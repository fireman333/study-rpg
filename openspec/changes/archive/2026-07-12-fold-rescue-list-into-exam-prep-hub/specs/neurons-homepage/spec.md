## MODIFIED Requirements

### Requirement: FamilyPicker SHALL offer a header-level always-on 考前救急 entry independent of the weakness gate

The homepage `FamilyPicker` region SHALL render a header-level, always-visible "考前救急" entry affordance that **navigates to the 考前中心 hub (`/cram`, per `neurons-exam-prep-hub`)**, whose rescue status strip is the plan-list surface (reflecting the currently-active plans and offering the「＋ 新增計畫」add affordance / a create CTA when none are active). It SHALL NOT open a separate homepage rescue-plans overview overlay. This entry SHALL NOT be gated by the `pressure >= 0.45` threshold that governs the per-card one-tap targeted-drill button (per `neurons-weakness-radar`), because the subjects most in need of rescue (thin history, or currently strong-looking but exam-imminent) would otherwise have no reachable entry. The header entry SHALL remain the single top-level rescue entry point **on the homepage** (no per-card rescue-start buttons on the 11 homepage family cards); the hub it navigates to drives the same global rescue-plan store (not a duplicate plan surface). It SHALL NOT imply a one-rescue-at-a-time constraint — multiple plans may coexist and each active family surfaces its own card chip (per the card-chip requirement). The per-card rescue chip (opening that family's rescue scene directly) and the handout「← 回救急」`?rescue=<familyId>` return-loop (reopening that family's scene directly) are UNCHANGED by this requirement — only the header entry's behaviour changes from opening an overlay to navigating to the hub, and the homepage SHALL keep mounting `RescueScene` to serve those two direct-family paths.

#### Scenario: Rescue entry is reachable even for a green / undiagnosed family

- **GIVEN** a family whose weakness-pressure is below 0.45 (no per-card targeted-drill button rendered)
- **WHEN** the homepage renders
- **THEN** the header-level "考前救急" entry SHALL still be present and SHALL navigate to the 考前中心 hub, from whose rescue strip a rescue for that family can be started

#### Scenario: Rescue entry navigates to the 考前中心 hub

- **WHEN** the player taps the header "考前救急" entry
- **THEN** it SHALL navigate to the 考前中心 hub (`/cram`), whose top rescue status strip reflects the active plans and offers plan creation / the「＋ 新增計畫」add affordance
- **AND** it SHALL NOT open a separate homepage rescue-plans overview overlay

#### Scenario: Per-card chip still opens the family scene directly

- **WHEN** the player taps a family card's rescue chip (a family with an active plan)
- **THEN** that family's rescue scene SHALL open directly on the homepage (unchanged), NOT navigate to the hub

#### Scenario: Homepage stays the single homepage rescue entry, hub entry allowed

- **WHEN** the 考前中心 hub surfaces its own rescue status strip / entry (per `neurons-exam-prep-hub`)
- **THEN** the homepage FamilyPicker header entry SHALL remain the single top-level rescue entry **on the homepage** (still no per-card rescue-start buttons on the 11 homepage family cards), now realized by navigating to the hub, and the hub SHALL drive the same global rescue-plan store (not a duplicate plan surface)
