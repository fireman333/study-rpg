## Why

Change `add-neurons-exam-set-mock-mode` (①) lifted the 模擬考試 (mock-exam) engine into `@study-rpg/core@0.6.2` to create a single source of truth shared by neurons (一階) and 二階. After it shipped, the 二階 session objected: the mock-exam engine is app-specific and should not live in shared content-agnostic core, and 二階 (a separate standalone repo) declines to consume it — so the shared-source-of-truth rationale no longer holds, and core would be carrying an engine with exactly one consumer (neurons). The lift is internal-only and cheaply reversible now because core `0.6.2` was never published to npm (`latest` is still `0.6.1`) and neurons consumes core via a pnpm workspace symlink, so no npm consumer breaks.

## What Changes

- Move `lib/exam-set.ts` + `lib/exam-set-mock.ts` (and the sibling test `lib/__tests__/exam-set-mock.test.ts`) out of `packages/core/` into `apps/neurons-tw/src/lib/`. Inside the moved `exam-set-mock.ts`, repoint `import type { Question } from '../types'` → `from '@study-rpg/core'`; the `./exam-set` relative import stays valid.
- **BREAKING** (core API, but unpublished): remove the two `./lib/exam-set` and `./lib/exam-set-mock` export blocks from `packages/core/src/index.ts`. No npm consumer exists, so the break is contained to the workspace.
- Revert `packages/core/package.json` version `0.6.2 → 0.6.1` and remove the `## [0.6.2]` entry from `packages/core/CHANGELOG.md`.
- Repoint 7 neurons consumers from `@study-rpg/core` to app-local relative imports: `MockExamRunner.tsx`, `QuestionJumpGrid.tsx`, `lib/services/mock-exam-draft.ts`, `lib/db.ts` (split — `ContentPack` stays from core, `MockExamDraftRow` moves to `./exam-set-mock`), `routes/QuestionBankPage.tsx`, `__tests__/mock-exam-draft.test.ts`, and `__tests__/db-v18-to-v19-migration.test.ts` (if it imports a moved symbol).
- The legacy `packages/core/src/lib/mock-exam.ts` (一階 `scoreMock` / `applyMockPassReward` / `paperIdOf` / `decodePaperId`) is a separate pre-existing module and **stays exported and untouched**.
- Pure relocation: no logic change, no Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` bump. Player-facing behavior in neurons prod is unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `core-npm-package`: REMOVE the `Exam-set mock engine exports` requirement that change ① added. The exam-set mock engine is no longer a published-core export; it now lives app-local in neurons-tw. Legacy `lib/mock-exam.ts` exports are unaffected.

## Impact

- **Code**: `packages/core/src/index.ts`, `packages/core/src/lib/exam-set*.ts` (+ test), `packages/core/package.json`, `packages/core/CHANGELOG.md`; 7 `apps/neurons-tw/src/**` consumer files + 2 new app-local lib files.
- **API**: `@study-rpg/core` public surface shrinks back to the `0.6.1` shape. Unpublished, so no downstream npm release impact; 二階 (standalone repo, npm `^0.6.x`) is unaffected and keeps its own copy.
- **Build/Test**: `pnpm --filter @study-rpg/core build` re-emits dist without the moved modules; `pnpm -r typecheck` + full vitest suite (561 tests: 536 neurons / 25 core — minus the relocated exam-set-mock tests that move app-side) must stay green.
- **No data/sync impact**: no schema, no migration, no leaderboard, no R2 bundle change.
