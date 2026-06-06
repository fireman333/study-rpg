## Why

The preceding change `decouple-neurons-subjects-from-nt-branches` gave each of the 11 subjects a distinct **card accent color**, keeping 4 NT-branch anchors (解剖/組織/生化/藥理) and assigning 7 new colors (胚胎/生理/微生物/免疫/寄生蟲/公衛/病理). The 7 new-color families' **sprites still carry the old NT-branch tint**, so their family cards show accent ≠ sprite. This change re-tints those 7 sprites to match, restoring card/sprite cohesion, and reconciles the now-inaccurate「NT branch color tint」clause in the sprite spec.

## What Changes

- Re-tint the **7 new-color family sprites** (`胚胎學 #7e7b25` / `生理學 #27866f` / `微生物學 #278634` / `免疫學 #696cd3` / `寄生蟲學 #ca4970` / `公共衛生學 #c639ba` / `病理學 #9859cf`) at `packages/theme-pixel-neurons/sprites/subjects/<id>.png` via an in-place `magick` hue-shift of the existing approved art (preserves morphology + persona accessory, shifts only the dominant tint to the family's card accent).
- The 4 anchor sprites (解剖/組織/生化/藥理) are **unchanged** (they kept their NT-branch color).
- Update the `neurons-mode`「Each neuron family SHALL have an identity-distinguishing sprite」 requirement: the sprite's color dimension is now **per-subject accent tint** (matching `FAMILY_COLOR`) rather than the 4-color NT-branch palette.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `neurons-mode`: the「identity-distinguishing sprite」 requirement's color dimension changes from「NT branch color tint (4-color palette)」 to「per-subject accent tint matching the family's card accent」.

## Impact

- **Assets**: 7 PNGs at `packages/theme-pixel-neurons/sprites/subjects/{胚胎學,生理學,微生物學,免疫學,寄生蟲學,公共衛生學,病理學}.png` (384×384, transparent, 16-color — same format).
- **No code change**: `theme-pixel-neurons` `SPRITE_MAP` glob already registers `subject:<id>`; the cards already read these. **No Dexie / R2 / Worker / content-pack change.**
- After this change, all 11 family cards show accent ≈ sprite tint.
