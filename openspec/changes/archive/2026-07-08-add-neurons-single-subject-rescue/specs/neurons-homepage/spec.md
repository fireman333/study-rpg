## ADDED Requirements

### Requirement: FamilyPicker SHALL offer a header-level always-on 考前救急 entry independent of the weakness gate

The homepage `FamilyPicker` region SHALL render a header-level, always-visible "考前救急" entry affordance that opens the single-subject rescue setup (choose family + exam date + daily-minutes budget, per `neurons-single-subject-rescue`). This entry SHALL NOT be gated by the `pressure >= 0.45` threshold that governs the per-card one-tap targeted-drill button (per `neurons-weakness-radar`), because the subjects most in need of rescue (thin history, or currently strong-looking but exam-imminent) would otherwise have no reachable entry. Being a single header-level affordance SHALL naturally express the "one rescue at a time" constraint (no per-card rescue buttons on the 11 family cards).

#### Scenario: Rescue entry is reachable even for a green / undiagnosed family

- **GIVEN** a family whose weakness-pressure is below 0.45 (no per-card targeted-drill button rendered)
- **WHEN** the homepage renders
- **THEN** the header-level "考前救急" entry SHALL still be present and able to start a rescue for that family

#### Scenario: Rescue entry opens setup, not an immediate drill

- **WHEN** the player taps the header "考前救急" entry
- **THEN** it SHALL open the rescue setup (family + exam date + daily minutes), not launch a zero-setup drill

### Requirement: A family card with an active rescue plan SHALL render a rescue chip in place of its weakness indicator

WHEN a family has an active rescue plan (per `neurons-single-subject-rescue`), its `FamilyPicker` card SHALL replace the WeaknessIndicator row with a rescue chip that surfaces the countdown, RescueScore, and a "今日佇列" CTA (e.g. "D-3 · RescueScore 62 · 今日佇列"). This override SHALL apply only to the one family with the active plan; all other family cards SHALL render their normal weakness indicator unchanged. When the plan is archived or abandoned, the card SHALL revert to the normal weakness indicator.

#### Scenario: Active-rescue family card shows the rescue chip

- **GIVEN** an active rescue plan for family A
- **WHEN** the `FamilyPicker` grid renders
- **THEN** family A's card SHALL show a rescue chip with countdown, RescueScore, and a 今日佇列 CTA
- **AND** every other family card SHALL render its normal weakness indicator unchanged

#### Scenario: Card reverts after the plan ends

- **WHEN** family A's rescue plan is archived or abandoned
- **THEN** family A's card SHALL revert to rendering its normal weakness indicator
