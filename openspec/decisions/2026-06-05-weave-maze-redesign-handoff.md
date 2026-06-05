> ⚠️ **SUPERSEDED (2026-06-05).** This change was COMPLETED, archived (`openspec/changes/archive/2026-06-05-redesign-neurons-maze-rotjs-grid/`) + committed (`66ad96e`) + pushed to `track-neurons`. The runtime work described below as "NOT started" is DONE. For the REMAINING maze work, read **`2026-06-05-maze-remaining-work-handoff.md`** instead. Kept for history only.

# Handoff — `redesign-neurons-maze-rotjs-grid` (Phase 2 maze) → next `/spec resume`

> Written at a clean stopping point (design + maze-gen locked; runtime NOT started). Context was full → handoff + clear. `/spec resume` reads this.

## TL;DR for resume

- **Change `redesign-neurons-maze-rotjs-grid` is mid-`/spec run` (apply phase).** Proposal/design/specs/tasks are written + **`openspec validate --strict` passes**. The build-time **maze generator is DONE** (committed `grid-graph.json`). **Runtime code is NOT started.** Nothing committed to git (WIP on disk on `track-neurons`).
- **Resume = continue `/opsx:apply`** from tasks.md **§2 onward** (§1 maze pipeline is done). Then verify → archive → commit → push → GATE 2 merge → deploy (the rest of `/spec run`).
- Worktree `~/coding-scratch/study-rpg-neurons`, branch `track-neurons`.

## The change in one paragraph

