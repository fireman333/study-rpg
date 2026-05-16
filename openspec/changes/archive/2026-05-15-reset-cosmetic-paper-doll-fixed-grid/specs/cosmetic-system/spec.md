## ADDED Requirements

### Requirement: Cosmetic sprite bbox compliance

Non-background cosmetic sprites SHALL paint their main visual content within a category-specific pixel bounding box on the 384×384 canvas. The canvas area outside the bbox SHALL be fully transparent (alpha = 0). This bbox convention is the normative spec for the LPC / Mana Seed fixed-grid paper-doll layering pattern adopted by this engine.

The bbox table is:

| Category | bbox X (pixels) | bbox Y (pixels) | Size (W × H) | Anatomy anchor |
|---|---|---|---|---|
| `head` | 130 – 254 | 40 – 160 | 124 × 120 | 臉部+瀏海+眼鏡/帽 |
| `body` | 100 – 280 | 140 – 300 | 180 × 160 | 肩→腰，白袍/衣服 |
| `accessory` | 100 – 280 | 160 – 260 | 180 × 100 | 胸口層級，聽診器/徽章/掛飾 |
| `held` | 80 – 200 | 240 – 340 | 120 × 100 | 左手 grip 位置 |
| `background` | N/A | N/A | 384 × 384 | full-canvas, no bbox |

Coordinates are pixel indices in a 384×384 canvas with origin (0, 0) at top-left.

The bbox compliance threshold SHALL be:
- Main visual content fully within declared bbox, with ≤ 5 px overflow tolerance per edge
- Outside bbox: alpha = 0 (transparent); non-transparent stray pixels outside bbox count as bbox violation

bbox violation is a spec-level defect. Theme pack authors generating sprites (via codex `$imagegen` or otherwise) SHALL regenerate non-compliant sprites until they fit the bbox.

#### Scenario: Head cosmetic fits head bbox

- **WHEN** any `cosmetic-head-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [130, 254] ± 5 px AND Y = [40, 160] ± 5 px
- **AND** all pixels outside the bbox SHALL have alpha = 0

#### Scenario: Body cosmetic fits body bbox

- **WHEN** any `cosmetic-body-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [100, 280] ± 5 px AND Y = [140, 300] ± 5 px

#### Scenario: Accessory cosmetic fits accessory bbox

- **WHEN** any `cosmetic-accessory-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [100, 280] ± 5 px AND Y = [160, 260] ± 5 px

#### Scenario: Held cosmetic fits held bbox

- **WHEN** any `cosmetic-held-*` sprite is loaded
- **THEN** all non-transparent pixels SHALL fall within X = [80, 200] ± 5 px AND Y = [240, 340] ± 5 px

#### Scenario: Background cosmetic is full-canvas

- **WHEN** any `cosmetic-background-*` sprite is loaded
- **THEN** the sprite MAY paint the full 384×384 canvas
- **AND** bbox compliance SHALL NOT apply
