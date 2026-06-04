## MODIFIED Requirements

### Requirement: Squad renders as a party on the connectome homepage

The active squad SHALL be presented to the player under the display name **「神經元遠征隊」** and SHALL render as a party row on the homepage using `VariantSprite`. The party row SHALL NOT crowd or overlap the homepage graph, SHALL be responsive (mobile single-column reflow), and SHALL respect `prefers-reduced-motion`. When the squad is empty, the row SHALL show an assemble-your-squad placeholder rather than a broken/empty element. The active squad SHALL be the **single source of truth** for every surface that depicts the squad — the homepage party row, the correct-answer celebration, AND the maze expedition animation band (`neurons-maze-expedition`) — so the player's chosen party appears consistently across all of them. The rename is presentational only: the persisted `activeSquad` meta key, its `VariantKey` shape, and all selection/sync mechanics are unchanged (no migration).

#### Scenario: Squad members render on the homepage
- **WHEN** the homepage loads with a non-empty active squad
- **THEN** each member renders via `VariantSprite` in the「神經元遠征隊」party row, beside (not over) the homepage graph

#### Scenario: Empty squad placeholder
- **WHEN** the homepage loads with an empty active squad
- **THEN** the party row shows an assemble-squad placeholder/CTA, no broken element

#### Scenario: Narrow viewport does not overlap the graph
- **WHEN** the homepage renders at a mobile-width viewport
- **THEN** the party row reflows without overlapping the homepage graph

#### Scenario: One squad drives every surface
- **WHEN** the player edits the active squad
- **THEN** the homepage party row, the correct-answer celebration, and the maze expedition animation band all reflect the same updated members (the band no longer derives an independent auto-rarest set)
