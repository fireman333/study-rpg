# Session handoff — 2026-06-05 (neurons worktree) → next `/spec resume` picks up **Phase 2**

> `/spec resume` reads the newest decisions/ files. This is the entry point for the NEXT session.
> Written at `/spec handoff`. Context was full → handoff + clear.

## TL;DR for resume

- **Phase 1 SHIPPED + DEPLOYED + prod-verified this session.** Nothing pending on it.
- **NEXT = Phase 2 = rot.js grid-maze redesign** (design-first, NOT yet proposed). Start with `/opsx:propose` (design-heavy) — the design is already locked by a grill chain + no-wheels (see cross-links).
- Worktree: `~/coding-scratch/study-rpg-neurons`, branch `track-neurons` = `origin/main` = `e8e57a8` (in sync, clean except harmless `meta.json` builtAt churn).

## What shipped this session (Phase 1)

**`drop-neurons-nt-branch-claim-and-synapse-axis`** — archived `openspec/changes/archive/2026-06-05-drop-neurons-nt-branch-claim-and-synapse-axis/`, commit `e8e57a8`, merged track-neurons→main (FF), CF Pages + Worker (auto-triggered) deployed, prod Chrome-MCP verified (`med-study-rpg.com/neurons/`).

Did two small/zero-schema things (Phase 1 of the 2-phase plan to kill the indefensible 四大家族 NT-branch claim):
1. **Removed leaderboard `synapse` axis** (item 3): 6→5 tabs, no replacement. composite doesn't weight synapse (no recompute). **D1 `synapse_strong` column left ORPHANED, no migration** (mirrors `family_complete` vestigial pattern).
2. **Removed player-facing NT-branch grouping CLAIM** across 6 surfaces: FamilyPicker FLATTENED (11 families, no NT grouping); MazeBrainMap 4-region labels `DA·多巴胺`→neutral `圓/菱/方/角徑` (**structure UNCHANGED** — owner: Phase 1 relabel only); FirstPull/HomepageOnboarding/BookmarksPage/theme `--nt-*` de-NT'd.

**KEPT/internal (Phase-2 territory):** `FAMILY_NT_BRANCH` data, 4 maze graphs, `economy.ts`, per-branch decor, **110 NT-saturated personas** (e.g. 藥理學=VTA 多巴胺), DMN flavor, character-card 「強連結 synapse」 game-stat.

## Phase 2 — rot.js grid-maze redesign (DO THIS NEXT)

The real maze redesign. **Design is locked** (grill quick → grill deep → route-eval → no-wheels). Scope:

- **Maze**: 4 per-branch regions → flatten. Owner chose **「maze 不要再用 4 區（可以考慮 11 科 11 區）」** + **「grid 方格迷宮（不必腦形），神經纖維可愛主題皮」**. Single big grid map OR 11-per-family — to be pinned in design.md.
- **Auto-navigation**: character auto-walks (rot.js `Path.Dijkstra`), advances **1 grid per correct answer OR per N reading-minutes**.
- **Economy**: per-branch 4 pools → **11 per-family pools** = NEW `maze:<family>:earned/settles` SYNCED_META_KEYS = **Dexie + R2 SCHEMA_VERSION bump + v(N-1)→v(N) fixture** (lint:dexie-fixtures will block otherwise).
- **Synapse LOAD-BEARING**: strong synapse gets real gameplay stake (e.g. grid intersection = synapse → cross-family bonus). Neuro-theming via grid: corridors = axon tracts, intersections = synapses, character = traveling action potential — **more defensible than 科別=NT**; run `/oe` before locking any neuro metaphor.
- **Rewrite the 110 NT-saturated personas** + first-pull flat version.
- **Save reset**: acceptable breaking (few prod players).

### Engine decision (no-wheels'd — WheelScore 74 🟠 "engine is a wheel, game layer is yours")

Use **rot.js** (ondras/rot.js, **BSD-3-Clause**, 2.7k⭐, zero-dep, ships TS types, npm `rot-js`) as a **HEADLESS algorithm dependency**:
- `ROT.Map.EllerMaze` (maze generation)
- `ROT.Path.Dijkstra` (auto-walk pathfinding)
- `ROT.FOV.*` (fog-of-war)
- **NOT `ROT.Display`** — write own React/CSS-grid themed render with the neural-fiber cute tiles.

Rejected: **Phaser** (over-abstracted, fights React); **PathFinding.js** (NO license — legal risk despite 8.7k⭐).

## Risks to flag at resume

1. **11-pool pacing is the #1 balance risk** — more fragmented than the current 4 pools + positive-feedback runaway (collection-count ×0.04 × streak × mastery × acceleration). Re-calibrate `cost(N)=round(24×(1+0.10·N))` + cap discipline.
2. **Schema change → MUST ship Dexie v(N-1)→v(N) fixture** (`lint:dexie-fixtures` CI + local gate). Next Dexie version after current head.
3. **Neuro metaphor rigor** — run `/oe` before locking (corridors=axons / intersections=synapses / saltatory走格). Owner is a med student; peers scrutinize.
4. **Deploy ordering** — if the Worker auto-triggers again (commit touching `cloudflare/sync-worker/**`), it deploys concurrently with CF Pages. Client-first is safest; transient window is acceptable for opt-in few-players.
5. **main worktree** (`~/coding-scratch/study-rpg`) had a parallel session's untracked `openspec/changes/add-cloudflare-auth-migration/` draft — confirm it doesn't clash before any merge.

## Cross-links (resume should read these)

- **Grill deep (flatten + maze):** `~/.claude/scratch/grilled-neurons-flatten-families-maze-redesign-2026-06-05.md`
- **Grill quick (Hebbian定位 + 四大家族):** `~/.claude/scratch/grilled-neurons-hebbian-connectome-定位-四大家族-2026-06-05.md`
- **Phase 1 archived change:** `openspec/changes/archive/2026-06-05-drop-neurons-nt-branch-claim-and-synapse-axis/`
- **Project memory:** `neurons-prod-state-2026-06-02.md` (LATEST 2026-06-05 entry has full Phase 1 + Phase 2 detail)
- **Progression roadmap (lanes):** `openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md`

## Suggested first move at resume

`/opsx:propose` a Phase-2 change (design-first, design.md heavy). Likely name: `redesign-neurons-maze-rotjs-grid` or split into (a) maze-engine + flatten, (b) synapse-load-bearing, (c) persona-rewrite. Pin in design.md: maze spatial model (single-grid vs 11), 11-pool economy + pacing recalibration, synapse stake mechanic, save-reset migration. Run `/oe` for the neuro metaphors before locking.
