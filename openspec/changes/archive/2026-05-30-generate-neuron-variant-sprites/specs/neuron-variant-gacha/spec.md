## MODIFIED Requirements

### Requirement: Theme pack SHALL register 55 placeholder variant sprite keys plus terminal default

The `theme-pixel-neurons` package's `SPRITE_MAP` SHALL include, at minimum:

- 55 entries with keys `'variant:<familyId>:<slotIndex>'` covering every catalog entry — each resolving to a **real GBA-era pixel-art PNG** under `packages/theme-pixel-neurons/sprites/variants/<familyId>-<slotIndex>.png`, NOT the 1×1 transparent-PNG scaffold placeholder.
- 1 terminal fallback entry `'variant:default'` — this terminal fallback MAY remain the 1×1 transparent-PNG placeholder.

Each variant sprite SHALL be a 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic, consistent with the `image_gen_routing.md` Gemini recipe), and SHALL communicate at least three identity dimensions:

1. **Source neuron-type silhouette** consistent across the family's 5 slots — the 5 slots SHALL read as ONE neuron archetype evolving, not 5 unrelated creatures (e.g. 生物化學 = Cerebellar Purkinje → elaborate planar dendritic-tree silhouette in all 5; 生理學 = Cortical Pyramidal L5 → triangular soma in all 5).
2. **NT-branch color tint** from the four-color palette: DA gold (藥理學 / 公共衛生學), 5HT red (寄生蟲學 / 組織學), GABA blue (生物化學 / 病理學 / 免疫學), Glu green (解剖學 / 生理學 / 胚胎學 / 微生物學).
3. **Career-stage progression** matching the slot's catalog persona name + flavour blurb in `NEURON_VARIANT_CATALOG`: slot 1 = newcomer / 初代 (plainer, smaller) escalating to slot 5 = legendary apex / 傳奇 (grander, more ornate / radiant), with accessories reflecting the per-slot persona.

The fallback chain for variant sprite resolution SHALL be unchanged:

```
variant:<familyId>:<slotIndex>     (real PNG after this change)
  → variant:<familyId>:default     (per-family fallback — NOT registered, reserved for future)
  → variant:default:<rarity>       (rarity-tier fallback — NOT registered, reserved for future)
  → variant:default                (terminal fallback — transparent placeholder)
```

Other sprite categories (items / cosmetics / skill placeholders / core scaffold keys) MAY remain on the transparent placeholder until their respective consumer capabilities ship.

#### Scenario: Theme pack registers all 55 variant keys as real art

- **WHEN** the developer iterates over all 55 `(familyId, slotIndex)` combinations
- **THEN** for each pair, `SPRITE_MAP['variant:' + familyId + ':' + slotIndex]` SHALL resolve to a non-empty URL pointing at a real PNG file under `packages/theme-pixel-neurons/sprites/variants/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI
- **AND** no two of the 55 variants SHALL share the same sprite file

#### Scenario: Within-family silhouette coherence and slot progression

- **GIVEN** a human reviewer opens the 5 slot sprites for 生物化學 (Cerebellar Purkinje — Mathematician, GABA blue)
- **THEN** all 5 SHALL share a recognizable Purkinje planar-dendritic-tree silhouette and a GABA-blue tint
- **AND** slot 1 (初代算術員) SHALL read as a plainer / smaller newcomer and slot 5 (平衡學至高神) SHALL read as a grander / more ornate apex

#### Scenario: Terminal fallback remains placeholder

- **WHEN** the developer reads `SPRITE_MAP['variant:default']`
- **THEN** the lookup SHALL resolve to a non-empty URL
- **AND** this terminal fallback MAY be the 1×1 transparent-PNG placeholder
