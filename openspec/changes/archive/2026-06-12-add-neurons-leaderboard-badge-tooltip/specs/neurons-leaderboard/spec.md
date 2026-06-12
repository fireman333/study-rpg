## ADDED Requirements

### Requirement: Leaderboard badges SHALL reveal their achievement name on hover

On a leaderboard row, hovering a player's achievement badge SHALL show a tooltip naming the achievement. The badge encodes only `<category>:<tier>`; when more than one achievement shares that cell, the tooltip SHALL list all their names joined by `" / "`. The same `BadgeSprite` element SHALL expose this label via `aria-label` for assistive technology. A **locked** badge SHALL NOT reveal any achievement name — it SHALL show only a generic tier+category label so masked (`????`) names on the achievements page are not leaked. The tooltip is a hover affordance only; touch devices (no hover) MAY show nothing.

#### Scenario: Hovering an unlocked leaderboard badge shows the achievement name

- **WHEN** a player hovers a badge on a leaderboard row
- **THEN** a tooltip SHALL appear naming the achievement (or all achievements sharing that category+tier, joined by `" / "`)
- **AND** the tooltip SHALL disappear when the pointer leaves the badge

#### Scenario: A locked badge does not reveal its name

- **WHEN** a badge is rendered in its locked state (e.g. a silhouette on the achievements page)
- **THEN** the hover tooltip and `aria-label` SHALL show only a generic「<tier>級<category>成就（尚未解鎖）」label
- **AND** SHALL NOT contain the achievement's real name
