## 1. Base map asset + build-time graph pipeline

- [x] 1.1 Generate DA-pathway base image via codex `gpt-image-2` (`-m gpt-5.5`): flat-saturated non-overlapping 4-color pixel brain map, sparse projection-pathway complexity (~12–16 main tracts: nigrostriatal / mesolimbic / mesocortical). **Visual-approval checkpoint** — present to owner, iterate until accepted; codex stall >10min → fall back to Gemini 3.5 Flash or cannibalize prototype `neurons-tracts-sparse.png`. Commit accepted image to `apps/neurons-tw/src/assets/maze/da-basemap.png` (or theme-pixel-neurons).
- [x] 1.2 Build-time pipeline `scripts/build-maze-graph.mjs` (Node, no OpenCV): sharp decode @384×256 → HSV single-color mask → morphological close → Zhang-Suen skeletonize (ported v7) → prune spurs → skeleton→graph (endpoint/branch/continuation) → **hub detect (densest amber) + Dijkstra root→anchor walk paths** → RDP → arc-length. Anchors farthest-point-sampled for spatial spread.
- [x] 1.3 Used `sharp` (already in store) for PNG decode as neurons-tw devDep; **self-wrote RDP** (no `simplify-js` dep) + HSV mask + Zhang-Suen + skeleton-to-graph. (Refinement: avoided adding simplify-js.)
- [x] 1.4 Emit committed static graph JSON `apps/neurons-tw/src/assets/maze/da-graph.json` (20 nodes w/ familyId+slotIndex+kind + per-node root→node walk polyline + arc-length; hub `root`). Regen: `pnpm --filter @study-rpg/neurons-tw build:maze-graph`. CI does NOT re-run.
- [x] 1.5 Generic growth-cone fallback walker (empty team, 0 collected) — inline SVG `GrowthConeGlyph` in `MazeBetaPage.tsx` (filopodia hand glyph; no PNG, themeable). Satisfies "generic growth-cone fallback sprite".

## 2. Node ↔ variant-slot binding (DA region)

- [x] 2.1 20 topology anchors mapped to 20 DA slots (藥理 + 公衛, slotIndex 0–9) at build time (radial assignment around hub); `FAMILY_NT_BRANCH`-derived `MAZE_FAMILIES`. Bijection asserted by `maze-graph.test.ts`.
- [x] 2.2 Typed loader `lib/maze/graph.ts` parses `da-graph.json` → `MazeGraph { root, nodes: MazeNode[] }`, each node carrying `{familyId, slotIndex, kind, x, y, path, arc, pathLen}` + helpers (`isNodeLit`/`foggedNodes`/`nextTarget`/`pointAtFraction`).

## 3. Persistence (prefer meta key-value)

- [x] 3.1 Maze persistence in existing `meta` key-value store (`meta['maze:da:signal']`, `meta['maze:da:settles']`) — **NO Dexie `.version()` bump**. Local-only (NOT added to `SYNCED_META_KEYS`). Lit-node state derived at read time, never stored.
- [x] 3.2 Escape hatch NOT needed — `meta` was sufficient. No new store, no schema bump → `lint:dexie-fixtures` not triggered (verified in 9.4).

## 4. Growth-signal exploration economy

- [x] 4.1 Growth-signal accumulator `lib/maze/economy.ts` (`accrueMazeSignal`): correct answer + reading both add; streak + team-speed multipliers; persist to `meta`. No monetary path.
- [x] 4.2 Hooks wired: `connectome.recordCorrectAnswer` (DA families only, post-commit dynamic-import + try/catch `[maze]`) + `reading-timer` per-minute `Promise.all`. Never breaks the originating action.
- [x] 4.3 Exploration advance = `walkerFraction` (unspent signal → fraction along the target path); `useMaze` live-advances the walker as signal accrues (`MazeBetaPage` walker `transition`).

## 5. Exploration teams + speed buff

- [x] 5.1 `mazeSpeedMultiplier(count)` = fixed base 1.0 + monotonic capped buff from collected DA count (read-only). Empty team → ×1 (still advances).
- [x] 5.2 Unit-tested base-never-below-1 + monotonic + capped (`maze-economy.test.ts`).

## 6. Node settle + gacha bridge

- [x] 6.1 Node-settle = `reconcileSettles` → for each due threshold, reveal nearest fogged node + collect its slot via new `mintVariantSlot` (reuses gacha mint machinery + `variantRolled` event → existing `VariantUnlockModal` animates reveal; no energy cost, no rarity roll).
- [x] 6.2 Pity trivially satisfied — frontier only targets fogged (uncollected) nodes, so every settle yields a new slot. Unit-tested (distinct + not-pre-collected).

## 7. Runtime rendering

- [x] 7.1 `MazeBetaPage.tsx` + `/maze-beta` route + nav link wired in `App.tsx` (router only; connectome/collection untouched).
- [x] 7.2 Base map rendered dimmed (fog) with region outline visible; lit nodes reveal variant 立繪 + bright grown-axon path; fogged nodes show nothing (no silhouette/shape/rarity); fog clears on lighting.
- [x] 7.3 Walker arc-length tween along the node's hub→node polyline (`pointAtFraction`, CSS `transition`); Dijkstra used only at build-time for route selection, never runtime movement.
- [x] 7.4 Live walker advance as signal accrues (when maze visible) + WebAudio reveal chime on settle (per spec refinement — neurons answers in QuizModal on other routes).
- [x] 7.5 Pure-count chip 「🧠 已連線 X 個腦區」 — no denominator, no completion milestone, no terminal disabled state.
- [x] 7.6 `TEAM_ENCODING` scaffold (color + line-style + node-shape) + legend; structured for 4-region reuse.
- [x] 7.7 Walker = rarest collected DA variant 立繪 (tie-break most-recent) via `pickWalkerVariant`; 0-collected → inline `GrowthConeGlyph`; recomputed live on collection change. Unit-tested.

## 8. Migration (collected → lit, derived)

- [x] 8.1 Lit nodes derived from collected DA variants read-only in `useMaze` (`collectedKeys`/`rowByKey`) — no backfill write, no migration banner. Existing players see collected DA variants pre-lit on open.

## 9. Tests + verification

- [x] 9.1 Vitest `maze-economy.test.ts` (12): signal accrual + speed/streak mult; base-never-below-1 + monotonic; settle mints per threshold + idempotent + guarantees-uncollected + stops-at-20; walker selection (rarest / tiebreak / empty→null).
- [x] 9.2 Vitest `maze-graph.test.ts` (7): 20-node bijection, DA families, hub root, on-fiber paths, topology kinds, lit/fog derivation, `pointAtFraction` root→node.
- [x] 9.3 Chrome MCP end-to-end smoke on `/maze-beta` ✓ — fog renders, signal→settle→reveal modal→node lights, chip 1→4, speed buff scales, walker advances, console clean (only a pre-existing nav-style React warning); SPA three-pack all green (in-app nav + direct URL + F5).
- [x] 9.4 `pnpm --filter @study-rpg/neurons-tw test` (234 pass) + `pnpm --filter @study-rpg/neurons-tw typecheck` (clean) + `pnpm lint:dexie-fixtures` (OK, no schema bump) + prod build (OK).
