## 1. Relocate engine modules into the app

- [x] 1.1 `git mv packages/core/src/lib/exam-set.ts apps/neurons-tw/src/lib/exam-set.ts` (pure, no edits needed)
- [x] 1.2 `git mv packages/core/src/lib/exam-set-mock.ts apps/neurons-tw/src/lib/exam-set-mock.ts`
- [x] 1.3 In moved `exam-set-mock.ts`, change `import type { Question } from '../types'` → `from '@study-rpg/core'`; verify `from './exam-set'` import is unchanged
- [x] 1.4 `git mv packages/core/src/lib/__tests__/exam-set-mock.test.ts apps/neurons-tw/src/__tests__/exam-set-mock.test.ts` (if present); repoint its imports of the moved symbols to `../lib/exam-set-mock` and `Question` to `@study-rpg/core`

## 2. Shrink core back to 0.6.1

- [x] 2.1 Remove the `export { ... } from './lib/exam-set'` block from `packages/core/src/index.ts`
- [x] 2.2 Remove the `export { ... } from './lib/exam-set-mock'` block from `packages/core/src/index.ts`
- [x] 2.3 Revert `packages/core/package.json` `"version": "0.6.2"` → `"0.6.1"`
- [x] 2.4 Remove the `## [0.6.2]` entry from `packages/core/CHANGELOG.md`
- [x] 2.5 Confirm `packages/core/src/lib/mock-exam.ts` and its `index.ts` export block are untouched (legacy 一階 helpers stay)

## 3. Repoint neurons consumers to app-local imports

- [x] 3.1 `components/MockExamRunner.tsx`: mock-engine symbol block → `../lib/exam-set-mock` (and `../lib/exam-set` if `examSetScore`/`POINTS_PER_QUESTION` used); keep `Question` from `@study-rpg/core`
- [x] 3.2 `components/QuestionJumpGrid.tsx`: `CellState, ReviewCellState` types → `../lib/exam-set-mock`
- [x] 3.3 `lib/services/mock-exam-draft.ts`: `paperKeyHash` + `MockExamDraftRow` → `../exam-set-mock`
- [x] 3.4 `lib/db.ts`: split import — `ContentPack` stays from `@study-rpg/core`, `MockExamDraftRow` (type-only) → `./exam-set-mock`
- [x] 3.5 `routes/QuestionBankPage.tsx`: `isDraftFresh` + any exam-set symbols → `../lib/exam-set-mock` / `../lib/exam-set`
- [x] 3.6 `__tests__/mock-exam-draft.test.ts`: `isDraftFresh` → `../lib/exam-set-mock`
- [x] 3.7 `__tests__/db-v18-to-v19-migration.test.ts`: repoint moved symbol if imported (else no-op)
- [x] 3.8 Grep sweep: `grep -rn "exam-set" apps/neurons-tw/src packages/core/src` — confirm no remaining `@study-rpg/core` import resolves to a moved symbol

## 4. Verify (pure relocation — must stay green)

- [x] 4.1 `pnpm --filter @study-rpg/core build` (re-emit dist without moved modules)
- [x] 4.2 `pnpm -r typecheck` clean
- [x] 4.3 Full vitest suite green (561 tests; neurons count up, core count down, total unchanged)
- [x] 4.4 Confirm no Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` diff (`git diff` review)
