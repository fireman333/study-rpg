## Why

`add-neurons-exam-set-mock-variants` shipped the mock-variant gacha as an MVP: the 13 catalog entries carried `neuroAnchorTODO: true` (textbook-canonical neuro-facts, no PubMed anchors) and rendered a placeholder 🧬 glyph instead of real art. Both were explicitly deferred follow-ups. This change finalizes the catalog: every neuro-identity is now OpenEvidence-anchored, and every entry has a real generated sprite.

## What Changes

- **OE anchoring**: all 13 catalog entries gain OpenEvidence crossref-validated reference anchors (landmark papers, `doi:` form) and flip `neuroAnchorTODO: false`. The `MockVariantDef.pmids?` field is renamed to `refs?: string[]` (the anchors are crossref-validated DOIs, PMID-equivalent evidence). Facts were confirmed via 6 grouped OE queries covering all 13 neurons.
- **Real sprites**: 13 generated 384×384 pixel-art neuron sprites (codex `gpt-image-2`) land in `packages/theme-pixel-neurons/sprites/mock-variants/<variantId>.png`, keyed `mock-variant:<id>` into `SPRITE_MAP` (present-only glob, mirroring connectors). The mock collection view + reveal badge render the real sprite when present, falling back to the 🧬 glyph for any missing.
- **Relocate the collection into 圖鑑**: the standalone `/mock-collection` page becomes a `MockVariantSection` rendered on `/collection` (圖鑑) directly after the 連結神經元 (`ConnectorSection`) block — mirroring how connectors are shown (an independent sub-pool as a section). The section uses the **open-collection** style (only owned variants, pure count, no denominator/silhouettes) — consistent with `ConnectorSection` and with the existing collection-view requirement (which already specified "no denominator"; the MVP standalone page wrongly showed "X/13" + locked silhouettes). The `/mock-collection` route 301-redirects to `/collection`; the 題庫 mock chooser links there.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-mock-variant-gacha`: the collection-view requirement is updated — real sprites now render via `SPRITE_MAP`, with the placeholder glyph demoted to a fallback (was "until real art ships, render a placeholder glyph"). The OE-anchor requirement is satisfied for all current entries (`neuroAnchorTODO` now false catalog-wide).

## Impact

- **Code**: `packages/content-neurons-tw/src/mock-variant-catalog.ts` (refs + flag flip + `pmids→refs` rename), `packages/theme-pixel-neurons/src/sprites.ts` (mock-variant glob + spread), `apps/neurons-tw/src/routes/MockVariantCollectionPage.tsx` + `components/MockVariantRevealBadge.tsx` (render real sprite, glyph fallback).
- **Assets**: 13 new PNGs in `theme-pixel-neurons/sprites/mock-variants/` (~0.6–1 MB total).
- **No schema/sync/backend change**: `spriteKey` strings are stable, so no Dexie/R2/leaderboard impact. Pure content + art finalization.
- **Evidence rigor**: fulfills the project M_3rd neuroscience rule (PubMed/OE-anchored neuro-facts before finalizing) for the mock catalog.
