## MODIFIED Requirements

### Requirement: Each neuron family SHALL have an identity-distinguishing sprite registered in `theme-pixel-neurons`

The neurons-mode umbrella SHALL ensure that every neuron family (the 11 entries declared by `wire-neurons-content-and-theme` Requirement 7's subject-id mapping) has a corresponding real pixel-art sprite registered under the `subject:<id>` key in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real sprite" means: a per-family PNG file at `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`, not the 1×1 transparent-PNG data URI placeholder from the scaffold phase.

Each sprite SHALL visually communicate at least three identity dimensions:

1. **Real neuron morphology hint** matching the family's source neuron type (e.g., Cerebellar Purkinje cell → elaborate dendritic-tree silhouette; Cortical Pyramidal L5 → triangular soma)
2. **Per-subject accent color tint** matching the family's card accent color (`FAMILY_COLOR` in `content-neurons-tw`, per `decouple-neurons-subjects-from-nt-branches`). Each of the 11 families uses its own distinct accent — 4 families (解剖學 Glu green / 組織學 5-HT red / 生物化學 GABA blue / 藥理學 DA gold) retain their original NT-branch color, the other 7 use distinct per-subject colors. The sprite tint SHALL NOT be presented as an NT-branch grouping signal.
3. **Persona accessory** matching the family's narrative role label (e.g., "Mathematician" → small abacus motif; "Judge" → tiny gavel; "Scout" → compass)

Sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe for Gemini-generated pixel-art assets.

This requirement supersedes the scaffold-phase placeholder mapping for subject keys only. Other sprite categories (items / cosmetics / skill placeholders / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities (variant gacha, achievements, dorm view, etc.) require them.

#### Scenario: Theme pack ships real sprite per neuron family

- **GIVEN** the neurons-mode umbrella is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (overview page, connectome page, future variant gacha, etc.) reads `SPRITE_MAP['subject:藥理學']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/subjects/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI used during scaffold phase

#### Scenario: All 11 families covered

- **GIVEN** the 11 neuron family IDs declared by `wire-neurons-content-and-theme` (藥理學 / 公共衛生學 / 寄生蟲學 / 組織學 / 生物化學 / 病理學 / 免疫學 / 解剖學 / 生理學 / 胚胎學 / 微生物學)
- **WHEN** the developer iterates over those IDs and checks `SPRITE_MAP['subject:' + id]`
- **THEN** each lookup SHALL return a unique real PNG URL
- **AND** no two families SHALL share the same sprite

#### Scenario: Sprite visual identity reflects family persona

- **GIVEN** the human reviewer opens `packages/theme-pixel-neurons/sprites/subjects/胚胎學.png` (Cajal-Retzius — Pioneer Architect)
- **THEN** the sprite SHALL display a Cajal-Retzius-style morphology cue (horizontal-bipolar dendrite signature) and its per-subject olive-yellow accent tint (`#7e7b25`)
- **AND** the sprite SHALL display an architect-related accessory (blueprint roll, hardhat, or similar)
- **AND** the same reviewer opening `生物化學.png` (Cerebellar Purkinje — Mathematician) SHALL see Purkinje-style elaborate dendritic-tree morphology, its GABA-blue accent tint (`#6a9bc4`, an unchanged anchor), and abacus / equation / chalkboard accessory

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** items / cosmetics / skill placeholders / core scaffold keys' consumer capabilities have not yet shipped
- **WHEN** the developer reads `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-subject key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability requires real assets (separate future change)
