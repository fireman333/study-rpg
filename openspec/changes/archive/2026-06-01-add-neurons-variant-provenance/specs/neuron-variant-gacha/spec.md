## ADDED Requirements

### Requirement: Each variant SHALL capture study-context provenance at mint time

When a `neuronVariant` row is created by the slot-unlock handler, the system SHALL stamp a `provenance` object onto the row capturing the study context at the moment of minting. The `provenance` object SHALL contain:

| Field | Source | Meaning |
|---|---|---|
| `bornAtISO` | local date at mint | the variant's birth date (caption date) |
| `apAtUnlock` | event payload | the family AP at unlock (equals the slot threshold; stored for forward-compatibility) |
| `wasRedemption` | event payload | `true` if the triggering correct answer's question had `everWrong === true` before that answer |
| `streakAtMint` | streak service at mint | the player's daily streak value at mint |

A variant SHALL be flagged a 里程碑 (milestone) individual when `streakAtMint >= MILESTONE_STREAK_THRESHOLD`, a single content-pack constant defaulting to `7`. Provenance SHALL be written inside the same Dexie transaction that persists the variant row, before the reveal UI fires. Provenance SHALL be immutable after mint.

#### Scenario: Mint stamps full provenance

- **GIVEN** a slot-unlock fires for `(familyId='藥理學', slotIndex=1, apAtUnlock=10)` with `wasRedemption=false`
- **AND** the player's daily streak is 3 at mint
- **WHEN** the variant row is created
- **THEN** the row's `provenance` SHALL equal `{ bornAtISO: <today local date>, apAtUnlock: 10, wasRedemption: false, streakAtMint: 3 }`
- **AND** the variant SHALL NOT be flagged a 里程碑 individual (streak 3 < 7)

#### Scenario: Redemption answer flags 救贖 individual

- **GIVEN** the triggering correct answer's question had `everWrong === true` before this answer
- **WHEN** the variant is minted
- **THEN** the row's `provenance.wasRedemption` SHALL be `true`

#### Scenario: Streak at or above threshold flags 里程碑 individual

- **GIVEN** the player's daily streak is 7 (== `MILESTONE_STREAK_THRESHOLD`) at mint
- **WHEN** the variant is minted
- **THEN** `provenance.streakAtMint` SHALL be 7
- **AND** the variant SHALL be flagged a 里程碑 individual

#### Scenario: apAtUnlock is recorded even though it equals the slot threshold

- **GIVEN** a slot-3 unlock fires with `apAtUnlock=80`
- **WHEN** the variant is minted
- **THEN** `provenance.apAtUnlock` SHALL be 80 (stored discretely so a future capability can read it)

### Requirement: Variants without provenance SHALL be treated as 元老 (傳承) individuals without any backfill write

Variants minted before this change have no `provenance`. The system SHALL treat `provenance === undefined` as a 元老 / 傳承 individual and SHALL NOT perform any migration write to backfill old rows (absence is the marker). For such rows the system SHALL derive a display date from the existing `rolledAt` and a subject from `familyId`, with no special tags.

#### Scenario: Pre-upgrade row renders as 元老 with no write

- **GIVEN** a `neuronVariant` row exists with `rolledAt` set and `provenance === undefined`
- **WHEN** the collection loads after upgrade
- **THEN** the row SHALL be treated as a 元老 individual
- **AND** no write SHALL be performed to that row to add provenance
- **AND** its caption SHALL derive the date from `rolledAt` and the subject from `familyId`

#### Scenario: New row is never a 元老 individual

- **GIVEN** a variant minted after this change with a populated `provenance`
- **WHEN** the collection loads
- **THEN** the variant SHALL NOT be treated as a 元老 individual

### Requirement: Dex card SHALL render a single-line birth caption derived from provenance

Each variant's dex card SHALL display exactly one birth caption line derived from its `provenance` (or the 元老 fallback when absent). The caption SHALL include the birth date and subject; the 救贖 and 里程碑 conditions SHALL be reflected inline in the same line. The caption SHALL NOT introduce a second line, chip cluster, or modal for provenance.

#### Scenario: Standard variant caption shows date, count, subject

- **GIVEN** a variant with `provenance = { bornAtISO: '2026-06-01', apAtUnlock: 10, wasRedemption: false, streakAtMint: 3 }` for `藥理學`
- **WHEN** its dex card renders
- **THEN** a single caption line SHALL show the birth date `2026-06-01`, the subject `藥理學`, and the answered-count milestone (`10`)

#### Scenario: 救贖 individual caption reflects the redemption inline

- **GIVEN** a variant with `provenance.wasRedemption === true`
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL convey that the variant was born from answering a previously-wrong question

#### Scenario: 里程碑 individual caption reflects the streak inline

- **GIVEN** a variant flagged 里程碑 (`streakAtMint >= MILESTONE_STREAK_THRESHOLD`)
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL convey the streak milestone

#### Scenario: 元老 individual caption uses the fallback form

- **GIVEN** a variant with `provenance === undefined`
- **WHEN** its dex card renders
- **THEN** the single caption line SHALL show the `rolledAt`-derived date + `familyId` subject + a 傳承/元老 marker, with no 救贖/里程碑 tags

### Requirement: Provenance SHALL be display-only and SHALL NOT affect any gacha mechanic

Provenance SHALL be read in this capability only by the caption renderer. The presence, absence, or contents of `provenance` SHALL NOT change rarity rolls, the `VARIANT_RARITY_WEIGHTS` distribution, slot rarity floors, the AP unlock ladder, the closed cap of 55, or any other gacha behavior. The shipped roll-and-persist path and its tests SHALL remain unchanged except for the additive provenance write.

#### Scenario: Rarity outcome is independent of provenance

- **GIVEN** two slot-1 unlocks with identical PRNG state but different provenance (one redemption, one not)
- **WHEN** each variant is rolled
- **THEN** both SHALL receive the same rarity (provenance does not influence the roll)

### Requirement: Provenance SHALL sync via the neurons R2 bundle with LWW and cross-version tolerance

Provenance SHALL travel inside the `neuronVariants` rows of the neurons R2 bundle. The bundle `SCHEMA_VERSION` SHALL bump from 6 to 7 (`add-neurons-variant-collection-view` already took 5 → 6). The `neuronVariants` adapter SHALL remain LWW (provenance is immutable per row, so no monotonic-merge discipline is required). Cross-version reads SHALL be tolerant: a newer client reading a bundle whose rows lack provenance SHALL treat those variants as 元老; an older client SHALL preserve the provenance field across a round-trip (it rides in the whole-row JSON).

#### Scenario: Provenance survives a push/pull round-trip

- **GIVEN** a variant with populated `provenance` is pushed to the neurons R2 bundle
- **WHEN** the same account pulls the bundle on another device
- **THEN** the pulled variant row SHALL retain its `provenance` unchanged

#### Scenario: Newer client reading older bundle treats provenance-less rows as 元老

- **GIVEN** an older bundle whose `neuronVariants` rows have no `provenance`
- **WHEN** a client at `SCHEMA_VERSION = 7` applies the bundle
- **THEN** those variants SHALL be treated as 元老 individuals
- **AND** no error SHALL be raised by bundle validation

#### Scenario: Older client preserves provenance across a round-trip

- **GIVEN** a client at `SCHEMA_VERSION = 6` reads a bundle whose `neuronVariants` rows carry `provenance`
- **WHEN** that client later pushes the bundle back
- **THEN** the `provenance` field on those rows SHALL be preserved (it is carried in the whole-row JSON even though the older client does not interpret it)
