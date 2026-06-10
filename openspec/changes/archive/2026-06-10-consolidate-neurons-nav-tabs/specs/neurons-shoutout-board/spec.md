# neurons-shoutout-board (delta)


## MODIFIED Requirements

### Requirement: Shoutout tab entry

The neurons app SHALL provide a 「留言」 entry reachable via a `/shoutout` route, surfaced as the 留言 sub-tab of the 社群 top-nav group (per `neurons-mode`'s five-tab consolidated navigation).

#### Scenario: Open the board

- **WHEN** a player taps the 社群 top-nav tab and then the 留言 sub-tab
- **THEN** the app routes to `/shoutout` and renders the bouncing-message board

#### Scenario: Direct URL and refresh

- **WHEN** a player loads `/shoutout` directly or presses F5
- **THEN** the board renders without a blank screen or routing error
