## 1. Atlas spec + index map (no art yet)

- [x] 1.1 Define the tile taxonomy + atlas layout: list every tile (bgTissue; fiber straight H/V, curve ×4, T ×4, cross, cap; weave over / under-gap; fog; node neuron; bouton; soma core; portal; walker) with its 16×16 grid `{col,row}` slot
- [x] 1.2 Create `apps/neurons-tw/src/assets/maze/tiles/tile-index.ts` — named-key → `{col,row}` const + the cell size constant; export a typed accessor
- [x] 1.3 Locked: atlas cell size = 16×16; vibe = v1 balanced density; corridors = per-family tinted from ONE neutral fiber set (bouton-state = single glyph at state op/r; tint blend = multiply)

## 2. Author structural tiles (seamless) — via generator script (D1a)

- [x] 2.1 Author the neural-tissue background field tile; seamless 2×2-grain dither (highest seam risk — done first)
- [x] 2.2 Author the axon-corridor fiber set: straight (H/V), curve, T, 4-way cross, cap — NEUTRAL/near-white tintable base, chunky (hard outline + coarse 2×2 glow + myelin segmentation per owner feedback)
- [x] 2.3 Author the over-under weave bridge tiles (weaveUnderH/V gapped) and the grainy fog tile
- [x] 2.4 Export the structural tiles into `maze-atlas.png` at their index-map slots (`scripts/build-maze-atlas.mjs`)

## 3. Author hero glyphs — geometric in the generator (D1a: AI@16px = mush)

- [x] 3.1 Generate variant node-neuron, synaptic bouton, center soma core, border entry portal, walker growth-cone glyphs (signal palette, hard outline, chunky)
- [x] 3.2 Composite hero glyphs into `maze-atlas.png` at their slots

## 4. Renderer: autotiling derivation

- [x] 4.1 `fiberTileFor(prev, cur, next)` derives the structural tile + rotation from same-family path neighbours (straight/curve/T/cross/cap) — `MazeGrid.tsx`
- [x] 4.2 Fold the over/under weave flag into the derivation: under family → `weaveUnder` gapped tile at the crossing cell (replacing the old `continue` gap)

## 5. Renderer: atlas blit behind the existing seam

- [x] 5.1 `loadAtlas()` loads the atlas once + builds per-family multiply-tinted copies + a bg-tissue pattern canvas; `atlasRef.current.ready` gate
- [x] 5.2 Swap drawFiberCell → autotiled tinted blit; drawBouton → bouton glyph at state op/r; drawCore → soma-core glyph; background checker → bgTissue pattern fill; `imageSmoothingEnabled = false`
- [x] 5.3 Keep the procedural draw functions as the fallback path when `!atlas.ready` (wired at each call site)
- [x] 5.4 Walker: kept the existing `VariantSprite` / `GrowthConeGlyph` HTML overlay (atlas walker glyph available but overlay reads better) — decided
- [x] 5.5 Confirmed camera / fog / contextual-camera / walker-overlay / synapse-overlay logic untouched (diff review)

## 6. Verify

- [x] 6.1 `pnpm -r typecheck` clean
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw test` — 356/356 still green (no new tests)
- [x] 6.3 `pnpm --filter @study-rpg/neurons-tw build` (prod) succeeds; atlas inlined as data URI (808 B < Vite 4 KB limit), confirmed present in bundle
- [x] 6.4 Render verified via headless real-maze render (`scripts/render-maze-preview.mjs` — same atlas + same autotiling + real grid-graph.json) + dev atlas serves 200 + console clean. Live browser canvas paint not captured (hidden-tab rAF throttle, documented artifact — not a bug)
- [x] 6.5 Missing-atlas fallback verified by construction: `atlas?.ready` gate falls back to the unchanged pre-existing procedural draw (atlas null → procedural; never broken images)
