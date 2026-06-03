## Why

The `neuron-family-mastery` capability already tracks per-family `correct` / `total`
counters and derives a P1–P5 tier, but that tier is currently **inert as gameplay**:
it only feeds visuals, achievements, and the leaderboard. The player has no in-loop
reason to deepen mastery in a family beyond cosmetics.

The locked 2-axis design (grilled 2026-06-03) gives mastery its job: it is the
**精通軸 (mastery axis)** that accelerates the **能量軸 (energy axis)**. Practiced
families should yield energy faster — a Hebbian "fire together, wire together"
consolidation reward. This change wires that acceleration as change #2 of the
3-change plan (#1 `add-neurons-dupe-fusion` already shipped; #3 `promote-maze-to-home`
unifies the energy counters later and inherits this multiplier).

## What Changes

- Add a pure function `masteryEnergyMultiplier(tier)` — the single source of truth for
  how much a family's mastery tier accelerates its energy acquisition. First-cut,
  dogfood-tunable: `none`/P5 → ×1.0, P4 → ×1.05, P3 → ×1.10, P2 → ×1.20, P1 → ×1.30.
- Apply that one multiplier at **both** correct-answer energy faucets for the answered
  family: the neural-energy award ([`currency.ts`](apps/neurons-tw/src/lib/services/currency.ts)
  `awardEnergyInTx`) and the maze-signal accrual ([`economy.ts`](apps/neurons-tw/src/lib/maze/economy.ts)
  `accrueMazeSignal`). Both call sites live in
  [`connectome.ts`](apps/neurons-tw/src/lib/services/connectome.ts) `recordCorrectAnswer`,
  so the tier is derived once and reused, keeping the two faucets in lockstep (the
  "one energy" intent even though the counters are physically separate until #3).
- Surface the active multiplier on `MasteryChip` (e.g. `⚡+10%`) so the reward is
  visible. Tier `none`/P5 (×1.0) shows no boost.
- Mastery acceleration applies to **correct-answer** energy only. Reading-minute energy
  has no family context (split evenly across branches) → it is NOT mastery-boosted.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neuron-family-mastery`: ADD requirements giving the mastery tier a gameplay effect —
  a pure `masteryEnergyMultiplier(tier)` function and its application at both
  correct-answer energy faucets, plus the chip display. No change to the existing
  tracking / tier-derivation / atomicity / chip-tracking requirements.

## Impact

- **Code (surgical, 3 sites + 1 new fn + 1 chip tweak):**
  - new pure `masteryEnergyMultiplier(tier)` (co-located with `deriveMasteryTier`)
  - `connectome.ts` `recordCorrectAnswer`: derive tier from the answered family's
    mastery state, multiply `CORRECT_ANSWER_ENERGY` at the in-tx energy award and
    multiply the post-commit `accrueMazeSignal` base
  - `MasteryChip.tsx`: render the active multiplier
  - unit tests: tier→multiplier boundaries (all 6 tiers) + both-faucet application
- **No schema / sync change:** `familyMastery` table already exists; this is a
  read-time multiplier only. No Dexie `.version()` bump, no R2 bundle
  `SCHEMA_VERSION` bump, no new sync adapter, no upgrade fixture required.
- **Deferred (each its own future change):** 軸B mastery context-art animation;
  oligodendrocyte companion; unifying the two energy counters (#3); SIGNAL_PER_NODE /
  pacing rebalance (#3).
