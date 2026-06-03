## Context

neurons-tw has two parallel energy-acquisition counters fed by the same
correct-answer / reading events:

| | neural energy ([`currency.ts`](apps/neurons-tw/src/lib/services/currency.ts)) | maze signal ([`economy.ts`](apps/neurons-tw/src/lib/maze/economy.ts)) |
|---|---|---|
| Role | gacha pull currency (`earned − spent`) | per-NT-branch `/maze-beta` frontier fuel |
| Correct-answer faucet | `awardEnergyInTx(CORRECT_ANSWER_ENERGY=3)` | `accrueMazeSignal(branch, CORRECT_SIGNAL=3 × streakMult)` |
| Existing multiplier | none | `mazeSpeedMultiplier(collectedCount)` |
| Storage | integer meta (parseInt on read), synced via MAX-merge | float meta, **local-only** |

The locked 2-axis model treats these as **one logical energy** — maze is the
visualization of the energy axis, 遠征速度 = 能量獲取速度. The two counters are not
yet physically unified; that unification is change #3 `promote-maze-to-home`. This
change must therefore work on the two-counter reality while staying faithful to the
one-energy intent.

Both correct-answer faucets already execute inside
[`connectome.ts`](apps/neurons-tw/src/lib/services/connectome.ts) `recordCorrectAnswer`:
the energy award at line 146 (inside the main `rw` tx whose scope already includes
`db.familyMastery`), the maze accrual at line 218 (post-commit best-effort block).
`recordAttemptInTx` (line 123) updates the family's mastery counters and returns a
`masteryUpdate` already captured in outer scope — so the answered family's tier can be
derived once and reused at both faucets without an extra read.

## Goals / Non-Goals

**Goals:**
- Give the existing mastery tier a single, legible gameplay effect: faster energy per
  correct answer in a mastered family.
- One shared multiplier function applied identically at both faucets, so the two
  counters stay in lockstep and #3's unification inherits it with zero rework.
- Make the reward visible on `MasteryChip`.

**Non-Goals:**
- Unifying the two energy counters (#3).
- 軸B mastery context-art animation; oligodendrocyte companion (each its own change).
- Mastery-boosting reading energy (no family context).
- Rebalancing `SIGNAL_PER_NODE` / pacing curve (#3).
- Any schema / sync change.

## Decisions

### D1 — One pure multiplier function, co-located with `deriveMasteryTier`

`masteryEnergyMultiplier(tier: MasteryTier): number`, pure (no Dexie / React / side
effect), co-located with `deriveMasteryTier` in the mastery module. First-cut values
declared as named tunable constants (dogfood telemetry will calibrate):

| tier | multiplier |
|---|---|
| `none` | 1.0 |
| P5 | 1.0 |
| P4 | 1.05 |
| P3 | 1.10 |
| P2 | 1.20 |
| P1 | 1.30 |

Single source of truth: both faucets and the chip import this one function. P5 sharing
×1.0 with `none` is intentional — Novice is "assessed but not yet rewarded"; the first
acceleration step is P4.

### D2 — Derive the answered family's tier once; apply at both faucets

Inside `recordCorrectAnswer`, after `recordAttemptInTx` returns the updated mastery
counters, derive `tier = deriveMasteryTier(correct, total)` from the **post-increment**
state and `mult = masteryEnergyMultiplier(tier)`. Then:
- in-tx energy faucet: `awardEnergyInTx(applyMasteryToEnergy(CORRECT_ANSWER_ENERGY, mult))`
- post-commit maze faucet: reuse the same `tier`/`mult` (carried via the outer-scope
  `masteryUpdate`) → `accrueMazeSignal(branch, CORRECT_SIGNAL × streakMult × mult)`

Post-increment tier (rather than pre) is chosen for simplicity — the difference is at
most one attempt across a tier boundary, immaterial to balance, and avoids a second
read.

### D3 — Integer-quantization on the energy faucet is accepted and documented

`CORRECT_ANSWER_ENERGY = 3` is stored as an integer (read via `parseInt`). Rounding
`3 × mult`: ×1.0/1.05/1.10 → 3, ×1.20 → 4, ×1.30 → 4. So on the **gacha-energy** faucet
only P2/P1 cross to a higher integer; P4/P3 acceleration is absorbed by rounding. The
**maze-signal** faucet stores floats, so it honors every tier's multiplier smoothly.

This asymmetry is accepted for the lean first cut, not hidden:
- The maze faucet is the visualization of the energy axis (locked model), and it
  reflects the multiplier faithfully at all tiers — so 遠征速度 (the player-visible rate)
  is correct per-tier.
- The gacha-energy integer quantization is a temporary artifact of the not-yet-unified
  counters; #3's unification (single, higher-resolution energy) dissolves it.
- `MasteryChip` shows the multiplier (the intended rate), which the maze faucet
  realizes; this is honest about the energy *rate*, not a per-pull promise.

`applyMasteryToEnergy(base, mult)` uses `Math.round`. Telemetry may later push base
energy up or switch to additive bonuses — deferred, noted as Open Question.

### D4 — Cap discipline (stacking on the maze faucet)

On the maze faucet, mastery stacks multiplicatively with the existing collection buff:
`base × streakMult × mazeSpeedMultiplier(collected) × masteryEnergyMultiplier(tier)`.
First-cut late-game ceiling ≈ ×1.30 (mastery P1) × ×2.0 (`SPEED_BUFF_CAP`) = ×2.6 on
maze signal for a fully-collected, P1-mastered branch (before streak). This is within
the "first-cut guess, telemetry calibrates" posture; #3 owns the global pacing curve.
No new cap is introduced here.

### D5 — Chip display

`MasteryChip` derives `masteryEnergyMultiplier(tier)` and renders it when > 1.0 (e.g.
`⚡+10%` for P3). Tier `none`/P5 (×1.0) renders no boost element. Reuses the chip's
existing tier read; no new data source.

## Risks / Trade-offs

- **Energy-faucet quantization (D3):** P4/P3 give no extra gacha energy at base 3 while
  the chip shows a boost. Mitigated by the maze faucet honoring it + the chip framing
  the *rate*; flagged for telemetry-driven tuning. Alternative (fractional-energy
  accumulator) rejected as scope creep.
- **Positive-feedback late-game (D4):** mastery + collection both accelerate the maze
  faucet → compounding for veterans. Bounded by `SPEED_BUFF_CAP` today; #3 owns the
  pacing curve. Acceptable for dogfood.
- **Tier read coupling:** the maze block reuses the in-tx `masteryUpdate`; if a future
  refactor moves the maze accrual before the mastery write, the tier source must move
  with it. Guarded by the both-faucet test.

## Open Questions

- Final multiplier curve + whether to raise `CORRECT_ANSWER_ENERGY` or switch the energy
  faucet to additive bonuses to remove D3 quantization — defer to dogfood telemetry.
