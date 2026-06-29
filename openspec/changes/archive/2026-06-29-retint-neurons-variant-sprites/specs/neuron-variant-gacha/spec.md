## MODIFIED Requirements

### Requirement: Theme pack SHALL register one variant sprite key per catalog entry plus terminal default

The `theme-pixel-neurons` `SPRITE_MAP` SHALL include `variant:<familyId>:<slotIndex>`
for **every** catalog entry (one key per pyramid slot) plus the terminal
`variant:default` fallback. All 110 keys (`slotIndex 0..9` per family) SHALL resolve to
**real art** PNGs: the 77 keys shipped before `expand-neuron-variant-catalog` (`slotIndex 0..6`) keep their
existing PNGs, and the 33 keys added there (`slotIndex 7 / 8 / 9`) ship a real PNG
(no placeholders). The terminal `variant:default` remains as a defensive
fallback so the lookup SHALL never produce a broken image.

Each variant 立繪 SHALL carry its **family's per-subject accent tint** (`FAMILY_COLOR` in
`content-neurons-tw`, per `decouple-neurons-subjects-from-nt-branches`) as its dominant color,
NOT the legacy 4-color NT-branch palette. 4 anchor families (解剖學 Glu green / 組織學 5-HT red /
生物化學 GABA blue / 藥理學 DA gold) retain their original color (new accent == old branch color);
the other 7 families' 立繪 (and their animation-state frames under `neurons-sprite-animation`,
`variant:<familyId>:<slot>:<state>`) were hue-shifted to their new accent so the 立繪 tint matches
the family card / `subject:<id>` icon. The tint SHALL NOT be presented as an NT-branch grouping signal.
Per-variant persona art MAY include accent color blocks that are not the family tint (narrative detail);
the requirement is that each family's variant 立繪 read, in aggregate, as the family's accent color.

#### Scenario: Every catalog key resolves to real art

- **WHEN** the developer iterates all `(familyId, slotIndex)` pairs in the catalog
- **THEN** `SPRITE_MAP['variant:'+familyId+':'+slotIndex]` SHALL resolve to a non-empty
  real-art URL for each (the `variant:default` fallback SHALL be unused in practice)

#### Scenario: P0 keys resolve to real art

- **WHEN** the developer reads a `variant:<familyId>:0` key
- **THEN** it SHALL resolve to a real (non-placeholder) P0 sprite PNG

#### Scenario: Variant 立繪 tint matches the family accent color

- **GIVEN** a human reviewer (or a dominant-hue measurement) inspects the 10 variant 立繪 of a new-color family — e.g. 公共衛生學 (accent `#c639ba` magenta) or 生理學 (accent `#27866f` teal)
- **THEN** the family's 立繪 SHALL read, in aggregate, as that family's accent hue (per-family mean dominant Δhue ≤ ~35° vs `FAMILY_COLOR`), NOT the family's former NT-branch color (DA gold / Glu green respectively)
- **AND** the 4 anchor families' 立繪 SHALL remain unchanged (their accent already equals their original NT-branch color)
- **AND** the family's animation-state frames (`variant:<familyId>:<slot>:correct` / `:evolve`) SHALL carry the same accent tint so animated states do not flash the legacy color
