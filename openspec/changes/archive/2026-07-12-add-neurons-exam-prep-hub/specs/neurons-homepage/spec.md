## MODIFIED Requirements

### Requirement: FamilyPicker SHALL offer a header-level always-on 考前救急 entry independent of the weakness gate

The homepage `FamilyPicker` region SHALL render a header-level, always-visible "考前救急" entry affordance that opens the **rescue-plans overview** (a list of the currently-active plans plus an "＋ 新增計畫" action; per `neurons-single-subject-rescue`). When no plan is active the entry MAY open setup directly. Adding a plan opens setup (choose family + exam date + daily-minutes budget). This entry SHALL NOT be gated by the `pressure >= 0.45` threshold that governs the per-card one-tap targeted-drill button (per `neurons-weakness-radar`), because the subjects most in need of rescue (thin history, or currently strong-looking but exam-imminent) would otherwise have no reachable entry. The header entry SHALL be the single top-level rescue entry point **on the homepage** (no per-card rescue-start buttons on the 11 homepage family cards); this SHALL NOT preclude a separate rescue entry on the 考前中心 hub (per `neurons-exam-prep-hub`), which drives the same global rescue-plan store. It SHALL NOT imply a one-rescue-at-a-time constraint — multiple plans may coexist and each active family surfaces its own card chip (per the card-chip requirement).

#### Scenario: Rescue entry is reachable even for a green / undiagnosed family

- **GIVEN** a family whose weakness-pressure is below 0.45 (no per-card targeted-drill button rendered)
- **WHEN** the homepage renders
- **THEN** the header-level "考前救急" entry SHALL still be present and able to start a rescue for that family

#### Scenario: Rescue entry opens the overview, and adding a plan opens setup

- **WHEN** the player taps the header "考前救急" entry with at least one active plan
- **THEN** it SHALL open the rescue-plans overview listing the active plans plus an add-new-plan action
- **AND** choosing add-new-plan SHALL open setup (family + exam date + daily minutes), not launch a zero-setup drill

#### Scenario: Homepage stays the single homepage rescue entry, hub entry allowed

- **WHEN** the 考前中心 hub adds its own rescue status strip / entry (per `neurons-exam-prep-hub`)
- **THEN** the homepage FamilyPicker header entry SHALL remain the single top-level rescue entry **on the homepage** (still no per-card rescue-start buttons on the 11 homepage family cards), and the hub entry SHALL drive the same global rescue-plan store (not a duplicate plan surface)
