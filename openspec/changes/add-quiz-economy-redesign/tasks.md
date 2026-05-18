## 1. Content-pack constants + tier threshold recalibration

- [ ] 1.1 Add 7 new constants to `packages/content-medexam2-tw/src/recruitment.ts` (each with `// TUNED 2026-05-18 — first dogfood pass; revisit after 1-2 weeks of telemetry`):
  - `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
  - `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`
  - `QUIZ_TICKET_GRANT_PER_N_CORRECT = 25`
  - `BANNER_UNLOCK_TICKET_BONUS = 1`
  - `BANNER_UNLOCK_TICKET_LIFETIME_CAP = 14`
  - `READING_SESSION_BUFF_MULTIPLIER = 1.5`
  - `READING_IDLE_RATE_REDUCTION = 0.3`
- [ ] 1.2 Update `TIER_UPGRADE_THRESHOLDS` in `packages/content-medexam2-tw/src/clinic-tiers.ts`: 診所 → 30_000, 區域醫院 → 80_000, 醫學中心 → 150_000 (keep 國家級教學醫院 → null). Add tuning comment header.
- [ ] 1.3 Re-export all new constants from `packages/content-medexam2-tw/src/index.ts`
- [ ] 1.4 Run `pnpm --filter @study-rpg/content-medexam2-tw build` — confirm new constants resolve and `pnpm -r typecheck` stays green

## 2. Dexie schema v5 + bannerUnlockBonusLog table

- [ ] 2.1 Bump `apps/medexam2-hospital-tw/src/db/schema.ts` Dexie version to v5; add `bannerUnlockBonusLog: '&subjectId'` to the v5 `stores()` declaration
- [ ] 2.2 Add `interface BannerUnlockBonusLogRow { subjectId: SubjectId; grantedAt: number }` + table-typed reference in `StudyRpgHospitalDB` class
- [ ] 2.3 Add `freshCorrectSinceLastTicket: number` field to `MonotonicCountersRow` (default 0 on read); upgrade hook for v5 SHALL initialize this field to 0 for existing rows
- [ ] 2.4 Add helper `grantTicketsForCorrect(count: number)` in `apps/medexam2-hospital-tw/src/db/schema.ts` — applies per-N grant logic, clamps at TICKET_CAP, optionally returns whether a toast should fire
- [ ] 2.5 Add helper `grantBannerUnlockBonus(subjectId: SubjectId)` — checks bannerUnlockBonusLog, grants +1 ticket (clamped), writes log row, returns whether toast should fire
- [ ] 2.6 Verify no cloud-sync table change — `bannerUnlockBonusLog` SHALL NOT be added to `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` adapters

## 3. quiz-rewards service

- [ ] 3.1 Create `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` (~80 lines):
  ```ts
  export interface ApplyQuizRewardInput {
    subjectId: SubjectId
    boundDoctor: { subjectId: SubjectId; rarity: Rarity } | null
    questionId: string
    isCorrect: boolean
    isDisputed: boolean
    isFresh: boolean
  }
  export async function applyQuizReward(input: ApplyQuizRewardInput): Promise<{ revenueDelta: number; reputationDelta: number; ticketDelta: number; toastTexts: string[] }>
  ```
- [ ] 3.2 Service body:
  - If `!input.isCorrect && !input.isDisputed` → return zeros immediately
  - Compute `specialtyMultiplier = getSpecialtyMultiplier(boundDoctor?.subjectId ?? null, boundDoctor?.rarity ?? null, subjectId)`
  - Read fresh `gameCounters.currentSessionStartedAt` from Dexie inside the transaction
  - Compute `readingBuff = currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0`
  - `revenueDelta = Math.round(QUIZ_REVENUE_PER_CORRECT_BASE × specialtyMultiplier × readingBuff)`
  - `reputationDelta = Math.round(QUIZ_REPUTATION_PER_CORRECT_BASE × specialtyMultiplier × readingBuff)`
  - Single Dexie transaction (`rw`, gameCounters + monotonicCounters + tickets + bannerUnlockBonusLog):
    - Update gameCounters.revenue / reputation
    - If `isFresh`: increment freshCorrectSinceLastTicket; if reaches 25 → reset to 0 + grantTicketsForCorrect(1)
    - Affinity-cross-threshold detection: read updated affinity, compare with RECRUITMENT_THRESHOLDS, if crossed and not in bannerUnlockBonusLog → grantBannerUnlockBonus
- [ ] 3.3 Add unit-style mental check (Bash echo): given session active, P3 same-subject partner, fresh correct: expect revenueDelta=ROUND(80×1.2×1.5)=144, ticket grant only if counter hits 25
- [ ] 3.4 Export from `apps/medexam2-hospital-tw/src/services/index.ts` (or barrel if exists)

## 4. QuizModal wire-up

- [ ] 4.1 In `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` `handlePickOption` correct branch (around line 107-122), after the existing `recordCorrectAnswer` call, invoke `applyQuizReward({ subjectId, boundDoctor: boundDoctor ? { subjectId: boundDoctor.subjectId, rarity: boundDoctor.rarity } : null, questionId: question.id, isCorrect: wasCorrect, isDisputed: question.disputed, isFresh: !(await db.questionHistory.get(question.id)) })`
- [ ] 4.2 The `isFresh` check MUST happen BEFORE `recordCorrectAnswer` writes to questionHistory (otherwise every correct looks "not fresh"). Capture isFresh into a local var before calling recordCorrectAnswer.
- [ ] 4.3 Surface toasts returned from applyQuizReward via the existing toast-stack pattern (reuse HomePage toast styling)
- [ ] 4.4 Verify atomicity: wrap recordCorrectAnswer + applyQuizReward in a single Dexie transaction OR ensure both are idempotent if one fails

## 5. Tick loop idle-rate reduction

- [ ] 5.1 In `apps/medexam2-hospital-tw/src/lib/tick.ts` around line 115-128, multiply `totalThroughput` by `READING_IDLE_RATE_REDUCTION` before computing `deltaRevenueGross` / `deltaReputation`. Salary computation (`computeSalaryDrain`) SHALL NOT be touched (salary at full rate).
- [ ] 5.2 Add a tracer log in DEV mode showing `effectiveIdleThroughput = totalThroughput × READING_IDLE_RATE_REDUCTION` so dogfood telemetry surfaces the value
- [ ] 5.3 Add inline comment near the multiplication explaining the role split (idle 30% / quiz primary)

## 6. Migration of existing saves

- [ ] 6.1 Verify Dexie v4→v5 upgrade hook seeds `freshCorrectSinceLastTicket = 0` for existing `monotonicCounters` rows
- [ ] 6.2 Verify Dexie v4→v5 upgrade hook initializes empty `bannerUnlockBonusLog` table (no backfill — existing unlocked banners do NOT retroactively grant tickets; acceptable trade-off per design D4)
- [ ] 6.3 Manual smoke: load existing v4 save, confirm:
  - All previously-accumulated revenue/reputation preserved
  - Tier auto-upgrades to whatever new threshold the existing reputation already exceeds (on next tick)
  - No toast spam / crash on first answer

## 7. Typecheck + Chrome MCP live smoke

- [ ] 7.1 Run `pnpm -r typecheck` — must be all green
- [ ] 7.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev`; preflight `mcp__Claude_in_Chrome__list_connected_browsers`
- [ ] 7.3 Chrome MCP: open the app at `/study-rpg/hospital/` (or dev URL), confirm HomePage revenue/reputation chips render initial values
- [ ] 7.4 Open QuizModal, answer 5 questions correctly with NO doctor partner bound, NO session — expect revenue +400 (5 × 80), reputation +400
- [ ] 7.5 Bind same-subject P5 doctor partner (use existing doctor roster), answer 5 more correctly with NO session — expect revenue +420 (5 × 84), reputation +420
- [ ] 7.6 Bind same-subject P1 doctor partner (use DEV tool to spawn one if no P1 in roster), answer 5 more correctly with NO session — expect revenue +600 (5 × 120), reputation +600
- [ ] 7.7 Open reading session, answer 5 more correctly with same-subject P1 partner — expect revenue +900 (5 × 180), reputation +900
- [ ] 7.8 Close reading session, answer 1 more correctly — expect revenue +120 (unbuffed)
- [ ] 7.9 Count fresh correct answers approaching 25, confirm +1 ticket toast fires on the 25th
- [ ] 7.10 Use DEV affinity-cross tool to push a never-unlocked subject across threshold, confirm +1 ticket bonus toast fires; repeat the cross (reset affinity to 0 first), confirm no second bonus
- [ ] 7.11 Open reading session, wait 60 seconds without answering (idle), confirm revenue + reputation increase by approximately `totalThroughput × 0.3` (not full throughput)
- [ ] 7.12 Confirm existing fate-card ticket grants still work (run a fate-card flow that grants tickets — e.g. dev tool or scripted scenario)
- [ ] 7.13 Verify tier-upgrade triggers at the new thresholds: push reputation to 30,001 with diversification satisfied → tier upgrades to 區域醫院

