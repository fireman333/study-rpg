## Context

The neurons maze is the **only** pull path: a correct answer (or reading minute) in subject S accrues neural energy into family S's own pool; when the next cumulative settle is affordable, the family settles a node and triggers one `pullVariant`. Per family there are 20 nodes — route-1 (settles 0–9, random within-tier gacha) + route-2 (settles 10–19, deterministic position-bound location variants, `add-neurons-maze-second-lap-variants`). 11 families × 20 = 220 catalog.

A modeling pass (this change's `model/` scripts) translated the live constants into **correct-answer counts** for the milestones the owner cares about (the owner chose answer-count as the "feels right" yardstick), under a realistic studious-solo grind (90% accuracy, streak ×1.3, no DMN acceleration — the slowest baseline; DMN-engaged players are faster). Findings:

| Milestone | CURRENT (correct answers) |
|---|---|
| First settle (per family) | 4 |
| Route-1 lit (10 nodes) | 42 |
| Both routes lit (20 nodes) | 92 |
| **100% one family** | ~1,387 |
| **100% all 220** | **~15,257 (p90 34,749)** |

The early/mid curve is fine. The endgame wall is **two compounding effects**: (a) route-1's random within-tier coupon-collector — each family's lone P1 is a 1.3% roll, and the within-tier pick re-rolls already-owned slots; (b) the uncapped quadratic-cumulative settle ramp `cumCost(20)=546 → (30)=1029 → (40)=1652`. The completionist tail (the rare last slots) lands exactly in the most expensive ramp region, so the two effects multiply.

Owner direction (grill 2026-06-07): lock-now-by-modeling; 100% stays a "full prep cycle" goal but ~2 months (≈ halve); early game snappier to attract players; rare P1 must still feel like an earned surprise.

## Goals / Non-Goals

**Goals:**
- Bring 100%-all-220 from ~15,257 → ~2,700–4,400 correct (≈ 2-month ceiling for the unlucky baseline player).
- Keep early game snappy (first settle ≈ 3 correct) to hook players.
- Make the completionist tail *fair* (bounded, deterministic-ish convergence) without trivializing the thrill of pulling a rare.
- Preserve the route-2 deterministic position-variant loop exactly as shipped (it is already the satisfying part).
- Zero schema/sync risk; monotonic-positive for in-flight saves.

**Non-Goals:**
- Touching `fusion K` (stays 3) or `accel caps` (2.5 / 2.0 — only affect DMN-meta players, out of scope).
- Reworking route-2 mechanics, the rarity weight table, or the P0 pity.
- Adding telemetry infrastructure (owner chose model-driven lock-now over telemetry-first).
- Any player-facing announcement of the new P1 pity (intentionally silent).

## Decisions

### D1 — Cap the settle ramp (`RAMP_CAP_N = 20`), not a slope/base-only change
`nodeCost(n) = round(PACING_BASE × (1 + PACING_K × Math.min(n, RAMP_CAP_N)))`. Past the cap, every settle costs a flat `round(PACING_BASE × (1 + PACING_K × RAMP_CAP_N))` instead of climbing forever. With `PACING_BASE=11`, `RAMP_CAP_N=20` → cost flattens at **33** for all n ≥ 20.
- **Why cap at 20**: route-2 finishes at settle 20, so the cap engages exactly where "intended progression" ends and the completionist tail begins — the tail is where the quadratic blowup hurt. The smooth early/mid ramp (settles 0–19) is preserved.
- **Alternatives considered**: (a) *reduce `PACING_K` slope* — flattens everywhere including early, blunting the intended front-loaded pacing; (b) *base-only drop* — doesn't stop the unbounded tail. The cap surgically fixes the tail while leaving the early ramp shape intact. Chosen because it targets the actual problem region.
- `cumulativeCost` / `affordableSettles` / `walkerFraction` all derive from `nodeCost`, so they inherit the cap with no further change.

### D2 — `PACING_BASE` 14 → 11 (snappier hook)
First settle: `ceil(11/3) = 4` raw, ~3 with any streak — a fast first reward. Model: route-1 lit 42→34, both lit 92→73 per family. Owner asked for an attractive early loop ("吸引玩家願意來玩").
- **Alternative**: keep 14 (Candidate A) — model put 100% at p90 ~2.3 months, slightly over target and a slower hook. Owner picked the snappier Candidate C.

### D3 — Within-tier "fill-missing-first" pick (kills within-tier coupon-collector)
Today `pullVariant` rolls a rarity tier, then picks **uniformly at random** among that tier's non-location slots → re-rolls already-owned slots (a family's two P3 route-1 slots can dupe each other indefinitely). Change: once a tier is rolled, prefer an **unowned** slot in that tier; only fall back to a random (dupe) pick when every slot in the tier is already owned.
- **Cross-tier rarity RNG is unchanged** — the *tier* is still rolled from `VARIANT_RARITY_WEIGHTS` (P1 = 1.3%), so the moment you pull a P1 is still a genuine surprise. This only removes the wasteful "you rolled P3 but got a P3 you already have" dupes.
- This is the single biggest lever (most of 15,257 → ~2,700 comes from here): the coupon-collector overhead within tiers vanishes.
- Preserves open-collection (a fully-owned family still yields dupe individuals for fusion fodder) and the `isLocation` exclusion (route-2 variants are never reachable via the random within-tier pick).

