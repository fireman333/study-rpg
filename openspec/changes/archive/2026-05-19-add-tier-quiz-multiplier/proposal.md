## Why

Phase 2 (`add-quiz-economy-redesign`, archived `e62807e`) made quiz a first-class income source with a flat formula `BASE × specialty × readingBuff = 80 × …`. The design.md D1 open question explicitly deferred: "後期 quiz reward 是否要 tier-scaled buff... dogfood 後決定". The 2026-05-19 Chrome MCP signal sweep ran a patched 醫學中心-tier scenario with realistic 8-P2 + 1-P1 roster and surfaced two interlocking problems:

1. **Quiz reward stays flat across tiers**, but salary scales with roster size — at 醫學中心 the idle path is net `63/min revenue (after ×0.3) − 132/min salary = −69/min` (negative), and quiz at flat 80/correct (~160/min) barely keeps the player above water (60-100/min depending on specialty / buff). The "idle as light-but-positive base layer" intent (Phase 2 design D2) is broken at this tier.
2. **HomePage 「淨收 / 分鐘」 display is stale**: [pages/HomePage.tsx:196](apps/medexam2-hospital-tw/src/pages/HomePage.tsx:196) computes `throughput − salary` using raw throughput (no `READING_IDLE_RATE_REDUCTION` applied). Player sees misleading positive rate even when actual tick math is net-negative.

Together: player at 醫學中心 thinks idle is profitable (UI bug) but actually is losing money; meanwhile quiz reward gives no tier-scaled compensation. Result: the late-game pacing feels anemic for active grinders, AND the player gets surprised when their idle balance silently drains.

## What Changes

- **Add `QUIZ_TIER_MULTIPLIER: Record<HospitalTier, number>` constant** in `packages/content-medexam2-tw/src/recruitment.ts`:
  - `診所: 1.0` (early game — no salary, quiz already dominates)
  - `區域醫院: 1.3` (mid-game pacing boost)
  - `醫學中心: 1.6` (compensate for salary outscaling)
  - `國家級教學醫院: 2.0` (terminal flex — quiz becomes dominant late-game)
- **Extend quiz reward formula** in `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` to read `gameCounters.tier` and apply the tier multiplier as the outermost factor:
  - `revenuePerCorrect = ROUND(BASE × specialty × readingBuff × QUIZ_TIER_MULTIPLIER[tier])`
  - `reputationPerCorrect = ROUND(BASE × specialty × readingBuff × QUIZ_TIER_MULTIPLIER[tier])`
- **Fix HomePage 「淨收 / 分鐘」 display bug**: apply `READING_IDLE_RATE_REDUCTION` to displayed throughput so net-per-min shows actual idle rate, not raw throughput. The sublabel `毛 {throughput} − 薪 {salary}` SHALL show `毛 {throughput × 0.3}` (rounded) so the math the player sees matches the tick loop math.

## Capabilities

### New Capabilities

無 — 純擴展現有 capability。

### Modified Capabilities

- `hospital-quiz`: MODIFY existing "Correct answer SHALL grant revenue and reputation rewards" requirement — add tier multiplier as final factor in reward formula. Update scenarios with new expected delta values; add new scenario for tier-multiplier effect.

`hospital-tycoon-engine` and `hospital-specialty-bonus` not affected (tick loop and specialty multiplier source-of-truth unchanged).

## Impact

- **改動檔案**:
  - `packages/content-medexam2-tw/src/recruitment.ts` (new constant `QUIZ_TIER_MULTIPLIER` with `// TUNED 2026-05-19` marker)
  - `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` (read tier from gameCounters in the transaction, apply multiplier)
  - `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` (apply `READING_IDLE_RATE_REDUCTION` to displayed throughput in net-per-min cell)
- **Schema variation**: 無。No Dexie migration. No cloud-sync table change. The `tier` field on `gameCounters` already exists and is already cloud-synced.
- **Out of scope (defer)**:
  - Re-tuning `TIER_SALARY_RATE` — different axis. Phase 2 spec invariant "salary stays at full rate" intentionally kept; tier-quiz multiplier is the alternative compensation path.
  - Re-tuning `READING_IDLE_RATE_REDUCTION` 0.3 → different value. Phase 2 design D2 chose 0.3 to keep idle as "weak base layer". Quiz multiplier preserves that by lifting the quiz path instead.
  - Cosmetic milestone reward adjustments. Independent.
  - Re-tuning `QUIZ_REVENUE_PER_CORRECT_BASE = 80` — global scaling vs tier-relative scaling are different design choices; tier-relative wins because it preserves early-game pacing while fixing late-game.
- **Verification面**: `pnpm -r typecheck` 全綠；Chrome MCP live smoke at each of 4 tier states confirms multiplier applied; HomePage display verified at 醫學中心 roster scenario shows correct negative-net-per-min.
