## MODIFIED Requirements

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-FAMILY **neural-energy** pool (11 pools) that is BOTH the exploration fuel and the pull cost (one currency per family, no separate manual-pull balance). A correct quiz answer in subject S SHALL accrue energy into family S's own pool directly (S is the family — no neurotransmitter-branch indirection). Reading time SHALL accrue **entirely to the single subject family the player has selected for the current reading session** (the per-subject reading model — there SHALL be no even-split across families); switching the reading subject SHALL end the prior session before the new family begins accruing. Accrual SHALL be scaled by the active answer streak, by that family's mastery tier, by the capped acceleration energy multiplier `energyAccel`, and by the capped synapse cross-family bonus. The settle cost SHALL follow the front-loaded pacing schedule `cost(N) = round(PACING_BASE × (1 + PACING_K · N))` for the N-th cumulative settle within a family (0-indexed, uncapped into 二週目), recalibrated for per-family fragmentation (first-cut `PACING_BASE = 14`, `PACING_K = 0.10`, `CORRECT_ENERGY = 3`, `READING_ENERGY = 3`; dogfood-telemetry-tunable). A family's frontier advances inward from its border entry while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to its family's pool

- **WHEN** the user answers a question correctly in subject S
- **THEN** earned energy is added to family S's pool (scaled by streak, S's mastery, capped `energyAccel`, and S's capped synapse bonus)
- **AND** no other family's pool is changed by that event

#### Scenario: Reading a chosen subject feeds only that subject's pool

- **WHEN** the user runs a reading session for a selected subject S and a study-minute accrues
- **THEN** the per-minute reading energy is added entirely to family S's pool
- **AND** no other family's pool is changed by that reading minute
- **AND** the global `totalStudyMinutes` counter still increments (unchanged) for achievements / leaderboard / character card

#### Scenario: Recalibrated front-loaded pacing applies per family

- **WHEN** energy accrues and settles in any family
- **THEN** the `cost(N) = round(PACING_BASE × (1 + PACING_K · N))` schedule applies with the recalibrated shared constants
- **AND** the first settle (N=0) costs `PACING_BASE` (cheap onboarding) and later settles cost strictly more (K > 0)

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Maze camera SHALL be activity-contextual

The maze camera SHALL frame the view by the player's current activity, and SHALL accept manual control on both desktop and touch devices. While the player is answering a quiz, the camera SHALL zoom in to the answered subject's family walker so the player watches that character move along its corridor as the answer resolves/settles. While the player is reading a **chosen subject**, the camera SHALL focus that subject's family cluster (not the whole map). Manual control SHALL remain available on desktop (wheel-zoom + drag-pan) and on touch devices (**two-finger pinch-zoom + one-finger pan + double-tap to recenter**); the contextual framing is the default per activity and yields to manual control. Tapping a subject in the family picker SHALL fly the camera to that family's cluster as a **sticky manual focus** that holds until the next user interaction (pan / zoom / another family / recenter); a **recenter control** SHALL return to the default whole-map framing. The answer-driven auto-focus SHALL remain time-boxed but SHALL NOT interrupt an active sticky manual focus. Zoom SHALL be continuous and clamped (between whole-map fit and single-cluster framing) and SHALL NOT be persisted across sessions (returning to the homepage resets to the default framing). Manual touch/drag/zoom SHALL be scoped so it does not hijack page scroll. Under reduced-motion the camera transition SHALL degrade to an instant cut (no animated zoom).

#### Scenario: Quiz answering zooms to the answered family's walker

- **WHEN** the player answers a question in subject S
- **THEN** the camera zooms in to family S's walker and the player sees it move along its corridor (the resolving settle, if any, animates there)

#### Scenario: Reading focuses the chosen subject's family

- **WHEN** the player is in a reading session for a chosen subject S
- **THEN** the camera focuses family S's cluster (not the whole map)

#### Scenario: Mobile touch zoom and pan

- **WHEN** the player uses two fingers to pinch or one finger to drag on the maze on a touch device
- **THEN** the maze zooms (pinch) or pans (drag) accordingly
- **AND** the gesture does not hijack page vertical scroll
- **AND** a double-tap recenters to the default whole-map framing

#### Scenario: Manual family focus is sticky until the next interaction

- **WHEN** the player taps a subject in the family picker
- **THEN** the camera flies to that family's cluster and stays there
- **AND** it does not auto-expire back to the whole map after a delay
- **AND** an answer-driven auto-focus does not interrupt the active sticky manual focus

#### Scenario: Recenter returns to the whole-map framing

- **WHEN** the player activates the recenter control while focused on a family
- **THEN** the camera returns to the default whole-map framing and clears the sticky manual focus

#### Scenario: Reduced-motion uses an instant camera cut

- **WHEN** reduced-motion is enabled and the activity or focus changes
- **THEN** the camera changes framing with an instant cut, not an animated zoom

## ADDED Requirements

### Requirement: Quiz-time maze-energy feedback strip with settle-threshold escalation

After a correct answer, the QuizModal SHALL surface a lightweight, **non-interactive** maze-energy feedback strip above the explanation (詳解) showing the answered subject's family and the energy gained toward that family's next maze node. The strip SHALL be presentational only — it SHALL NOT accept pinch/pan/wheel input (`pointer-events: none`) and SHALL NOT itself perform the settle/pull (the homepage maze performs settles). When the correct answer's accrual **crosses the threshold to settle the next node** for that family (the family's affordable-settle count increases), the strip SHALL escalate to a brief mini-maze animation that replays the walker advancing one node. The escalation animation SHALL bound its cost: its animation loop SHALL run only for the duration of the ~2-second advance then stop, SHALL render only the focused family's sub-view, and SHALL NOT run during the modal's enter/exit transition. The strip SHALL be responsive (compact on mobile so it does not push the explanation below the fold) and SHALL degrade under reduced-motion to a static end-state cue. The strip SHALL NOT appear while the player is still reading the question stem (only after the answer is submitted). On modal close the homepage maze SHALL still perform its existing activity-contextual auto-zoom to the answered family.

#### Scenario: Correct answer shows the energy feedback strip

- **WHEN** the player answers a question correctly in subject S
- **THEN** a non-interactive feedback strip appears above the 詳解 showing family S and the energy gained toward S's next node
- **AND** the strip does not accept pinch/pan/wheel input
- **AND** the strip is not shown before the answer is submitted

#### Scenario: Crossing a settle threshold escalates to a one-node advance animation

- **WHEN** a correct answer's accrual raises family S's affordable-settle count (a node settle is now due)
- **THEN** the strip escalates to a brief mini-maze animation replaying the walker advancing one node
- **AND** the animation loop runs only for that ~2-second advance and then stops

#### Scenario: Feedback strip is responsive and reduced-motion safe

- **WHEN** the QuizModal is viewed on a narrow phone, or with reduced-motion enabled
- **THEN** the strip stays compact (it does not push the explanation below the fold) and, under reduced-motion, shows a static end-state cue instead of the animation

#### Scenario: Strip does not perform the settle

- **WHEN** the feedback strip or its escalation animation plays
- **THEN** the actual energy consumption, pull, and walker advance are performed by the homepage maze reconcile, not by the strip
- **AND** the strip remains a display-only replay
