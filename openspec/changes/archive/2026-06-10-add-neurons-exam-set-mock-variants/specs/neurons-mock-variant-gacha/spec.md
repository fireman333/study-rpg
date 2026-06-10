## ADDED Requirements

### Requirement: Mock-exam submission SHALL roll one variant from an independent, score-weighted pool

On a qualifying mock-exam submission the system SHALL roll exactly one mock-exam neuron variant from a pool that is **independent** of the maze `neuronVariants` collection (separate catalog, separate table, separate gacha). The roll SHALL be biased by the run's national-equivalent score: a higher score band SHALL shift probability mass toward rarer tiers. The default bands (`<60 / 60–79 / 80–89 / 90–100`) and their P5→P0 weight vectors are dogfood-tunable game-design values, not load-bearing requirements; only the monotonic relationship (higher band → not-lower rare probability) is normative. The roll SHALL reuse the content-agnostic core floor/pity helper; `packages/core/` SHALL NOT gain any `P1..P5` or content-domain literal.

#### Scenario: Submit rolls one mock variant weighted by score

- **WHEN** a mock exam is submitted and the daily cap for its paper has not been spent
- **THEN** exactly one mock variant SHALL be rolled and added to the player's mock collection
- **AND** a higher national-equivalent score SHALL give a not-lower probability of a rare (≥P2) outcome than a lower score

#### Scenario: Mock roll never touches the maze pool

- **WHEN** a mock variant is rolled
- **THEN** no row in the maze `neuronVariants` table SHALL be created or mutated
- **AND** no maze energy, family walker, connectome conduction, or DMN draw SHALL be credited

### Requirement: A per-paper daily cap SHALL prevent farming rolls

A given paper SHALL grant a mock-variant roll at most once per local day; re-submitting the same paper the same day SHALL still complete the exam (and its 錯題本 write) but SHALL NOT grant an additional roll. The per-paper last-roll date SHALL be persisted so the cap survives reloads.

#### Scenario: Re-submitting the same paper same day grants no second roll

- **WHEN** a paper already rolled today is submitted again the same local day
- **THEN** the submission SHALL complete and record 錯題 normally
- **AND** no additional mock variant SHALL be rolled

#### Scenario: A new local day re-opens the roll for that paper

- **WHEN** the same paper is submitted on a later local day
- **THEN** a mock variant SHALL be rolled again

### Requirement: Pity SHALL guarantee a rare after a dry streak

The mock gacha SHALL apply a soft-pity floor that guarantees a rare (≥P2) outcome after a tunable number of consecutive rolls without one. The pity counter SHALL persist across runs. The exact threshold is a dogfood-tunable value; the guarantee-after-dry-streak behavior is normative.

#### Scenario: Dry streak forces a rare

- **WHEN** the player has rolled the pity-threshold number of times with no ≥P2 outcome
- **THEN** the next roll SHALL be forced to at least P2

### Requirement: Collected mock variants SHALL persist in a dedicated synced table

Collected mock variants SHALL be stored in a dedicated `mockExamVariants` Dexie table (introduced at Dexie v20 as an additive, no-callback upgrade) keyed by catalog `variantId`, holding rarity, display name, sprite key, a `copies` count, and roll timestamps. The table SHALL sync to R2 via a new `TableAdapter` (`SCHEMA_VERSION` raised to 21). Applying the same synced bundle twice SHALL be idempotent (pure replace-by-`variantId`); ownership SHALL be monotonic (a collected variant SHALL NOT un-collect on merge) and `copies` SHALL merge monotonic-max. The table SHALL NOT reuse the maze `neuronVariants` table.

#### Scenario: Re-applying a bundle does not double-count

- **WHEN** the same R2 bundle snapshot is applied twice
- **THEN** the resulting `mockExamVariants` rows SHALL be identical to applying it once
- **AND** no `copies` count SHALL increase from the duplicate apply

#### Scenario: Dexie v20 upgrade is additive

- **WHEN** a v19 client opens after this change
- **THEN** the database SHALL upgrade to v20 by adding the `mockExamVariants` store with no data transform and no upgrade callback

### Requirement: Mock variants SHALL NOT count toward the public leaderboard

The public leaderboard variant count SHALL continue to reflect only maze 220-taxonomy progress. Mock collection size SHALL be surfaced only on the player's own collection view and SHALL NOT be uploaded to or counted by the leaderboard. This change SHALL make no D1, sync Worker, or leaderboard-spec modification.

#### Scenario: Leaderboard count excludes mock variants

- **WHEN** the player collects mock variants
- **THEN** the player's public leaderboard variant count SHALL be unchanged

### Requirement: A collection view SHALL show owned mock variants with own count

The system SHALL provide a mock-variant collection view that lists the player's owned variants grouped by rarity and shows a pure-count own total (no denominator, no full-collection celebratory state, consistent with the maze cards). Until real art ships, sprites SHALL render via a stable placeholder glyph keyed by `spriteKey`.

#### Scenario: Collection view renders owned variants and a count

- **WHEN** the player opens the mock-variant collection view
- **THEN** it SHALL list each owned variant (placeholder sprite + display name + rarity) and a pure-count own total

### Requirement: Catalog neuroscience facts SHALL be OE-anchored before finalizing

Each catalog entry's neuroscience identity (NT branch / anatomical location / mechanism / persona neuro-fact) SHALL be backed by OpenEvidence-anchored evidence (PubMed PMID) before that entry's identity is finalized. The MVP catalog MAY ship with placeholder sprites and a `neuroAnchorTODO` marker on entries whose neuro-facts are not yet anchored; persona visual and story hooks MAY be authored more freely, but the neuron's NT/anatomy/mechanism facts SHALL be rigorous.

#### Scenario: Unanchored catalog entry is flagged, not silently shipped as fact

- **WHEN** a catalog entry's neuro-identity has not been OE-anchored
- **THEN** the entry SHALL carry a `neuroAnchorTODO` marker rather than presenting an unverified neuroscience claim as final
