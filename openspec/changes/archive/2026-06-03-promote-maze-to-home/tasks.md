> Guided apply. ⏸ = owner checkpoint (stop, report, wait). Shared neurons worktree (corpus change running in another session) → explicit per-file `git add`; `git diff --cached --name-status` before any commit; watch `git reflog`; never `git add -A`. Commit only at guided checkpoints when the tree is in a known state.

## 0. Phase 0 — Audit + schema-shape confirmation + OE framing ⏸

- [x] 0.1 Audit all consumers of the global energy currency — **9 files**: `currency.ts` (module), faucets `connectome.ts` (`awardEnergyInTx`) + `reading-timer.ts` (`awardEnergy`, already also calls per-branch `accrueReadingSignalAllBranches`), spend `variant-gacha.ts` (`spendEnergyInTx(PULL_COST)`), sync `backfill/counters.ts` + `r2/bundles.ts` + `tables.ts`, UI `CollectionPage.tsx` (pull button + `balance` HUD), `db.ts` (v10/11/12 upgrade seeds — meta keys, leave). **Manual pull = ONLY `CollectionPage.tsx`.** Achievements + leaderboard do NOT read energy balance (safe to retire). DMN "抽卡" is a separate system (untouched). Repoint list: faucets → per-branch earned; drop global `awardEnergy`/`spendEnergyInTx(PULL_COST)`; remove CollectionPage pull button + HUD.
- [x] 0.2 Zero Dexie `.version()` bump **confirmed** — energy is `meta` kv (not a table); current chain at v13; `synapses` table retained across all versions; per-branch `maze:<branch>:earned`/`:settles` ride `meta`; `mintVariantSlot` removal = function only; manual-pull removal = UI only. No new store/index → no fixture-lint trigger.
- [x] 0.3 `/oe` **confirmed** synapse-as-maze-overlay framing: functional connectivity overlaid on structural tract map = standard connectomics; functional edges exist without direct tracts (polysynaptic/common-input/transitivity) → synapse edges between family centroids need not follow maze tracts. Anchors: Fotiadis 2024 Nat Rev Neurosci `10.1038/s41583-024-00846-6`; Straathof 2018 JCBFM `10.1177/0271678x18809547`; Messé 2020 HBM `10.1002/hbm.24866`. Recorded in design.md D2.
- [x] 0.4 ⏸ Report Phase 0 findings to owner before code changes. **(reporting now — awaiting go before Phase 1 code)**

## 1. Phase 1 — Per-branch energy economy (consume-at-node)

- [x] 1.1 Added the 8 `maze:<branch>:earned` / `:settles` keys to `SYNCED_META_KEYS` (tables.ts) + `MAX_MERGE_KEYS` (counters.ts).
- [x] 1.2 economy.ts rewritten: per-branch `earned` accrual; frontier = `affordableSettles(earned)`; `signal` retired.
- [x] 1.3 Faucets repointed: `connectome.recordCorrectAnswer` accrues per-branch energy (×streak×mastery); `reading-timer` splits across 4 branches; global `awardEnergy*` calls removed.
- [x] 1.4 Global `neuralEnergyEarned/Spent` currency + `useEnergyBalance` retired (`currency.ts` deleted; meta keys kept present-but-unused in sync allowlists).
- [x] 1.5 Tests: `maze-economy.test.ts` rewritten (per-branch accrual + pacing + reconcile); `currency.test.ts` deleted; `mastery-energy-faucets.test.ts` updated to the sole per-branch faucet.

## 2. Phase 2 — Pacing curve

- [x] 2.1 `nodeCost(N)=round(24×(1+0.10·N))` + `cumulativeCost` + `affordableSettles` in economy.ts (front-loaded, uncapped index).
- [x] 2.2 `reconcileSettles` + `walkerFraction` use the cumulative-index ramp; `SPEED_BUFF_CAP` retained.
- [x] 2.3 Tests: pacing curve (cheapest first node, strictly increasing incl. 二週目, affordableSettles) in `maze-economy.test.ts`.

## 3. Phase 3 — Settle = only pull path (consume energy + pull node's family; remove manual pull)

