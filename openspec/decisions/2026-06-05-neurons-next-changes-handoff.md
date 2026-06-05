# Handoff — Next two neurons changes (maze mechanics audit + maze zoom/focus UX)

> Written 2026-06-05 at session end, **before `/clear`**, at owner request. Next session: run `/spec resume` (it surfaces this file). Both changes are maze-centric and each **starts with `/grill` if scope is open**, then `/opsx:propose`. Owner said "有需要時 grill" for both.

## Where we are (context)

- **題庫 `/bank` tab shipped to prod** this session (main `3cfa39b`, CF Pages deployed, prod-verified `med-study-rpg.com/neurons/bank`). No active OpenSpec changes; `openspec validate --all --strict` = 82/0. Worktree `track-neurons` clean + in sync with origin.
- **The maze was ALREADY redesigned** (archived `redesign-neurons-maze-rotjs-grid` `66ad96e`): 4-NT-branch brain map → **single unified square grid covering all 11 subject families** (no neurotransmitter regions), GBA pixel tileset (`polish-neurons-maze-tileset` `ef68c2f`), crossing points named by real neuroanatomy (`name-neurons-maze-circuit-locations` `24eb242`), synapse LTP bonus now load-bearing. **So "去除四大家族" is already DONE in the maze itself.**
- ⚠️ **Spec drift to fix**: `openspec/specs/neurons-brain-maze/spec.md` **Purpose paragraph is STALE** — still describes "four-region brain map / per-NT-branch neural energy / MazeBrainMap" while its **Requirements** correctly describe the new 11-family unified grid. (Good candidate to fix inside Change A.)

## Current maze model (accurate as of this handoff — supersedes older per-NT-branch notes in project memory)

| Concern | Location | Notes |
|---|---|---|
| Render | `apps/neurons-tw/src/components/maze/MazeGrid.tsx` | Unified square grid, GBA tilemap, per-family axon tinting |
| Hook | `apps/neurons-tw/src/lib/maze/useMaze.ts` | **`OverviewPage` (`/`) owns the SINGLE `useMaze`** — double-mount = double pulls (known gotcha) |
| Economy | `apps/neurons-tw/src/lib/maze/economy.ts` | **Per-FAMILY (11) neural-energy pools.** Correct answer in subject S → family S's pool; reading splits across collected families. Settle `cost(N)=round(PACING_BASE×(1+PACING_K·N))` (PACING_BASE=14, PACING_K=0.10, CORRECT_ENERGY=3, READING_ENERGY=3 — dogfood-tunable). Energy is BOTH fuel AND pull cost; settle = 1 random `pullVariant` for the node's family (二週目 least-collected) |
| Graph | `apps/neurons-tw/src/assets/maze/grid-graph.json` | Committed; built by `scripts/build-grid-maze.mjs`. **1 node = 1 variant slot**; each family's node count = its variant-slot count |
| **Camera/focus** | `apps/neurons-tw/src/lib/maze/maze-focus.ts` | **ALREADY EXISTS** — inspect FIRST for Change B; the "button-zoom-to-subject" may build directly on it |
| Graph helpers | `apps/neurons-tw/src/lib/maze/graph.ts` | grid topology |
| Tiles | `apps/neurons-tw/src/assets/maze/tiles/tile-index.ts` | atlas built by `scripts/build-maze-atlas.mjs`; preview `scripts/render-maze-preview.mjs` |
| Acceleration | `apps/neurons-tw/src/lib/services/acceleration.ts` | `energyAccel(familyId)` **already per-family** (cap 2.5; folds family-buff +1.0 + bolus + owned energy-equipment); `speedAccel()` global (cap 2.0). Equipment 2 lanes (speed/myelin + energy/metabolic), catalog `packages/content-neurons-tw/src/equipment-catalog.ts` |
| Mastery | `packages/core` `mastery-tier.ts` | `masteryEnergyMultiplier(tier)` folds into the per-family faucet |
| Sync | `lib/sync/tables.ts`, `lib/sync/r2/bundles.ts` | maze energy rides synced `meta` keys; R2 neurons bundle `SCHEMA_VERSION` currently 16 |

---

## Change A — 確認去除四大家族後的「抽卡 / 加速 / 能量」機制 + sprite 調整

**Suggested change id**: `audit-neurons-subject-mechanics-and-sprites` (finalize name; must contain `neurons`).

