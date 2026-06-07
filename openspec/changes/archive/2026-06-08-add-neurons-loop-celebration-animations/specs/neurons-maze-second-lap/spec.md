## ADDED Requirements

### Requirement: Family second-lap completion SHALL play a one-time celebration animation

When a family's brain-maze (including its second lap) becomes fully lit during play — i.e. that family's frontier `target` transitions from non-null to `null` (`settles` reaches the family's full node count) — the system SHALL play a one-time celebration animation in the homepage maze band. The celebration SHALL be a non-blocking overlay (`pointer-events: none`) composed from the existing motion-library primitives (an expanding celebration halo + a particle burst at spectacle intensity) and SHALL NOT block, delay, or alter maze interaction, reconciliation, or any reward. The celebration SHALL respect `prefers-reduced-motion`: when reduced motion is set, the animated burst SHALL be omitted and the family's lit nodes SHALL remain visible as a static completed end-state.

The celebration SHALL trigger only on the live non-null → null transition observed within the session (an "event"), NOT merely on observing `target === null` (a persistent "state"), so that a family already complete at mount time does not re-celebrate.

#### Scenario: Live completion triggers the celebration

- **WHEN** a family's `target` transitions from non-null to `null` during play (its maze, including second lap, becomes fully lit)
- **AND** that family has not previously been marked celebrated
- **THEN** the homepage maze band plays one celebration animation (halo + particle burst) as a non-blocking overlay
- **AND** the celebration does not block or delay maze reconciliation, pulls, or rewards

#### Scenario: Already-complete family at mount does not celebrate

- **WHEN** the homepage mounts and a family's `target` is already `null` (completed in a prior session) and that family is already marked celebrated
- **THEN** no celebration plays for that family

#### Scenario: Reduced-motion degrades to a static completed end-state

- **WHEN** the user has `prefers-reduced-motion: reduce` set
- **AND** a family completes during play
- **THEN** the animated halo / particle burst SHALL be omitted
- **AND** the family's lit nodes SHALL remain visible as a static completed end-state

### Requirement: Second-lap completion celebration SHALL fire at most once per family across sessions and devices (synced one-shot)

The system SHALL persist a per-family "celebrated" marker so the completion celebration fires at most once per family. The marker SHALL be synced (carried in the cloud-sync surface) so that a family celebrated on one device SHALL NOT re-celebrate on another device or in a later session. The marker SHALL be additive to the sync surface and MUST NOT require a Dexie schema (`.version()`) bump. Pre-existing players SHALL NOT have already-completed families retroactively celebrated on upgrade (no backfill); only families that complete live after this change ships SHALL celebrate.

#### Scenario: Celebration does not replay in a later session on the same device

- **WHEN** a family was celebrated in a prior session
- **AND** the player reopens the app
- **THEN** that family does not celebrate again

#### Scenario: Celebration does not replay on a second device

- **WHEN** a family was celebrated on device A and its marker has synced
- **AND** the player opens the app on device B where the family's maze is already complete
- **THEN** that family does not celebrate on device B

#### Scenario: No retroactive backfill on upgrade

- **WHEN** an existing player who already completed one or more families upgrades to this change
- **THEN** no celebration fires for those already-completed families on upgrade
- **AND** a celebration fires only when a family completes live thereafter
