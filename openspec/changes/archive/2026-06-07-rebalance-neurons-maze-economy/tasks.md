# Tasks — rebalance-neurons-maze-economy

> Single source of truth for constants = `packages/content-neurons-tw`. Zero schema/sync change. Worktree `track-neurons`.

## 1. Constants (content pack)

- [x] 1.1 `packages/content-neurons-tw/src/maze-constants.ts`: `PACING_BASE` 14 → **11**; keep `PACING_K = 0.1`; add `export const RAMP_CAP_N = 20` with a doc comment (front-loaded ramp flattens past this cumulative settle index). Update the file-header comment (currently says "recalibrated 24 → 14") to reflect 11 + the cap.
- [x] 1.2 `packages/content-neurons-tw/src/variants.ts`: add `export const P1_PITY_START = 30` + `export const P1_PITY_RAMP = 0.06` next to the P0 pity constants; add an `effectiveP1Rate(pullCount)` helper mirroring `effectiveP0Rate` (`clamp(max(0, pullCount − P1_PITY_START) * P1_PITY_RAMP, 0, 1)`).
- [x] 1.3 `packages/content-neurons-tw/src/index.ts`: export the new `RAMP_CAP_N`, `P1_PITY_START`, `P1_PITY_RAMP`, `effectiveP1Rate` (mirror existing PACING / P0 exports).

## 2. Cost ramp cap (economy)

- [x] 2.1 `apps/neurons-tw/src/lib/maze/economy.ts` `nodeCost(n)`: change to `round(PACING_BASE * (1 + PACING_K * Math.min(Math.max(0, n), RAMP_CAP_N)))`; import `RAMP_CAP_N`. Update the `nodeCost` doc comment ("uncapped — ramp into 二週目" → "capped at RAMP_CAP_N").
- [x] 2.2 Confirm `cumulativeCost` / `affordableSettles` / `walkerFraction` need no change (they call `nodeCost`, so the cap propagates) — add a one-line note in the module header.

## 3. Fill-missing-first within-tier pick (gacha)

- [x] 3.1 `apps/neurons-tw/src/lib/services/variant-gacha.ts` `pullVariant`: in the first-route branch (after `rollRarityWithP0Pity`), replace the within-tier `tierDefs[Math.floor(rng()*len)]` uniform pick with **fill-missing-first**: among the rolled tier's non-`isLocation` defs, prefer one whose `(familyId, slotIndex)` is NOT already in `ownedRows`; only fall back to a uniform-random pick (dupe) when every slot in the tier is owned. Preserve `isLocation` exclusion + the `forceSlotIndex` (二回目) branch untouched.
- [x] 3.2 Keep cross-tier RNG intact (the rarity TIER is still rolled from the weight table) — verify the change touches only the slot choice within the rolled tier.

## 4. Silent P1 soft-pity (gacha)

- [x] 4.1 `packages/content-neurons-tw/src/variants.ts` `rollRarityWithP0Pity`: add a `p1Owned` param; after the P0-pity check and BEFORE the weighted roll, when `!p1Owned` apply `effectiveP1Rate(pullCount)` → return `'P1'` if it fires. Keep signature back-compat where possible (default `p1Owned = false`? — prefer explicit; update all callers).
- [x] 4.2 `apps/neurons-tw/src/lib/services/variant-gacha.ts`: derive `p1Owned` from `ownedRows` (a slot-0-style check: any owned row with `rarity === 'P1'`) and pass it to `rollRarityWithP0Pity` alongside `p0Owned`.
- [x] 4.3 **Silent**: do NOT set any `wasPityFloor`-style flag for a P1 minted under pity (only P0 keeps `wasPityFloor`); confirm no UI surfaces a P1 "保底" marker.

## 5. Spec-hygiene riders (comments / non-normative)

- [x] 5.1 C1: `apps/neurons-tw/src/lib/services/connectome.ts` — fix the stale "two counters stay in lockstep ('one energy' until #3 unifies them)" comment (line ~131) to the single-live-faucet reality (matches the `neuron-family-mastery` spec rewrite).
- [x] 5.2 C2: `apps/neurons-tw/src/lib/maze/economy.ts` `reconcileSettles` comment — reconcile any "二週目 least-collected" wording with the actual within-tier fill-missing-first / deterministic-route-2 behavior.
- [x] 5.3 C3: `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — cosmetic changelog comment per-branch → per-family (no behavior change).

## 6. Tests

- [x] 6.1 Update existing maze-economy tests for the new `nodeCost` values (base 11) + add a cap-behavior test (`nodeCost(N>RAMP_CAP_N)` is constant; `cumulativeCost` grows linearly past the cap).
- [x] 6.2 Update / add variant-gacha tests: fill-missing-first picks an unowned slot before a dupe; cross-tier RNG unchanged; dupe only when tier fully owned; `isLocation` still excluded.
- [x] 6.3 Add silent-P1-pity tests: `effectiveP1Rate` ramp (0 before start, →1 past start); `rollRarityWithP0Pity` returns P1 under pity when `!p1Owned`; NO pity-floor flag is set on a pity P1; inert once `p1Owned`.
- [x] 6.4 Re-run the `model/*.mjs` scripts and confirm the candidate-C curve still lands ~2,700 (p90 ~4,400) correct for 100%-all-220 with the final locked constants (update the model if a constant changed during apply).

## 7. Verify (gates)

- [x] 7.1 `pnpm -r typecheck` clean.
- [x] 7.2 `pnpm --filter @study-rpg/neurons-tw test` green (existing + new).
- [x] 7.3 `pnpm lint:dexie-fixtures` — no-op (no `.version()` bump introduced); confirm.
- [x] 7.4 Chrome MCP dev smoke: settle a family early (snappy first settle), confirm a within-tier reroll fills an unowned slot (no early dupe), console clean; SPA 三件套 not required for a constants change but boot must be clean.
- [x] 7.5 **Owner sign-off on the C1 SHALL rewrite wording** (approved as written 2026-06-07) (the `neuron-family-mastery` rename + body) before archive — it is a normative SHALL edit (design Open Question).
