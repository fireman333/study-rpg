## Context

Follow-up to `retint-neurons-subject-sprites` (which only covered the 11 `subject:<id>` icons). The variant gacha 立繪 layer (`variant:<familyId>:<slotIndex>`, 110 keys) + its animation-state frames (`variant:<familyId>:<slot>:<state>`, slots 3/5 × correct/evolve) still carry the pre-`decouple` NT-branch tint. This is a pure recolor of owner-approved art — no morphology / persona / gameplay change.

## Goals / Non-Goals

- **Goal**: every family's variant 立繪 + animation frames read as that family's accent color (`FAMILY_COLOR`), matching the icon + family card.
- **Non-Goal**: regenerate art, change persona morphology, alter saturation/brightness beyond the hue rotation, or touch the 4 anchor families (already correct).

## Decisions

### D1 — In-place `magick` hue-shift, not regeneration (same as icon retint)

Each of the 7 families' sprites is recolored by `magick <src> -modulate 100,100,<hueVal> <out>`, where the rotation = (new accent hue − the family's measured old-branch dominant hue), computed per family from the shipped art's circular-mean dominant hue. This preserves the exact pixel art and shifts only color. _Alternative rejected_: generative regen (different morphology, slower, quality variance).

Per-family rotation applied (old→new hue):

| Family | old branch hue | new accent | rotation | `-modulate` hue param |
|---|---|---|---|---|
| 公共衛生學 | 41° (DA gold) | `#c639ba` 305° | −96° | 46.8 |
| 生理學 | 80° (Glu green) | `#27866f` 165° | +85° | 147.4 |
| 病理學 | 210° (GABA blue) | `#9859cf` 272° | +62° | 134.7 |
| 微生物學 | 82° (Glu green) | `#278634` 128° | +46° | 125.8 |
| 免疫學 | 209° (GABA blue) | `#696cd3` 238° | +29° | 116.3 |
| 寄生蟲學 | 1° (5-HT red) | `#ca4970` 342° | −19° | 89.6 |
| 胚胎學 | 83° (Glu green) | `#7e7b25` 58° | −25° | 85.9 |

The same rotation is applied to that family's variant 立繪 (slots 0–9) AND its animation frames (slots 3/5, correct/evolve), so static and animated states stay color-consistent.

### D2 — Verification by dominant-hue measurement, asserted at the subject-aggregate level

Each sprite's dominant **saturated** opaque color is sampled (skip alpha<50%, saturation<0.18, near-black) and its hue compared to the family accent. The authoritative metric is the **per-family mean Δhue** (robust to individual persona accents); a single 立繪 may legitimately have a large non-family color block (e.g. 胚胎學-0's amniotic-blue), which shows as a per-variant outlier but is NOT a tint error — its family-tint pixels shifted correctly. Post-retint result: all 11 families mean Δhue ≤ 5°; 109/110 individual 立繪 within ≤35° (the one outlier is 胚胎學-0's persona blue block).

## Risks / Trade-offs

- **Hue-shift introduces stray colors on multi-color sprites** → the rotation is uniform, so persona accessory colors rotate too; large rotations (公衛 −96° / 生理 +85° / 病理 +62°) reviewed on a before/after contact sheet and approved by owner.
- **Indexed-palette re-encode** (`-modulate` output is `color_type 3` vs the source `color_type 6`) → benign: binary alpha preserved, browser-universal, smaller files; no anti-aliasing to lose (sources are hard-edged 1-bit-alpha pixel art).

## Migration Plan

1. Copy the 70 + 28 recolored PNGs over the originals (done in working tree).
2. Verify dominant-hue per family + format integrity + typecheck.
3. Sync the `neuron-variant-gacha` delta into the main spec; `openspec validate --strict`; archive.

## Open Questions

_None._ Owner approved the recolored sprites on the contact sheet.
