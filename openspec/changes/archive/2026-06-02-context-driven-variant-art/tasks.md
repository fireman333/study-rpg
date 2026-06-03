# Tasks — context-driven-variant-art

> Final design (2026-06-02 pivot): context art renders as faint full-bleed neuro-field
> backdrops BEHIND the neuron + a colour-coded δ/θ/α/β band letter. No foreground badges,
> no colour wash. See design.md D1–D3.

## 1. Types + pure helper
- [x] 1.1 `apps/neurons-tw/src/lib/variant-decor.ts`: `DecorKey` (redemption/milestone/elder), `BandKey` (delta/theta/alpha/beta), `VariantContextArt = { decor: DecorKey[]; band: BandKey }`.
- [x] 1.2 `variantContextArt(row)`: decor from provenance (elder when undefined; redemption + milestone may stack; `MILESTONE_STREAK_THRESHOLD` from content pack); band from `brainwaveBand(row.rolledAt)`.
- [x] 1.3 `brainwaveBand(rolledAt)`: hour in fixed Asia/Taipei tz → δ/β/α/θ by circadian epoch (cross-device deterministic). `BAND_META` (label / greek / color / hz), OE-grounded.
- **Verify**: `pnpm --filter @study-rpg/neurons-tw typecheck` passes; helper is pure.

## 2. Theme pack — decor texture registration
- [x] 2.1 `packages/theme-pixel-neurons/sprites/decor/` folder.
- [x] 2.2 `sprites.ts`: `sprites/decor/*.png` glob → `decor:redemption|milestone|elder`; register in `SPRITE_MAP` with `?? TRANSPARENT_PIXEL`.
- **Verify**: keys resolve.

## 3. Generate 3 full-bleed neuro-field textures
- [x] 3.1 Gemini-first (per `image_gen_routing.md`).
- [x] 3.2 redemption = action-potential firing field / milestone = myelinated-axon field (nodes of Ranvier) / elder = antique Cajal histology plate. Edge-to-edge, on magenta key colour.
- [x] 3.3 Postprocess: chroma-key magenta → transparent, resize 384 (keep full-bleed, no trim), 16-color quantize → `sprites/decor/`.
- **Verify**: 3 PNGs land; keys resolve to real URLs.

## 4. Shared `<VariantSprite>` component
- [x] 4.1 `apps/neurons-tw/src/components/VariantSprite.tsx` props `{ row, size, alt?, children? }`.
- [x] 4.2 `position:relative; overflow:hidden` wrap → faint decor field(s) `objectFit:cover` (0.11 single / 0.07 stacked) → δ/θ/α/β band letter (band colour, opacity 0.75, bottom-right) → base sprite on top. All context BEHIND the neuron; no colour wash.
- [x] 4.3 Derive via `variantContextArt(row)`; resolve decor URLs via `SPRITE_MAP`; `children` allows animated base.
- **Verify**: component typechecks; verified live (§9).

## 5. Wire `/collection` dex card
- [x] 5.1 `VariantSlotCard` inner sprite → `<VariantSprite row size={64} />`; removed orphan `spriteUrl`/`spriteStyle`/`SPRITE_MAP` import.
- **Verify**: dex grid renders; rarity chip + caption unchanged.

## 6. Wire `VariantUnlockModal`
- [x] 6.1 Wrap reveal sprite in `<VariantSprite size={128}>`; hero evolve sheet / alive idle `<img>` passed as `children` (no animation regression).
- **Verify**: mint reveal shows correct context per provenance.

## 7. Family-section-header representative sprite (decision B)
- [x] 7.1 `<VariantSprite size={32}>` next to each family `<h2>`, sourced from the representative row; nothing when no representative set.
- **Verify**: representative shows its context art on the header.

## 8. Unit tests
- [x] 8.1 `__tests__/variant-decor.test.ts`: decor mapping (標準 / 救贖 / 里程碑 / stack / 元老).
- [x] 8.2 `brainwaveBand` birth-hour → band incl. 4 boundaries + elder-gets-a-band + `BAND_META` shape.
- **Verify**: `pnpm --filter @study-rpg/neurons-tw test` green (157 total).

## 9. Chrome MCP visual pass
- [x] 9.1 `list_connected_browsers` preflight → dev server → seed 5 states (4 bands) → `/collection`.
- [x] 9.2 Confirmed: neuron never occluded; firing/myelin/Cajal fields render as faint backdrops; δ/θ/α/β letter legible; consistent neutral card backgrounds (no rainbow wash); family-header mini reads. Iterated opacity/wash/letter per owner review.
- [x] 9.3 `read_console_messages onlyErrors=true` clean.
- **Verify**: owner approved final design (定稿).

## 10. Close out
- [x] 10.1 `/opsx:verify` (3-dim) passed.
- [x] 10.2 Project `CLAUDE.md` neurons section updated with the context-art capability.
- [ ] 10.3 `/opsx:archive` → commit (auto-git, user-confirmed). Worktree-clean + explicit `git add` per multi-agent git safety (parallel sessions touch this branch; exclude unrelated `meta.json` timestamp).
