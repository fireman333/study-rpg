# Neurons mechanics audit — findings + rebalance input (2026-06-05)

> Produced by change `audit-neurons-subject-mechanics-and-sprites`. The audit confirmed the 抽卡/加速/能量 mechanics are coherent for the 11-family (per-subject) model after the 四大家族 maze flatten, and fixed code-comment / spec-prose drift. This note carries the **out-of-scope findings** forward: a suspect-numbers list for a future rebalance change, plus three coherence observations the owner deferred.

## A. Confirmed coherent (no NT-branch indirection)

| Mechanic | Verdict | Evidence |
|---|---|---|
| **Energy** (`lib/maze/economy.ts`) | ✅ per-family | 11 pools keyed `maze:<familyId>:earned/:settles` (CJK family ids); `accrueMazeEnergy(familyId)` → family's own pool; reading splits across active families; settle → `pullVariant(familyId)`. |
| **Gacha** (`lib/services/variant-gacha.ts`, `lib/maze/useMaze.ts`) | ✅ per-family | `pullVariant(familyId)` keyed by `CATALOG_BY_FAMILY`; settle→pull loop iterates `FAMILY_IDS`; `NT_BRANCHES` is used ONLY to read first-pull's by-design 4 starter keys. |
| **Acceleration** (`lib/services/acceleration.ts`) | ✅ per-family | `energyAccel(familyId)` per-family; `family-buff` is `familyScoped` and matched on `b.familyId === familyId`; speed/energy equipment lanes carry no NT-branch. |
| **Mastery fold-in** (`connectome.ts`, `lib/mastery/mastery-tier.ts`) | ✅ per-family | `masteryEnergyMultiplier(tier)` folds into the single `accrueMazeEnergy(familyId, …)` call per answered family. |
| **Synced schema layer** (`lib/sync/tables.ts`) | ✅ already clean | `SYNCED_META_KEYS` uses `PER_FAMILY_MAZE_KEYS` (22 keys); the 8 retired four-branch `maze:{da,5ht,gaba,glu}:{earned,settles}` keys are explicitly dropped + cleared by a Dexie upgrade. No residual to flag. |
| **Intentional NT-branch survivors** | ✅ by-design, untouched | first-pull 4-branch ritual (own `neurons-first-pull` spec); `neurons-character-card` NT-branch grouping (teaching anchor); `circuit-locations` real pathway names; NT-named flavor items/cosmetics; `neuron-variant-gacha` L390 rollback-safety note. |

## B. Fixed in this change (code-logic comments + non-normative spec prose)

- `connectome.ts` / `variant-gacha.ts` / `reading-timer.ts` / `first-pull.ts` / `useMaze.ts` — stale "per-branch maze energy/fuel" + `maze:<branch>:…` comments corrected to per-family.
- `neurons-brain-maze` spec **Purpose** rewritten (four-region brain map / per-NT-branch / HSV-Zhang-Suen pipeline / 已連線X個腦區 / Designed per-branch → 11-family unified square grid). Non-normative.
- `neuron-family-mastery` spec — one scenario's "藥理學's NT branch" → "family energy pool" (spec delta; ×1.30 semantics unchanged).

## C. Deferred findings (NOT fixed — owner decision / future change)

### C1 — 🟡 P3: `neuron-family-mastery` "two faucets" language is post-consolidation stale
`connectome.ts:215` declares "**SOLE** correct-answer energy faucet now" + `connectome.ts:118` comments "the two counters stay in lockstep ('one energy' until #3 unifies them)". The global `neuralEnergyEarned/Spent` currency is **retired-but-present** for rollback safety (`tables.ts:373-378`). Yet `neuron-family-mastery` Requirement "Mastery multiplier SHALL apply at **both** correct-answer energy faucets … so the two counters stay in lockstep" still describes the pre-`promote-maze-to-home` dual-counter world. **This is an energy-consolidation drift, NOT a 4-branch issue** — left for a dedicated spec-hygiene/consolidation change (the recent `wire-mastery-energy-acceleration` authored the dual-faucet wording deliberately; rewriting a SHALL needs owner sign-off + confirming the retired currency is truly removable).

### C2 — 🟡 P4: "二週目 least-collected" claim vs within-tier-uniform impl
`economy.ts` `reconcileSettles` comment says 二週目 "keeps pulling toward the family's **least-collected** slots", and the specs echoed it — but `variant-gacha.ts` `pullVariant` does a **within-tier UNIFORM** pick (P0 apex excluded once owned), with no least-collected bias. The `neurons-brain-maze` Purpose was corrected here to "continued settles keep pulling within the family — dupes feed fusion" (accurate). The `economy.ts` comment + any spec scenario still claiming "least-collected" should be reconciled (decide: implement least-collected weighting, or drop the claim). Not a 4-branch issue.

### C3 — 🟢 P5: `lib/sync/r2/bundles.ts` v12 changelog describes maze keys as per-branch
The v12 SCHEMA_VERSION changelog (`bundles.ts:66-72`) describes the maze keys as `maze:<branch>:earned/settles` for `DA/5HT/GABA/Glu`, while the authoritative current allowlist (`tables.ts`) is per-family. Left as-is (historical changelog + schema-adjacent prose — per the owner's "flag, don't rewrite schema-layer" rule); reconcile if the bundle changelog is cleaned up later.

### C4 — first-pull 四大家族 onboarding visibility (owner decision)
`FirstPull.tsx` surfaces「四大家族各誕生一隻」/「四大家族代表神經元」 to the player, while the rest of the game presents no 四大家族 taxonomy (per `neurons-mode` "NT-branch is internal only, no player-facing grouping"). first-pull's 4-branch design is intentional (own spec), but the **player-facing 四大家族 wording** may read inconsistently. **Owner decision**: keep as deliberate onboarding framing, or neutralize the copy to per-family. Not changed in this audit.

## D. Suspect numbers list (input for a future `rebalance-neurons-*` change)

Faucet/cost constants live in `content-neurons-tw` (single source of truth). Flagged because the maze went 4 pools → 11 pools, so each pool fills ≈ 2.75× slower for the same play when the reading-split faucet dominates. **None changed here** — the rebalance change should validate against dogfood telemetry.

| Constant | Current | Why possibly imbalanced under 11 pools |
|---|---|---|
| `PACING_BASE` | 14 | First settle cost; with 11 pools each filling slower, first-settle-per-family pacing may feel too slow. |
| `PACING_K` | 0.10 | Ramp slope into 二週目; interacts with pool count. |
| `CORRECT_ANSWER_ENERGY` | 3 | Per-correct, concentrated into the answered family — probably fine; confirm vs reading. |
| `READING_MINUTE_ENERGY` | 3 | Split across active families → per-family yield shrinks as the player collects more families (worst case ÷11). |
| `ENERGY_ACCEL_CAP` | 2.5 | Runaway guard; revisit only if rebalance changes the base. |
| `SPEED_ACCEL_CAP` | 2.0 | Same. |

→ The dominant suspect is **`READING_MINUTE_ENERGY` ÷ active-family-count**: reading yield per family collapses as breadth grows, which (with `PACING_BASE=14`) may make broad-but-shallow players' frontiers crawl. A rebalance change should model reading-split yield vs pool count + collection breadth.
