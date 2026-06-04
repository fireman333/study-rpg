## Context

Phase 1 of the two-phase 「拿掉站不住腳的 NT-branch claim」 plan. The leaderboard exposes 6 axes (`composite / variants / ap / synapse / study / settles`); the `synapse` axis ranks `synapse_strong` = count of `synapses` with `state==='strong'`. The 4-branch grouping (`FAMILY_NT_BRANCH`: 11 subjects → DA/5-HT/GABA/Glu) drives the maze region assignment, the per-branch economy (`maze:<branch>:earned/settles`), and per-branch context-art decor — all **internal** — but is also surfaced to players (family grouping label + `--nt-*` accent colors), which is the indefensible part.

Grounding facts:
- Client axis source: `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` — `LeaderboardFilter` union, `LEADERBOARD_FILTERS`, snapshot fields `synapse_strong`, derived via `synapses.filter(s => s.state==='strong').length`.
- D1: `leaderboard_neurons.synapse_strong INTEGER NOT NULL DEFAULT 0` + `CHECK (synapse_strong >= 0)` + `idx_leaderboard_neurons_synapse` (migrations 0003 + 0006).
- Worker (`cloudflare/sync-worker/src/neurons-leaderboard.ts`) handles columns generically; `composite` ranking is computed cron-side — must verify whether it weights `synapse_strong`.

## Goals / Non-Goals

**Goals:**
- Remove the `synapse` leaderboard axis (client + Worker serving + cron snapshot), no replacement; leaderboard → 5 axes.
- Remove the player-facing 4-neurotransmitter-branch **grouping claim** (no UI presents 「整科＝某 NT」); neutralize the `--nt-*` accent role.
- Keep `FAMILY_NT_BRANCH` as internal-only data (maze/economy/decor unchanged).
- Stay schema-free: ZERO Dexie / R2 bump; ZERO D1 table migration.

**Non-Goals (Phase 2):**
- Rewriting the 110 NT-themed variant personas / DMN card flavor (untouched here).
- Flattening families, rot.js grid-maze redesign, synapse load-bearing.
- Recoloring the 4 accents to a new scheme (interim: values kept, only the NT meaning dropped).
- Dropping the D1 `synapse_strong` column / index (left orphaned — see Decision 1).

## Decisions

**Decision 1 — D1 `synapse_strong` left orphaned, NO D1 migration.** Stop the client from computing/sending `synapse_strong`; rely on the column's `DEFAULT 0` so the Worker upsert tolerates its absence. Stop serving the `synapse` GET endpoint + drop it from the cron KV snapshot set. The column + `idx_leaderboard_neurons_synapse` stay in place, unused. Rationale: a DROP COLUMN/INDEX migration buys nothing for Phase 1 and risks the wrangler-4.x multi-statement footgun ([[wrangler4-d1-multistatement-migration]]); orphaned columns are harmless. Phase 2 (which already touches D1) can clean it up.

**Decision 2 — `composite` recomputed without synapse if it weighted it.** Apply-time: inspect the Worker cron `composite` ranking formula. If `synapse_strong` is a term, remove it and re-derive `composite` from the remaining 4 signals. This is a player-visible ranking behavior change → captured in the `neurons-leaderboard` spec delta. If `composite` does NOT use synapse, no formula change (note the finding in the task).

**Decision 3 — NT grouping is removed from presentation, not from data.** `FAMILY_NT_BRANCH` stays. The change locates every player-facing surface that renders the 4-branch grouping (candidates: FamilyPicker, CollectionPage family-section headers, any 「DA/5-HT/GABA/Glu 分支」 label, the `--nt-*` colors used as a per-family *group* tint) and removes the grouping affordance — families render as a flat list / by their own identity, not bucketed under a neurotransmitter. The `--nt-*` color *values* may remain as per-family accents (no claim attached); their code comments lose the NT framing. Individual variant persona text stays (Phase 2).

**Decision 4 — interim, not polished.** Per the locked plan, Phase 2 redesigns all of this. Phase 1 does the minimum so the app is not self-contradictory (no dangling 「分支」 label, no synapse tab) without investing in new grouping aesthetics.

## Risks / Trade-offs

- **Orphaned D1 column/index** (Decision 1): minor clutter; deliberate, documented, Phase-2 cleanup. Trade simplicity + migration-safety over tidiness.
- **`composite` shift**: if synapse was a composite term, existing ranks move slightly on next cron. Acceptable (few prod players; the axis was weak by design).
- **Missed NT surface**: a player-facing 「分支」 reference could be overlooked. Mitigation: a repo-wide grep for `DA|5HT|5-HT|GABA|Glu|多巴胺|血清素|麩胺酸|分支|branch` across player-facing components in the verify step, excluding `variants.ts` / `dmn-cards.ts` (intentionally out of scope) and internal `FAMILY_NT_BRANCH`/maze/economy.
- **Breaking**: clients lose the `synapse` tab; orphaned `synapse_strong` D1 values ignored. Accepted (few players).