Phase 2 of de-NT-claim: replace the 4-NT-branch maze with **ONE 99×99 square structural-WEAVE grid** (~1300 over/under bridges), where the **11 families wind (non-shortest) from the border toward the center**, their **route crossings generate the nodes** (all 110 variant nodes sit at crossings; ~135 crossing-synapses), 11 per-family energy pools replace the 4 branch pools, synapses are **load-bearing** (capped LTP cross-family bonus, no LTD), the camera is **activity-contextual** (quiz→zoom to answered family's walker / reading→whole-map), and the maze is **brain-skinned** (neural-fiber design language, D12). Save = per-branch economy reset only (collection + first-pull preserved).

## LOCKED maze model (owner-iterated this session — DO NOT re-litigate)

- **Generator = OURS** (`apps/neurons-tw/scripts/build-grid-maze.mjs`, `pnpm --filter @study-rpg/neurons-tw build:grid-maze`). rot.js only for the EllerMaze base + runtime FOV. External weave libs all rejected on integration (meatfighter `canvas` build fails on node 25 / csmazes CoffeeScript / daleobrien Python).
- **Params (locked defaults in the script)**: `GRID=99`, `BRAID=0.7` (the sweet spot — higher KILLS 4-way junctions → 0 bridges), `WEAVE=0.7` (~1300 bridges), `WIND=10` (winding waypoints → ~135 crossings; WIND scales crossings: 8→117, 12→167), `SEED=20260605`. All env-overridable.
- **`grid-graph.json` shape** (committed, runtime consumes only): `{ gridW, gridH, center, seed, weave:[{cell:[x,y],over:'H'|'V'}]×~1300, families:{<familyId>:{ entryCell:[x,y], path:[[x,y]…~700], nodeCells:[{slotIndex,cell,t,synapse}]×10 }}, synapses:[{ cell:[x,y], families:[A,B], over, under }]×~135 }`.
- **11 families** (= 11 subjects, 10 variant slots each = 110): 藥理學 公共衛生學 寄生蟲學 組織學 生物化學 病理學 免疫學 解剖學 生理學 胚胎學 微生物學.
- Owner sign-off on the visual: ✅ (preview `apps/neurons-tw/src/assets/maze/grid-preview.png`).

## Scope decisions made this session

- **first-pull = UNTOUCHED** (its rework — border-onboarding + 二階-style answer-unlock — is a FUTURE change). The new maze reads its legacy `meta['maze:<branch>:starterFamily']` keys (values are familyIds) to light starter nodes. Only mechanical change: relocate `NT_BRANCHES`/`FAMILIES_BY_BRANCH`/`branchOfFamily` from `lib/maze/graph.ts`→ content `families.ts`; re-point `first-pull.ts`/`first-pull-keys.ts` imports. `neurons-first-pull` is NOT a modified capability.
- **`FAMILY_NT_BRANCH` STAYS** in content as internal data (character-card + variant-decor keep reading it — untouched). Maze stops using branches.
- **Modified capabilities (proposal)**: only `neurons-brain-maze` (4 ADDED — incl square-weave-grid, weave-pipeline, brain-aesthetic, synapse-bonus; ~12 MODIFIED; 4 REMOVED) + `neuron-variant-gacha` (2 MODIFIED — per-family faucet + settle pull-path). Collection NOT reset (only maze economy).
- **Schema**: Dexie **v16→v17** (upgrade clears `maze:{da,5ht,gaba,glu}:{earned,settles}`, KEEPS `:starterFamily` + collection) + fixture `db-v16-to-v17`. R2 `SCHEMA_VERSION` **16→17** (additive + reader-tolerant). Worker untouched.
- **Economy constants** (first-cut, in content): `CORRECT_ANSWER_ENERGY=3`, `READING_MINUTE_ENERGY=3`, `PACING_BASE=14`, `PACING_K=0.10`, `SPEED_BUFF_PER_VARIANT=0.04`, `SPEED_BUFF_CAP=1.0`, `SYNAPSE_BONUS_CAP≈+30%`.
- **OE-grounded neuro metaphors** (cite in code/UI): axon tract = Salzer Glia 2008 / Debanne Physiol Rev 2011; AP = Debanne 2011; saltatory (future item) = Cohen Cell 2020; synapse = Südhof Neuron 2018; LTP = Bliss & Collingridge Nature 1993 / Brown Science 1988. (LTD intentionally NOT a maze mechanic.)

## DONE this session

- proposal.md / design.md / specs (neurons-brain-maze + neuron-variant-gacha) / tasks.md — written + validated (strict).
- `scripts/build-grid-maze.mjs` (weave generator) + committed `src/assets/maze/grid-graph.json` + `grid-preview.png` (debug).
- `rot-js` added to `apps/neurons-tw/package.json` (+ pnpm-lock).
- `build:grid-maze` script wired (replaced `build:maze-graph`).

## NOT done — resume here (`/opsx:apply` §2 onward)

Per tasks.md (note: tasks.md §1 pipeline reflects an earlier border→center model — the COMMITTED generator is the weave/winding/crossings model above; trust grid-graph.json + design.md D3, not tasks.md §1 prose):
- **§2 content**: add `FAMILY_IDS`; relocate `NT_BRANCHES`/`FAMILIES_BY_BRANCH`/`branchOfFamily` to `families.ts`; faucet/pacing/synapse constants in content; re-point first-pull imports.
- **§3 graph/economy**: rewrite `lib/maze/graph.ts` (consume new grid-graph.json: per-family `path`/`nodeCells`/synapses; frontier = route-order; lit = frontier ∪ first-pull starter reps); rewrite `economy.ts` per-family + `synapseBonus(familyId)` reading connectome strength; migrate faucet in `services/connectome.ts`; update `useMaze.ts` (single mount).
- **§4 schema**: db.ts `.version(17)`; tables.ts SYNCED_META_KEYS (drop 8 branch earned/settles, add 22 per-family, KEEP 4 starterFamily); bundles.ts SCHEMA_VERSION 17; fixture `db-v16-to-v17-migration.test.ts`.
- **§5 renderer (BIG)**: replace `components/maze/MazeBrainMap.tsx` with a **zoomable canvas, brain-skinned (D12)**, weave over/under rendering, FOV fog, per-family walker, **contextual camera (D-camera)**, synapse overlay.
- **§6 wiring/colors**: homepage `/` centerpiece; theme `--nt-*` → neutral.
- **§7 tests** + **§8 verify** (typecheck, lint:dexie-fixtures, vitest, Chrome MCP smoke incl SPA three-piece + brain look).
- Then **§ rest of `/spec run`**: `/verify` → `/opsx:archive` → commit (explicit per-file) → push track-neurons → **GATE 2 merge confirm** → merge→main → deploy-cf-pages.yml → prod smoke.
- **Cleanup**: delete old `scripts/build-maze-graph.mjs` + 4 `assets/maze/{da,5ht,gaba,glu}-*.{json,png}` + `brain-*.png` (tasks.md §1.4); gitignore or don't commit `grid-preview.png`.

## Deferred FOLLOW-UP — circuit-location naming (owner-requested 2026-06-05)

Name each crossing-synapse a real neuroscience circuit/pathway/nucleus location; surface as Pikmin-Bloom provenance 「在 XXX 尋獲的神經元」 in the variant title/稱號. **Next session: one batched OE query** for ~60–135 evocative real neuroanatomical loop/tract/nucleus names + one-line function each (owner OK'd batching). Then assign into `grid-graph.json synapses[].location` + surface at variant mint. Likely a **separate change** `name-neurons-maze-circuit-locations` (touches title/provenance beyond the maze). Detail in design.md "Deferred follow-up".

## Git / safety

- WIP **uncommitted** on `track-neurons` (survives /clear on disk): `M package.json`, `M pnpm-lock.yaml`, `?? scripts/build-grid-maze.mjs`, `?? assets/maze/grid-graph.json`, `?? assets/maze/grid-preview.png`, `?? openspec/changes/redesign-neurons-maze-rotjs-grid/`.
- No git ops needed before resume. When committing later: explicit per-file `git add` (multi-agent safety), exclude `grid-preview.png` + the stray `openspec/decisions/*precompact-snapshot.md`.
