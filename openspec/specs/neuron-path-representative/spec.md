# neuron-path-representative Specification

## Purpose
TBD - created by archiving change add-neurons-first-pull-path-rep. Update Purpose after archive.
## Requirements
### Requirement: Per-family first-pull grant on a family's first answer

The system SHALL grant each subject family exactly one free **first-pull** variant the first time the player completes an answer for that family. The trigger SHALL fire on the first answer whether the answer is correct or incorrect. The granted variant SHALL be a guaranteed common-tier (P5) variant for that family, minted **silently** through the existing variant-gacha path (not a parallel mint) and stamped with a first-pull provenance. The grant SHALL be idempotent — recorded once per family and never re-granted, including after a cross-device sync that brings in a fresh device. The grant SHALL run after the answer is committed and SHALL NOT break or block the answer flow if it fails (best-effort; errors surfaced to a dedicated log channel, not to the player). Silent minting means no per-pull reveal and no inline achievement-toast flood; achievement unlocks still persist. The P0 pity counter and dupe handling SHALL follow the gacha's normal behavior.

#### Scenario: First answer grants one P5 and sets the representative

- **WHEN** the player completes their first answer (correct or incorrect) for a family that has no recorded first-pull
- **THEN** one guaranteed-P5 variant for that family is minted silently via the gacha and recorded as that family's first-pull
- **AND** the family's representative is set to that variant

#### Scenario: Subsequent answers do not re-grant

- **WHEN** the player answers more questions for a family that already has a recorded first-pull
- **THEN** no additional free pull is granted

#### Scenario: Fresh device does not re-trigger the grant

- **WHEN** a second device with no local first-pull record pulls the family's synced state showing a first-pull was already recorded
- **THEN** the device adopts the existing first-pull record and does NOT mint another variant

### Requirement: The representative is the family's path neuron at the maze tract

Each family's **representative variant** (defined and re-selected per `neurons-variant-collection-view`, persisted in the `representativeVariants` meta key) SHALL be that family's **path representative** — the neuron shown at the family's maze tract walker position (rendered per `neurons-brain-maze`'s walker-sprite requirement). The representative SHALL default to the family's first-pull P5 variant. Before a family has any first-pull (no collected variants), the family's tract head SHALL render a grayscale silhouette placeholder rather than a collected neuron. Setting, changing, or seeding the representative SHALL NOT alter maze topology, the energy economy, fog-of-war, or the settle/pull mechanic (presentational only).

#### Scenario: First-pulled family shows its representative on the tract

- **WHEN** a family has a representative variant that the player owns
- **THEN** the maze renders that variant's sprite at the family's tract walker position

#### Scenario: Un-answered family shows a silhouette

- **WHEN** a family has no first-pull yet (no collected variants)
- **THEN** the family's tract head renders a grayscale silhouette placeholder

### Requirement: First-pull state persists and syncs cross-device without a Dexie schema change

The per-family first-pull record SHALL persist locally and sync across devices as an additive part of the neurons cloud bundle, using a synced `firstPullFamilies` meta key (the set of familyIds already first-pulled). It SHALL merge **monotonically (union)** — a familyId present on either side stays present and is never removed — so the first-pull grant is one-time across all devices. The representative selection SHALL continue to persist and sync via the existing `representativeVariants` meta key (last-write-wins, per `neurons-variant-collection-view`). This change SHALL NOT add a new Dexie table or bump the Dexie `.version()`. The R2 bundle `SCHEMA_VERSION` SHALL bump additively from 17 to 18 and remain reader-tolerant: clients on the prior schema SHALL drop the unknown `firstPullFamilies` key without error, and clients on the new schema reading a prior-schema bundle SHALL preserve their local first-pull set.

#### Scenario: First-pull set converges by union

- **WHEN** two devices have first-pulled different families and then sync
- **THEN** both devices converge to the union of first-pulled families, and no family's first-pull is cleared

#### Scenario: Prior-schema client tolerates the new bundle

- **WHEN** a client on the prior bundle schema reads a bundle carrying the `firstPullFamilies` key
- **THEN** it ignores the unknown key and does not error

#### Scenario: No Dexie version bump

- **WHEN** this change ships
- **THEN** no new Dexie table is added and no Dexie `.version()` is incremented

