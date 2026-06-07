## MODIFIED Requirements

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-FAMILY **neural-energy** pool (11 pools) that is BOTH the exploration fuel and the pull cost (one currency per family, no separate manual-pull balance). A correct quiz answer in subject S SHALL accrue energy into family S's own pool directly (S is the family — no neurotransmitter-branch indirection). Reading time SHALL accrue **entirely to the single subject family the player has selected for the current reading session** (the per-subject reading model — there SHALL be no even-split across families); switching the reading subject SHALL end the prior session before the new family begins accruing. Accrual SHALL be scaled by the active answer streak, by that family's mastery tier, by the capped acceleration energy multiplier `energyAccel`, and by the capped synapse cross-family bonus. The settle cost SHALL follow the front-loaded **capped** pacing schedule `cost(N) = round(PACING_BASE × (1 + PACING_K · min(N, RAMP_CAP_N)))` for the N-th cumulative settle within a family (0-indexed); the ramp climbs for the first `RAMP_CAP_N` settles and then **flattens** to a constant `round(PACING_BASE × (1 + PACING_K · RAMP_CAP_N))` for every later settle, so the completionist tail (settles past the cap) costs a fixed amount rather than escalating without bound. First-cut constants (dogfood-telemetry-tunable): `PACING_BASE = 11`, `PACING_K = 0.10`, `RAMP_CAP_N = 20`, `CORRECT_ENERGY = 3`, `READING_ENERGY = 3`. The cumulative settle **index** N itself SHALL remain uncapped (the family can keep settling into 二回目 and beyond); only the per-settle `cost(N)` function is capped. A family's frontier advances inward from its border entry while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

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
- **THEN** the `cost(N) = round(PACING_BASE × (1 + PACING_K · min(N, RAMP_CAP_N)))` schedule applies with the recalibrated shared constants
- **AND** the first settle (N=0) costs `PACING_BASE` (cheap onboarding) and later settles up to the cap cost strictly more (K > 0)

#### Scenario: Ramp flattens past the cap so the completionist tail does not escalate

- **WHEN** a family's cumulative settle index N exceeds `RAMP_CAP_N`
- **THEN** `cost(N)` SHALL equal the constant `round(PACING_BASE × (1 + PACING_K · RAMP_CAP_N))` for every such settle
- **AND** the per-settle cost SHALL NOT grow further as N increases beyond the cap

#### Scenario: No monetary path

- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle
