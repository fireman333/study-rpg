## Why

The brain-maze (`/maze-beta`) shipped as a DA-only vertical slice — 1 of the 4 NT branches, 20 of the 110 variant slots. Its design (D9) was explicitly built per-branch so the remaining three regions could be added additively, but the runtime is still DA-hardcoded (`graph.ts` imports a single `da-graph.json`; `economy.ts` uses single-pool `maze:da:*` keys). Players studying 5HT / GABA / Glu subjects currently get no maze surface for those variants. This change completes the maze across all four branches so every collected variant has a node, while keeping DA's hardened code path and proven pipeline defaults as the reference all branches inherit.

## What Changes

- **Generalize the maze runtime from single-branch to multi-branch.** `graph.ts` loads a `Record<NtBranchId, MazeGraph>` from four committed graph JSONs (DA + 5HT + GABA + Glu); `economy.ts` keys signal/settle pools, collected-keys, speed buff, walker, and frontier per `NtBranchId`. Growth-signal accrual routes each event to its branch via `FAMILY_NT_BRANCH[subject]`.
- **Add 3 NT regions (90 nodes).** 5HT (寄生蟲學 + 組織學 = 20), GABA (生物化學 + 病理學 + 免疫學 = 30), Glu (解剖學 + 生理學 + 胚胎學 + 微生物學 = 40).
- **Asset pipeline (purely additive).** Generate 3 single-color tract base images, run `build-maze-graph.mjs` on each → commit `5ht-graph.json` / `gaba-graph.json` / `glu-graph.json`. **The DA image + `da-graph.json` are never regenerated** — DA node positions stay byte-stable.
- **Renderer multi-branch.** Render all four NT regions; the layout approach (overlay-all-4 on a shared brain outline vs. a per-branch picker/tab) is decided in design.md.
- **DA-as-reference inheritance contract (D10).** Shared code path + economy constants are inherited by all branches by default; only the per-branch *asset* (image + colour + that image's pipeline sanity-check) differs. Economy constants stay shared with a per-branch seam left open for telemetry.
- **Preserve all existing `neurons-brain-maze` requirements** across all four branches (open-collection fog-of-war, pure-count chip with no denominator/completion, derived lit-node state with no backfill, settle = `mintVariantSlot` with no energy/monetary path, build-time-only graph pipeline, arc-length centerline walk, colour-blind-safe per-branch encoding).
- Stays on the `/maze-beta` route (still a beta). No Dexie schema bump (per-branch `meta` keys remain local-only).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-brain-maze`: generalize region scope from DA-only to all four NT branches — the "Region scope is DA only" requirement is replaced by a multi-branch region requirement; per-branch growth-signal pools, exploration teams, walkers, and graph JSONs; plus a new DA-as-reference inheritance requirement (shared code + constants inherited; only the per-branch asset differs).

## Impact

- **Code**: `apps/neurons-tw/src/lib/maze/{graph,economy}.ts` (single-branch → multi-branch); `apps/neurons-tw/src/routes/MazeBetaPage.tsx` + maze components (multi-branch render); the growth-signal accrual call site (route by `FAMILY_NT_BRANCH`); `apps/neurons-tw/src/__tests__/{maze-graph,maze-economy}.test.ts` (extend to multi-branch).
- **Assets**: 3 new base images under `apps/neurons-tw/src/assets/maze/` + 3 new committed `*-graph.json` (via `apps/neurons-tw/scripts/build-maze-graph.mjs`). DA assets untouched.
- **Content pack**: read-only consumption of `FAMILY_NT_BRANCH` from `@study-rpg/content-neurons-tw` (already exported); no content-pack change.
- **Persistence**: 3 additional local-only `meta` keys per branch; no `SYNCED_META_KEYS` change, no Dexie `.version()` bump, no sync/R2/leaderboard change.
- **Deploy**: `track-neurons` → main → `deploy-cf-pages.yml` → `med-study-rpg.com/neurons/`. neurons is not on GH Pages.
