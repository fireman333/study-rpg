## 1. OE-anchor the catalog neuro-facts

- [x] 1.1 Run grouped OpenEvidence queries covering all 13 neuro-identities; capture crossref-validated landmark refs
- [x] 1.2 Rename `MockVariantDef.pmids?` → `refs?: string[]`; `mk()` sets `neuroAnchorTODO = refs.length === 0`
- [x] 1.3 Add one OE-anchored ref per catalog entry; confirm all 13 now have `neuroAnchorTODO: false`
- [x] 1.4 Build content pack + typecheck; confirm no lingering `.pmids` usage

## 2. Generate + wire real sprites

- [x] 2.1 Generate 13 384×384 sprites via codex gpt-image-2 (per neuron morphology/persona); size-verify each (>40 KB real)
- [x] 2.2 Copy verified PNGs → `packages/theme-pixel-neurons/sprites/mock-variants/<variantId>.png`
- [x] 2.3 Add `mock-variants` present-only glob + spread into `SPRITE_MAP` (mirror connectors)
- [x] 2.4 Render real sprite (glyph fallback) in the collection view + `MockVariantRevealBadge`

## 3. Relocate collection into 圖鑑 (open-collection)

- [x] 3.1 Extract `MockVariantSection` (mirror `ConnectorSection`; open-collection: only owned, pure count, no denominator/silhouettes)
- [x] 3.2 Render `<MockVariantSection />` on `CollectionPage` after `<ConnectorSection>`
- [x] 3.3 Delete standalone `MockVariantCollectionPage`; redirect `/mock-collection` → `/collection`; 題庫 link → `/collection`

## 4. Verify

- [x] 4.1 `pnpm -r typecheck` + full vitest green (no behavior change expected)
- [x] 4.2 neurons Vite build green (sprites bundle / glob resolves)
- [x] 4.3 Chrome MCP smoke: 圖鑑 shows the 模擬考收藏 section (after 連結神經元) with real sprites for owned variants
- [x] 4.4 Diff hygiene: revert meta.json churn; confirm no schema/sync diff
