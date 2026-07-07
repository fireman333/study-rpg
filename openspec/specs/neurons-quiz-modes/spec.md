# neurons-quiz-modes

## Purpose

Defines the per-family two-mode answering entry for neurons-tw (🆕 新題 = never-answered only / 🔄 錯題 = SRS-scheduled due review) and the spaced-repetition loop that backs it: scheduling on every answer via the `@study-rpg/core` binary SM-2 engine, the due-queue review pool, per-family chip counts, and the ✨/🤔 quality modifiers. Mode selects WHICH questions enter the pool; SRS scheduling itself is mode-agnostic (二階 skipSrs semantics). This delivers the SRS due-bias + quality modifiers that `neurons-mode` deferred to a follow-up.

## Requirements

### Requirement: FamilyPicker SHALL offer per-family 新題 and 錯題 quiz-mode entries

Each family card in the neurons-tw `FamilyPicker` SHALL surface two quiz-mode chips in place of the prior single 答題 button:
- **🆕 新題** — launches a quiz over ONLY the questions in that family the player has never answered (no `questionHistory` row for the question id). The chip SHALL show a badge with the **unseen count over the family's total question count (`unseen/total`, e.g. "694/700")**; the standalone「{total} 題」pill SHALL NOT be rendered separately on the card (the total lives in this badge). The chip SHALL be disabled (with a 「全部答過」 affordance) when the unseen count is 0, and SHALL show a neutral「—」badge when the family has no questions at all.
- **🔄 錯題** — launches an SRS review quiz over that family's questions that are currently due (`nextDueAt <= now`). The chip SHALL show a badge with today's due count (due-count only — no denominator) and SHALL be disabled (with a 「今日無到期」 affordance) when that count is 0.

The global 🎲 cross-family random-quiz entry and the ⚔️ 出征 entry SHALL remain unchanged.

#### Scenario: 新題 chip serves only never-answered questions
- **WHEN** the player taps a family's 🆕 新題 chip
- **THEN** the quiz pool SHALL contain only questions in that family with no `questionHistory` row
- **AND** the active exam-year filter SHALL still apply to that pool

#### Scenario: 新題 badge shows unseen over total
- **GIVEN** a family with 694 never-answered questions out of 700 total
- **WHEN** its card renders
- **THEN** the 🆕 新題 chip badge SHALL read "694/700"
- **AND** no standalone「{total} 題」pill SHALL be present in the card's chip row

#### Scenario: 錯題 chip serves the family's due review queue
- **WHEN** the player taps a family's 🔄 錯題 chip
- **THEN** the quiz pool SHALL be that family's questions whose `nextDueAt <= now`, ordered oldest-due-first

#### Scenario: 新題 chip disabled when the family is fully answered
- **WHEN** a family has 0 never-answered questions under the active filter
- **THEN** its 🆕 新題 chip SHALL be disabled with a 「全部答過」 affordance (in place of the `unseen/total` badge)

#### Scenario: 錯題 chip disabled when nothing is due today
- **WHEN** a family has 0 questions with `nextDueAt <= now`
- **THEN** its 🔄 錯題 chip SHALL be disabled with a 「今日無到期」 affordance, even if the family has scheduled-but-not-yet-due cards

### Requirement: Every answer SHALL update the question's SRS schedule regardless of quiz mode

On every answered question — in 新題 mode, 錯題 mode, or the 🎲 random entry — the system SHALL update that question's SRS schedule via `@study-rpg/core` `reviewCardBinary({ correct, prev, now })`, after the existing `recordCorrectAnswer` / `recordIncorrectAnswer` and `recordQuestionResult` calls. The quiz mode SHALL determine ONLY which questions enter the pool; it SHALL NOT gate whether scheduling happens. SRS persistence SHALL be best-effort (wrapped so a scheduling failure never breaks the answer flow) and SHALL log to a `[srs]` channel on failure rather than swallowing the error.

