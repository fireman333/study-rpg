## ADDED Requirements

### Requirement: Permanent equipment SHALL have real artwork registered in `theme-pixel-neurons`

The `neurons-acceleration-system` capability SHALL ensure that every permanent-equipment sprite key (`equipment:<equipmentId>` for each entry in `EQUIPMENT_CATALOG`, currently 12) resolves in `theme-pixel-neurons`'s `SPRITE_MAP` to a real pixel-art PNG file at `packages/theme-pixel-neurons/sprites/equipment/<equipmentId>.png`, NOT the 1×1 transparent-PNG data URI placeholder shipped during `add-neurons-acceleration-system`.

Each equipment sprite SHALL visually communicate at least two identity dimensions:

1. **Neuroscience anchor** named in the equipment's `displayName` / `description` (e.g., `eq-fully-myelinated-axon-p1` → a heavily myelin-wrapped axon cable; `eq-mitochondrial-powerhouse-p1` → a mitochondrion with cristae; `eq-sodium-potassium-pump-p2` → a membrane pump moving Na⁺/K⁺ ions; `eq-oligodendrocyte-companion-p3` → an oligodendrocyte cell companion wrapping myelin).
2. **Lane** via palette — the `speed` lane (myelin / conduction) SHALL read in gold / white myelin with cyan conduction accents; the `energy` lane (pump / metabolic) SHALL read in warm amber / orange metabolic tones — so the two lanes are visually separable in the equipment dex.

Equipment sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe used by sibling changes `generate-neurons-sprites` and `generate-dmn-card-artworks`. Rarity (P1–P5) MAY additionally be conveyed via aura intensity (P1 radiant → P5 plain), reinforcing — not replacing — the dex's rarity grouping.

Equipment are **independent following-companion / aura sprites**, NOT body-worn gear composited onto the neuron; the sprite is a self-contained collectible object (or, for the glial-cell entries, a cute companion creature).

This requirement permits other sprite categories declared by `theme-pixel-neurons` (items / cosmetics / skill placeholders / 6 core scaffold keys) to remain on the transparent-PNG placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack ships real artwork per equipment

- **GIVEN** the `neurons-acceleration-system` capability is active and `theme-pixel-neurons` is loaded
- **WHEN** a consumer (`EquipmentDexPanel`, `DmnDrawModal` equipment reveal, etc.) reads `SPRITE_MAP['equipment:eq-mitochondrial-powerhouse-p1']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/equipment/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI placeholder

#### Scenario: All 12 equipment ids covered with distinct sprites

- **GIVEN** the 12 `equipmentId` values declared by `EQUIPMENT_CATALOG` in `@study-rpg/content-neurons-tw`
- **WHEN** the developer iterates over those ids and checks `SPRITE_MAP['equipment:' + id]`
- **THEN** each lookup SHALL return a real PNG URL (not the transparent placeholder)
- **AND** no two equipment SHALL share the same sprite file

#### Scenario: Lane is distinguishable at a glance

- **GIVEN** a user opens the equipment dex showing speed-lane and energy-lane items
- **WHEN** the user visually scans without reading labels
- **THEN** speed-lane equipment SHALL read in gold / white myelin + cyan tones
- **AND** energy-lane equipment SHALL read in warm amber / orange metabolic tones
