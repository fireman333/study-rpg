## ADDED Requirements

### Requirement: Image-placeholder banner on hasImage questions in boss mode

When the active boss question's `hasImage === true` and no actual image asset is available, the BossModal SHALL render a placeholder banner above the question stem informing the player that the original question had an accompanying image which is not yet imported.

The banner SHALL be visually distinct (consistent with the QuizModal banner palette) and SHALL appear in answering state. Since boss mode does not show explanations (per existing `No explanations shown during boss run` requirement), there is no reveal state to consider.

Future image support: when a future content-pack revision adds an `imageUrl` (or equivalent) field and the asset is reachable, the banner SHALL be replaced by the rendered image. The component encapsulates the decision logic.

#### Scenario: hasImage true shows banner during boss

- **WHEN** the BossModal renders a question with `hasImage === true` and no available image asset
- **THEN** a visually distinct banner SHALL appear above the question stem
- **AND** the banner SHALL communicate that the question originally had an image which is not yet imported
- **AND** the countdown timer SHALL continue running unaffected

#### Scenario: hasImage false shows no banner during boss

- **WHEN** the BossModal renders a question with `hasImage === false`
- **THEN** no placeholder banner SHALL appear

### Requirement: Boss mode SHALL NOT offer skip on hasImage questions

Unlike QuizModal, the BossModal SHALL NOT render a "跳過此題" action on the placeholder banner. The player MUST either answer the question or leave it unanswered (which counts against their pass threshold).

Rationale: boss runs are timed assessments with a fixed 30-question sample size and a 60% pass threshold. Allowing skip would break the sample-size and scoring contract — players could strategically skip uncertain questions to inflate their effective answer rate.

The player MAY still close the modal mid-run via backdrop click (existing behavior); this counts as run-end-with-current-correct-count, not skip.

#### Scenario: No skip button on boss hasImage banner

- **WHEN** the BossModal renders a hasImage question
- **THEN** the placeholder banner SHALL NOT contain a skip button or skip action
- **AND** the only ways to advance SHALL be answering an MCQ option or letting the timer expire

#### Scenario: Unanswered hasImage question counts as wrong at run end

- **WHEN** the timer expires while the player is viewing a hasImage question they have not answered
- **THEN** the run SHALL finalize with that question counted as not-correct (existing fail-path behavior)
- **AND** consolation reward SHALL apply if `correctQ / 30 < 0.6`