#### Scenario: Answering in 新題 mode still schedules the card
- **WHEN** the player answers a question wrong while in 新題 mode
- **THEN** that question's `questionHistory` row SHALL receive an SRS schedule with `nextDueAt` set
- **AND** the question SHALL subsequently appear in that family's 錯題 due queue once due

#### Scenario: SRS write failure does not break answering
- **WHEN** the SRS schedule write throws
- **THEN** the answer flow SHALL complete normally and the failure SHALL be logged to the `[srs]` channel

### Requirement: SRS schedule SHALL persist on the questionHistory row (Dexie v15, additive)

The `questionHistory` Dexie store SHALL be extended (Dexie v14 → v15, additive — no primary-key change) with fields `interval: number`, `easeFactor: number`, `nextDueAt: number | null`, `attempts: number`, and `correctCount: number`, and SHALL index `nextDueAt`. The v14 → v15 upgrade SHALL backfill rows whose `lastResult === 'wrong'` with an immediately-due card (`nextDueAt = now`, `interval = STANDARD_INITIAL_INTERVALS[0]`, `easeFactor = DEFAULT_EASE`); rows whose `lastResult === 'correct'` SHALL be left unscheduled (`nextDueAt` null).

#### Scenario: SRS fields persist after an answer
- **WHEN** a question is answered
- **THEN** its `questionHistory` row SHALL carry the updated `interval`, `easeFactor`, and `nextDueAt`

#### Scenario: v14→v15 upgrade backfills currently-wrong rows as due
- **WHEN** a v14 database with a `questionHistory` row where `lastResult === 'wrong'` is opened at v15
- **THEN** that row SHALL have `nextDueAt` set to an immediately-due value
- **AND** a row where `lastResult === 'correct'` SHALL keep `nextDueAt` null

### Requirement: 錯題 review pool SHALL be the due queue, oldest-due-first, capped per session

The 錯題 review pool for a family SHALL be built from `questionHistory` rows with `nextDueAt <= now`, ordered ascending by `nextDueAt` (oldest-due first), excluding `hasOptionImages` questions and questions filtered out by the active exam-year filter, and capped at `@study-rpg/core` `SRS_DAILY_CAP` questions per session.

#### Scenario: Due cards are served oldest-first
- **WHEN** a family's 錯題 review quiz starts with multiple due cards
- **THEN** questions SHALL be served in ascending `nextDueAt` order

#### Scenario: Session is capped at SRS_DAILY_CAP
- **WHEN** a family has more due cards than `SRS_DAILY_CAP`
- **THEN** the session SHALL serve at most `SRS_DAILY_CAP` of them

### Requirement: SRS schedule SHALL sync via the existing questionHistory R2 adapter

