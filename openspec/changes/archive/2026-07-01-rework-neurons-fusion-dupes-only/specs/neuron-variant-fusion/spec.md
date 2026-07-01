## MODIFIED Requirements

### Requirement: Player SHALL be able to tier-promote by consuming K same-rarity surplus individuals

The system SHALL offer an opt-in **tier-promote** action: consume K held (`consumedAt == null`) SURPLUS (duplicate) individuals of the same `rarity` tier `T` within one family → mint one new individual of the next-rarer tier `T−1` in that same family. K SHALL be a single tunable constant (default `3`). Fusion consumes **duplicates only**: the eligible-to-consume pool for a tier `T` SHALL be the held individuals at tier `T` minus the protected oldest individual of each `T` slot (see the last-copy-protection requirement). The count surfaced to the player (the fusion button numerator) SHALL be this duplicate surplus, NOT the total held — the button and the tooltip SHALL make clear it counts duplicates.

The promote SHALL prefer an **unowned** `T−1` slot in the family; if every `T−1` slot is already owned, it SHALL mint a new individual of an already-owned `T−1` slot (a valid dupe individual under open-collection). Promotion of the rarest tier (P0) SHALL be unavailable (no `T−1`). The promote SHALL NOT spend neural energy and SHALL NOT introduce any new currency.

Consuming an individual SHALL set its `consumedAt` (soft-delete) rather than deleting the row; `neuronVariants.copies` SHALL NOT be decremented (it is a lifetime-mint count). The minted higher-tier individual SHALL go through the existing mint path (emit `variantRolled` reveal, stamp provenance, fire achievement / leaderboard / connectome hooks).

#### Scenario: Promote consumes 3 surplus P4 individuals and mints a P3 individual

- **GIVEN** a family with ≥ K held P4 SURPLUS individuals (duplicates beyond one-per-slot) and at least one unowned P3 slot
- **WHEN** the player promotes at that P4 tier (K = 3)
- **THEN** exactly 3 surplus P4 individuals SHALL have `consumedAt` set (never a slot's protected copy)
- **AND** one new P3 individual SHALL be minted for a previously-unowned P3 slot in that family, `consumedAt = null`
- **AND** the reveal modal/toast SHALL fire for the minted P3

#### Scenario: Promote target falls back to a dupe individual when the tier is full

- **GIVEN** a family whose every P3 slot is already owned, and ≥ K held P4 surplus individuals
- **WHEN** the player promotes at the P4 tier
- **THEN** a new P3 individual SHALL be minted for an already-owned P3 slot (a dupe individual)

#### Scenario: P0 cannot be promoted

- **GIVEN** any number of held P0 individuals
- **WHEN** the player views promote options at the P0 tier
- **THEN** no promote action SHALL be offered for P0

#### Scenario: Promote is unavailable below the K threshold

- **GIVEN** a family whose surplus pool at a tier holds fewer than K individuals
- **WHEN** the player views that tier
- **THEN** the promote action SHALL be disabled with a reason indicating insufficient surplus

## ADDED Requirements

### Requirement: Last-copy protection SHALL keep at least one individual per owned slot

A promote SHALL only consume individuals that are **surplus** — for every `(familyId, slotIndex)` the system SHALL keep at least one held individual. The eligible-to-consume pool for a tier `T` SHALL be the held individuals at tier `T` minus the protected oldest individual of each `T` slot. Fusion therefore never destroys the sole held copy of a distinct variant single-device. The default SHALL be to keep all individuals; promotion SHALL be entirely player-initiated.

**Cross-device limitation (acknowledged).** Last-copy protection is enforced per-device at promote time. Two devices starting from the same `(2 held individuals at one slot)` snapshot can each promote-consume one individual (each device locally thinking the other is the kept one). After the consumed monotonic-OR merge in the R2 bundle, the slot can converge to **0 held individuals while the `neuronVariants` row still exists with monotonic `copies ≥ 2`** — a「ghost slot」. The cross-device race cannot be cheaply prevented without a synchronous claim protocol; instead every downstream「distinct-owned」 consumer reads through the canonical `ownedSlotCount` projection so a ghost slot does NOT inflate any user-visible or cloud-visible count, and the collection view does not render a card for it.

The system SHALL NOT auto-purge ghost slot `neuronVariants` rows. The lifetime `copies` field intentionally retains its monotonic semantics for catalog-history purposes; the row stays as a「once held, currently empty」 marker.

#### Scenario: The sole individual of a slot is never consumable

- **GIVEN** a family with exactly one held P4 individual at slot a and three held P4 individuals at slot b
- **WHEN** the eligible-to-consume P4 pool is computed
- **THEN** it SHALL contain exactly two individuals (the surplus copies of slot b)
- **AND** the sole individual of slot a SHALL NOT be eligible

#### Scenario: Individuals spread one-per-slot yield zero surplus

- **GIVEN** a family holds P4 individuals each in a DISTINCT P4 slot (one per slot)
- **WHEN** the surplus pool at the P4 tier is computed
- **THEN** it SHALL be empty (every copy is a protected last copy)
- **AND** the promote action SHALL be disabled

#### Scenario: Cross-device promote race produces a ghost slot but no inflated count

- **GIVEN** both devices share starting state for slot `(藥理學, 2)`: 2 held P4 individuals `I1` and `I2`, with `neuronVariants.copies = 2`
- **WHEN** device A promotes consuming `I1` and device B promotes consuming `I2` before either pushes
- **AND** both bundles round-trip through the consumed monotonic-OR merge
- **THEN** both `I1.consumedAt` and `I2.consumedAt` SHALL be set (the slot is a ghost slot)
- **AND** the `neuronVariants` row SHALL remain with `copies = 2` (monotonic lifetime count unchanged)
- **AND** `ownedSlotCount(db)` SHALL exclude this ghost slot from its return value

### Requirement: The fusion UI SHALL prominently indicate that only duplicates are consumed

The collection view's fusion surface SHALL render a prominent, always-visible hint (not merely a tooltip) stating that fusion consumes only DUPLICATE individuals and that the first copy of each variant is always kept. Each tier's promote button label SHALL count the duplicate surplus explicitly (e.g.「T→T−1（重複 N/K）」) so the number cannot be mistaken for the total held count. The button tooltip SHALL restate the cost and the keep-one rule.

#### Scenario: The duplicates-only hint is shown whenever fusion is offered

- **GIVEN** a family with ≥ 1 surplus (duplicate) individual at some tier
- **WHEN** the family section renders its fusion surface
- **THEN** a prominent hint SHALL state that only duplicates are fused and one copy of each variant is kept
- **AND** each tier button's numerator SHALL be that tier's duplicate surplus, labelled as duplicates (not total held)

#### Scenario: A tier with holdings but no duplicates offers no enabled fusion

- **GIVEN** a family holds individuals of a tier but zero duplicates (one per slot)
- **WHEN** the family section renders
- **THEN** no enabled fusion button SHALL be shown for that tier (surplus 0)
