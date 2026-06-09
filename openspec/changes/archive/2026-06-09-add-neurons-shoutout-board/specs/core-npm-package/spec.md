## ADDED Requirements

### Requirement: Shoutout message contract export
The published `@study-rpg/core` package SHALL export a content-agnostic shoutout contract consumable by any app/theme: the message type, the structured avatar-payload type, the board client (fetch / upsert / delete / report), and the text normalize/blocklist utilities. The contract SHALL NOT contain domain-specific terms (no medical or neuron vocabulary) — sprites are referenced only by opaque `assetId` strings. Introducing this export SHALL be accompanied by a CHANGELOG entry and a version bump.

#### Scenario: App consumes the contract
- **WHEN** an app imports the shoutout client and types from `@study-rpg/core`
- **THEN** it can post, list, delete, and report messages without reimplementing the schema or transport, against the shared backend

#### Scenario: Core stays content-agnostic
- **WHEN** the shoutout contract is reviewed
- **THEN** it carries only generic fields (e.g. `avatarType`, `assetId`, `message`) and no domain-specific vocabulary

#### Scenario: Versioned release
- **WHEN** the shoutout contract is published
- **THEN** a CHANGELOG entry is added and the package version is bumped, released under a pre-release dist-tag for parallel consumers
