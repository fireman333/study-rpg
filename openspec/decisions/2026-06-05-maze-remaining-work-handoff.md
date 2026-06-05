# Handoff — neurons maze remaining work → next `/spec resume`

> Written at a clean stopping point (the flat-grid redesign is shipped to `track-neurons`; context was full → handoff + `/clear`). `/spec resume` auto-reads this. Goal of the next session(s): **finish all remaining maze-related work** (3 items below).

## TL;DR

- **`redesign-neurons-maze-rotjs-grid` is DONE** — archived + committed (`66ad96e`) + **pushed to `origin/track-neurons`**. NOT merged to `main` → **NOT deployed** (prod `med-study-rpg.com/neurons/` still shows the OLD 4-branch maze).
- The maze now = ONE 99×99 square **weave grid**, 11 families wind border→center, **11 per-family energy pools**, **synapse LTP bonus**, and a **canvas GBA-pixel tilemap** renderer (procedural first-cut tiles).
- **3 remaining maze items** (none started): (1) visual pass + **merge→main = deploy** the redesign; (2) **`polish-neurons-maze-tileset`** (crafted Aseprite + AI atlas); (3) **`name-neurons-maze-circuit-locations`** (circuit naming + 稱號).
- Worktree `~/coding-scratch/study-rpg-neurons`, branch `track-neurons`. Dev server may still be running on `http://localhost:5175/`.

## What shipped (commit `66ad96e`)

