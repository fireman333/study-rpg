## Context

neurons-tw collects neuron variants via an AP-threshold gacha (`neuron-variant-gacha`): crossing a per-family Action Potential threshold (10/30/80/200/500) fires `connectome.variantSlotUnlocked`, the gacha subscriber rolls a rarity and writes a `neuronVariant` row (PK `[familyId+slotIndex]`, closed cap 55). Today the row is `{ familyId, slotIndex, rarity, displayName, spriteKey, rolledAt, wasPityFloor }` and, once written, is inert — a trophy in a grid.

This change is the first, deliberately-minimal step toward the Pikmin Bloom north star ("the collectible carries the context of the habit that grew it"): each variant remembers the **study context at mint** and shows a one-line birth caption. Display-only; no gacha mechanic touched. Clarification record: `~/.claude/scratch/grilled-neurons-tw-variant-provenance-2026-06-01.md`.

Grounded facts (verified in code, not assumed):
- Dexie max version is **v9** (`apps/neurons-tw/src/lib/db.ts`); `neuronVariants` index string is `'[familyId+slotIndex], familyId, rolledAt'`.
- `recordCorrectAnswer(familyId: string)` takes **only** familyId — no questionId. Caller is `QuizModal.tsx`, which holds the question `q` and writes `questionHistory` (the `everWrong` source).
- R2 bundle `SCHEMA_VERSION = 6` (after `add-neurons-variant-collection-view`; was 5 when this change was first drafted); `validateBundleMeta` already tolerates `schema_version > SCHEMA_VERSION` (console.info + continue). `neuronVariants` R2 adapter is LWW and serializes whole rows.

## Goals / Non-Goals

**Goals:**
- Stamp 3 mint-time context signals (触發脈絡 / 錯題救贖 / 里程碑) onto each new variant, plus baseline date+family.
- Render one birth caption per variant on the dex card; 元老 fallback for pre-upgrade rows.
- Sync provenance through the neurons R2 bundle, surviving cross-version round-trips.
- Schema is forward-compatible so a later "study-context → rarity" change reads these fields without re-plumbing.

**Non-Goals:**
- No change to gacha rarity weights, slot floors, AP ladder, variant count, or any shipped gacha logic/test.
- No new sprite art / no context-driven visual variants (separate future `context-driven-variant-art`).
- No answer buffs, stakes, loss, or 模擬考 context capture (deferred).
- Provenance does NOT influence any mechanic in this change (display-only).

## Decisions

### D1 — Provenance is an optional nested object on the row; absence = 元老 (no backfill write)
Add `provenance?: NeuronVariantProvenance` to `NeuronVariantRow`:
```ts
interface NeuronVariantProvenance {
  bornAtISO: string        // local-date string at mint (caption date; new rows only)
  apAtUnlock: number       // == slot threshold; stored for forward-compat (D6)
  wasRedemption: boolean   // triggering answer's question was everWrong before this answer
  streakAtMint: number     // daily streak value at mint
}
```
Pre-upgrade rows have `provenance === undefined`. The UI treats `undefined` as a **元老 / 傳承** individual and displays the existing `rolledAt` (formatted to date) + `familyId` as subject, with no special tags. **No migration write touches old rows** — absence is the marker. Cheapest, and it makes 元老 status stable across sync/versions.
- *Alternative considered*: write `isLegacy: true` on old rows via an upgrade callback → rejected (needs a Dexie version bump + churns LWW timestamps for no benefit).

### D2 — No Dexie `.version()` bump
`provenance` fields are **non-indexed**, so the `neuronVariants` `.stores()` string is unchanged and Dexie persists the new property transparently on both existing and new rows. No `.version(10)` declaration is added → the `lint:dexie-fixtures` rule (which fires only on a new `.version(N)`) does not trigger, so no upgrade fixture is required. **This is intentional, not an omission** — called out here so review (incl. codex) doesn't read it as a skipped fixture. The dex page already loads all ≤55 variants (`peekAll`) and filters in JS, so no provenance index is needed.
- *Alternative considered*: bump to v10 "for documentation" → rejected per Simplicity-First and the Dexie pk-change pitfall memory (minimize schema churn).

