## Why

A modeling pass over the live maze economy (`/tmp/neurons-rebalance-model.mjs` + `candidate.mjs`, copied into this change as design artifacts) shows that **100%-collecting all 220 variants currently costs ≈ 15,257 correct answers (p90 ≈ 34,749)** — roughly answering every one of the 4,600 corpus questions correctly ~2.8× over. The early/mid game is fine (first settle ≈ 4 correct, route-1 lit ≈ 42, both routes lit ≈ 92), but the completionist endgame is a wall driven by **two compounding effects**: (a) route-1's random within-tier coupon-collector (each family's lone P1 is a 1.3% roll, and the within-tier pick re-rolls already-owned slots), multiplied by (b) the **uncapped quadratic-cumulative settle ramp** (`cumCost(20)=546 → (30)=1029 → (40)=1652`). The owner wants 100% to stay a "full prep cycle" goal but land at **~2 months** of study (≈ halve the grind), with snappier early game to hook players.

## What Changes

- **Cap the settle cost ramp.** `nodeCost(n) = round(PACING_BASE × (1 + PACING_K × min(n, RAMP_CAP_N)))` — new constant `RAMP_CAP_N` flattens the cost after the intended depth so the completionist tail stops escalating. Cost stops growing past the cap instead of climbing forever.
- **Lower `PACING_BASE` 14 → 11.** Snappier onboarding (first settle ≈ 3 correct), keeping the early loop attractive.
- **Within-tier "fill-missing-first" pick.** When a pull rolls a rarity tier, prefer an **unowned** slot in that tier; fall back to a dupe only when the tier is fully owned. This kills the within-tier coupon-collector. **Cross-tier rarity RNG is unchanged** — P1 is still a 1.3% roll, so the first P1 stays a genuine surprise.
- **Add a silent P1 soft-pity.** Mirror the existing P0 soft-pity for P1 so the lone P1 slot is guaranteed to converge — but **do NOT surface it** (no `wasPityFloor`-style flag, no UI "保底" marker). The player experiences it as luck.
- **Spec-hygiene riders** (from the 2026-06-05 audit input doc): align the `neuron-family-mastery` "two faucets" SHALL to the current single-faucet reality; reconcile the "二週目 least-collected" wording with the implementation; fix a cosmetic per-branch changelog comment.
- Model-validated outcome: 100%-all-220 ≈ **2,728 correct (p90 ≈ 4,400)** ≈ ~1.7 months for the slowest baseline player (DMN-engaged players faster).
- `fusion K` (3) and `accel caps` (2.5 / 2.0) are **NOT** changed.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-brain-maze`: settle cost ramp gains an upper cap (`RAMP_CAP_N`) and a lower `PACING_BASE`; `reconcileSettles` "二週目 least-collected" wording reconciled with the within-tier fill-missing-first behavior.
- `neuron-variant-gacha`: within-tier pick changes from uniform-random to fill-missing-first (cross-tier RNG unchanged); adds a silent P1 soft-pity so the lone P1 converges without a surfaced保底 flag.
- `neuron-family-mastery`: rewrite the stale "applies at both correct-answer energy faucets … two counters stay in lockstep" SHALL to the post-`promote-maze-to-home` single-faucet reality (multiplier value ×1.0→×1.3 unchanged).

## Impact

- **Constants** (single source of truth): `packages/content-neurons-tw/src/maze-constants.ts` — `PACING_BASE` 14→11, new `RAMP_CAP_N`; `packages/content-neurons-tw/src/variants.ts` — new `P1_PITY_START` / `P1_PITY_RAMP` + `effectiveP1Rate` helper + P1 branch in `rollRarityWithP0Pity`.
- **Logic**: `apps/neurons-tw/src/lib/maze/economy.ts` `nodeCost` (cap); `apps/neurons-tw/src/lib/services/variant-gacha.ts` `pullVariant` within-tier pick + pass `p1Owned` to the roll.
- **No schema/sync change**: no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no Worker change → `pnpm lint:dexie-fixtures` is a no-op. Monotonic-positive for in-flight players (costs only drop/cap; pity only helps) → no migration, no banner.
- **Tests**: update existing maze-economy + variant-gacha tests for the new cost values and pick behavior; add unit tests for ramp cap, fill-missing-first, and the silent P1 pity.
- **Docs/comments**: `apps/neurons-tw/src/lib/maze/economy.ts` reconcile comment; `apps/neurons-tw/src/lib/sync/r2/bundles.ts` cosmetic changelog wording.
