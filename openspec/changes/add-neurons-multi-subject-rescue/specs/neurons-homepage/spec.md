## MODIFIED Requirements

### Requirement: FamilyPicker SHALL offer a header-level always-on 考前救急 entry independent of the weakness gate

The homepage `FamilyPicker` region SHALL render a header-level, always-visible "考前救急" entry affordance that opens the **rescue-plans overview** (a list of the currently-active plans plus an "＋ 新增計畫" action; per `neurons-single-subject-rescue`). When no plan is active the entry MAY open setup directly. Adding a plan opens setup (choose family + exam date + daily-minutes budget). This entry SHALL NOT be gated by the `pressure >= 0.45` threshold that governs the per-card one-tap targeted-drill button (per `neurons-weakness-radar`), because the subjects most in need of rescue (thin history, or currently strong-looking but exam-imminent) would otherwise have no reachable entry. The header entry SHALL be the single top-level entry point for rescue (no per-card rescue-start buttons on the 11 family cards); it SHALL NOT imply a one-rescue-at-a-time constraint — multiple plans may coexist and each active family surfaces its own card chip (per the card-chip requirement).

#### Scenario: Rescue entry is reachable even for a green / undiagnosed family

- **GIVEN** a family whose weakness-pressure is below 0.45 (no per-card targeted-drill button rendered)
- **WHEN** the homepage renders
- **THEN** the header-level "考前救急" entry SHALL still be present and able to start a rescue for that family

#### Scenario: Rescue entry opens the overview, and adding a plan opens setup

- **WHEN** the player taps the header "考前救急" entry with at least one active plan
- **THEN** it SHALL open the rescue-plans overview listing the active plans plus an add-new-plan action
- **AND** choosing add-new-plan SHALL open setup (family + exam date + daily minutes), not launch a zero-setup drill

### Requirement: A family card with an active rescue plan SHALL render a rescue chip in place of its weakness indicator

WHEN a family has an active rescue plan (per `neurons-single-subject-rescue`), its `FamilyPicker` card SHALL replace the WeaknessIndicator row with a rescue chip that surfaces the countdown, RescueScore, and a "今日佇列" CTA (e.g. "D-3 · RescueScore 62 · 今日佇列"). This override SHALL apply to **every** family that has an active plan — each such card renders its own rescue chip independently; a family with no active plan SHALL render its normal weakness indicator unchanged. Tapping a card's rescue chip SHALL open that family's own rescue scene instance. When a family's plan is archived or abandoned, only that family's card SHALL revert to the normal weakness indicator.

#### Scenario: Every active-rescue family card shows its own rescue chip

- **GIVEN** active rescue plans for families A and B
- **WHEN** the `FamilyPicker` grid renders
- **THEN** both A's and B's cards SHALL each show their own rescue chip (countdown, RescueScore, 今日佇列 CTA)
- **AND** every family without an active plan SHALL render its normal weakness indicator unchanged

#### Scenario: Tapping a chip opens that family's scene

- **GIVEN** active plans for families A and B
- **WHEN** the player taps family A's rescue chip
- **THEN** the rescue scene SHALL open bound to family A's plan (not B's)

#### Scenario: Card reverts after its plan ends

- **WHEN** family A's rescue plan is archived or abandoned
- **THEN** family A's card SHALL revert to rendering its normal weakness indicator, while family B's chip (if still active) is unaffected