Flat-grid maze redesign (full detail in `openspec/changes/archive/2026-06-05-redesign-neurons-maze-rotjs-grid/`):
- ONE 99×99 square weave grid replaces the 4-branch image-pipeline maze; 11 families enter the border ring, wind (non-shortest) to center; route crossings = synapses (all 110 nodes at crossings).
- 11 per-family energy pools `maze:<familyId>:{earned,settles}` replace the 4 per-branch pools; reading splits across active families; recalibrated `PACING_BASE` 24→14, `READING` 2→3.
- Synapse load-bearing: a STRONG synapse grants a capped cross-family LTP energy bonus (+6%/synapse, ≤+30%, **no LTD**). Faucet accrues directly to the answered family.
- Canvas **GBA-pixel tilemap** renderer (`MazeGrid.tsx`): pan/zoom + activity-contextual camera (answer→zoom to that family's walker via `maze-focus` bus / reading→whole-map) + corridor-frontier fog + per-family walker (`VariantSprite`/growth-cone) + synapse bouton overlay.
- Dexie **v17** (economy reset of the 8 branch keys; `starterFamily` + collection PRESERVED) + R2 bundle `SCHEMA_VERSION` **16→17** (additive + reader-tolerant) + `db-v16-to-v17` fixture.
- first-pull UNCHANGED (NT helpers relocated to content `families.ts`); theme `--nt-*` tints removed; leaderboard `total_settles` + counters MAX-merge + bug-report re-pointed to per-family keys.
- **Verify (all green):** 356/356 vitest, `tsc`, dexie-fixture lint, prod build, `openspec validate --strict`. Chrome MCP smoke: maze renders, settle→pull→reveal fired, `/maze-beta`→`/` redirect, `/collection` F5 no-404, console clean. (Canvas paint pauses under the backgrounded-tab rAF throttle — engine verified independently.)

## Remaining item 1 — visual pass + merge `track-neurons` → `main` (= DEPLOY)

- **Gated on owner.** Merge=deploy is the irreversible on-line step (CF Pages `deploy-cf-pages.yml` fires on `main` push). Owner wanted a visual pass first (the current tiles are the **procedural first cut**, not the crafted atlas — item 2).
- Visual pass: `pnpm --filter @study-rpg/neurons-tw dev` → `http://localhost:5175/`. (My smoke left 藥理學 at 3 settles in the dev IndexedDB — run `__maze.reset()` in console to clear.)
- Merge SOP (per `openspec/project.md` Sync protocol): `cd ~/coding-scratch/study-rpg && git merge track-neurons` → push `main` → watch `gh run list --branch main` (Deploy Cloudflare Pages) → **prod SPA three-piece** at `med-study-rpg.com/neurons/` (in-app nav `/` + direct `/` + F5 `/collection`; `/maze-beta`→`/`).
- **Multi-session caution:** `track-neurons` may have parallel in-flight work (session-bus history mentioned a `track-neurons-p4`). Before merging, `git fetch` + check `git log origin/track-neurons..origin/main` and `/inbox`. Explicit per-file staging discipline (shared `.git` across study-rpg worktrees).

## Remaining item 2 — `polish-neurons-maze-tileset` (the crafted GBA art)

Replace the procedural canvas tiles with a crafted **16×16 pixel-art atlas** (owner's GBA-寶可夢 art direction). **Owner-locked source plan (hybrid — evaluated by the seamless-tiling constraint, design D12):**
- **Aseprite-authored SEAMLESS structural tiles** (MUST tile edge-to-edge): neural-tissue bg, axon corridor (直/彎/T/十字), over/under weave bridge, fog. Aseprite MCP is available (`mcp__plugin_pixel-plugin_aseprite__*`).
- **Gemini/codex-generated standalone HERO glyphs** (no edge continuity → AI art is safe + nicer): 節點神經元, synapse bouton, 中心 soma core, 邊界入口 portal, walker growth-cone. Gemini MCP `mcp__gemini__gemini_generate_image` (model `BASIC_FLASH`); codex CLI per `~/.claude/imports/codex_image_gen.md` (`-m gpt-5.5 --sandbox workspace-write --skip-git-repo-check < /dev/null`). AI tiles rarely tile seamlessly → only for hero glyphs.
- **Open-source CC0**: palette inspiration only (brain-themed seamless sets don't exist off-the-shelf).

**Renderer swap seam** (already built for this): `apps/neurons-tw/src/components/maze/MazeGrid.tsx` — the procedural tile fns `drawFiberCell` / `drawNodeGlyph` / `drawBouton` / `drawCore`. Swap them to blit from an atlas (`ctx.drawImage(atlas, sx,sy,16,16, dx,dy, tile,tile)`; `ctx.imageSmoothingEnabled=false`). Suggested atlas path `apps/neurons-tw/src/assets/maze/tiles/maze-atlas.png` + a tile-index map. Corridor autotiling: derive direction from consecutive `path` cells; `SYNAPSE_UNDER_BY_CELL` (in MazeGrid.tsx) already gives the under-family gap for the weave look. **No schema/sync change** (pure presentational + asset) → no Dexie/R2 bump, no fixture.

## Remaining item 3 — `name-neurons-maze-circuit-locations` (circuit naming + 稱號)

Give each crossing-synapse a real neuroscience circuit/pathway/nucleus name → surface as Pikmin-Bloom provenance 「在 XXX 尋獲的神經元」 in the variant title/稱號 at mint.
- **One batched OE query** (owner OK'd batching): `/oe` for ~60–135 real neuroanatomical loop/tract/nucleus names + one-line function each (OE-grounded — owner is a med student; neuro facts must be peer-defensible per `project.md` neuroscience-verification rule).
- Assign names into `grid-graph.json synapses[].location` (build-time — extend `scripts/build-grid-maze.mjs`, re-run `build:grid-maze`; same seed → same layout).
- Surface at variant mint (touches the title/caption system — `neuron-variant-gacha` / `neurons-variant-collection-view` / character-card). Likely a separate change beyond the maze. (Detail also in the archived change's design.md "Deferred follow-up".)

## Key technical context (for a cold next session)

- **`grid-graph.json`** (committed, runtime-consumed, ~`apps/neurons-tw/src/assets/maze/`): `{ gridW:99, gridH:99, center:[49,49], seed:20260605, weave:[{cell:[x,y],over:'H'|'V'}]×1300, families:{<familyId>:{ entryCell:[x,y], path:[[x,y]…~704], nodeCells:[{slotIndex,cell,t,synapse}]×10 }}, synapses:[{ cell:[x,y], families:[A,B], over, under }]×135 }`. Omits the wall map by design (runtime fog = corridor-frontier, not ROT.FOV).
- **Generator**: `apps/neurons-tw/scripts/build-grid-maze.mjs` (`pnpm --filter @study-rpg/neurons-tw build:grid-maze`). Params `GRID=99 BRAID=0.7 WEAVE=0.7 WIND=10 SEED=20260605`. rot-js build-time only (NOT in runtime bundle).
- **Runtime maze module** (`apps/neurons-tw/src/lib/maze/`): `graph.ts` (loads JSON, per-family accessors, `frontierNode`/`litNodes`/`representativeNode`/`litNodesWithStarter`/`walkerCell`/`synapseCell`), `economy.ts` (per-family pools, `accrueMazeEnergy`/`synapseBonus`/`reconcileSettles`/`accrueReadingEnergyActiveFamilies`), `useMaze.ts` (single-mount per-family view), `maze-focus.ts` (contextual-camera bus). Renderer `components/maze/MazeGrid.tsx`.
- **Schema**: Dexie v17, R2 `SCHEMA_VERSION` 17. Per-family keys `maze:<familyId>:{earned,settles}`; single source = `PER_FAMILY_MAZE_KEYS` in `lib/sync/tables.ts` (also consumed by `backfill/counters.ts`). first-pull starter keys `maze:<branch>:starterFamily` ×4 retained.
- **Content** (`@study-rpg/content-neurons-tw`): `FAMILY_IDS`, `NT_BRANCHES`/`FAMILIES_BY_BRANCH`/`branchOfFamily` (relocated from app), `maze-constants.ts` (`CORRECT_ANSWER_ENERGY=3`, `READING_MINUTE_ENERGY=3`, `PACING_BASE=14`, `PACING_K=0.10`, `SPEED_BUFF_*`, `SYNAPSE_BONUS_PER=0.06`, `SYNAPSE_BONUS_CAP=0.30`). `FAMILY_NT_BRANCH` kept as internal data (character-card / variant-decor only).
- **Quick gates**: `pnpm --filter @study-rpg/neurons-tw test` · `pnpm -r typecheck` · `pnpm lint:dexie-fixtures` · `pnpm --filter @study-rpg/neurons-tw build`.

## Owner-locked decisions (DO NOT re-litigate)

- Keep the committed weave routes; render each cell as a GBA-style pixel tile (art-only, not a route change).
- Tileset source = hybrid (Aseprite seamless structural + AI hero glyphs); open-source = inspiration only.
- Circuit naming = a SEPARATE change (item 3), not folded into the redesign.
- Merge→main (= deploy) is owner-gated; current tiles are a deliberate procedural first cut.

## Git / safety

- `66ad96e` on `track-neurons`, pushed to origin. 2 untracked leftovers (intentionally NOT committed): `apps/neurons-tw/src/assets/maze/grid-preview.png` (debug, regenerates) + `openspec/decisions/2026-06-05_015106-precompact-snapshot.md` (stray auto-checkpoint).
- Shared `.git` across study-rpg worktrees → explicit per-file `git add`, `git diff --cached --name-status` before any commit; never `git add -A`.