**Goal (owner's words)**: 確認不同科目神經元在去除四大家族後的**抽卡 / 加速 / 能量**機制是否一致、合理，並確認 **sprite 有沒有需要調整**。有需要時 grill。

**What to audit/confirm** (per-subject = per-family, 11 families, NO 4-NT-branch grouping):
1. **能量 (energy)** — `lib/maze/economy.ts`: are the 11 per-family pools coherent? Is reading-split-across-collected-families sensible? Is `PACING_BASE=14` balanced now that there are 11 pools (each fills slower than the old 4) — or does first-pull pacing feel wrong? **Hunt for residual 4-branch (`maze:da/5ht/gaba/glu`) keys** left in code/sync/meta (`SYNCED_META_KEYS`, `lib/sync/tables.ts`, `lib/sync/r2/bundles.ts`, tests).
2. **抽卡 (gacha)** — `lib/services/variant-gacha.ts` + the settle→pull path in `useMaze`/`economy`: confirm pull is purely per-family (settle → `pullVariant` for the node's family), no NT-branch indirection; 二週目 least-collected logic operates per-family.
3. **加速 (acceleration)** — `lib/services/acceleration.ts`: `energyAccel(familyId)` composes correctly with the 11-family pools; family-buff (`dmnActiveBuffs`) family-scoping still matches a real family id; the speed/energy equipment lanes stay coherent.
4. **Sprites** — do neuron立繪 / maze tiles / family axon tints still encode anything NT-branch that should now read as per-subject? (Tileset already does per-family axon tinting → likely fine; **CONFIRM**.) Are all 11 families visually distinguishable on the grid? Any sprite needing regen?
5. **Spec hygiene** — fix the stale `neurons-brain-maze` Purpose paragraph (4-region → 11-family grid); scan `neuron-variant-gacha`, `neurons-acceleration-system`, `neuron-family-mastery`, `neurons-mode` for residual 四大家族 wording.

**Grill if open** (`/grill quick`): Is this **audit-and-fix only**, or does it include **REBALANCING** numbers (pacing/caps)? What's the acceptance bar for "confirmed"? Does sprite "調整" mean **regen art** (Gemini/codex batch) or just verify?

**Likely size**: small/zero-schema if audit + spec/doc fixes + minor coherence patches; larger if rebalancing or sprite regen.

---

## Change B — 迷宮縮放 + 聚焦 + 答題/閱讀顯示

**Suggested change id**: `add-neurons-maze-zoom-and-focus` (finalize name; must contain `neurons`/`maze`).

**Goal (owner's 4 asks)**:
1. **縮放體驗 + 手機**: the maze must zoom/pan, and **must work on mobile** (touch / pinch). Render lives in `MazeGrid.tsx`; mobile per `neurons-responsive-layout` + `chrome_mcp_rwd_probe.md` (resize_window is unreliable → use the class-override probe).
2. **按鍵放大到特定科目神經元**: a button → camera zooms/pans to a specific 科目 (family) cluster on the grid. **`lib/maze/maze-focus.ts` already exists — START THERE; it may already scaffold this.** (sozi-style pan+zoom feel is an option.)
3. **答題和閱讀時迷宮的顯示機制**: how the maze displays during **quiz (`QuizModal`)** and **reading**. **UNDER-SPECIFIED — grill this.** Current: QuizModal has a compact 出征 expedition band; the homepage reading flow has a band too. Owner may want the maze itself to highlight the active-subject family / show energy accruing live / focus to a sub-view.
4. grill as needed.

**Grill (likely `/grill` Deep — UX scope is open)**:
- Zoom: pinch + pan? discrete zoom levels or continuous? reset/recenter button? persist zoom across sessions?
- Focus button: 11 per-family buttons? a dropdown/picker? where does it live (CTA toolbar)? animation style?
- 答題/閱讀 display: does the maze **highlight the active family** while answering that subject? show live energy accrual? full grid vs focused sub-view during quiz/reading? overlay vs inline?
- Mobile: is the maze even usable on phone today? (baseline-check first.)

**Relevant files**: `components/maze/MazeGrid.tsx` (render), `lib/maze/maze-focus.ts` (camera — START HERE), `lib/maze/useMaze.ts`, `routes/OverviewPage.tsx` (homepage host of the single useMaze), `components/QuizModal.tsx` (answer-time display), the reading band component.

---

## Interplay + sequencing

- **Both changes touch the maze.** Change A = economy/gacha/accel correctness + specs/sprites; Change B = `MazeGrid.tsx` render + camera. Low file overlap (A mostly `economy.ts`/specs; B mostly `MazeGrid.tsx`/`maze-focus.ts`) but **do them SEQUENTIALLY** in this single worktree to avoid churn.
- **Suggested order: Change A first** (confirm the mechanic foundation is coherent + kill any residual 4-branch code), **then Change B** (UX on a confirmed-correct maze). Independent enough to swap if owner prefers.
- Each change: `/grill` (if scope open) → `/opsx:propose` → `/opsx:apply` → `/verify` (Chrome MCP; **for B include mobile RWD probe**) → `/opsx:archive` → commit → merge→main = deploy (explicit confirm).

## Process reminders

- Worktree `track-neurons` (`~/coding-scratch/study-rpg-neurons`); merge→main triggers CF Pages deploy (`deploy-cf-pages.yml`); confirm before merge/push.
- **Multi-agent git safety**: the main worktree (`~/coding-scratch/study-rpg`) has another session's **untracked `openspec/changes/add-cloudflare-auth-migration/`** — leave it untouched; explicit per-file `git add`; revert `meta.json` builtAt churn.
- **Neuroscience facts** (family→mechanism, any sprite/persona science) → `/oe` per project rule, not memory/LLM guess.
- Cold checkout / core change → `pnpm --filter @study-rpg/core build` before dev. Dexie schema bump → ship a v(N-1)→v(N) upgrade fixture (`pnpm lint:dexie-fixtures`).
