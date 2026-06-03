## ADDED Requirements

### Requirement: QuizModal SHALL display keyboard-shortcut hint badges that match the active phase

The QuizModal SHALL render small visual hint badges on the buttons that have a
keyboard shortcut, so desktop users can discover the existing hotkeys. Each badge
SHALL indicate the key that the `useQuizHotkeys` dispatcher actually handles for
that button **in the current phase**, and SHALL NOT be shown when pressing that
key in the current phase would do something else (no misleading badge).

Badges SHALL be presentational only: they SHALL be marked `aria-hidden` (the
authoritative key announcement remains the existing `aria-label` / `title`), and
their presence SHALL NOT change any keyboard behavior, persistence, or sync.

#### Scenario: Asking phase shows option-number badges
- **WHEN** the QuizModal is in the asking phase (no answer picked yet) on a desktop pointer device
- **THEN** each of the four answer-option buttons shows a subscript badge (`₁`, `₂`, `₃`, `₄`) matching the `1`–`4` highlight keys
- **AND** the bookmark / 太簡單 / 我亂猜 action badges are NOT shown (those keys are not active in the asking phase)

#### Scenario: Answered phase shows action badges
- **WHEN** the QuizModal is in the answered phase (an answer has been picked) on a desktop pointer device
- **THEN** the 收藏 button shows `₁`, the ✨ 太簡單 button shows `₂`, the 🤔 我亂猜 button shows `₃`, and the 下一題 button shows `↵`
- **AND** the answer-option `₁`–`₄` badges are NOT shown (the options are no longer selectable and `1`/`2`/`3` are reassigned to bookmark/easy/guessed)

#### Scenario: Touch devices hide all badges
- **WHEN** the device has no fine pointer / hover capability (touch-only)
- **THEN** no hotkey badge is rendered (the `@media (hover: hover) and (pointer: fine)` gate hides them)
- **AND** the underlying keyboard handling is unchanged

#### Scenario: Badge has no semantic announcement
- **WHEN** a screen reader traverses a button that carries a hotkey badge
- **THEN** the badge text is not announced (it is `aria-hidden`)
- **AND** the button's existing `aria-label` continues to convey the shortcut number

#### Scenario: Buttons without a shortcut carry no badge
- **WHEN** the QuizModal renders the 結束 button (which has no keyboard shortcut)
- **THEN** no hotkey badge is shown on it
