## 1. Re-tint the variant 立繪 (70 files, 7 families)

- [x] 1.1 Compute per-family hue rotation from the shipped art's measured old-branch dominant hue → new accent (`FAMILY_COLOR`).
- [x] 1.2 Apply `magick <src> -modulate 100,100,<hueVal>` in place over `packages/theme-pixel-neurons/sprites/variants/{胚胎學,生理學,微生物學,免疫學,寄生蟲學,公共衛生學,病理學}-{0..9}.png`.
- [x] 1.3 Confirm the 4 anchor families' 44 立繪 (解剖 / 組織 / 生化 / 藥理) are untouched (`git status` shows exactly 70 modified variant PNGs, 0 anchors).

## 2. Re-tint the animation-state frames (28 files, same 7 families)

- [x] 2.1 Apply the identical per-family rotation to `packages/theme-pixel-neurons/sprites/animated/{同7科}-{3,5}-{correct,evolve}.png`.
- [x] 2.2 Confirm the 17 anchor animation frames are untouched (`git status` shows exactly 28 modified animated PNGs, 0 anchors).

## 3. Verify

- [x] 3.1 Dominant-hue re-measurement: all 11 families mean Δhue ≤ 5° vs `FAMILY_COLOR`; 109/110 立繪 within ≤35° (sole outlier = 胚胎學-0 persona blue block, family pixels correct).
- [x] 3.2 Format integrity: all 98 PNGs stay 384×384, binary alpha, ≤16-color; valid PNG.
- [x] 3.3 `pnpm -r typecheck` clean (no code change → expected no-op).
- [x] 3.4 Owner reviewed the before/after contact sheet (7 families) and approved.

## 4. Spec + archive + commit

- [x] 4.1 Sync the `neuron-variant-gacha` delta into the main spec; `openspec validate --strict`.
- [x] 4.2 Archive the change.
- [ ] 4.3 Commit: explicit per-file `git add` of the 98 PNGs + `neuron-variant-gacha` main spec + the archived change folder; `git diff --cached --name-status` confirms no anchor / non-sprite file staged.
