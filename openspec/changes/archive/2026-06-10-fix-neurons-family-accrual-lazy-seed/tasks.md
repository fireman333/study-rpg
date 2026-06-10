## 1. Shared default-row helper (db.ts)

- [x] 1.1 Add exported `defaultFamilyAccrualRow(familyId: string): FamilyAccrualRow` in `apps/neurons-tw/src/lib/db.ts` returning the canonical zero-init shape (`ap=0`, `firedToday=false`, `lastFireDate=null`, `unlockedSlots=[]`, `sameDayCorrect=0`, `pullCount=0`)
- [x] 1.2 Refactor `initFamilyAccrualIfEmpty`'s `bulkAdd` map to build each row via `defaultFamilyAccrualRow(subject.id)` (no behavior change — same shape, single source)

## 2. Lazy-seed the pull path (variant-gacha.ts)

- [x] 2.1 In `pullVariant`'s transaction, replace `const accrual = ...get(); if (!accrual) throw` with: read the row; when absent, `add(defaultFamilyAccrualRow(familyId))` and use it as `accrual`, then proceed to the existing `pullCount` bump
- [x] 2.2 Confirm the subsequent `familyAccrual.update(familyId, { pullCount })` still sets `pullCount` to 1 on the freshly-seeded row (update runs after the add)

## 3. Lazy-seed the answer-recording path (connectome.ts)

- [x] 3.1 In `recordCorrectAnswer`, change the `if (!accrual) throw` at the `familyAccrual.get` site to default to `defaultFamilyAccrualRow(familyId)` when missing (the existing `db.familyAccrual.put(updatedAccrual)` persists the seeded row); remove the throw
- [x] 3.2 Verify the AP / `lastFireDate` / `firedToday` arithmetic is unchanged (prevAp = 0 for a freshly-seeded family → newAp = 1)

## 4. Tests (Vitest, apps/neurons-tw)

- [x] 4.1 Add a test: `pullVariant` on a family with NO pre-existing `familyAccrual` row succeeds (`ok:true`), mints a variant row + individual, and seeds the accrual row with `pullCount === 1`
- [x] 4.2 Add a test: `recordCorrectAnswer` on a family with no `familyAccrual` row does NOT throw, seeds the row, and sets `actionPotential` to 1 (the prior throw would have aborted the tx)

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green (new tests pass, no regressions)
- [x] 5.2 `pnpm -r typecheck` clean
- [x] 5.3 `openspec validate fix-neurons-family-accrual-lazy-seed --strict` passes
