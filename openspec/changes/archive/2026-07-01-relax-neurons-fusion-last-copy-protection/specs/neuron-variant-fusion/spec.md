## MODIFIED Requirements

### Requirement: Player SHALL be able to tier-promote by consuming K same-rarity surplus individuals

The system SHALL offer an opt-in **tier-promote** action: consume K held (`consumedAt == null`) individuals of the same `rarity` tier `T` within one family → mint one new individual of the next-rarer tier `T−1` in that same family. K SHALL be a single tunable constant (default `3`). The **fusable pool for a tier `T` SHALL be every held individual at tier `T` in that family** — there is NO per-slot「keep one」 reservation, so a family holding ≥ K individuals of tier `T` can always promote regardless of how those individuals are spread across the tier's slots. The count surfaced to the player (the fusion button numerator) SHALL be this total held pool, so it equals the sum of that tier's card `×N` badges.

To preserve collection breadth by default without a hard gate, the consume order SHALL drain **duplicates first** — every slot's copies beyond its oldest one — and only dip into a slot's sole/oldest copy when K exceeds the duplicate pool (oldest individual first within each band, deterministic). A promote MAY therefore empty a slot (consume its last held individual); the resulting `neuronVariants` row becomes a「ghost slot」 (`copies` unchanged, 0 held) that the `ownedSlotCount` projection already excludes from every distinct-owned count.

The promote SHALL prefer an **unowned** `T−1` slot in the family; if every `T−1` slot is already owned, it SHALL mint a new individual of an already-owned `T−1` slot (a valid dupe individual under open-collection). Promotion of the rarest tier (P0) SHALL be unavailable (no `T−1`). The promote SHALL NOT spend neural energy and SHALL NOT introduce any new currency.

Consuming an individual SHALL set its `consumedAt` (soft-delete) rather than deleting the row; `neuronVariants.copies` SHALL NOT be decremented (it is a lifetime-mint count). The minted higher-tier individual SHALL go through the existing mint path (emit `variantRolled` reveal, stamp provenance, fire achievement / leaderboard / connectome hooks).

#### Scenario: Promote consumes 3 P4 individuals and mints a P3 individual

- **GIVEN** a family with 4 held P4 individuals (across one or more P4 slots) and at least one unowned P3 slot
- **WHEN** the player promotes at that P4 tier (K = 3)
- **THEN** exactly 3 of those P4 individuals SHALL have `consumedAt` set
- **AND** one new P3 individual SHALL be minted for a previously-unowned P3 slot in that family, `consumedAt = null`
- **AND** the reveal modal/toast SHALL fire for the minted P3

#### Scenario: K individuals spread one-per-slot are fusable

- **GIVEN** a family holds exactly K held P4 individuals, each in a DISTINCT P4 slot
- **WHEN** the player views the P4 tier
- **THEN** the promote action SHALL be enabled (the whole held pool is fusable — no per-slot reservation blocks it)
- **AND** promoting SHALL set `consumedAt` on all K of them and mint one T−1 individual

#### Scenario: Consume order drains duplicates before a slot's sole copy

- **GIVEN** a family holds one P4 individual at slot a and three P4 individuals at slot b, and K = 3
- **WHEN** the player promotes at the P4 tier
- **THEN** the two DUPLICATE individuals of slot b SHALL be consumed first
- **AND** the third consumed individual SHALL be a sole/oldest copy (slot a's or slot b's oldest), leaving exactly one held P4 individual in the family

#### Scenario: Promote target falls back to a dupe individual when the tier is full

- **GIVEN** a family whose every P3 slot is already owned, and ≥ K held P4 individuals
- **WHEN** the player promotes at the P4 tier
- **THEN** a new P3 individual SHALL be minted for an already-owned P3 slot (a dupe individual)

#### Scenario: P0 cannot be promoted

- **GIVEN** any number of held P0 individuals
- **WHEN** the player views promote options at the P0 tier
- **THEN** no promote action SHALL be offered for P0

#### Scenario: Promote is unavailable below the K threshold

- **GIVEN** a family whose held pool at a tier holds fewer than K individuals
- **WHEN** the player views that tier
- **THEN** the promote action SHALL be disabled with a reason indicating insufficient held individuals

### Requirement: Collection view SHALL render individuals with per-instance context-art

The collection view SHALL render held individuals (`consumedAt == null`), grouped by family then slot, with each slot collapsible; each individual SHALL render its own context-art via `variantContextArt` computed from that individual's `provenance` + `rolledAt`. A **ghost slot** — a `neuronVariants` row with zero held individuals (every individual fused away) — SHALL NOT render a card, so the rendered cards match the family's distinct-owned `X 隻` chip. The `neuronVariants` row persists in the DB as catalog history; it simply stops rendering once nothing is held. The pure-count `🧬 X 隻` chip SHALL retain its existing **distinct-slot** semantics (X = number of owned `neuronVariants` slots with ≥ 1 held individual), with the total-individual count available as a secondary display. No denominator and no full-collection celebratory state SHALL be introduced (open-collection is preserved).

#### Scenario: Two individuals of one slot render distinct context-art

- **GIVEN** a slot with two held individuals minted at different times of day
- **WHEN** the slot is expanded in the collection view
- **THEN** both individuals SHALL render, each with its own brainwave-band letter / decor field

#### Scenario: A fully-fused-away slot stops rendering a card

- **GIVEN** a family slot whose every individual has been consumed by fusion (0 held, `neuronVariants` row still present)
- **WHEN** the family section renders
- **THEN** that slot SHALL NOT render a card
- **AND** the family's `🧬 X 隻` chip and the rendered card count SHALL agree

#### Scenario: The count chip stays distinct-slot

- **GIVEN** a family with 3 owned slots whose individuals total 7
- **WHEN** the family card chip renders
- **THEN** the `🧬 X 隻` chip SHALL show the distinct-slot count (3), not the individual total (7)

## REMOVED Requirements

### Requirement: Last-copy protection SHALL keep at least one individual per owned slot

**Reason**: The per-slot「keep one」 gate was the root of the player-reported「有 3 隻 P4 卻融不了」 friction. With only 2 slots each at the low tiers (P5/P4), reserving one per slot meant a player needed 5 individuals to fuse once, and the fusion button (which showed *surplus*) never matched the cards (which show *total held*) — so fusing appeared not to increase the count. Owner chose「任 K 隻同階即可融」. Breadth is now preserved *softly* by the dupes-first consume order (see the tier-promote requirement) instead of a hard gate.

**Migration**: No data migration. `consumedAt` remains monotonic-OR merged and `neuronVariants.copies` remains MAX-merged, so existing saves and cross-device sync are unaffected. Ghost slots (a slot whose individuals are all consumed) are already excluded from every distinct-owned count by the `ownedSlotCount` projection; single-device fusion can now create them routinely, and the collection view hides their cards (see the collection-view requirement). No Dexie / R2 `SCHEMA_VERSION` bump.
