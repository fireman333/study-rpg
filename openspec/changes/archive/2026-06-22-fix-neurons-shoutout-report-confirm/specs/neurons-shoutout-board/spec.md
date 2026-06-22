## MODIFIED Requirements

### Requirement: Report a message
A logged-in player SHALL be able to report another player's message from the board. Reporting SHALL be a two-step action: activating a card's report control SHALL open a confirmation dialog rather than immediately submitting a report, so that an accidental tap on the report control never sends a report. The confirmation dialog SHALL show the targeted message so the player can confirm which card they are reporting.

#### Scenario: Report control opens a confirmation dialog
- **WHEN** a player activates the report control on another player's card
- **THEN** a confirmation dialog opens showing the targeted message and no report is submitted yet

#### Scenario: Confirm the report
- **WHEN** the player confirms in the dialog
- **THEN** the app `POST`s a report for that message and confirms receipt without exposing other reporters

#### Scenario: Cancel the report
- **WHEN** the player cancels or dismisses the dialog
- **THEN** no report is submitted and the board is unchanged
