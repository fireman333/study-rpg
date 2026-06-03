## Context

`neurons-leaderboard` shipped (2026-05-25) when the variant catalog was 55 and the game still had a global pull-currency. Since then: catalog grew 55 → 77 → 110 (`expand-neuron-variant-catalog`), and `promote-maze-to-home` replaced the global currency with per-branch maze energy + settles (each settle = one variant pull; the maze is the only pull path). The leaderboard was never realigned, leaving two debts:

1. **Stale `variant_count` cap** — three inconsistent layers: D1 `CHECK ... BETWEEN 0 AND 55`, Worker `VARIANT_COUNT_MAX = 77`, catalog 110. Client sends raw `db.neuronVariants.length` (no clamp). A player at 56–77 variants violates the D1 CHECK → SQLite error → Worker catch → 500; at 78–110 the Worker drops with 200 `variant_count_oob`. Both make the player vanish from every tab.
2. **No maze-aligned axis** — the board's progression-ish axes are `variant_count` (partial proxy: dupe-fusion means dupes don't raise distinct count) and the vestigial `total_AP`. The actual exploration effort (settles) is invisible.

## Goals / Non-Goals

**Goals:**
- Raise `variant_count` enforcement to the catalog total (110) at both D1 and Worker layers so no current player is dropped.
- Add a「探索進度」(`total_settles`) leaderboard axis sourced from existing synced meta, so the board reflects maze progression.
- Keep the change additive and isolated: no Dexie/R2 bump, no SRS-file contact, 二階 untouched.

**Non-Goals:**
- Changing `total_AP` semantics or removing the AP tab (it still maps to a visible per-family number).
- Reworking the composite tie-break to include settles (kept as `variant_count DESC, total_study_min DESC`; revisit later with telemetry).
- Clamping `variant_count` client-side (the catalog upper-bounds it; the cap is server-side defence-in-depth).
- Wiring an auto-push hook (out of scope; existing manual-push + opt-in + opt-out paths already call `buildLeaderboardPayload`, the single payload builder, so the new field is covered everywhere).

## Decisions

**D1 — Cap value = 110, sourced from the catalog conceptually but hard-coded at each layer.** The Worker and D1 cannot import `@study-rpg/content-neurons-tw`. Use a literal `110` + a comment pointing at `NEURON_VARIANT_TOTAL` so the next catalog bump has a findable breadcrumb. (A generous over-cap like 999 was rejected — it weakens the sanity bound; matching the catalog is the right defence-in-depth.)

**D2 — Single table-recreate migration 0006 for BOTH the CHECK relax and the new column.** SQLite has no `ALTER TABLE DROP/MODIFY CONSTRAINT`, so relaxing `variant_count`'s CHECK requires the canonical `CREATE _new → INSERT SELECT → DROP → RENAME → recreate indexes` pattern (exactly as `0004_bump_tier_to_4.sql` did for `leaderboard_m2`). Since we're recreating anyway, add `total_settles INTEGER NOT NULL DEFAULT 0 CHECK (total_settles >= 0)` in the same migration — one recreate, not two. Keep `family_complete` (vestigial) in the recreated table because Worker `handleGetMe` still `SELECT`s it. D1 forbids explicit `BEGIN/COMMIT` (auto-wrapped). Include the pre/post `SELECT COUNT(*)` parity note.

**D3 — `total_settles` is computed at push time from the 4 settles meta keys, not stored separately.** `buildLeaderboardPayload` reads `meta['maze:da:settles'] + ['maze:5ht:settles'] + ['maze:gaba:settles'] + ['maze:glu:settles']` (matching `economy.ts` `settlesKey` lowercase form) and sums them. No import from `lib/maze/economy.ts` (those key builders aren't exported and we want zero blast radius into maze files) — the 4 keys are inlined with a comment cross-referencing `economy.ts`. Defensive `Number(...) || 0` per key (mirrors `readTotalStudyMinutes`).

**D4 — Settles is the 6th tab, appended after study.** Tab order stays `composite / variants / ap / synapse / study` then new `settles`「探索進度」. Appending (not reordering) keeps existing tab indices and tests stable. Sort key `total_settles DESC`. The grid header gains a「探索」column; primary-stat emphasis lights it when the settles tab is active.

**D5 — Worker LWW + one-way-ratchet logic unchanged.** `total_settles` is monotonic on the client (settles only ever increase), so the existing `updated_at` LWW gate suffices; no per-field ratchet needed (unlike `badges_csv`). It rides the same UPSERT statement.

## Risks / Trade-offs

- **Migration 0006 is owner-applied + irreversible-ish on prod D1.** Mitigated by the canonical recreate pattern (data-preserving `INSERT SELECT`) + mandatory pre/post `COUNT(*)` parity check + nightly R2 backup as restore path. Same risk profile as the already-shipped 0004.

- **wrangler ≥ 4.x rejects the multi-statement recreate file** (verified with wrangler 4.92.0). Both `wrangler d1 migrations apply` and `wrangler d1 execute --file` abort with `"Wrangler could not process the provided SQL file, as it contains several transactions"` when a file contains the `CREATE TABLE … / DROP TABLE / RENAME` recreate sequence (the implicit-commit DDL trips its single-transaction wrapper). Empirically, single `--command` statements and additive `ALTER ADD COLUMN + CREATE INDEX` files are accepted; only the recreate is hostile. This is almost certainly why the already-shipped `0004_bump_tier_to_4.sql` (same pattern) was applied with an older wrangler. **`0006_*.sql` is kept as the canonical, sqlite3-validated record, but the standard `wrangler d1 migrations apply --remote` will NOT run it under wrangler 4.x.** Apply paths that DO work (documented in tasks §7.3): (1) **recommended** — paste the whole file into the **Cloudflare dashboard → D1 → study-rpg-leaderboard → Console** (the dashboard runs multi-statement SQL directly); (2) CLI — run each statement individually via `wrangler d1 execute --remote --command "<one statement>"`. Either way, also `INSERT INTO d1_migrations (name, applied_at) VALUES ('0006_neurons_variant_cap_and_settles.sql', CURRENT_TIMESTAMP)` so a future `migrations apply` doesn't re-attempt (and re-fail on) 0006. The 0006 SQL itself was validated end-to-end with `sqlite3` against a 0003-shaped table: 2 rows preserved, `variant_count=110` accepted, `111` rejected by the new CHECK, all 6 indexes created.
- **Worker / client / D1 must deploy together-ish.** The Worker cap bump (110) is independent of the D1 column, but the settles axis needs all three (D1 column → Worker reads/writes it → client sends it → UI shows it). Ordering in tasks: apply migration 0006 first, then deploy Worker, then client. If the Worker ships before the migration, `total_settles` UPSERT writes hit a missing column → 500; tasks sequence this explicitly.
- **`total_settles` could read 0 for legacy R2 saves that predate maze meta.** Acceptable — defaults to 0, climbs on next settle (same forward-accrual stance as `total_study_min`).
- **Spec Purpose line still says「0–77」after delta sync.** The delta updates Requirements; the main spec's free-text Purpose needs a one-line manual edit at archive/sync time — called out as a task.
