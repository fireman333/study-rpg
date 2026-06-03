## Context

`rework-neurons-variant-pyramid` shipped a closed-cap Pokédex: each family renders a fixed slot grid (collected cards + rarity-labeled silhouettes), a `🧬 X / N` chip, and pulling disables once a family is fully collected. After dogfooding the live build the owner decided to invert the范式 to an **open-ended collection**: render only what you've pulled, never show the total, never stop pulling.

Four neurons capabilities encode the closed-cap assumption and must change together (this is a mechanics change, not a view-only tweak):
- `neurons-variant-collection-view` — silhouettes + `X / N` + 全部收集 pull-disable.
- `neuron-variant-gacha` — pull rejected when family fully collected; family card chip `🧬 X / N` with celebratory `X === N`.
- `neurons-achievements` — family-complete predicate concept + `familyCompleteCount` stat.
- `neurons-leaderboard` — `family_complete` field + composite tie-break + bounds.

Stale debt the pyramid change left: the leaderboard still bounds `variant_count ∈ [0, 55]` and treats families as 5-slot (pyramid is 77 = 11 families × variable, max-77). We are touching the leaderboard, so we correct the bound to 77 in the same pass.

## Goals / Non-Goals

**Goals:**
- `/collection` renders only collected variants — no silhouettes, no pre-shown rarity, no catalog-sized slot grid.
- Player never sees a denominator / progress bar / `X / N` / 全部收集 / 100%. Count chips become pure counts (`🧬 X 隻`). Collected cards still show their own rarity.
- Pulling is always available (balance ≥ cost); post-completion pulls yield dupes (`copies + 1`); no completion-disable.
- Achievements: drop family-complete; add 「收集 N 隻」 distinct-variant milestones (10 / 25 / 50 / 77).
- Leaderboard: retire `family_complete`; `variant_count` (denominator hidden) is the sole collection metric; fix the stale `55 → 77` bound.
- Dexie `v11 → v12` resets the collection (owner-chosen clean slate) while preserving neural-energy + study progress.

**Non-Goals:**
- Dupe consumption / 衝卷軸 fusion (`add-neurons-dupe-fusion`, Phase 3) — this change only lets dupes accrue.
- Roster art-fill (~110 sprites) — orthogonal; placeholders simply won't show as empty slots anymore.
- 集滿彩蛋 easter egg — deferred.
- Any change to `leaderboard_m2` / 二階 semantics — the shared Worker edit is neurons-namespaced only.

## Decisions

