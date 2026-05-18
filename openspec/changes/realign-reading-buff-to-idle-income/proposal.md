## Why

`add-quiz-economy-redesign` (archived 2026-05-19) wired the 1.5× reading-session multiplier to **quiz answer rewards**, but the intended mental model is "I am sitting next to the clinic reading textbook while my doctors see patients" — the buff should boost **doctor idle income** (patient throughput), not quiz reward, because the player may not actively answer questions during a reading session (see `openspec/decisions/2026-05-19.md` §23:55 for the full reflection). Current behavior makes reading sessions feel disconnected from the tycoon idle loop and over-rewards active quizzing during sessions, while leaving "離開電腦看書" strategically weak (idle stays at 0.3× regardless of session state).

## What Changes

- Move the `1.5×` multiplier (`READING_SESSION_BUFF_MULTIPLIER`) from quiz reward computation to idle income computation
- **BREAKING** (gameplay semantics, not API): Quiz revenue/reputation no longer receives reading-session buff. Only `specialtyMultiplier` (1.0–1.2×) and tier multiplier remain on quiz path.
- `lib/tick.ts`: branch on `currentSessionStartedAt` — if session active, multiply `totalThroughput` by `1.5 / 0.3 = 5×` relative to current idle (i.e., full × 1.5); if inactive, keep current `× 0.3`
- `services/quiz-rewards.ts`: remove `readingBuff` term from `revenueDelta` / `reputationDelta` formula; keep `specialtyMultiplier` and (if present) tier multiplier
- Tutorial / help copy refresh in three places:
  - `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` help banner
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` reading-session accordion section
  - `apps/medexam2-hospital-tw/src/components/V6Migration.tsx` migration explainer
  - Old: "回首頁寫題答對的營收/聲望會有 1.5× 加成"
  - New: "醫師看患者的營收/聲望會有 1.5× 加成"
- `READING_IDLE_RATE_REDUCTION = 0.3` constant **stays** — the "no supervision penalty" semantic is still valid for sessions-inactive idle
- Phase 2 1-month full-clear anchor calibration **not adjusted now** — defer to post-dogfood telemetry (per `add-quiz-economy-redesign` 10.2 tuning protocol)

## Capabilities

### New Capabilities

_None — this change refines existing capabilities._

### Modified Capabilities

- `hospital-quiz`: remove reading-session buff from quiz reward requirement (specialty + tier multipliers remain)
- `hospital-tycoon-engine`: add reading-session buff (×1.5) to idle income requirement (alongside existing × 0.3 inactive penalty)
- `hospital-study-session`: refine session buff scope — clarify that session active boosts **doctor idle income**, not quiz reward

## Impact

- **Code touched**: `apps/medexam2-hospital-tw/src/lib/tick.ts`, `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`, `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx`, `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`, `apps/medexam2-hospital-tw/src/components/V6Migration.tsx`
- **Constants reused**: `READING_SESSION_BUFF_MULTIPLIER` (1.5, from `packages/content-medexam2-tw/src/recruitment.ts`) — no value change, only relocation of where it's applied
- **No schema changes** — Dexie v5 stays as-is; `gameCounters` / `monotonicCounters` shape unchanged
- **No constant changes** — re-tuning deferred to post-dogfood telemetry (per `add-quiz-economy-redesign` task 10.2)
- **No cloud-sync changes** — `bannerUnlockBonusLog` table untouched
- **Gameplay strategy shift**:
  - "離開電腦看書" strategy value 上升 (idle income ×1.5 instead of staying at ×0.3 baseline)
  - "全程主動寫題" quiz boost down by 33% (was specialty × tier × 1.5; now specialty × tier only)
  - Net Phase 2 income mix shifts toward idle; quiz becomes pure income source independent of session state
- **Telemetry**: existing DEV-mode `console.debug` lines in `applyQuizReward` need updating to remove `readingBuff` field (or keep but always print 1.0)
- **Dogfood reset**: the live preview at https://fireman333.github.io/study-rpg/hospital/ will get different feel — owner should re-run baseline measurement
