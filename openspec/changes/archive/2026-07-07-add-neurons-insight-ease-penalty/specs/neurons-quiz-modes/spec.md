## MODIFIED Requirements

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
