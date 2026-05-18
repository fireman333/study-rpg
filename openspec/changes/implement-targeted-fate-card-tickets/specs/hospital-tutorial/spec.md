## ADDED Requirements

### Requirement: First epic and first legendary targeted draws SHALL each trigger a one-time tutorial step

When the player obtains their first epic-tier targeted ticket (i.e., the first `targetedTickets` row inserted with `sourceFateCardTier = 'epic'`), the system SHALL display a tutorial overlay BEFORE opening the subject picker modal, explaining (a) what a targeted ticket is, (b) that rarity floor of P3 is guaranteed, (c) that the subject choice is final after the confirm step. The overlay SHALL be dismissed by the player before the picker modal opens.

A symmetric one-time tutorial step SHALL fire on the first legendary-tier targeted ticket (`sourceFateCardTier = 'legendary'`), with copy adjusted to mention P2 floor.

Each tutorial step SHALL fire AT MOST ONCE per save (tracked via existing `milestoneTips` mechanism — new keys `firstEpicTargetedDraw` and `firstLegendaryTargetedDraw`). Subsequent epic / legendary targeted draws SHALL go straight to the picker modal without tutorial overlay.

#### Scenario: First epic targeted draw fires tutorial

- **GIVEN** the player has never previously obtained an epic targeted ticket (no `milestoneTips.firstEpicTargetedDraw` flag set)
- **WHEN** the player draws an epic 命運卡 that resolves to `targeted-p3-ticket`
- **THEN** the tutorial overlay SHALL display with copy explaining targeted ticket mechanics + P3 floor + assignment finality
- **AND** the picker modal SHALL NOT open until the overlay is dismissed
- **AND** `milestoneTips.firstEpicTargetedDraw` SHALL be set to truthy after dismiss

#### Scenario: Second epic targeted draw skips tutorial

- **GIVEN** `milestoneTips.firstEpicTargetedDraw` is already set
- **WHEN** the player draws another epic 命運卡 that resolves to `targeted-p3-ticket`
- **THEN** the tutorial overlay SHALL NOT display
- **AND** the picker modal SHALL open directly after the draw resolution

#### Scenario: Legendary tutorial fires independently of epic

- **GIVEN** `milestoneTips.firstEpicTargetedDraw` is set (player has seen epic tutorial) but `milestoneTips.firstLegendaryTargetedDraw` is not
- **WHEN** the player draws their first legendary 命運卡 resolving to `targeted-p2-ticket`
- **THEN** the legendary tutorial overlay SHALL display (with P2 floor copy)
- **AND** dismissing it SHALL set `milestoneTips.firstLegendaryTargetedDraw`
