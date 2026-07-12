## MODIFIED Requirements

### Requirement: The hub SHALL surface a rescue status strip that opens the same RescueScene in place

The 考前中心 hub SHALL render a 救急狀態條 that reflects the current active rescue plans, reusing the same global rescue-plan store as the homepage (`useRescuePlans` and the shared per-family rescue-chip computation). For each active plan the strip SHALL surface that family's status (days-to-exam and RescueScore, matching the homepage rescue chip's `D-3 · RescueScore 62` presentation). The strip SHALL be clickable to enter rescue **in place** — clicking SHALL open the same `RescueScene` overlay over the hub, driving the same plan (not a duplicate dashboard, not a route change). The rescue system's own device-local/synced semantics SHALL be unchanged; the strip is a read + entry surface only.

The rescue status strip SHALL be the **single homepage-reachable rescue plan-list surface** — the homepage header rescue entry navigates here (per `neurons-homepage`), and the standalone rescue-plans overview is no longer a homepage-reachable entry destination. Accordingly, the RescueScene multi-plan `'list'` phase SHALL be retained as a **fallback-only** surface (the mid-scene plan-vanish safety net and the in-scene 切科 / back-to-list exit), NOT deleted; it SHALL NOT be re-surfaced as a primary homepage entry destination.

When at least one plan is active, the strip SHALL — in addition to the per-plan chips — render a low-key「＋ 新增計畫」add affordance at its tail **only while the active-plan count is below the hard cap of 5** (`0 < activeCount < 5`); at the 5-plan cap the「＋」affordance SHALL be omitted (opening / editing / abandoning existing plans stays available, per `neurons-single-subject-rescue`'s hard-cap rule). Activating the「＋」affordance SHALL open rescue **setup directly** in add-new-plan mode (preselecting a subject that has no active plan, then exam-date + daily-minutes), NOT re-open a separate plan-list overlay. When no plan is active, the strip SHALL instead show its existing「建立考前救急」create-rescue CTA (unchanged), and SHALL NOT imply a one-rescue-at-a-time constraint.

#### Scenario: Strip reflects active plans
- **WHEN** the user has one or more active rescue plans and opens the hub
- **THEN** the rescue status strip SHALL show each active family's status (days-to-exam + RescueScore), derived from the same store the homepage uses

#### Scenario: Clicking the strip opens RescueScene in place
- **WHEN** the user clicks the rescue status strip (or a family entry within it)
- **THEN** the same `RescueScene` overlay SHALL open over the hub driving the same plan, without navigating away from `/cram` and without route-izing the overlay

#### Scenario: Strip shows an add affordance below the cap
- **WHEN** the user has between one and four active rescue plans and opens the hub
- **THEN** the strip SHALL render a low-key「＋ 新增計畫」affordance at its tail (in addition to the per-plan chips)

#### Scenario: Add affordance opens setup directly
- **WHEN** the user activates the strip's「＋ 新增計畫」affordance
- **THEN** rescue setup SHALL open directly in add-new-plan mode (preselecting a subject without an active plan), NOT a separate plan-list overlay

#### Scenario: Add affordance is hidden at the plan cap
- **WHEN** the user has five active rescue plans (the hard cap) and opens the hub
- **THEN** the strip SHALL NOT render the「＋ 新增計畫」affordance, while the per-plan chips (and their open / edit / abandon paths) remain available

#### Scenario: No active plan
- **WHEN** the user has no active rescue plan and opens the hub
- **THEN** the strip SHALL offer an entry to create a rescue plan (opening the shared RescueScene setup), and SHALL NOT imply a one-rescue-at-a-time constraint

#### Scenario: The strip is the single homepage-reachable plan-list surface
- **WHEN** the homepage header rescue entry is activated
- **THEN** it SHALL land on the hub's rescue status strip (per `neurons-homepage`), and the standalone multi-plan `'list'` phase SHALL NOT be presented as a homepage-reachable entry destination (it remains only as a fallback within RescueScene)

### Requirement: The repurposed entry banner SHALL advertise the 考前中心 hub

The existing homepage rescue promo banner SHALL be repurposed to advertise / link into the 考前中心 hub rather than acting as a redundant rescue entry. The banner SHALL remain dismissible (its existing versioned dismiss behavior). Repurposing the banner SHALL NOT alter the homepage rescue CTA or the `?rescue=<familyId>` return-loop — those remain unchanged. The FamilyPicker header rescue entry now navigates to the same 考前中心 hub (per `neurons-homepage`); the banner is a distinct dismissible promo surface from that header entry, and both converging on the hub SHALL NOT constitute a duplicate rescue entry.

#### Scenario: Banner points at the hub
- **WHEN** the repurposed banner renders and the user activates it
- **THEN** it SHALL lead the user into the 考前中心 hub, not open a duplicate rescue entry

#### Scenario: Homepage rescue CTA and return-loop unchanged
- **WHEN** the banner is repurposed
- **THEN** the homepage rescue CTA and the `?rescue=` return-loop SHALL be unchanged (the FamilyPicker header entry's navigation-to-hub behavior is governed by `neurons-homepage`, not by this banner requirement)