The new SRS fields SHALL sync as part of the existing `questionHistory` R2 TableAdapter (per-row LWW on the row's timestamp; `everWrong` keeps its monotonic-OR merge). The neurons R2 bundle `SCHEMA_VERSION` SHALL bump 13 → 14 and SHALL retain forward-compatible reader tolerance: a client on the older schema reading a newer bundle SHALL drop the unknown SRS fields without error, and a client on the newer schema reading an older bundle SHALL default the absent SRS fields (`interval 0`, `nextDueAt null`).

#### Scenario: SRS fields propagate under row LWW
- **WHEN** a device answers a question and the row syncs
- **THEN** another device pulling the bundle SHALL receive the updated SRS fields under the existing LWW rule

#### Scenario: Cross-version bundle tolerance
- **WHEN** a client on schema_version 13 pulls a bundle written at schema_version 14
- **THEN** it SHALL drop the unknown SRS fields without error
- **AND** a client on schema_version 14 reading a schema_version 13 bundle SHALL default the absent SRS fields

### Requirement: Quality modifiers SHALL adjust the SRS schedule of a just-answered question

After a correct answer is revealed, the QuizModal SHALL offer ✨「太簡單」 and 🤔「我亂猜的」 modifiers wired to the persisted `questionFlags`. ✨ SHALL apply `reviewCardBinaryEasy` (lengthen interval, raise ease); 🤔 SHALL apply `reviewCardBinaryGuessed` (reset interval to 1). Each modifier SHALL be three-state: tapping applies it, tapping the active modifier again SHALL restore the default post-answer SRS snapshot. Neither modifier SHALL alter `everWrong` — neurons merges `everWrong` via monotonic-OR (the 永久錯題庫 invariant of `neurons-wrong-answer-list`), so a local clear would be futile and contradict that capability (this is the deliberate divergence from 二階, whose `everWrong` is LWW).

#### Scenario: ✨ 太簡單 lengthens the schedule
- **WHEN** the player taps ✨「太簡單」 after a correct answer
- **THEN** the question's SRS schedule SHALL be recomputed via `reviewCardBinaryEasy`
- **AND** the row's `everWrong` SHALL be left unchanged

#### Scenario: 🤔 我亂猜的 resets the interval
- **WHEN** the player taps 🤔「我亂猜的」
- **THEN** the question's interval SHALL be reset to 1 via `reviewCardBinaryGuessed`
- **AND** the row's `everWrong` SHALL be left unchanged

#### Scenario: Re-tapping the active modifier restores the default snapshot
- **WHEN** the player taps an already-active modifier again
- **THEN** the question's SRS schedule SHALL be restored to the default post-answer snapshot

### Requirement: Wrong answers SHALL offer opt-in 看錯 / 觀念洞 error-cause modifiers wired to questionFlags

After an **incorrect** answer is revealed, the QuizModal SHALL offer two opt-in error-cause modifiers — 👁「看錯」(misread / careless) and 💡「觀念洞」(genuine knowledge gap) — as the post-wrong symmetric counterpart to the existing post-correct ✨「太簡單」/ 🤔「我亂猜的」modifiers. These SHALL persist to the existing `questionFlags` store via two **additive boolean** fields (`wrongAnswerMarked` for 看錯, `insightMarked` for 觀念洞) that reuse the existing coexist-and-LWW pattern; adding them SHALL NOT change the store's primary key and SHALL NOT require a Dexie/R2 schema-version bump. Each modifier SHALL be three-state: tapping applies it, tapping the active modifier again clears it. The two error-cause modifiers SHALL render **only after a wrong answer**, and the ✨/🤔 modifiers **only after a correct answer**, so the player never sees all four at once. Neither error-cause modifier SHALL alter `everWrong` (the 永久錯題庫 monotonic-OR invariant of `neurons-wrong-answer-list` is preserved).

The modifiers SHALL affect subsequent review/expedition priority:
- 看錯 SHALL **de-prioritise** the question in the 錯題 review / 出征 ordering (it is likely already known), and SHALL NOT promote it into the targeted-drill high-priority set.
- 觀念洞 SHALL **prioritise** the question in the 錯題 review / 出征 ordering AND apply a **distinct, harsher review schedule** via a dedicated `reviewCardBinaryInsight` engine function — resetting the next interval to 1 **and** decrementing the ease factor (a self-declared concept gap decays ease faster than a plain wrong answer, and unlike 🤔「我亂猜的」it does NOT preserve ease), so a concept gap re-graduates more slowly than either a plain wrong or a lucky guess. The three post-answer schedules SHALL therefore be **distinct on ease**: 觀念洞 (lowest ease) < plain-wrong < 我亂猜的 (ease preserved). 觀念洞 SHALL NOT clear `everWrong`. The exact ease multiplier is implementation-defined and dogfood-tunable (initial value one notch harsher than the plain-wrong multiplier), floored at the existing ease floor so a single flag cannot collapse a card's ease in one hit.

The modifier icons SHALL render through the existing neurons `<EmojiIcon>` pixel-art component (mapped codepoint PNG assets), NOT raw OS emoji.

Because the `questionFlags` row now carries four coexisting boolean flags (`easyMarked`, `guessedMarked`, `wrongAnswerMarked`, `insightMarked`), every existing and new writer SHALL preserve the flags it does not own: the existing ✨/🤔 setters/toggles SHALL NOT clear the two new error-cause flags when they persist, and the new error-cause setters SHALL NOT clear ✨/🤔. The R2 `questionFlags` sync adapter SHALL serialize and apply all four boolean fields, and on apply SHALL preserve any locally-set flag that an incoming row omits (preserve-on-omission), with no R2 SCHEMA_VERSION bump.

#### Scenario: 看錯 marks a careless miss and de-prioritises it

- **WHEN** the player taps 👁「看錯」after a wrong answer
- **THEN** `questionFlags.wrongAnswerMarked` SHALL be set true for that question with an updated `updatedAt`
- **AND** the question SHALL be de-prioritised in the 錯題 review / 出征 ordering
- **AND** `everWrong` SHALL remain true (unchanged)

#### Scenario: 觀念洞 marks a knowledge gap and applies a distinct harsher schedule

- **WHEN** the player taps 💡「觀念洞」after a wrong answer
- **THEN** `questionFlags.insightMarked` SHALL be set true with an updated `updatedAt`
- **AND** the question SHALL be prioritised in the 錯題 review / 出征 ordering
- **AND** its schedule SHALL be set via `reviewCardBinaryInsight` — interval reset to 1 with a **lowered ease factor** (strictly lower than the ease a plain wrong answer would leave, and lower than 我亂猜的 which preserves ease), floored at the ease floor
- **AND** `everWrong` SHALL remain true (unchanged)

#### Scenario: Un-flagging 觀念洞 restores the default schedule

- **GIVEN** 觀念洞 is active on the current question (its schedule was set via `reviewCardBinaryInsight`)
- **WHEN** the player taps 💡「觀念洞」again to clear it
- **THEN** `questionFlags.insightMarked` SHALL be cleared to false
- **AND** the question's SRS schedule SHALL be restored to the default post-answer snapshot (the ease decrement SHALL NOT persist after un-flagging)

#### Scenario: Error-cause modifiers only appear after a wrong answer

- **WHEN** the player answers correctly
- **THEN** the 看錯 / 觀念洞 modifiers SHALL NOT render (only ✨ / 🤔 may appear)
- **AND WHEN** the player answers incorrectly, the ✨ / 🤔 modifiers SHALL NOT render (only 看錯 / 觀念洞 may appear)

#### Scenario: Tapping an active modifier clears it

- **GIVEN** 看錯 is active on the current question
- **WHEN** the player taps 👁「看錯」again
- **THEN** `questionFlags.wrongAnswerMarked` SHALL be cleared to false with an updated `updatedAt`

#### Scenario: Additive boolean fields require no schema bump

- **WHEN** `wrongAnswerMarked` / `insightMarked` are written to a `questionFlags` row
- **THEN** the write SHALL use the existing store and primary key with no Dexie `.stores()` change and no R2 SCHEMA_VERSION bump
- **AND** a row written by an older client that omits these fields SHALL read them as false (preserve-on-omission)

#### Scenario: Existing ✨/🤔 setters preserve the new error-cause flags

- **GIVEN** a question whose `wrongAnswerMarked` is true
- **WHEN** the player later toggles ✨「太簡單」on that question (via the existing `setEasy` / `toggleEasy` path)
- **THEN** `easyMarked` SHALL update
- **AND** `wrongAnswerMarked` SHALL remain true (the ✨ setter SHALL NOT reconstruct the row without the error-cause flags)

#### Scenario: R2 adapter round-trips all four flags

- **GIVEN** a local `questionFlags` row with `insightMarked` true
- **WHEN** the row is serialized and re-applied through the `questionFlags` R2 adapter
- **THEN** `insightMarked` SHALL survive the round-trip
- **AND** an incoming row that omits `insightMarked` SHALL NOT clear the locally-set value (preserve-on-omission), with no R2 SCHEMA_VERSION bump
