## Why

`retint-neurons-subject-sprites` (2026-06-06) re-tinted the 11 **subject family icons** (`sprites/subjects/<id>.png`) to each family's new per-subject accent (`FAMILY_COLOR`, set by `decouple-neurons-subjects-from-nt-branches`). But the **110 variant gacha 立繪** (`sprites/variants/<familyId>-<slotIndex>.png`) and their **animation-state frames** (`sprites/animated/<familyId>-<slot>-{correct,evolve}.png`) were generated earlier (`generate-neuron-variant-sprites` 2026-05-30) with the old 4-color NT-branch palette baked in, and were never re-tinted.

Measuring every variant sprite's dominant tint confirmed all 110 still carry the **old NT-branch color** (Δhue→old ≤ 6° for all 11 families). For the 4 anchor families (解剖 / 組織 / 生化 / 藥理) the new accent == old branch color, so they coincidentally still match. For the 7 new-color families the variant 立繪 visibly diverge from their family card / icon — worst cases: 公共衛生學 (gold → magenta, Δ96°), 生理學 (green → teal, Δ85°), 病理學 (blue → purple, Δ63°), 微生物學 (Δ46°). So the collection page, connectome nodes, family picker, and `VariantUnlockModal` show a 立繪 tint that contradicts the family's accent color.

## What Changes

- Re-tint the **70 variant 立繪** (`sprites/variants/`) of the **7 new-color families** (胚胎 / 生理 / 微生物 / 免疫 / 寄生蟲 / 公衛 / 病理) via an in-place `magick -modulate 100,100,<hueVal>` hue-shift of the existing approved art — same proven technique as the icon retint. The 4 anchor families' 44 立繪 are **unchanged**.
- Re-tint the **28 animation-state frames** (`sprites/animated/`) of those same 7 families (slots 3 & 5, `correct` + `evolve`) with the identical per-family rotation, so the win / evolve animations no longer flash the old color. The 17 anchor animation frames are **unchanged**.
- Reconcile the `neuron-variant-gacha`「register one variant sprite key per catalog entry」 requirement to state the per-subject accent-tint cohesion dimension (matching `FAMILY_COLOR`), mirroring the icon requirement.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `neuron-variant-gacha`: the「Theme pack SHALL register one variant sprite key per catalog entry plus terminal default」 requirement gains a per-subject accent-tint cohesion clause — each family's variant 立繪 (and their animation-state frames) carry that family's accent tint (`FAMILY_COLOR`), not the legacy 4-color NT-branch palette.

## Impact

- **Assets**: 98 PNGs re-tinted in place — 70 at `packages/theme-pixel-neurons/sprites/variants/{胚胎學,生理學,微生物學,免疫學,寄生蟲學,公共衛生學,病理學}-{0..9}.png` + 28 at `packages/theme-pixel-neurons/sprites/animated/{同7科}-{3,5}-{correct,evolve}.png`. All stay 384×384 transparent PNG with binary alpha; the `-modulate` re-encode yields indexed-palette PNGs (smaller, browser-universal, no fidelity loss).
- **No code change**: `theme-pixel-neurons` `SPRITE_MAP` globs already register `variant:<familyId>:<slotIndex>` and `variant:<familyId>:<slot>:<state>`; consumers read these keys unchanged. **No Dexie / R2 / Worker / content-pack / animation-component change.**
- **No `neurons-sprite-animation` delta**: that capability already requires per-family glow「配合立繪主色」; retinting the frames keeps them consistent with the (now-new) 立繪 main color.
- After this change, all 11 families show variant 立繪 tint ≈ family accent (verified: per-family mean Δhue ≤ 5°).
