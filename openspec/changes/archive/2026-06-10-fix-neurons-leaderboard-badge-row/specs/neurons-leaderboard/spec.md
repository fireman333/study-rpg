## ADDED Requirements

### Requirement: Leaderboard nickname badges SHALL render inline in a single row

On a leaderboard row, a player's achievement badges SHALL render in a single inline row immediately after the (ellipsis-truncated) nickname — NOT stacked vertically. Because `BadgeSprite` is a block-level element, the nickname+badges container SHALL be a flex (or `inline-flex`) row so the badges lay out horizontally; the nickname text SHALL truncate with an ellipsis while the badges remain intact.

#### Scenario: Badges sit in one row next to the nickname

- **WHEN** a leaderboard row has one or more achievement badges
- **THEN** the badges SHALL render in a single horizontal row immediately after the nickname
- **AND** the nickname SHALL truncate with an ellipsis when space is constrained, without pushing badges onto a new line
