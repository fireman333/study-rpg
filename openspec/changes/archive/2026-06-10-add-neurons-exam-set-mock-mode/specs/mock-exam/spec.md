## REMOVED Requirements

### Requirement: Mock exam picker surfaces year × session × paper grid

**Reason**: `mock-exam` was a TBD placeholder created by archiving the legacy 一階-engine
`add-mock-exam-mode` change. It was never implemented in neurons, and the 一階 app
(`apps/medexam-tw`) that it described has been removed from the repo. The 模考 picker that
neurons actually ships is specified by `neurons-exam-set-expedition` (per-冊 paper picker with
`questionHistory`-derived coverage).
**Migration**: Use `neurons-exam-set-expedition` — "Year + 次別 full-question-set expedition
picker".

### Requirement: Mock runner presents all questions in the paper (≈100, source-dependent for 一階國考) in original paper order

**Reason**: Superseded by the neurons dual-mode runner. The whole-paper-in-order behavior now
lives in `neurons-exam-set-expedition`'s `模擬考試` mode (full 冊 in question order via the new
full-paper pool builder).
**Migration**: Use `neurons-exam-set-expedition` — "模擬考試 mode SHALL load the full paper …".

### Requirement: Mock runner uses stopwatch and auto-pauses on idle/visibility

**Reason**: The stopwatch / idle-pause design belonged to the 一階 engine's integrity model and
is not part of the neurons mock-exam port (neurons 模擬考試 is a pure-practice閉卷 run without a
graded stopwatch).
**Migration**: None — feature intentionally dropped for the neurons port. If a timer is desired
later it will be specified as a new requirement under `neurons-exam-set-expedition`.

### Requirement: Mock submit triggers full-paper scoring and persists attempt

**Reason**: Depended on the 一階 `mockAttempts` Dexie table and `engine-rewards`
`REWARD.mockExamPass` XP/stat/loot burst — neurons has no XP / stat / loot engine. neurons mock
scoring is corpus-agnostic (`scoreMockExam` in `@study-rpg/core`) and persists only a local-only
draft, not a graded attempt record.
**Migration**: Use `core-npm-package` — "Exam-set mock engine exports" (scoring) and
`neurons-exam-set-expedition` — "Mock scoring SHALL report accuracy, national-equivalent score …".

### Requirement: Mock result screen displays full per-question breakdown

**Reason**: Replaced by the neurons review state.
**Migration**: Use `neurons-exam-set-expedition` — "Submitting a mock exam SHALL reveal all
explanations, lock answers, and enter review".

### Requirement: Result screen offers one-click "add wrong answers to SRS"

**Reason**: The 一階 design enqueued wrong answers to an SRS queue via an explicit button. The
neurons port instead batch-records wrong + unanswered to the `questionHistory` 錯題本 at submit
(monotonic-OR `everWrong`), feeding the ⚔️ 錯題出征 pool; SRS scheduling stays mode-independent.
**Migration**: Use `neurons-exam-set-expedition` — "Mock submission SHALL warn about unanswered
questions and batch-record wrong + unanswered to the 錯題本".

### Requirement: Mock attempts are routable and resumable across reloads

**Reason**: Replaced by the neurons local-only `mockExamDrafts` resume design (draft per paper +
`isDraftFresh` stale detection), without the 一階 in-progress attempt record.
**Migration**: Use `neurons-exam-set-expedition` — "In-progress mock exams SHALL be resumable
after accidental exit".

### Requirement: Reward burst is treated as exception to per-minute rate caps

**Reason**: Specific to the 一階 `engine-rewards` `REWARD.mockExamPass` stat burst, which does
not exist in neurons (no XP / stat / loot engine). neurons mock exams grant no progression reward.
**Migration**: None — neurons 模擬考試 is pure-practice (no reward burst), per
`neurons-exam-set-expedition`'s pure-practice requirement.