### D4 — Silent P1 soft-pity (converge the lone P1 without surfacing it)
Mirror the existing P0 soft-pity for P1: in `rollRarityWithP0Pity`, when `!p1Owned` and the pull count is past `P1_PITY_START`, ramp a P1 chance (`P1_PITY_RAMP` per pull) that guarantees the lone P1 converges. **But silent**: do NOT set any `wasPityFloor`-equivalent flag on the minted row, and do NOT add any UI "保底" marker. The player perceives getting P1 as luck.
- **Why silent** (owner: "給 pity 但不要明講"): the achievement feeling of "I finally got the P1!" is preserved; a visible pity counter would deflate it into a chore.
- Ordering in the roll: P0-pity check first (unchanged), then P1-pity check (new, gated on `!p1Owned`), then the normal weighted tier roll. `pullVariant` must pass `p1Owned` (derive from owned rows) alongside the existing `p0Owned`.
- **Alternative considered**: rely on fusion (lower K 3→2) for P1 convergence instead of pity. Rejected for *this* lever because it forces the player to learn/use fusion UI to complete; the owner wanted the convergence to be invisible. Fusion stays an additional path at K=3, untouched.

### D5 — Constants live in the content pack (single source of truth)
`PACING_BASE`, `PACING_K`, new `RAMP_CAP_N` in `packages/content-neurons-tw/src/maze-constants.ts`; `P1_PITY_START` / `P1_PITY_RAMP` + `effectiveP1Rate` in `variants.ts` next to the P0 equivalents. App logic (`economy.ts`, `variant-gacha.ts`) consumes them — no magic numbers in the app layer.

### D6 — Fold in the three spec-hygiene riders (2026-06-05 audit)
- **C1 (`neuron-family-mastery`)**: the "Mastery multiplier SHALL apply at **both** correct-answer energy faucets … two counters stay in lockstep" SHALL is stale post-`promote-maze-to-home` (there is one faucet now). Rewrite to the single-faucet reality; multiplier semantics (×1.0→×1.3) unchanged. **Wording needs owner sign-off at apply** (rewriting a normative SHALL).
- **C2 (`neurons-brain-maze` + `economy.ts` comment)**: the "二週目 least-collected" wording vs the within-tier pick — now that D3 makes the within-tier pick deterministic fill-missing-first, reconcile the prose to describe the actual behavior.
- **C3 (`bundles.ts` changelog)**: cosmetic per-branch → per-family comment fix.

## Risks / Trade-offs

- **[Model assumptions ≠ real play]** → The numbers assume 90% accuracy / streak ×1.3 / no DMN accel. Real players vary; the "months" translation is sensitive to daily question volume. Mitigation: the change is a content-pack constant tune — a follow-up nudge is cheap (no schema), and the cap/pity make the *shape* robust even if absolute pace shifts.
- **[Fill-missing-first reduces dupe fodder]** → Fewer within-tier dupes means slightly less fusion fodder. Mitigation: acceptable — fusion stays a secondary path (K unchanged); the owner's goal is faster *collection*, and completionists still generate ample commons from route-1 + settles 20+.
- **[Silent P1 pity hides a mechanic]** → A datamining player could discover it. Mitigation: it's a *soft* pity (probabilistic ramp, not a hard floor), so even discovered it reads as "rates improve the longer you go" rather than a guaranteed counter. No correctness risk.
- **[Early game too fast cheapens progress]** → `PACING_BASE=11` + snappy first settle could feel un-earned. Mitigation: model keeps first settle at ~3–4 correct (not 1); route-1 lit still ~34. Owner explicitly prioritized the hook.
- **[Existing tests encode old cost values]** → Maze-economy / variant-gacha unit tests assert specific costs / pick behavior. Mitigation: update them in the same change; add new tests for cap, fill-missing-first, silent P1 pity.

## Migration Plan

- **No data migration.** Pure content-pack constant + pull-logic change. No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no Worker change → `pnpm lint:dexie-fixtures` is a no-op.
- **Monotonic-positive for in-flight saves**: settle costs only drop or cap (never rise), and the pity only adds P1 chance — a player mid-grind simply finds the rest cheaper. No banner, no reset.
- **Rollback**: revert the constants + the two logic edits; no persisted state depends on the new values, so reverting restores prior pacing with zero data impact.
- **Deploy**: merge `track-neurons` → `main` in `~/coding-scratch/study-rpg` triggers `deploy-cf-pages.yml` (neurons build) → `med-study-rpg.com/neurons/`.

## Open Questions

- **C1 SHALL wording** — the exact rewrite of the `neuron-family-mastery` "two faucets" requirement needs owner confirmation during apply (it's a normative SHALL edit). Default proposal: "Mastery tier SHALL accelerate energy acquisition via a pure multiplier applied at the (single) correct-answer maze-energy faucet."
- **Exact `P1_PITY_START` / `P1_PITY_RAMP`** — modeled at ~30 / ~0.06; final values confirmed against the candidate model's 100% target during apply (tunable).
