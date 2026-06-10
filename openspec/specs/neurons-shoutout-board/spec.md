# neurons-shoutout-board Specification

## Purpose
TBD - created by syncing change add-neurons-shoutout-board. Update Purpose after archive.

## Requirements

### Requirement: Shoutout tab entry
The neurons app SHALL provide a 「留言」 entry reachable via a `/shoutout` route, surfaced as the 留言 sub-tab of the 社群 top-nav group (per `neurons-mode`'s five-tab consolidated navigation).

#### Scenario: Open the board
- **WHEN** a player taps the 社群 top-nav tab and then the 留言 sub-tab
- **THEN** the app routes to `/shoutout` and renders the bouncing-message board

#### Scenario: Direct URL and refresh
- **WHEN** a player loads `/shoutout` directly or presses F5
- **THEN** the board renders without a blank screen or routing error

### Requirement: Compose, edit, and delete own message
A logged-in player with a leaderboard nickname SHALL be able to post exactly one message consisting of one owned neuron sprite plus text (≤ 40 full-width characters, at most two lines), edit it, and delete it. Editing is subject to the backend cooldown.

#### Scenario: First post
- **WHEN** a gated player composes a message picking a neuron sprite and entering ≤ 40 characters and submits
- **THEN** the app `PUT`s the message and immediately shows the player's own card on the board using the write response (without waiting for the list cache)

#### Scenario: Over-length input
- **WHEN** a player enters more than 40 full-width characters or more than two lines
- **THEN** the compose UI blocks submission and shows a length hint before any request is sent

#### Scenario: Edit blocked by cooldown
- **WHEN** a player edits within the backend edit cooldown window
- **THEN** the UI surfaces a cooldown message and does not lose the player's edited text

#### Scenario: Delete own message
- **WHEN** a player deletes their own message
- **THEN** the app `DELETE`s it and removes the player's card from the board

### Requirement: Post gating and content-responsibility disclaimer
The app SHALL require login AND an existing leaderboard nickname before allowing a post, and SHALL display a notice that the player is responsible for their own content before first submission.

#### Scenario: Not logged in
- **WHEN** an anonymous visitor opens the compose UI
- **THEN** the app prompts sign-in instead of allowing a post

#### Scenario: No nickname yet
- **WHEN** a logged-in player without a leaderboard nickname tries to post
- **THEN** the app routes them through the existing nickname-setup flow before the post is accepted

#### Scenario: Responsibility notice
- **WHEN** a player opens the compose UI for the first time
- **THEN** a 自負內容責任 disclaimer is shown and acknowledged before submission

### Requirement: DVD-logo bounce rendering
The board SHALL display the latest messages as elements bouncing and reflecting inside a frame; each element shows the sprite, the joined leaderboard nickname, and the message text.

#### Scenario: Render the latest set
- **WHEN** the board loads the latest-message list
- **THEN** each message renders as a bouncing card with its sprite, nickname, and text, capped at the configured maximum on screen

#### Scenario: Pause to read
- **WHEN** a player hovers or taps a bouncing card
- **THEN** its motion pauses so the text is readable

#### Scenario: Unknown sprite asset
- **WHEN** a message carries an `assetId` not found in the local sprite catalog
- **THEN** the card renders a placeholder sprite rather than failing or rendering raw client data

### Requirement: Own and top-N halo
The board SHALL mark the current player's own card with a distinct halo and SHALL mark leaderboard top-N players' cards with a special halo; a special halo SHALL NOT render for a message that is hidden by moderation.

#### Scenario: Own card highlighted
- **WHEN** the board renders and one card's author matches the signed-in player
- **THEN** that card shows the own-halo styling

#### Scenario: Top-N card highlighted
- **WHEN** a card's author is flagged top-N by the backend
- **THEN** that card shows the special halo

#### Scenario: Hidden message loses halo
- **WHEN** a message is hidden by moderation
- **THEN** it neither appears on the board nor renders any special halo

### Requirement: Safe text rendering
The app SHALL render all user-supplied text (message and joined nickname) as plain text, never as HTML, and SHALL not honor bidirectional-override control characters.

#### Scenario: Markup in a message
- **WHEN** a message contains HTML-like or script-like characters
- **THEN** they render as literal visible text, not as markup or executable content

### Requirement: Reduced motion and mobile performance
The board SHALL respect `prefers-reduced-motion` and SHALL bound rendering cost on mobile (no O(n²) full elastic collision; capped sprite size and frame rate).

#### Scenario: Reduced-motion preference
- **WHEN** the OS/browser signals `prefers-reduced-motion`
- **THEN** the board reduces motion to a slow or static layout instead of fast bouncing

#### Scenario: Many cards on mobile
- **WHEN** the maximum number of cards is on screen on a phone
- **THEN** collision handling stays bounded (wall bounce + overlap avoidance) and does not freeze the device

### Requirement: Report a message
A logged-in player SHALL be able to report another player's message from the board.

#### Scenario: Submit a report
- **WHEN** a player reports a card
- **THEN** the app `POST`s a report for that message and confirms receipt without exposing other reporters
