## MODIFIED Requirements

### Requirement: All-subject wrong-question expedition

The connectome homepage SHALL surface **two distinct, visually differentiated entries** — NOT a single 出征 action opening a co-equal chooser:

1. a prominent **錯題出征** primary CTA (defined by this requirement), framed as **connectome-building** (修復錯題＝建立連線), and
2. a secondary **模考** entry (defined by `neurons-exam-set-expedition`), framed as a **pure exam drill that does NOT build the connectome**.

The 錯題出征 CTA SHALL be visually dominant over the 模考 entry (size / accent / connectome visual language), and the two SHALL be independently reachable: 模考 SHALL be available regardless of the wrong-question pool's state, and 錯題出征 SHALL be reachable regardless of exam-paper coverage.

**錯題出征** opens the existing `QuizModal` on the cross-subject pool of questions whose `questionHistory.lastResult === 'wrong'` (the "currently unmastered" set), spanning all subjects — NOT a single family. When that pool is empty, the 錯題出征 control SHALL surface an empty-state (disabled control or message) instead of opening a broken modal; the 模考 entry SHALL remain independently available.

#### Scenario: Homepage surfaces two differentiated entries
- **WHEN** the homepage renders
- **THEN** it SHALL present a prominent 錯題出征 primary CTA and a secondary 模考 entry as two distinct controls (NOT a single 出征 button opening a co-equal chooser)
- **AND** the 錯題出征 CTA SHALL be visually dominant over the 模考 entry

#### Scenario: Entries communicate connectome vs no-connectome
- **WHEN** the player views the two entries
- **THEN** the 錯題出征 entry SHALL carry connectome-building framing (修復＝建立連線) and the 模考 entry SHALL carry an explicit "純測驗 · 不產生連線" framing

#### Scenario: 錯題出征 with wrong questions opens the drill
- **WHEN** the player picks 錯題出征 and the cross-subject `lastResult === 'wrong'` pool is non-empty
- **THEN** `QuizModal` opens on exactly that pool, drawing from multiple subjects

#### Scenario: 錯題出征 with an empty pool
- **WHEN** the player picks 錯題出征 and there are no `lastResult === 'wrong'` questions
- **THEN** an empty-state message is shown and no `QuizModal` opens
- **AND** the 模考 entry SHALL remain independently selectable

#### Scenario: Pool is all-subject, not per-family
- **WHEN** the wrong-question pool spans multiple subjects
- **THEN** the 錯題出征 drill includes questions from all of them (no family restriction)
