## MODIFIED Requirements

### Requirement: Growth-signal exploration economy

The system SHALL maintain a per-NT-branch **neural-energy** pool that is BOTH the exploration fuel and the pull cost (one currency, no separate manual-pull balance). A correct quiz answer SHALL accrue energy into the pool of the branch that the answered subject belongs to, resolved via `FAMILY_NT_BRANCH`; reading time SHALL accrue across all four branch pools (even split). Accrual SHALL be scaled by the active answer streak, by that branch's mastery tier, and by the **acceleration energy multiplier** `energyAccel` (the additive, hard-capped pool from `neurons-acceleration-system` — composing active consumables such as the reframed `family-buff`/`bolus` and owned energy-lane permanents). A branch's frontier position SHALL be determined by its accumulated earned energy against the cumulative pacing cost of the nodes already settled — i.e. the frontier advances while `earned − Σcost(settled) ≥ cost(nextNode)`. The system MUST NOT introduce any monetary, IAP, ad-reward, or non-gameplay path to advance exploration or settle nodes.

#### Scenario: A correct answer accrues to the subject's branch pool
- **WHEN** the user answers a question correctly in subject S
- **THEN** earned energy is added to the per-branch pool of `FAMILY_NT_BRANCH[S]` (scaled by streak, mastery, and the capped `energyAccel`)
- **AND** no other branch's pool is changed by that event
- **AND** when that branch's region is visible the growth cone advances toward its next fogged node

#### Scenario: Reading time feeds branch pools
- **WHEN** the user accrues reading time
- **THEN** earned energy is added across the four branch pools (even split) at the reading rate

#### Scenario: Acceleration energy multiplier composes under its cap
- **WHEN** active energy-lane consumables and owned permanents raise `energyAccel` toward its cap
- **THEN** the per-event accrual is multiplied by the clamped `energyAccel` (never exceeding `ENERGY_ACCEL_CAP`)
- **AND** with no active consumable and no owned permanent `energyAccel` SHALL be `1.0` (no change to prior behavior)

#### Scenario: No monetary path
- **WHEN** any exploration advance or node settle is triggered
- **THEN** the trigger is a gameplay action (correct answer / reading time) only
- **AND** no real-money, IAP, or ad-reward path exists to advance or settle

### Requirement: Exploration teams from collected variants

Collected variants SHALL act as exploration units ("Pikmin"), partitioned by NT branch; each branch's team explores its own region. Per branch, base exploration speed SHALL be a fixed positive value so that a player with an empty team for that branch can still make progress. A larger or rarer set of collected variants in a branch SHALL increase that branch's team exploration speed (a buff that never hard-blocks progress). The effective exploration speed SHALL additionally be scaled by the **acceleration speed multiplier** `speedAccel` (the additive, hard-capped pool from `neurons-acceleration-system` — composing active speed-lane consumables such as `surge` and owned speed-lane permanents), clamped to `SPEED_ACCEL_CAP`.

#### Scenario: Empty branch team still progresses
- **WHEN** a player with zero collected variants in branch B accrues growth signal in B
- **THEN** exploration in B still advances at the fixed base speed (never zero / blocked)

#### Scenario: Collected variants buff the owning branch's speed
- **WHEN** a player has collected more (or rarer) variants in branch B
- **THEN** branch B's team exploration speed is higher than its base speed
- **AND** the speed increases monotonically with B's collection strength
- **AND** collecting variants in branch B does not change another branch's team speed

#### Scenario: Acceleration speed multiplier composes under its cap
- **WHEN** active `surge` consumables and/or owned speed-lane permanents raise `speedAccel`
- **THEN** the branch's effective exploration speed SHALL be multiplied by the clamped `speedAccel` (never exceeding `SPEED_ACCEL_CAP`)
- **AND** with no speed boost active `speedAccel` SHALL be `1.0`
