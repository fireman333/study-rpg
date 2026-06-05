## 1. Dependency + build-time grid pipeline (border → center)

- [x] 1.1 Add `rot-js` (BSD-3-Clause) to `apps/neurons-tw/package.json`; `pnpm install`; used BUILD-TIME ONLY by the generator (`ROT.Map.EllerMaze` + `ROT.RNG`, NOT Display) — NOT in the runtime bundle.
- [x] 1.2 Write `apps/neurons-tw/scripts/build-grid-maze.mjs`: generate a large/complex square grid maze (`ROT.Map.EllerMaze`/`DividedMaze`, fixed seed) → place 11 family entry anchors on distinct border cells (spread around perimeter) → `ROT.Path.Dijkstra` from each border entry inward to a shared center target → tag ≥2-family shared cells as synapse intersections (concentrate near center) → order each family's node cells by border-entry distance → arc-length parameterize corridor polylines → write committed `apps/neurons-tw/src/assets/maze/grid-graph.json` `{ gridW, gridH, center, families:{<familyId>:{entryCell,corridorCells,nodeCells}}, synapses:[{cell,families}] }`.
- [x] 1.3 Visual pass (Open Questions #1/#2): pin grid size + complexity + 11 anchor placement; verify center crossings are rich. If rot.js generation isn't complex enough, fork/modify an open-source maze layout (committed as the same JSON shape) and/or add radial center extensions for more crossings. Re-run; commit `grid-graph.json`. (Dev-server stale-committed-JSON gotcha: restart dev server after regen.)
- [x] 1.4 Retire 4-branch assets: delete `assets/maze/{da,5ht,gaba,glu}-graph.json`, `{da,5ht,gaba,glu}-basemap.png`, `brain-outline.png`, `brain-mask.png`; remove old `scripts/build-maze-graph.mjs`. Keep `expedition-bg.png`/`expedition-sky.png` (expedition out of scope).

## 2. Content + family layout (keep NT data internal)

- [x] 2.1 In `packages/content-neurons-tw/src/families.ts`: **KEEP** `FAMILY_NT_BRANCH` + `NtBranchId` (internal data for character-card + variant-decor). **Relocate** `NT_BRANCHES` / `FAMILIES_BY_BRANCH` / `branchOfFamily` here (moving them out of the rewritten `lib/maze/graph.ts`); add `FAMILY_IDS` (the 11 family ids) as the single source for grid anchors + per-family pools. Export from `content-neurons-tw/src/index.ts`.
- [x] 2.2 Faucet + pacing constants in `content-neurons-tw` (single source of truth): `CORRECT_ANSWER_ENERGY=3`, `READING_MINUTE_ENERGY=3` (recalibrated), `PACING_BASE=14`, `PACING_K=0.10`, `SPEED_BUFF_PER_VARIANT=0.04`, `SPEED_BUFF_CAP=1.0`, `SYNAPSE_BONUS_CAP` (≈ +30%) + per-synapse bonus %. Mark dogfood-tunable.
- [x] 2.3 Re-point importers of the relocated helpers: `services/first-pull.ts` + `first-pull-keys.ts` import `NT_BRANCHES`/`FAMILIES_BY_BRANCH` from `@study-rpg/content-neurons-tw` instead of `../maze/graph` (mechanical — **first-pull behavior unchanged**). Confirm character-card (`CARD_BRANCH_ORDER` is local) + variant-decor (imports `FAMILY_NT_BRANCH` from content) still compile untouched.

## 3. Maze graph + economy rewrite (11 per-family pools, border frontier)

- [x] 3.1 Rewrite `apps/neurons-tw/src/lib/maze/graph.ts`: load `grid-graph.json`; expose per-family entry/corridor/node accessors, `frontierNode(familyId, settleIndex)` (border-distance order), synapse-intersection lookup, and `litNodesWithStarter(familyId, settles, starterFamilies)` reading the legacy `maze:<branch>:starterFamily` VALUES (familyIds) to light starter reps. Remove `NT_BRANCHES`/`FAMILIES_BY_BRANCH`/`normalizeGraph`/`BRANCH_FIT`/4-branch co-registration.
- [x] 3.2 Rewrite `apps/neurons-tw/src/lib/maze/economy.ts` to per-family: `maze:<familyId>:{earned,settles}` keys; `accrueMazeEnergy(familyId, base)` accrues directly; reading splits across families-with-collected-variants (fallback all 11); `nodeCost` uses `PACING_BASE=14`; keep `affordableSettles`/`cumulativeCost`/`walkerFraction`/`reconcileSettles(familyId)` per-family. Update DEV `__maze` handle to per-family.
- [x] 3.3 Add synapse cross-family bonus: `synapseBonus(familyId)` reads `connectome-collection` synapse strength (read-only), sums strong-synapse bonuses, clamps to `SYNAPSE_BONUS_CAP`; fold into `accrueMazeEnergy` alongside streak × mastery × `energyAccel`. Returns `1.0` with no strong synapse. **No LTD/decay penalty.**
- [x] 3.4 Migrate the faucet (`services/connectome.ts` ~L217-225): correct-answer accrual → `accrueMazeEnergy(subjectFamilyId, …)` directly (drop the `branchOfFamily` dynamic import + per-branch routing). Reading-minute → per-family split helper (remove `accrueReadingEnergyAllBranches`).
- [x] 3.5 Update `apps/neurons-tw/src/lib/maze/useMaze.ts` for per-family state; keep the SINGLE-mount discipline (OverviewPage owns the one `useMaze`).

## 4. Schema: Dexie v17 + R2 17 + sync keys + fixture

- [x] 4.1 `apps/neurons-tw/src/lib/db.ts`: add `.version(17)` with `.upgrade()` clearing `maze:{da,5ht,gaba,glu}:{earned,settles}` (economy reset) but PRESERVING `maze:{da,5ht,gaba,glu}:starterFamily` + `neuronVariants`. No object-store / pk change.
- [x] 4.2 `apps/neurons-tw/src/lib/sync/tables.ts` `SYNCED_META_KEYS`: remove the 8 branch earned/settles keys; add `maze:<familyId>:{earned,settles}` × 11 (derive from `FAMILY_IDS`); **keep** the 4 `maze:<branch>:starterFamily` keys (first-pull). Keep MAX-merge counter post-pass coverage for the new keys.
- [x] 4.3 `apps/neurons-tw/src/lib/sync/r2/bundles.ts`: bump `SCHEMA_VERSION` 16 → 17; update meta-key allowlist (add 11-family earned/settles; keep starterFamily; the 4-branch earned/settles become unused-but-tolerated); append `SCHEMA_VERSION history` comment. Confirm reader-tolerance.
- [x] 4.4 Add fixture `apps/neurons-tw/src/__tests__/db-v16-to-v17-migration.test.ts` (canonical pattern from `db-v15-to-v16`): seed a v16 save with `maze:da:earned`/`settles` + `maze:da:starterFamily` + collected variants → open at v17 → assert branch earned/settles cleared, starterFamily + `neuronVariants` preserved. Confirm `pnpm lint:dexie-fixtures` passes.

## 5. Render: zoomable canvas tilemap + corridor-frontier fog + contextual camera + walker

> NOTE (owner pivot 2026-06-05, design D12): each cell is a GBA-style pixel tile drawn on a `<canvas>` (procedural first cut behind a swappable `drawCell` seam; authored/AI atlas deferred to `polish-neurons-maze-tileset`). rot.js is build-time only — runtime fog is corridor-frontier-based (the committed JSON omits the wall map, so a runtime `ROT.FOV` pass has no walls).

- [x] 5.1 Replace `MazeBrainMap.tsx` with `MazeGrid.tsx`: a zoomable `<canvas>` tilemap drawing neural-tissue / axon-fiber / over-under bridge / node / synapse / center pixel tiles from `grid-graph.json`; pan/zoom (wheel + drag).
- [x] 5.2 Contextual camera (design language): quiz-answer (via `maze-focus` bus) → zoom in to the answered family's walker; reading → whole-map + ambient. Reduced-motion → instant camera cut.
- [x] 5.3 Fog-of-war from the explored corridor frontier (each family's lit route prefix); unexplored corridor faint, nodes fogged until lit. (Corridor-frontier reveal — NOT a runtime `ROT.FOV` wall-occlusion pass; committed JSON omits walls.)
- [x] 5.4 Per-family walker: rarest collected variant (tie-break most-recent) else generic growth-cone fallback; smooth arc-length tween along the corridor centerline from border inward (= AP; NOT saltatory). Reduced-motion respected.
- [x] 5.5 Synapse overlay: draw each formed synapse at its intersection cell with weight = state (dormant/weak/strong); read-only re: state; toggleable. Pure-count chips unchanged (「🧠 已連線 X 個腦區」 + 「🧬 X 隻」).

## 6. Homepage wiring + colors

- [x] 6.1 Wire the grid renderer as the `/` centerpiece in `App.tsx` / OverviewPage (replace the brain-map centerpiece); `/maze-beta` still redirects to `/`. Keep CTA toolbar / family grid / DMN ring / onboarding composition.
- [x] 6.2 `packages/theme-pixel-neurons/src/index.ts`: replace `--nt-da/5ht/gaba/glu` tints with a neutral family palette (color + line-style + node-shape redundancy); no NT claim. Update consumers of the old `--nt-*` vars (character-card / variant-decor keep their own internal coloring).

## 7. Tests

- [x] 7.1 Update/replace `apps/neurons-tw/src/__tests__/maze-economy.test.ts`: per-family accrual, recalibrated `cost(N)`, reading split across active families, synapse bonus cap, runaway-stack boundedness.
- [x] 7.2 Update/replace `maze-graph.test.ts`: grid-graph load, 1-node-per-slot per family, border-entry-distance frontier order, synapse-intersection tagging, border→center routing, starter-lit via legacy keys.
- [x] 7.3 Update `maze-bundle-cross-version.test.ts`: v16↔v17 tolerance (v16 drops 11-family keys; v17 reads v16 → fresh per-family maze, starterFamily + collection preserved).
- [x] 7.4 New synapse-bonus unit test: strong synapse → capped cross-family bonus; no/decayed strong synapse → 1.0 (no LTD penalty); many strong synapses → ≤ cap.
- [x] 7.5 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` + `pnpm lint:dexie-fixtures` all green.

## 8. Verify (per /verify + SPA three-piece)

- [x] 8.1 `pnpm --filter @study-rpg/neurons-tw build` (TS strict) green; check `rot-js` bundle delta acceptable.
- [x] 8.2 Chrome MCP smoke on localhost: square grid renders at `/`; pan/zoom works; quiz-answer zooms to the answered family's walker + advances; reading shows whole-map ambient; family pool accrues → settle → pull reveal; fog clears inward; synapse overlay toggles; console clean.
- [x] 8.3 SPA three-piece: in-app nav to `/` + direct URL `/` + F5 on `/collection` — no 404; `/maze-beta` redirects to `/`.
- [x] 8.4 v16→v17 reset sanity: simulated v16 save upgrades with branch earned/settles cleared, starterFamily + collection intact (4.4 fixture; spot-check via DEV `__maze` + `__db`); first-pull starter nodes still light.
