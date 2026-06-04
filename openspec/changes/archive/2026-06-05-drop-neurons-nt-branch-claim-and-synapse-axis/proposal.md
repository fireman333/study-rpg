## Why

The neurons-tw 「四大家族」 taxonomy maps the 11 exam subjects onto four neurotransmitter branches (DA / 5-HT / GABA / Glu via `FAMILY_NT_BRANCH`). This grouping claim is scientifically indefensible — an exam subject (藥理學, 解剖學…) is not a neurotransmitter — and the owner (a medical student) expects peer players to see through 「為什麼整科＝某 NT 分支」. Separately, the leaderboard's `synapse` ranking axis is a weak competitive axis (a tiny integer that can decay) with no real gameplay stake behind it.

This change is **Phase 1 of a locked two-phase plan** (grill summary: `~/.claude/scratch/grilled-neurons-flatten-families-maze-redesign-2026-06-05.md`). It does the small, low-risk, decoupled wins now: remove the indefensible **grouping claim** from player-facing surfaces and delete the weak leaderboard axis. The larger Phase 2 (flatten to 11 families + rot.js grid-maze redesign + make synapse load-bearing + rewrite the 110 NT-themed personas) is a separate, later, design-first change and is **explicitly out of scope here**.

Scope was tightened during proposal grounding: the NT claim is welded into the 110 variant personas (e.g. 藥理學 variants are all 「VTA 多巴胺」 neurons) and DMN card flavor. Rewriting those is a large content job that belongs to Phase 2. Phase 1 therefore removes only the **grouping** (the 「整科＝某 NT」 framing + the leaderboard axis), leaving individual persona flavor untouched — which already neutralizes the peer-defensibility concern while keeping the change small and reversible.

## What Changes

- **Remove the leaderboard `synapse` ranking axis** (item 3). Drop the `'synapse'` filter + `synapse_strong` snapshot field across client + Worker; the leaderboard goes from 6 axes to 5 (`composite / variants / ap / study / settles`). Verify and, if `composite` weights in `synapse_strong`, recompute `composite` without it. **No replacement axis.**
- **Stop presenting the 4-neurotransmitter-branch grouping to players.** Any player-facing UI that groups / labels / color-codes the 11 families as DA / 5-HT / GABA / Glu (the 「整科＝某 NT」 claim) is removed or neutralized. The 4 accent colors lose their NT-grouping role (neutral relabel; recolor deferred to Phase 2 as interim cosmetics).
- **`FAMILY_NT_BRANCH` is retained as internal-only data** — it still drives the maze region assignment, the per-branch economy, and per-branch context-art decor. Only its **player-facing presentation as a neurotransmitter taxonomy** is removed.
- **OUT OF SCOPE (Phase 2):** the 110 variant personas + DMN card NT-flavor text (untouched), the maze 4-region structure + per-branch economy (untouched), any flatten / grid-maze redesign / synapse load-bearing.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-leaderboard`: the ranking-axis requirement changes — the `synapse` (strong-synapse) axis is removed; the leaderboard offers 5 axes, and `composite` (if it weighted synapse) is recomputed without the synapse component.
- `neurons-mode`: the neurotransmitter-branch requirement changes — the 4-branch (DA/5-HT/GABA/Glu) mapping is demoted from a **player-facing family identity / taxonomy** to **internal-only data** (maze/economy/decor). Player-facing surfaces SHALL NOT claim that an exam subject belongs to a neurotransmitter branch.

## Impact

- **Client (`apps/neurons-tw`)**: `src/lib/services/neurons-leaderboard.ts` (drop `synapse` from `LeaderboardFilter` / `LEADERBOARD_FILTERS` / `synapse_strong` field + derivation), `src/routes/LeaderboardPage.tsx` (drop tab), `LeaderboardOptInModal` + `HelpMenu` (drop synapse-axis copy); plus whichever player-facing components surface the NT-branch grouping (FamilyPicker / CollectionPage family sections / homepage / the `--nt-*` accent usage).
- **Theme (`packages/theme-pixel-neurons`)**: `src/index.ts` `--nt-da/5ht/gaba/glu` comments + grouping role neutralized (values may stay for the interim).
- **Content (`packages/content-neurons-tw`)**: `families.ts` `FAMILY_NT_BRANCH` kept as internal data (not deleted). 110 personas + DMN flavor **untouched**.
- **Worker (`cloudflare/sync-worker`)**: `src/neurons-leaderboard.ts` (drop `synapse_strong` from upsert validation / KV snapshot / cron columns); **D1 migration** to drop or stop-populating the `synapse_strong` column (additive-safe: a new numbered migration; column can be left in place but unused if dropping is risky — to be decided in design).
- **Hard constraints**: ZERO Dexie / R2 schema bump (no sync change). Maze graphs (`{da,5ht,gaba,glu}-graph.json`), `maze:<branch>:earned/settles`, and `economy.ts` are NOT touched. `lint:dexie-fixtures` should not trigger (no `.version()` change).
- **Breaking**: leaderboard clients lose the `synapse` tab; existing per-user `synapse_strong` D1 values become orphaned/ignored (acceptable — few prod players).
