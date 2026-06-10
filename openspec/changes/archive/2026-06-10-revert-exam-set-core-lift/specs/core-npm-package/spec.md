## REMOVED Requirements

### Requirement: Exam-set mock engine exports

**Reason**: The 模擬考試 (mock-exam) engine was lifted into `@study-rpg/core@0.6.2` by change `add-neurons-exam-set-mock-mode` to serve as a shared source of truth for neurons (一階) and 二階. 二階 (a separate standalone repo consuming core from npm) declined to consume it and keeps its own app-local copy, leaving the engine with exactly one consumer (neurons). Since core `0.6.2` was never published to npm, the lift is reverted to keep `@study-rpg/core` content-agnostic and free of single-consumer engines. The engine now lives app-local in `apps/neurons-tw/src/lib/exam-set.ts` + `exam-set-mock.ts`.

**Migration**: No published consumer exists, so no external migration is required. The neurons app imports the engine from its own `src/lib/` instead of `@study-rpg/core`. `packages/core/package.json` reverts to `0.6.1` and the legacy `lib/mock-exam.ts` exports (`scoreMock`, `applyMockPassReward`, `paperIdOf`, `decodePaperId`) remain exported and unchanged.