### D3 — 救贖 signal threads QuizModal → recordCorrectAnswer → event payload; streak read at mint
- **錯題救贖** is answer-specific and only known at the answer site. `QuizModal` reads `questionHistory.get(q.id)?.everWrong` **before** recording, computes `wasRedemption`, and passes it via an additive optional arg: `recordCorrectAnswer(familyId, { wasRedemption })`. `connectome` forwards it into the `connectome.variantSlotUnlocked` payload (`{ familyId, slotIndex, apAtUnlock, wasRedemption }`). The gacha subscriber stamps it.
- **里程碑** is global current state — the gacha subscriber reads the streak service at mint (`handleSlotUnlock`), so streak needs **no** payload coupling.
- **觸發脈絡** (`slotIndex`, `apAtUnlock`) is already in the payload — free.
- *Alternative considered*: subscriber queries question-history itself → rejected, it has no questionId and the "triggering" answer isn't identifiable post-hoc.

### D4 — Birth caption: date + 答對 N 題該科 + 放電 metaphor + subject, special tags inline
Single line, derived from provenance. Recommended template (copy is tunable; lock visual at verify):
- Default: `2026-06-01 · 答對 10 題藥理學時放電誕生`
- 救贖: `2026-06-01 · 攻下一題曾錯的藥理學時放電誕生`
- 里程碑: `2026-06-01 · 連續 14 天 · 答對 80 題藥理學時放電誕生`
- 元老 (provenance absent): `2026-05-25 · 藥理學 · 傳承個體`

Note: `apAtUnlock` equals the slot threshold (always 10/30/80/200/500), so the count is a milestone marker, not a unique fingerprint — uniqueness comes from **date + special tags**. "放電" is kept because action potential = neuron firing is the mode's core Hebbian metaphor and the med-student audience reads it natively.

### D5 — Streak-milestone threshold = 7 (tunable constant), default
A variant is a 里程碑 individual when `streakAtMint >= MILESTONE_STREAK_THRESHOLD`, default **7**, exported as a single content-pack constant for dogfood tuning (candidates 7/14/30). Rationale for 7: matches the existing 7-day LTD-decay cadence and is reachable within a normal study week so the tag actually appears.

### D6 — Display-only now, forward-compatible for context-rarity later
Provenance is read only by the caption renderer in this change. `apAtUnlock` + `wasRedemption` + `streakAtMint` are stored as discrete fields specifically so a future "study-context → rarity" capability can consume them without re-plumbing signals. This change adds **no** code reading provenance for any mechanic.

### D7 — R2: bump SCHEMA_VERSION 6 → 7; adapter logic unchanged
The `neuronVariants` adapter serializes/merges whole rows, so `provenance` flows automatically. Bump `SCHEMA_VERSION` to 7 (`add-neurons-variant-collection-view` already took 5 → 6) as a provenance-evolution audit marker. The field survives all cross-version paths: an older client round-tripping a provenance-bearing row preserves `provenance` (it rides in row JSON even though it ignores it); a newer client reading an older bundle sees no `provenance` → 元老. Worker is bundle-opaque → no Worker change.

## Risks / Trade-offs

- **Same (familyId, slotIndex) minted offline on two devices with different provenance** → LWW picks one row by its existing resolver; the surviving row's provenance wins. Acceptable: variant identity (rarity) is the meaningful payload and provenance is cosmetic; no new merge discipline (unlike DMN's monotonic-union) is needed because provenance is immutable per row. → Documented; no special handling.
- **`validateBundleMeta` logs "unknown fields will be dropped" for v5-reading-v6** even though provenance is actually preserved (it's inside existing rows, not a new adapter key) → harmless cosmetic log during the brief multi-version window. → Leave as-is.
- **Reviewer flags "row shape changed but no Dexie bump / no fixture"** → preempted by D2 rationale in this doc and the proposal Impact note.
- **Caption count is deterministic per slot** (always the threshold) → acknowledged in D4; date + tags carry the real distinctiveness.

## Migration Plan

- Ship in neurons-tw only; deploy via `pnpm deploy:cf` from the `~/coding-scratch/study-rpg` deploy worktree (CF Pages direct-upload). No Worker / D1 / Supabase change.
- No data migration: existing variants render as 元老 immediately; they gain real provenance only if re-minted (they won't — slots are one-shot), which is fine.
- Rollback: revert the change; provenance fields on any rows written meanwhile are simply ignored by the prior build (non-indexed extra properties) — no data corruption.

## Open Questions

- Exact caption copy polish (spacing, tag glyphs) — finalize at `/verify` visual check, not blocking.
- Streak-milestone threshold may need dogfood retuning (7 → 14?) once telemetry exists; it's a single constant by design.
