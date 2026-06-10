## Why

On a fresh / anonymous IndexedDB the neurons app throws `no familyAccrual row for "<subject>"` because the only seeder, `initFamilyAccrualIfEmpty()`, is **orphaned — it was never called in any commit**. `familyAccrual` rows are therefore created only by cloud-sync hydration (signed-in users) or by `recordCorrectAnswer`'s own `put` — which is itself guarded by an `if (!accrual) throw`. The result is two latent failures whenever a row is not yet present:

- **`pullVariant`** throws (caught + logged, non-fatal) but **drops the family's first auto-pull** — both the maze settle pull and the silent first-pull P5 grant. Reproduced for 藥理學 on first load at `med-study-rpg.com/neurons/` and localhost, and as a sync-hydration race for signed-in users when synced meta energy applies before the `familyAccrual` rows.
- **`recordCorrectAnswer`** throws the same condition, which **aborts the entire write transaction** (mastery increment, streak increment, AP — all rolled back) on the first correct answer for a fresh anonymous user: a core-loop break, not just noise.

This is a pre-existing bug, not introduced by the 2026-06-10 homepage/maze changes.

## What Changes

- Add an exported `defaultFamilyAccrualRow(familyId)` helper in `apps/neurons-tw/src/lib/db.ts` as the **single source** of the default accrual-row shape (`ap=0`, `firedToday=false`, `lastFireDate=null`, `unlockedSlots=[]`, `sameDayCorrect=0`, `pullCount=0`); refactor `initFamilyAccrualIfEmpty` to use it so the bulk seed and the new lazy seed can never drift.
- `pullVariant` (variant-gacha service): inside the existing pull transaction, when the `familyAccrual` row is absent, lazily `add` `defaultFamilyAccrualRow(familyId)` and proceed (the subsequent `pullCount` bump then works) — instead of throwing.
- `recordCorrectAnswer` (connectome service): default the missing-row read to `defaultFamilyAccrualRow(familyId)` (the existing `put` persists the seeded row); remove the throw.
- No Dexie schema bump, no R2 / sync-protocol change, no new meta keys — purely makes existing code paths tolerant of a not-yet-seeded row, robust regardless of effect / sync-hydration ordering.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-variant-gacha`: the settle-triggered pull SHALL lazily seed a default `familyAccrual` row when none exists yet, before incrementing `pullCount`, instead of erroring out and dropping the pull.
- `connectome-collection`: AP accrual SHALL treat a missing `familyAccrual` row as `ap = 0` and lazily seed the default row inside the correct-answer transaction (correcting the existing "one row per family on save creation" claim, which the code never satisfied).

## Impact

- Code: `apps/neurons-tw/src/lib/db.ts`, `apps/neurons-tw/src/lib/services/variant-gacha.ts`, `apps/neurons-tw/src/lib/services/connectome.ts`.
- Tests: new Vitest coverage (fresh-family pull seeds the row; fresh-family correct answer seeds the row + accrues AP).
- The orphaned `initFamilyAccrualIfEmpty` stays (now used by the new helper) but is no longer load-bearing for correctness — the lazy path is the safety net.
- No persistence / sync / deploy surface change; behavior is purely additive tolerance.