## 8. SPA prod-equivalent verification

- [ ] 8.1 Build the app: `pnpm --filter @study-rpg/medexam2-hospital-tw build`
- [ ] 8.2 Preview: `pnpm --filter @study-rpg/medexam2-hospital-tw preview`
- [ ] 8.3 Chrome MCP: navigate to prod-equivalent URL, hit F5 on non-root routes (e.g. `/study-rpg/hospital/training`) — confirm no regression vs current SPA-routing behavior
- [ ] 8.4 Verify all 7.4–7.13 smoke tests pass against prod build (not just dev)

## 9. Spec validation + handoff

- [ ] 9.1 Run `openspec validate add-quiz-economy-redesign --strict` — must pass
- [ ] 9.2 Verify no Phase 1 (`add-medexam2-completion-tracker`) conflict — both changes touch QuizModal but in different code paths; manual diff review
- [ ] 9.3 Confirm `add-ticket-grant-per-correct` was never created (it was decided to fold into this change — verify nothing on filesystem under that name)
- [ ] 9.4 Run `/verify` end-to-end gate before tagging the change ready for `/opsx:apply`

## 10. Post-apply dogfood telemetry hooks (optional, for next pass)

- [ ] 10.1 Add DEV-mode `console.debug` lines in `applyQuizReward` printing `{ revenueDelta, reputationDelta, specialtyMultiplier, readingBuff, freshCorrect }` per answer — visible during dogfood, stripped from prod
- [ ] 10.2 Document tuning protocol in design.md Open Questions section: "After 1-2 weeks of dogfood, review average rep accrued / day vs target 4,300 (= 129k / 30); adjust BASE constants if off by >20%"
