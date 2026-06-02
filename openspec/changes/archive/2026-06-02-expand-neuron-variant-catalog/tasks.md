# Tasks — expand-neuron-variant-catalog

> GATE 1 (2026-06-02): D1 = Option A (thicken mids), **D2 = Path 2 (inline sprite-gen,
> 110 all-real art)**, D3 = scale re-tune. §2 is the Path-2 sprite batch; the line-334
> spec delta reads "110 all real art".

## 1. Catalog expansion (content pack)

- [x] 1.1 Added **33 new entries** to `RAW_CATALOG` (`packages/content-neurons-tw/src/variants.ts`) — slots 7/8/9 per family, D1 Option A (`7=P4, 8=P3, 9=P2`), under a "Mid-tier deepening" comment block.
- [x] 1.2 Authored the 33 personas as mid-tier career-stages of each family's already-anchored neuron type (no new science claims; mechanisms reuse the slot-1..5 anchors). Names distinct within family across all 10 slots.
- [x] 1.3 `pnpm --filter @study-rpg/content-neurons-tw build` passes → `assertCatalogShape` holds (one P0/family, contiguous 0..9, pyramid invariant, canonical spriteKey).

## 2. Sprites (Path 2 — inline real art, 33 sprites)

- [x] 2.1 Generated 33 real sprites at `packages/theme-pixel-neurons/sprites/variants/<family>-{7,8,9}.png` via Gemini (`gemini_generate_image`), per-family neuron identity + authored persona + hardened anti-frame prompt. Wall ~12 min (4 batches), no codex quota used.
- [x] 2.2 Post-processed via **aspect-preserving** pipeline (`/tmp/neurons-slot789-raw/process.sh`): `-trim` → `-resize 320x320` (NO `!`) → center-pad `-extent 384x384` → chroma-key + `-colors 16`. Fixes the prior `-resize 384x384!` vertical-stretch ("被拉高") bug. All 110 = 384×384 PaletteAlpha, 15–16 colors, 12–15KB (matches existing 77).
- [x] 2.3 `theme-pixel-neurons/src/sprites.ts` variant-key loop bumped `slot <= 6` → `slot <= 9` (the span is hardcoded — theme can't import the catalog, cyclic dep). All 110 `variant:<family>:<slot>` keys now register to real PNGs; QA montages (3 batches) confirm no frame/stretch artifacts, correct NT colours (DA gold / 5HT red / GABA blue / Glu green).

## 3. Pyramid-catalog test re-pin

- [x] 3.1 `variant-pyramid-catalog.test.ts`: `77→110`, per-family `7→10`, contiguous `[0..9]`.
- [x] 3.2 Added per-tier slot-set assertions (D1 Option A: P0{0} P1{5} P2{4,9} P3{3,8} P4{2,7} P5{1,6}); pyramid-invariant test retained. 5/5 green.

## 4. Distinct-count achievement re-tune (content-only)

- [x] 4.1 `achievements.ts` per D3: `variant-fifteen` 15→20; `variant-thirty` 30→40 (dropped "過半典藏"); `variant-fifty` 50→70; `variant-grand-collector` 60→90 (kept `naturalP1DistinctFamilies >= 3` composite gate + updated text).
- [x] 4.2 Content build re-emits "achievements: 30 entries" → validator passes (entry count unchanged; ≥30 / ≥4-per-category / P1-composite intact).

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/content-neurons-tw build` (catalog guard + achievement validator) ✓.
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` — 215/215 pass.
- [x] 5.3 `pnpm -r typecheck` clean (all apps).
- [x] 5.4 Grep for stray hardcoded counts → fixed 3 stale-denominator surfaces (see §6); `character-card.ts SLOTS_PER_FAMILY` derives to 10.
- [x] 5.5 Functional smoke (Chrome MCP, via `/verify`): /collection deeper grid renders; 15/15 force-pulled new-slot variants render real art (0 broken / 0 `variant:default` fallback); Overview chip shows `/ 110`; achievement re-tune correct (53 collected → 20/40 unlock, 70/90 don't); console clean.

## 6. Stale-denominator fixes discovered en route (in-scope: my count change invalidated them)

- [x] 6.1 `OverviewPage.tsx` status chip hardcoded `/ 55` (pre-pyramid base, never updated 66→77→110) → now derives `VARIANT_TOTAL = NEURON_VARIANT_CATALOG.length` (future-proof, won't go stale again).
- [x] 6.2 `HelpMenu.tsx` "7 slot = 77 variants" + "🧬 變體 X / 77" → "10 slot = 110" + "X / 110".
- [x] 6.3 `sprites.ts` registry comment updated to "11 × 10 = 110".
- Note: Overview chip + HelpMenu still use a **denominator** while the connectome family card uses pure-count `🧬 X 隻` (open-collection model). This inconsistency predates this change; corrected the numbers only, did NOT redesign the UX → flagged as a separate follow-up.