- [x] 3.1 `reconcileSettles` triggers `pullVariant(targetFamily)` per settle (frontier node's family pre-completion; `leastCollectedFamily` in 二週目); lit caps at node count, settles continue; `mintVariantSlot` call removed.
- [x] 3.2 `mintVariantSlot` deleted from variant-gacha.ts; `pullVariant` no longer spends `PULL_COST` (free at this layer; balance preflight + `spendEnergyInTx` removed; `currency` import dropped).
- [x] 3.3 `CollectionPage.tsx`: pull button + balance HUD + 每抽 hint removed; dex grid + tier-promote/fusion intact; subtitle points to maze exploration.
- [x] 3.4 Tests: `gacha-pull.test.ts` updated (free pull, no balance gate, dupe + within-tier + copies still asserted); reconcile pull coverage in `maze-economy.test.ts`.

## 4. Phase 4 — Maze becomes homepage `/`

- [x] 4.1 `App.tsx`: route `/` → maze-home; `/maze-beta` → `<Navigate to="/" replace />`. Nav: home label → 腦圖, redundant 迷宮 item removed. `MazeBetaPage.tsx` deleted (render moved to `MazeBrainMap`).
- [x] 4.2 Merged maze brain-map render into the homepage via new presentational `components/maze/MazeBrainMap.tsx` (takes `view`; OverviewPage owns the single `useMaze(pack)` — calling it twice would double-fire reconcileSettles → double pulls). Companion surfaces re-homed: CTA toolbar, `FamilyPicker` grid, `DmnDrawProgressRing`, onboarding, StudySquadPanel (party + editor).
- [x] 4.3 ⚔️ 出征 added as the 3rd CTA-toolbar button (disabled at 0 wrong; opens the cross-subject `lib/services/expedition.ts` drill). `StudySquadPanel`'s duplicate 出征 action row removed (toolbar owns it; study-squad spec only requires the homepage "surface a 出征 action" — satisfied).
- [x] 4.4 `ConnectomeTreeSvg` no longer mounted on `/`; `SynapseFormationToast` (App.tsx `ConnectomeToastHost`) + the connectome service mechanic intact. Daily-reset-on-open re-homed to `runDailyResetIfNeeded()` in OverviewPage mount (was owned by the tree's mount).
- [x] 4.5 Chip semantics: 🧠 已連線 X 個腦區 (reached nodes) in the maze header; 🧬 X 隻 collected (no denominator) in the status strip + per-family `VariantCollectionChip`. Onboarding copy rewritten: step 3 = 走腦圖收集 (maze exploration is the only way to collect); step 4 = synapse 畫在腦圖功能連結覆蓋層.

## 5. Phase 5 — Synapse overlay on the maze brain-map

- [x] 5.1 `FAMILY_CENTROIDS` computed in `MazeBrainMap` from `MAZE_GRAPHS` node `(x,y)` per `familyId` (static module const; mean of each family's nodes).
- [x] 5.2 Formed synapses render as overlay `<line>`s between family centroids; edge weight per state (dormant op0.16/w0.35 · weak op0.45/w0.7 · strong op0.85/w1.15), colour `#a9e8ff` (functional links, distinct from coloured structural tracts). Live via `liveQuery(db.synapses)`; `stroke-opacity`/`stroke-width` transition gated by `useRespectsReducedMotion`. Smoke-verified: seed strong→edge op0.85/w1.15; state change →weak→op0.45/w0.7; delete→0 edges.
- [x] 5.3 Single overlay toggle chip (🔗 顯示/隱藏連結, default on) consistent with the branch-filter chip model; render-only (never mutates synapse state). Smoke-verified toggle off hides the group, on restores it.
- [x] 5.4 Removed 10 orphan tree-only components (`ConnectomeTreeSvg` + `FamilyNode` / `SynapseEdge` / `force-sim` / `graph-builder` / `BranchRoot` / `YearNode` / `EdgePulse` / `colors` / `layout`); `SynapseDemoSvg` KEPT (still used by dev-only `MotionDemoPage`). Typecheck clean after deletion (no dangling imports).

## 6. Phase 6 — Sync bundle bump + persistence

- [x] 6.1 R2 bundle `SCHEMA_VERSION` 11→12 (additive, reader-tolerant; v12 history note added). Existing dmn/squad bundle-version tests updated to 12.
- [x] 6.2 Tests: dedicated cross-version round-trip `maze-bundle-cross-version.test.ts` (4 tests) — v12 earned/settles snapshot+restore; v12 reads v11 (no maze keys) → preserve-on-omission; all 8 keys in the synced snapshot allowlist.
- [x] 6.3 Confirmed `neuronVariants` PK + `neuronInstances` union/`consumedAt` + tier-promote/fusion unchanged (257 tests pass incl. variant-copies-merge, neuron-instances-merge, variant-fusion).

## 7. Phase 7 — Verify, build, smoke

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` 257/257 (37 files); `pnpm -r typecheck` clean (all 9 packages Done, no `error TS`).
- [x] 7.2 `pnpm lint:dexie-fixtures` → `[lint:dexie] OK` (no `.version()` bump; per-branch energy rides `meta` kv).
- [x] 7.3 Chrome MCP smoke (localhost:5175): `/` maze centerpiece ✓; correct answer (免疫學/GABA) accrued `maze:gaba:earned` null→4.224 while `maze:da:earned` stayed null (per-branch attribution) ✓; 22 lit nodes ← settles (da1/5ht5/gaba7/glu9) ✓; `/collection` NO pull button + NO balance HUD (dex+fusion; subtitle→maze) ✓; synapse overlay edges render + state-update + toggle ✓; ⚔️出征 opens cross-subject drill (第1/3題) ✓; 🧠22 / 🧬23 chips no denominator ✓; `/maze-beta`→`/` redirect ✓; direct-URL + fresh reload render fully ✓; console clean ✓.
- [x] 7.4 ⏸ Reported verify + smoke + first pacing telemetry (correct-answer 4.224 into GABA w/ this player's 1.28 speed; baseline ≈3/correct → node0=24 ≈ half-day first pull) to owner; owner confirmed proceed to archive + commit.

## 8. Phase 8 — Archive, commit

- [x] 8.1 `/opsx:verify`: completeness — all impl tasks (0–7.3) done, 4/4 artifacts done. correctness — every MODIFIED/ADDED requirement maps to impl + tests + smoke (maze route, per-branch faucet, settle-only pull, pure-count chips, persistence, pacing ramp, lit-node-from-frontier, synapse overlay, manual-pull removed). coherence — design D1–D7 all followed. 0 CRITICAL / 0 WARNING.
- [ ] 8.2 `/opsx:archive` (sync delta specs → `openspec/specs/{neurons-brain-maze,neuron-variant-gacha,connectome-collection,neurons-homepage}/spec.md`).
- [ ] 8.3 Explicit per-file `git add` (maze/economy + currency + variant-gacha + sync + routes + components + specs/changes) → `git diff --cached --name-status` review (exclude any corpus-change files from the other session) → commit (owner-confirmed). Push per owner.
