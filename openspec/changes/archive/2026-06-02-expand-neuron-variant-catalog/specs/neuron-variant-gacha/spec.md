## MODIFIED Requirements

### Requirement: Content pack SHALL ship a per-family pyramid `NEURON_VARIANT_CATALOG` with an explicit rarity per variant

The `@study-rpg/content-neurons-tw` package SHALL export `NEURON_VARIANT_CATALOG:
NeuronVariantDef[]` shaped as a **per-family rarity pyramid**: each family declares a
variable number of variants per tier, with rising rarity holding fewer variants and
exactly one P0 apex (`slotIndex = 0`) per family. The catalog SHALL currently ship
**110 variants = 11 families × 10 slots** (uniform per family:
P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2). Each entry SHALL have:

```typescript
interface NeuronVariantDef {
  familyId: string
  slotIndex: number                     // 0..N-1 unique within family; 0 = P0 apex
  rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5' // EXPLICIT per variant (not derived)
  displayName: string
  spriteKey: string                     // 'variant:<familyId>:<slotIndex>'
  description: string
}
```

A build-time `assertCatalogShape` guard SHALL enforce: every family has exactly one
P0 at `slotIndex === 0`; `slotIndex` values are contiguous `0..N-1` and unique within
each family; `rarity ∈ {P0..P5}`; rising rarity holds no more variants than the tier
below it (pyramid invariant); and `spriteKey === 'variant:' + familyId + ':' + slotIndex`.

#### Scenario: Catalog is a per-family pyramid with one P0 apex each

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** every family SHALL have exactly one `rarity === 'P0'` entry at `slotIndex === 0`
- **AND** within each family, for every adjacent rarity pair the rarer tier SHALL
  declare no more variants than the commoner tier (pyramid invariant)
- **AND** each family's `slotIndex` values SHALL be contiguous `0..N-1` and unique

#### Scenario: Catalog ships 110 variants across 11 families of 10 slots each

- **WHEN** a consumer imports `NEURON_VARIANT_CATALOG`
- **THEN** `NEURON_VARIANT_CATALOG` SHALL contain exactly 110 entries
- **AND** every family SHALL declare exactly 10 variants (`VARIANT_COUNT_BY_FAMILY[f] === 10`)
- **AND** each family's per-tier counts SHALL be `P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2`
- **AND** each family's `slotIndex` values SHALL be contiguous `0..9`

#### Scenario: Rarity is read from the explicit field, not the slot index

- **GIVEN** a family with two `P5` variants at `slotIndex` 1 and 2
- **WHEN** the pull service resolves a variant's rarity
- **THEN** it SHALL read the entry's explicit `rarity` field, not `SLOT_RARITY[slotIndex]`

### Requirement: Theme pack SHALL register one variant sprite key per catalog entry plus terminal default

The `theme-pixel-neurons` `SPRITE_MAP` SHALL include `variant:<familyId>:<slotIndex>`
for **every** catalog entry (one key per pyramid slot) plus the terminal
`variant:default` fallback. All 110 keys (`slotIndex 0..9` per family) SHALL resolve to
**real art** PNGs: the 77 keys shipped before this change (`slotIndex 0..6`) keep their
existing PNGs, and the 33 new keys (`slotIndex 7 / 8 / 9`) SHALL each ship a real PNG
in this change (no placeholders). The terminal `variant:default` remains as a defensive
fallback so the lookup SHALL never produce a broken image.

#### Scenario: Every catalog key resolves to real art

- **WHEN** the developer iterates all `(familyId, slotIndex)` pairs in the catalog
- **THEN** `SPRITE_MAP['variant:'+familyId+':'+slotIndex]` SHALL resolve to a non-empty
  real-art URL for each (the `variant:default` fallback SHALL be unused in practice)

#### Scenario: P0 keys resolve to real art

- **WHEN** the developer reads a `variant:<familyId>:0` key
- **THEN** it SHALL resolve to a real (non-placeholder) P0 sprite PNG
