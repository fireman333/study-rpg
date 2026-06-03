## 1. Runtime refactor — graph loader (single-branch → multi-branch)

- [x] 1.1 Generalize `apps/neurons-tw/src/lib/maze/graph.ts`: replace single `MAZE_GRAPH` / `MAZE_BRANCH='DA'` with `MAZE_GRAPHS: Record<NtBranchId, MazeGraph>` (4 JSON imports — `da` existing + 3 new placeholders, see §3) and a `MAZE_FAMILIES_BY_BRANCH` derived from `FAMILY_NT_BRANCH`.
- [x] 1.2 Branch-parameterize `foggedNodes(branch, collected)` / `nextTarget(branch, collected)` / `MAZE_FAMILIES`; keep `nodeKey` / `isNodeLit` / `pointAtFraction` branch-agnostic.
- [x] 1.3 Keep DA byte-stable: `da-graph.json` untouched; DA path = `branch==='DA'` with identical resolved behaviour.

## 2. Runtime refactor — economy (single-pool → per-branch)

- [x] 2.1 Per-branch `meta` keys in `economy.ts`: `maze:<branch>:signal` / `maze:<branch>:settles` (DA keys preserved); branch-parameterize `readMazeSignalState(branch)` / `accrueMazeSignal(branch, base)` / `reconcileSettles(branch, …)` / `walkerFraction`.
- [x] 2.2 Branch-parameterize `collectedKeys(branch)` (rename from `collectedDaKeys`) + `mazeSpeedMultiplier(branch, count)`; constants stay shared (D10/D13), keyed seam left open.
- [x] 2.3 Route growth-signal accrual at the call site via `FAMILY_NT_BRANCH[subject]` so each subject feeds its own branch pool; decide reading-time attribution (default even-split, per design Open Q).
- [x] 2.4 Update DEV `globalThis.__maze` debug handle to be branch-aware (state/addSignal/reset per branch).

## 3. Assets — 3 new branch images + graphs (DA untouched)

- [x] 3.1 Generate 3 single-color tract base images (5HT / GABA / Glu) on DA's canvas geometry + brain placement (co-registration), per `~/.claude/imports/image_gen_routing.md` (Gemini-first, codex fallback); seed pipeline params from DA defaults.
- [x] 3.2 Resolve the shared-outline approach (design Open Q): dedicated neutral shared brain-outline asset + outline-free tract layers (incl. DA re-cut keeping graph stable), or DA-basemap-as-outline fallback — verify via Chrome MCP overlay check.
- [x] 3.3 Run `apps/neurons-tw/scripts/build-maze-graph.mjs` on each new image → commit `5ht-graph.json` / `gaba-graph.json` / `glu-graph.json`; verify per-branch node counts (5HT 20 / GABA 30 / Glu 40) and topology-bound nodes.
- [x] 3.4 Wire the 3 new JSON imports into `graph.ts` `MAZE_GRAPHS`.

## 4. Renderer — overlay on shared outline + filter chips

- [x] 4.1 `MazeBetaPage.tsx`: composite shared brain-outline base layer + 4 z-stacked colored tract layers + per-branch node/fog/walker overlays (default all visible).
- [x] 4.2 Add branch filter-chip control (reuse `.filter-chip[aria-pressed]` pattern); toggling hides a branch's tract/nodes/fog/walker only; shared outline never hides; accrual/settles unaffected by visibility.
- [x] 4.3 Per-branch walker sprite = rarest collected variant of that branch (fallback growth-cone when empty); per-branch frontier toward nearest fogged node.
- [x] 4.4 Ensure 4 branches distinct on all three channels (color + line style + node shape), legible overlaid + in grayscale.
- [x] 4.5 Pure-count chip 「🧠 已連線 X 個腦區」 counts lit nodes across visible branches; no denominator / percentage / completion milestone.

## 5. Tests (extend, no schema fixture)

- [x] 5.1 Extend `apps/neurons-tw/src/__tests__/maze-graph.test.ts`: 4-branch load, per-branch node counts (20/20/30/40), 1-node-per-slot no cross-branch collision, DA byte-stable assertion.
- [x] 5.2 Extend `apps/neurons-tw/src/__tests__/maze-economy.test.ts`: per-branch pool isolation (accruing one branch doesn't move others), per-branch speed buff, settle routes to correct branch, DA regression-equivalence.

## 6. Verify + ship (driven by /spec run)

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + `test` green; build passes.
- [x] 6.2 Chrome MCP smoke on `/maze-beta`: all 4 regions overlay in register, filter chips toggle correctly, walkers per branch, accrual routes by subject, progress persists across reload, console clean.
- [x] 6.3 SPA route 三件套 on `/maze-beta` (in-app nav + direct URL + F5) — last round on prod after deploy.
