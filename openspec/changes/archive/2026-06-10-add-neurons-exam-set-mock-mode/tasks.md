## 1. Core lift — `@study-rpg/core` exam-set engine (D1, D2)

- [x] 1.1 Create `packages/core/src/lib/exam-set.ts` from 二階 `exam-set.ts` **scoring部分**: `POINTS_PER_QUESTION`, `ExamSetScore`, `examSetScore` — change body to `examScore = total > 0 ? (correct / total) * 100 : 0` (D2 normalize). Do NOT lift `parseQuestionId` / `listExamPapers` / `buildExamSetPool` / `ExamPaper` / `ExamPaperKey` (二階 ID-format-specific; neurons uses meta-based enumeration).
- [x] 1.2 Create `packages/core/src/lib/exam-set-mock.ts` from 二階 `mock-exam.ts` **verbatim** (`ExamMode`, `MockExamState`, `MockAction`, `createInitialMockState`, `clampIndex`, `mockExamReducer`, `isCorrectAnswer`, `SubjectTally`, `MockExamScore`, `scoreMockExam`, `unansweredIndexes`, `firstUnanswered`, `wrongOrUnansweredIndexes`, `CellState`, `ReviewCellState`, `navigatorCellStates`) — keep its `import { examSetScore, type ExamSetScore } from './exam-set'`.
- [x] 1.3 Add the draft pure helpers into `exam-set-mock.ts` from 二階 `mock-exam-draft.ts`: `paperKeyHash(key: { year; sitting; book })`, `isDraftFresh(draft, pool)`, and a `MockExamDraftRow` interface (`paperKeyHash, year, sitting, book, questionIds[], answers[], flaggedIndexes[], index, startedAt, updatedAt`). Strip the Dexie ops (`saveMockDraft`/`loadMockDraft`/`deleteMockDraft`) — those stay per-app.
- [x] 1.4 Add all new symbols to `packages/core/src/index.ts` exports (two export blocks: `./lib/exam-set` + `./lib/exam-set-mock`). Do NOT touch the existing legacy `./lib/mock-exam` export block.
- [x] 1.5 Bump `packages/core/package.json` `version` `0.6.1` → `0.6.2`; add a `0.6.2` entry to `packages/core/CHANGELOG.md` documenting the exam-set engine exports + normalize.
- [x] 1.6 Add `packages/core/src/lib/__tests__/exam-set-mock.test.ts`: normalize equivalence (80Q → `×1.25` parity; 100Q → max 100), disputed-credit across all figures + excluded from `wrongOrUnansweredIndexes`, reducer lock-after-submit, `navigatorCellStates` answering vs review, `isDraftFresh` mismatch cases.
- [x] 1.7 `pnpm --filter @study-rpg/core build && pnpm --filter @study-rpg/core typecheck` green; `pnpm --filter @study-rpg/core test` green.

## 2. neurons paper pool + draft service (D3, D4)

- [x] 2.1 Add `buildExamSetPaper(pool, year, session, book)` to `apps/neurons-tw/src/lib/services/expedition.ts` — the **full** 冊 (NOT unanswered remainder), reusing `examOrderCompare`. Leave `buildExamSetExpeditionPool` (即時詳解 remainder) unchanged.
- [x] 2.2 Create `apps/neurons-tw/src/lib/services/mock-exam-draft.ts`: `saveMockDraft` / `loadMockDraft` / `deleteMockDraft` against `db.mockExamDrafts`, typed with core's `MockExamDraftRow`; map neurons `session` → key `sitting` when calling `paperKeyHash`.
- [x] 2.3 Unit-test `buildExamSetPaper` (full paper, order, other-冊 excluded) + the draft service round-trip (save → load → stale via `isDraftFresh`).

## 3. Dexie v18 → v19 + fixture (D6)

- [x] 3.1 In `apps/neurons-tw/src/lib/db.ts` add `this.version(19).stores({ ...all v18 stores verbatim, mockExamDrafts: '&paperKeyHash, updatedAt' })` — NO `.upgrade()` callback (additive). Add the `MockExamDraftRow` table typing to the `NeuronsDB` class.
- [x] 3.2 Add `apps/neurons-tw/src/__tests__/db-v18-to-v19-migration.test.ts` (clone `db-v17-to-v18-migration.test.ts` pattern): open a v18 fixture with seeded data containing the literal `.version(18).stores(`, upgrade to v19, assert existing rows intact + `mockExamDrafts` read/write works.
- [x] 3.3 `pnpm lint:dexie-fixtures` green (CI `dexie-fixture-lint` sees the v18→v19 fixture).

## 4. neurons MockExamRunner UI + mode selector (D5, D8)

- [x] 4.1 Port `QuestionJumpGrid` to `apps/neurons-tw/src/components/QuestionJumpGrid.tsx` (cells `1..pool.length`, grouped in tens; answered/unanswered/flagged/current + review correct/wrong/unanswered/disputed states; non-colour cue per cell).
- [x] 4.2 Create `apps/neurons-tw/src/components/MockExamRunner.tsx` (port 二階 `ExamSetModal` mock branch): consumes core `mockExamReducer`/`scoreMockExam`/`navigatorCellStates`; neurons question rendering; flag toggle; 全部送出 with unanswered warning (jump-to-first / submit-anyway); post-submit review (own vs correct + explanation + 各科 correct/total + 國考換算分 + 未作答數); 再考一次; debounced draft save on answer/flag/nav; resume detection + stale prompt on mount.
- [x] 4.3 Add the mode selector (即時詳解 / 模擬考試) into `apps/neurons-tw/src/routes/QuestionBankPage.tsx` post-paper-selection: 即時詳解 → existing `QuizModal preserveOrder practice` (unchanged); 模擬考試 → `MockExamRunner` over `buildExamSetPaper(...)`.
- [x] 4.4 On 全部送出, batch-write 錯題本: `wrongOrUnansweredIndexes(pool, answers)` → loop `recordQuestionResult(q.id, q.family, false)` (disputed excluded); confirm `Question.family` present (else fallback per D-risk). NO `onExpeditionComplete` / DMN credit.
- [x] 4.5 Verify mock = pure practice: no maze energy / no variant pull / no connectome / no DMN; still writes `questionHistory` + `everWrong` + SRS schedule.

## 5. Retire `mock-exam` spec (D7)

- [x] 5.1 (Spec delta already written under `specs/mock-exam/`.) At archive time, after sync, `rm -rf openspec/specs/mock-exam/` and run `openspec validate --all` to confirm no dangling references. Do NOT remove core legacy `lib/mock-exam.ts` code (still published).

## 6. Verify + cross-session coordination

- [x] 6.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` + `pnpm lint:dexie-fixtures` all green.
- [x] 6.2 `/verify` Chrome MCP 三件套: open 題庫 → pick paper → choose 模擬考試 → answer a few + flag + jump → 送出 with unanswered warning → review (own vs correct + 各科分數 + 國考換算分) → refresh mid-run → resume prompt → console clean. Confirm 即時詳解 path unchanged.
- [ ] 6.3 (Owner) `npm publish @study-rpg/core@0.6.2` (latest dist-tag) — manual, not automated.
- [ ] 6.4 After publish, session-bus → 二階: "core 已 lift exam-set 引擎 (`exam-set.ts` + `exam-set-mock.ts`) + 發 0.6.2 latest；可 bump `@study-rpg/core` → swap app-local `mock-exam.ts` / `exam-set.ts` / `mock-exam-draft.ts` pure helpers → core import. 注意 normalize：shrunk paper (answerable<80) 分數上限由 <100 回到 100。"
