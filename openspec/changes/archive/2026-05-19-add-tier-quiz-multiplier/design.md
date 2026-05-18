## Context

Phase 2 `add-quiz-economy-redesign` (archived `e62807e`) introduced the quiz-driven income model with a flat per-correct base. Design.md D1 deferred tier-scaled multipliers to a dogfood pass. The 2026-05-19 Chrome MCP signal sweep (d-2 in user's resume plan) patched a 醫學中心-tier scenario with 8 P2 + 1 P1 doctors and read direct from IDB + the HomePage display:

| Field | Value at 醫學中心 with 8 P2 + 1 P1 |
|---|---|
| Gross throughput (raw) | 210/min |
| Idle accrual (×0.3 reduction) | 63/min |
| Salary drain (full rate) | 132/min |
| Net idle rate | **−69/min** ❌ |
| HomePage 「淨收 / 分鐘」 display | **+78** ❌ (uses raw, not idle-adjusted throughput) |
| Quiz reward (flat 80/correct, no tier scaling) | ~160/min (at 30 sec/correct pace) |
| Net quiz rate (quiz path: +160 − 132 salary) | +28/min |
| Quiz vs idle gap | quiz +28 vs idle −69 = 97/min difference |

The 97/min gap shows quiz is the "only viable path" at this tier — Phase 2 design D2 envisioned idle as a "light-but-positive base layer" but at this tier it's broken. Three observations:

1. Salary scales with roster (rev/min lost = Σ doctor.powerMultiplier × 4), but quiz reward is fixed at 80/correct.
2. Throughput also scales with roster (powerMultiplier × baseRate × roomFacility × affinity), but `READING_IDLE_RATE_REDUCTION = 0.3` is constant.
3. Net: as you get better doctors, salary grows linearly while idle (capped at ×0.3 of growing throughput) grows slower than salary in mid-late game. At some point net flips negative.

The cleanest mitigation that respects Phase 2's spec invariants ("salary stays at full rate") is to scale the quiz reward by tier — make quiz the dominant income path explicitly, as design D1 anticipated.

## Goals / Non-Goals

**Goals:**
- At each tier, quiz path's per-30sec impact (per-correct reward minus ongoing 0.5-min idle drain) is strictly positive AND grows with tier.
- Mid-game (區域醫院) pacing accelerates ~30% so 30-day full-clear target stays achievable for typical active player.
- HomePage net-per-min display reflects actual tick-loop math (no UI lying to player about income).
- Late-game (國家級教學醫院) feels like a "flex" where quiz rewards are clearly the headline activity.

**Non-Goals:**
- Don't change `TIER_SALARY_RATE` (Phase 2 spec invariant — payroll pressure preserved).
- Don't change `READING_IDLE_RATE_REDUCTION = 0.3` (Phase 2 design D2 anchor — idle stays light).
- Don't change `QUIZ_REVENUE_PER_CORRECT_BASE = 80` (early-game pacing already feels right per dogfood; tier-relative scaling is more precise than global).
- Don't touch cosmetic / mock-exam / fate-card economies (independent).

## Tier Multiplier Math

Target: at each tier, quiz mode strictly dominates idle mode by a comfortable margin (~50% headroom).

### 診所 (no salary, throughput trivial)

Quiz × 1.0:
- Quiz reward: 80/correct → ~160/min
- Idle: ~3/min throughput × 0.3 = ~1/min (effectively zero)
- No salary at 診所 tier (0% rate)
- Quiz comfortably dominates ✓ no scaling needed

### 區域醫院 (mid-game, ~5 P3 doctors typical)

Roster est: 5 P3 doctors. Salary = 5 × 2.0 × 4 × 1.0 = 40/min. Throughput est: 5 rooms × 10 × 2.0 × 1.5 × 1.2 = 180/min → idle ×0.3 = 54/min.

Quiz × 1.0 vs idle:
- Quiz path: +80 - 40×0.5 = +60/30sec, ~120/min net
- Idle path: 54 - 40 = 14/min net

Quiz dominates by 106/min — already comfortable. But mid-game pacing feels slow for active grinders: 80k threshold − 30k (already past 診所) = 50k rep needed from 區域醫院 grind. At 80 rep × 0.8 correct rate × 2/min = 128/min effective, 50k / 128 ≈ 6.5 hr. Combined with 診所 ~3 hr, totals 9-10 hr to reach 醫學中心 — beyond design 30-day × 30min = 15hr budget headroom.

Quiz ×1.3 → 104/correct → ~208/min effective at 0.8 rate. 50k / 208 ≈ 4 hr. Comfortable mid-game pacing.

### 醫學中心 (late-game)

Per d-2 measurement: salary 132/min, idle ×0.3 = 63/min, net −69/min. Quiz ×1.0 = 80/correct.

Quiz path per 30sec: +80 − 66 (salary half) = +14/30sec → +28/min effective. Idle: −69/min.

Quiz ×1.6 → 128/correct. Per 30sec: +128 − 66 = +62/30sec → +124/min effective. Quiz dominates idle (−69) by 193/min. ✓ comfortable.

### 國家級教學醫院 (terminal, "flex" tier)

Estimated salary at this tier: ~250/min (P1-heavy roster). Idle ×0.3 ≈ 100/min. Net idle: −150/min.

Quiz ×2.0 → 160/correct. Per 30sec: +160 − 125 = +35/30sec → +70/min effective. Quiz dominates idle by 220/min. ✓

### Summary table

| Tier | Multiplier | Quiz/correct | Quiz/min effective (0.8 correct rate, 30sec/Q) | Idle net/min | Quiz dominates by |
|---|---|---|---|---|---|
| 診所 | 1.0 | 80 | 128 | ~0 | 128 ✓ |
| 區域醫院 | 1.3 | 104 | 166 | +14 | 152 ✓ |
| 醫學中心 | 1.6 | 128 | 205 | −69 | 274 ✓ |
| 國家級教學醫院 | 2.0 | 160 | 256 | −150 | 406 ✓ |

All four tiers: quiz strictly dominates idle ✓. Multipliers are SIMPLE (1.0 / 1.3 / 1.6 / 2.0) so player can mentally model.

## Decisions

### D1: Multiplier shape — linear (1.0 / 1.3 / 1.6 / 2.0) vs other curves

**Considered**:
- (a) Linear 1.0 / 1.3 / 1.6 / 2.0 — chosen
- (b) Exponential 1.0 / 1.5 / 2.25 / 3.4 — too aggressive late game, breaks design D2 (idle still has SOME role)
- (c) Step function 1.0 / 1.5 / 1.5 / 2.0 — works but inconsistent for player intuition
- (d) Dynamic (computed from current salary / throughput at runtime) — over-engineered, hard to communicate to player, hard to dogfood

**Decision**: (a) linear. Each tier upgrade gives ~+30% quiz reward — matches the "feels noticeable but not overwhelming" curve. Player can grok: "high tier = better quiz reward" without spreadsheet.

### D2: Apply multiplier in service vs in constants

**Considered**:
- (a) Multiply inside `applyQuizReward` service, read tier from gameCounters in same transaction
- (b) Pre-compute per-tier `revenuePerCorrect` constants at module load (no runtime tier read)
- (c) Pass tier as a service arg from QuizModal

**Decision**: (a). Service already reads currentSessionStartedAt from gameCounters inside the transaction — adding `tier` to the same read is one extra field access, near-zero cost. (b) would require module-level state, complicates testing. (c) couples QuizModal to economy logic the service should own.

### D3: HomePage display fix — separate "idle gross" vs reformat

**Considered**:
- (a) Show `毛 {throughput × 0.3} − 薪 {salary}` (matches tick math)
- (b) Show `毛 {throughput} × 0.3 − 薪 {salary}` (more transparent but cluttered)
- (c) Show `毛 {throughput} ... 閒置 ×0.3 ... 薪 {salary}` (educational but long)

**Decision**: (a) — simplest, matches tick math directly. Player who wants to understand the formula can read the `// TUNED` comment in source. UI stays tight.

### D4: Tier read inside service transaction

The service's existing transaction includes `db.gameCounters`. The tier read happens inside the rw transaction, so any concurrent tier upgrade write would block until this transaction commits. Read at line ~80 (after currentSessionStartedAt read). No race condition.

### D5: Out-of-scope: salary tier rate retune

Phase 2 design D2 deliberately set "salary stays at full rate" to maintain payroll pressure as an investment incentive. Changing salary tier rate would weaken that and require Phase 2 spec revision. Tier-quiz multiplier achieves the same end (quiz dominates at high tiers) without touching that contract. Defer salary tuning to a future change ONLY if dogfood shows tier-quiz multiplier alone is insufficient.

## Risks / Trade-offs

- **[Idle net stays negative at 醫學中心 / 國家級]** → Acknowledged. Player choice: idle for atmosphere (zero or slight negative drain) vs quiz for income. Design intent.
- **[Multipliers may be too generous if dogfood shows over-acceleration]** → Mitigation: all values marked `// TUNED 2026-05-19 — first dogfood pass`. Easy to retune in a follow-up change.
- **[Player surprise: same quiz now gives different revenue/rep after tier upgrade]** → Mitigation: tier-quiz multiplier kicks in seamlessly on next quiz answer post-upgrade. Toast already fires on tier upgrade (per existing spec). Could add an explanatory line to the tier-up toast or tutorial, but defer until dogfood shows confusion.
- **[Math model now has 3 axes (BASE, specialty, buff, tier) — getting complex]** → Mitigation: design.md table above. Service comment lists all 4 factors.
- **[HomePage display fix could conflict with future redesigns of the counters banner]** → Mitigation: minimal change — single line, computes adjusted throughput inline.

## Migration Plan

No data migration. Constants change is no-op for existing saves. Tier-quiz multiplier kicks in on next quiz answer after deployment. Older quiz answers (already-credited revenue/rep) stay as-is.

Rollback: revert single commit. No data integrity concerns.

## Open Questions

- **Should we also surface tier-quiz multiplier in the QuizModal partner panel** (e.g. show "醫學中心 × 1.6" alongside the specialty multiplier chip)? Could be a polish follow-up if dogfood shows players miss the connection.
- **Does mock exam mode need its own tier-quiz multiplier**? Currently mock exam is a 一階 thing (separate runner). 二階 doesn't have mock exam yet. When 二階 mock exam ships, decide whether to apply the same multiplier or not — defer.
- **Should fate cards' revenue-grant rewards also tier-scale**? E.g. `minor-revenue-5k` card grants flat 5,000 — at 國家級 that's barely a quiz session's worth. Could tier-scale fate-card rewards too, but that's a different change.
