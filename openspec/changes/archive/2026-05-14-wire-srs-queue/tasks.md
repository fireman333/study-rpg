## Tasks

### Spec

- [x] **T1**: Write `specs/srs-queue/spec.md` with 5 requirements
- [x] **T2**: Write `specs/quiz-runner/spec.md` delta — 1 MODIFIED requirement: random selection becomes due-biased

### Impl

- [x] **T3**: Add `dueQuestionIds: QuestionId[]` state to `App.tsx`
- [x] **T4**: Hydrate `dueQuestionIds` from `db.srs.toArray()` filtered by `dueAt <= Date.now()` on mount
- [x] **T5**: Update `QuizModal` to accept `dueQuestionIds?: QuestionId[]` prop; biased selection in `questions` `useMemo`
- [x] **T6**: Update `onQuizComplete` to receive `QuestionResult[]` (questionId + correct); upsert SrsCard per result via `reviewCard(card ?? newCard(qid), correct ? 4 : 2)` → `db.srs.put`
- [x] **T7**: Refresh `dueQuestionIds` after quiz completes

### Verify

- [x] **T8**: `pnpm -r typecheck`
- [x] **T9**: `pnpm --filter @study-rpg/medexam-tw build`; src/ clean
- [x] **T10**: Chrome MCP smoke — clear IDB → answer 1 quiz (1 right + 1 wrong of 5) → confirm `db.srs.count() >= 2` (at least 1 wrong, 1 right of new cards) → reload → open new quiz → confirm wrong-answered question reappears

### Archive

- [x] **T11**: `openspec validate wire-srs-queue`
- [x] **T12**: `openspec archive wire-srs-queue -y`
- [x] **T13**: auto-git commit