### D1 — Open-collection = render-only-collected + hide totals (not a `display: none` over silhouettes)
The dex iterates the **collected** `neuronVariants` rows grouped by family, not the catalog slot set. Removing the catalog-driven slot grid (rather than hiding silhouettes with CSS) is the honest implementation and removes the dead silhouette/threshold code path. Family sections with zero collected variants render nothing (or a subtle "尚未收集" hint, owner's call at apply). Alternative considered: keep the grid but blank uncollected cells — rejected (leaves the closed-cap mental model + dead code).

### D2 — `total-count` = distinct variant kinds (= existing `variant_count`, max 77), NOT Σ copies
Owner-confirmed. This means the leaderboard needs **no new D1 column**: `variant_count` already publishes distinct collected count. `family_complete` is removed from the Worker's composite tie-break, sanity bounds, snapshot SELECT, and the client adapter; the D1 `family_complete` column is left **vestigial** (not dropped — SQLite column-drop is painful and a dead column is harmless). Achievement 「收集 N 隻」 milestones evaluate the same distinct count (thresholds 10/25/50/77; 77 = the pyramid cap). Alternative considered: add `total_individuals` (Σ copies) — rejected by owner (would duplicate the grind axis and force a migration).

### D3 — Pull never disables on completion; completion concept hidden, dupes accrue
`pullVariant(familyId)` drops the "not fully collected" precondition — it requires only balance ≥ `PULL_COST`. The existing within-tier dupe path (`copies + 1`) already handles post-completion pulls; once every slot is owned, every pull is a dupe. `getPullableState` loses its `complete`/disable semantics from the player's view (a `complete` boolean MAY remain internally for the dupe-only-from-here UI hint, but it SHALL NOT disable the control). Alternative considered: cap dupes — rejected (dupe sink is Phase 3).

### D4 — Count chip becomes pure count everywhere; no celebratory full-state
`VariantCollectionChip` (homepage family cards) + any collection总覽 chip render `🧬 X 隻` with no denominator and no `X === N` gold/🏆 celebratory branch (that branch leaks the cap). Leaderboard `variant_count` cell drops its `/55` (and does NOT gain `/77`) suffix — pure number, consistent with hiding the total.

### D5 — Dexie v11 → v12 reset is a clean-slate **preference**, not a technical necessity
The open-collection change does not alter the `neuronVariants` row shape, so a reset is not technically required. The owner chose a 3rd same-topic reset for a clean start. The v11→v12 `.upgrade()` callback mirrors v10→v11: clear `neuronVariants`, reset every `familyAccrual.pullCount` to 0 (P0 pity restarts) + `unlockedSlots` to `[]`, **preserve** AP / synapses / mastery / question-history / bookmarks / achievements / `totalStudyMinutes` **and the neural-energy counters** (`neuralEnergyEarned` / `neuralEnergySpent`). No grandfather, no banner. A `db-v11-to-v12-migration.test.ts` fixture satisfies `dexie-fixture-lint`. (Design note: this is the third collection reset; future feature changes should avoid reflexive resets unless row shape genuinely changes.)

### D6 — Cross-track Worker isolation discipline (mirror pyramid P0 cross-cut caution)
The neurons leaderboard lives in the shared `cloudflare/sync-worker`. The edit touches only the neurons code path (`/leaderboard/neurons/*`, `leaderboard_neurons` table, `leaderboard:neurons:top100:*` KV). `leaderboard_m2` query/validation/snapshot SHALL be untouched. `deploy-worker.yml` redeploys the whole Worker, so the apply must run the 二階 leaderboard smoke (or at least confirm no `leaderboard_m2` code changed) before GATE 2.

## Risks / Trade-offs

- **Shared Worker redeploy affects 二階** → Mitigation: change is strictly inside neurons branches; diff-review the Worker to confirm zero `leaderboard_m2` delta; deploy-worker smoke on a 二階 row post-deploy.
- **Vestigial `family_complete` D1 column** → Mitigation: documented as dead; no read path; cheaper than a SQLite column-drop migration. A future cleanup MAY drop it.
- **3rd collection reset annoys returning dogfooder** → Mitigation: owner explicitly chose it; energy + study progress preserved so only the menagerie resets.
- **Stale spec `Purpose` text** (collection-view + leaderboard Purpose paragraphs mention silhouettes / `family_complete` / `0–55`) → Mitigation: archive sync only merges requirement deltas; flag a manual `Purpose` touch in tasks so the merged main specs don't read stale.
- **CI env gotcha** (`deploy-cf-pages.yml` builds neurons-tw without `VITE_SUPABASE_*` / `VITE_SYNC_WORKER_URL`) → Mitigation: leaderboard already shipped under this gap; if prod leaderboard breaks, first suspect the missing build env (out of scope to fix here, noted for Step 9).

## Migration Plan

1. Dexie `v11 → v12` upgrade callback (reset + preserve) + `db-v11-to-v12-migration.test.ts` fixture.
2. App: CollectionPage (render-only-collected, pure-count, pull-never-disables), VariantCollectionChip, variant-gacha `pullVariant`/`getPullableState`, achievement.ts stat, neurons-leaderboard adapter.
3. Content: `achievements.ts` family-complete → distinct-count milestones; validator if P1 composite affected.
4. Worker: neurons leaderboard composite/bounds/snapshot/upsert drop `family_complete`, bound `variant_count` → 77.
5. Deploy order: push `track-neurons` → GATE 2 → merge to main (via sync protocol from the main worktree) → CI fires `deploy-cf-pages` + `deploy-worker` + `dexie-fixture-lint` → prod smoke.

**Rollback**: revert the merge commit on main (open `revert-rework-neurons-open-collection` if already archived). The Worker rolls back via redeploy of the prior version; the vestigial D1 column needs no rollback.

## Open Questions

- Empty family section presentation: render nothing vs a faint 「尚未收集」 row — resolve at apply (default: render nothing, keep the family header so the filter chips stay meaningful).
- Whether to keep an internal `complete` flag in `getPullableState` for a "從此只出重複" hint — apply may add a non-disabling hint; not required by spec.
