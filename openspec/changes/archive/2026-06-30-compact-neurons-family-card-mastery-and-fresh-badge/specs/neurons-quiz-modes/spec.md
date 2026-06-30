## MODIFIED Requirements

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
