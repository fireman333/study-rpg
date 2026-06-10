## Context

`familyAccrual` (Dexie table, keyed by `familyId`) holds each neuron family's AP, pull-pity clock (`pullCount`), and daily-fire bookkeeping. Two write paths read a family's row and assume it exists:

- `pullVariant` ([variant-gacha.ts:249](apps/neurons-tw/src/lib/services/variant-gacha.ts:249)) — `if (!accrual) throw`, caught by the outer try/catch → returns `{ ok:false }` and drops the pull.
- `recordCorrectAnswer` ([connectome.ts:176](apps/neurons-tw/src/lib/services/connectome.ts:176)) — `if (!accrual) throw` inside the Dexie tx → **aborts the whole transaction** (mastery + streak + AP rolled back).

The intended seeder `initFamilyAccrualIfEmpty` ([db.ts:901](apps/neurons-tw/src/lib/db.ts:901)) is **never called** — confirmed via `git log -S "await initFamilyAccrualIfEmpty"` returning empty across all history. So rows materialize only via cloud-sync hydration (signed-in users) or `recordCorrectAnswer`'s own guarded `put`. On a fresh / anonymous DB (or a hydration race where synced meta energy lands before the `familyAccrual` rows), the row is absent and both paths fail. This is the root cause behind the observed `no familyAccrual row for "藥理學"`.

## Goals / Non-Goals

**Goals:**
- Make `pullVariant` and `recordCorrectAnswer` tolerant of a missing `familyAccrual` row by lazily seeding the canonical default row **inside the existing transaction** — robust regardless of effect / hydration ordering.
- Single source of truth for the default row shape, shared by the bulk seeder and the two lazy paths so they cannot drift.
- Vitest coverage for both fresh-family paths.

**Non-Goals:**
- No Dexie schema bump, no R2 / sync-protocol change, no new synced meta keys (the row shape and table are unchanged).
- No change to gacha RNG, pity, mastery, streak, or AP arithmetic — only the missing-row precondition is handled.
- Not deleting the orphaned `initFamilyAccrualIfEmpty` (it becomes a thin consumer of the new helper; harmless and keeps the bulk-seed shape colocated).

## Decisions

**D1 — Lazy-init-in-tx over re-attaching a boot seeder.** Re-attaching `initFamilyAccrualIfEmpty` at `OverviewPage` mount would fix the common case but NOT the mount-time / sync-hydration race: `useMaze.reconcileSettles` runs concurrently on mount and can call `pullVariant` before an async seed effect completes. Lazy-seed-in-tx is correct under every ordering because the seed and the read live in the same serialized IndexedDB transaction. (Chosen per the bug report's stated preference; confirmed with the user as the full-scope fix.)

**D2 — Shared `defaultFamilyAccrualRow(familyId)` helper in db.ts.** Both lazy sites and `initFamilyAccrualIfEmpty`'s `bulkAdd` map call it, so the zero-init shape (`ap=0, firedToday=false, lastFireDate=null, unlockedSlots=[], sameDayCorrect=0, pullCount=0`) is defined once. Alternative (inline literals at each site) was rejected — three copies of the shape is exactly the drift risk a Dexie row with 6 fields invites.

**D3 — `pullVariant` uses `add`; `recordCorrectAnswer` only defaults the read.** In `pullVariant` the next step is `familyAccrual.update(familyId, {pullCount})`, and Dexie `update` is a no-op on a non-existent key — so the row must be physically `add`ed first, then `update` bumps `pullCount` 0→1. In `recordCorrectAnswer` the tx already ends with `db.familyAccrual.put(updatedAccrual)` (a full-row write), so defaulting the *read* to `defaultFamilyAccrualRow(familyId)` is sufficient — the existing `put` persists it; no extra write. Both are within already-`rw`-scoped transactions that include `db.familyAccrual`, so no transaction-scope change is needed.

**D4 — Concurrency safety of `add`.** IndexedDB serializes `rw` transactions that share an object store, so a `get`→`add` pair within one `pullVariant` tx is atomic relative to other `pullVariant` / sync-`apply` / `recordCorrectAnswer` txns touching `familyAccrual`. A second concurrent pull sees the row in its own (later-serialized) `get`. The sync adapter uses idempotent `put`. Hence no `ConstraintError` window.

## Risks / Trade-offs

- [A second pull for the same fresh family races the first] → IndexedDB tx serialization on the `familyAccrual` store means the second pull's `get` observes the row the first pull `add`ed; no double-seed, no constraint error.
- [Spec drift correction surprises a reader who expected "11 rows on save creation"] → The `connectome-collection` MODIFIED requirement explicitly restates the observable contract: AP reads as 0 whether or not the row exists; the row is created lazily. Observable behavior (AP=0 initially, +1 per correct answer) is unchanged.
- [Sync MAX-merge of a lazily-seeded `pullCount=…` row] → Unchanged: the `familyAccrual` adapter already MAX-merges `pullCount` and AP per family, so a device that lazily seeded then pulled converges identically to one hydrated from cloud.

## Migration Plan

Pure code tolerance — no data migration, no deploy-ordering constraint. Ships on `track-neurons` via the standard neurons CF Pages pipeline. Rollback = revert the commit (no persisted artifact to undo; lazily-seeded rows are valid default rows indistinguishable from sync/answer-seeded rows).
