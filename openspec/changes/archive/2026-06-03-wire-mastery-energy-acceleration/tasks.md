## 1. Pure multiplier function (single source of truth)

- [x] 1.1 Add `masteryEnergyMultiplier(tier)` co-located with `deriveMasteryTier`
      (`apps/neurons-tw/src/lib/mastery/mastery-tier.ts`), with first-cut values as
      named tunable constants: `none`/P5 → 1.0, P4 → 1.05, P3 → 1.10, P2 → 1.20,
      P1 → 1.30. Pure, no Dexie/React.
- [x] 1.2 Add a tiny helper `applyMasteryToEnergy(base, mult) = Math.round(base * mult)`
      (or inline) for the integer energy faucet; export both from the mastery module
      barrel (`lib/mastery/index.ts`).
- [x] 1.3 Unit test all 6 tiers return the expected multiplier + assert monotonic
      non-decreasing and never < 1.0
      (`apps/neurons-tw/src/__tests__/mastery-energy-multiplier.test.ts`).

## 2. Apply at both correct-answer faucets

- [x] 2.1 In `connectome.ts` `recordCorrectAnswer`, after `recordAttemptInTx` returns
      the updated mastery counters, derive `tier` (post-increment) and
      `mult = masteryEnergyMultiplier(tier)`; keep `tier`/`mult` in outer scope for the
      post-commit maze block.
- [x] 2.2 In-tx energy faucet: change `awardEnergyInTx(CORRECT_ANSWER_ENERGY)` →
      `awardEnergyInTx(applyMasteryToEnergy(CORRECT_ANSWER_ENERGY, mult))` (line ~146).
- [x] 2.3 Post-commit maze faucet: multiply the accrual base —
      `accrueMazeSignal(branch, CORRECT_SIGNAL * streakMultiplier(current) * mult)`
      (line ~218), reusing the same `mult`.
- [x] 2.4 Confirm `recordIncorrectAnswer` and the reading-timer energy path are
      untouched (no mastery factor).

## 3. Chip display

- [x] 3.1 In `MasteryChip.tsx`, compute `masteryEnergyMultiplier(tier)` and render a
      boost indicator (e.g. `⚡+10%`) only when > 1.0; render nothing for `none`/P5.

## 4. Tests + verification

- [x] 4.1 Test that a correct answer to a high-mastery family applies `mult` at both
      faucets: assert neural-energy delta = `round(CORRECT_ANSWER_ENERGY * mult)` and
      maze-signal accrual reflects `* mult`
      (`apps/neurons-tw/src/__tests__/mastery-energy-faucets.test.ts`).
- [x] 4.2 Test that a `none`-tier correct answer awards exactly `CORRECT_ANSWER_ENERGY`
      and an unboosted maze base.
- [x] 4.3 `pnpm --filter @study-rpg/neurons-tw test` green; `pnpm -r typecheck` clean.
- [x] 4.4 No Dexie `.version()` bump and no R2 `SCHEMA_VERSION` bump introduced
      (grep-confirm) → no upgrade fixture needed.
