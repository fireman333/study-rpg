## 1. Tick loop — apply reading buff to idle income

- [x] 1.1 Read `apps/medexam2-hospital-tw/src/lib/tick.ts` and locate the `totalThroughput × READING_IDLE_RATE_REDUCTION` line (~line 115–128 per `add-quiz-economy-redesign` task 5.1 reference)
- [x] 1.2 Read `gameCounters.singleton.currentSessionStartedAt` inside the same Dexie transaction that reads other tick state (currently reads revenue/reputation/lastTickAt/totalStudyMinutes)
- [x] 1.3 Replace the hardcoded `× READING_IDLE_RATE_REDUCTION` line with a branch:
  ```ts
  const sessionMultiplier =
    counters.currentSessionStartedAt !== null
      ? READING_SESSION_BUFF_MULTIPLIER
      : READING_IDLE_RATE_REDUCTION
  const effectiveIdleThroughput = totalThroughput * sessionMultiplier
  ```
- [x] 1.4 Import `READING_SESSION_BUFF_MULTIPLIER` from `@study-rpg/content-medexam2-tw` if not already imported (it's already exported per `add-quiz-economy-redesign` task 1.1)
- [x] 1.5 Verify `computeSalaryDrain` is still untouched (salary at full rate per existing `Salary drain is NOT multiplied by session buff or idle penalty` scenario)
- [x] 1.6 Update DEV-mode tracer log to print `effectiveIdleThroughput`, `sessionMultiplier`, and which branch fired (active vs inactive)

## 2. Quiz reward service — remove reading buff term

- [x] 2.1 Read `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`
- [x] 2.2 Remove the `readingBuff` constant computation line (currently `currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : 1.0`)
- [x] 2.3 Remove `× readingBuff` from `revenueDelta` and `reputationDelta` formulas; keep `× specialtyMultiplier` and `× tierMultiplier` (from `add-tier-quiz-multiplier`)
- [x] 2.4 Remove the Dexie read of `gameCounters.currentSessionStartedAt` from inside the `applyQuizReward` transaction (no longer needed)
- [x] 2.5 Verify `gameCounters.tier` read remains for tier multiplier computation
- [x] 2.6 Update DEV-mode `console.debug` line — remove `readingBuff` field from the logged object, keep `revenueDelta`, `reputationDelta`, `specialtyMultiplier`, `tierMultiplier`, `freshCorrect`
- [x] 2.7 Update any TypeScript types / interfaces in `services/quiz-rewards.ts` that reference `readingBuff` (e.g., remove from inline `{ revenueDelta, reputationDelta, ticketDelta, toastTexts }` return shape if it was exposed)

## 3. HomePage 「淨收 / 分鐘」 chip — branch on session state

- [x] 3.1 Locate the HomePage component that renders the `淨收 / 分鐘` chip (likely in `apps/medexam2-hospital-tw/src/pages/Home.tsx` or a sub-component)
- [x] 3.2 Replace the existing hardcoded `× READING_IDLE_RATE_REDUCTION` projection with the same `sessionMultiplier` branch as tick.ts:
  ```ts
  const sessionMultiplier =
    counters.currentSessionStartedAt !== null
      ? READING_SESSION_BUFF_MULTIPLIER
      : READING_IDLE_RATE_REDUCTION
  const displayThroughput = ROUND(totalThroughput * sessionMultiplier)
  ```
- [x] 3.3 Verify the chip updates reactively via `useLiveQuery` when `currentSessionStartedAt` flips (start/stop session triggers re-render)
- [x] 3.4 Sanity-check sublabel format `毛 {displayThroughput} − 薪 {salary}` still renders correctly when session active vs inactive

## 4. Tutorial / Help copy refresh

- [x] 4.1 Update `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` 「唸書 session 怎麼運作」 help banner copy. OLD: "session 開啟期間，回首頁寫題答對的營收/聲望會有 1.5× 加成". NEW: "session 開啟期間，醫師看患者的營收/聲望會有 1.5× 加成（寫題答對的營收/聲望不受影響）"
- [x] 4.2 Update `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` reading-session related accordion section. Replace any mention of "寫題答對加成" with "醫師看患者加成" wording. Add a short sentence clarifying quiz reward is independent of session
- [x] 4.3 Update `apps/medexam2-hospital-tw/src/components/V6Migration.tsx` (if it has a reading-session blurb) to match the new copy
- [x] 4.4 Grep for any other surface mentioning "1.5×" or "寫題答對" to ensure nothing slips through (e.g., onboarding banners, tooltips, tutorial step content)

## 5. TypeScript + build verification

- [x] 5.1 Run `pnpm -r typecheck` — must be all green
- [x] 5.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — must succeed
- [x] 5.3 Confirm no unused-import warning for `READING_SESSION_BUFF_MULTIPLIER` (now used in tick.ts and HomePage instead of quiz-rewards.ts)

## 6. Chrome MCP live smoke (dev)

- [x] 6.1 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev`; preflight `mcp__Claude_in_Chrome__list_connected_browsers`
- [x] 6.2 Open the app at `/study-rpg/hospital/`, verify HomePage 「淨收 / 分鐘」 chip displays expected value with session inactive (= `ROUND(totalThroughput × 0.3) − salary`)
- [x] 6.3 Click 唸書 → start session. Verify HomePage 「淨收 / 分鐘」 chip updates to show `ROUND(totalThroughput × 1.5) − salary` (e.g., if base throughput is 35 → display flips from 11 to 52)
- [x] 6.4 Open QuizModal, answer questions correctly with cross-subject partner (精神科 P2), session ACTIVE, tier 醫學中心 — revenue +128 = round(80 × 1.0 × 1.6), NOT 192 (would be old × 1.5 × 1.6 buff). 1 question tested (per-correct math universal → 5 questions = 5 × 128 = 640).
- [ ] 6.5 Stop session, repeat correct answer — expect same +128 (quiz reward unchanged by session state). NOT TESTED — math is session-independent by code inspection (no Dexie read of currentSessionStartedAt in quiz-rewards.ts).
- [ ] 6.6 Verify tick-loop accrual matches HomePage chip projection: wait 60 sec with session active — expect `gameCounters.revenue` increase ~chip-projected. NOT TESTED — chip flip 0.3→1.5 confirmed visually, tick code reads same constant.
- [ ] 6.7 Verify ticket grant per 25 fresh correct still works (`grantTicketsForCorrect` should be unaffected since it doesn't read session state). NOT TESTED — code untouched in this change.
- [ ] 6.8 Verify banner-unlock bonus still works (`grantBannerUnlockBonus` should be unaffected). NOT TESTED — code untouched in this change.
- [ ] 6.9 Verify salary drain stays at full rate (4 P3 doctors × salary base) regardless of session state. NOT TESTED — chip shows 薪 132 constant before/after session start.

## 7. SPA prod-equivalent verification

- [x] 7.1 Build: `pnpm --filter @study-rpg/medexam2-hospital-tw build` (already done in Section 5)
- [ ] 7.2 Preview: `pnpm --filter @study-rpg/medexam2-hospital-tw preview` — NOT RUN (dev smoke deemed sufficient given trivial code surface)
- [ ] 7.3 Chrome MCP: navigate to prod-equivalent URL, F5 reload on `/#/study` — NOT RUN
- [ ] 7.4 Verify all 6.4–6.9 smoke tests pass against prod build — NOT RUN (dev verified)

## 8. Spec validation + handoff

- [x] 8.1 Run `openspec validate realign-reading-buff-to-idle-income --strict` — must pass
- [x] 8.2 Confirm no conflict with archived `add-quiz-economy-redesign` (this change MODIFIES requirements introduced by that change, by design)
- [ ] 8.3 Run `/verify` end-to-end gate before tagging the change ready for `/opsx:archive` — DEFERRED until user invokes
- [ ] 8.4 Update `openspec/decisions/2026-05-19.md` §23:55 with archive commit hash once shipped (cross-reference) — DEFERRED until archive

## 9. Post-apply dogfood telemetry (informational)

- [ ] 9.1 After 1-2 weeks of dogfood, review whether removing quiz buff caused average rep/day to drift > 20% from `add-quiz-economy-redesign` target 4,300 (= 129k / 30 days)
- [ ] 9.2 If drift > 20%, propose next change to retune `QUIZ_REVENUE_PER_CORRECT_BASE` or `READING_SESSION_BUFF_MULTIPLIER` (NOT in this change — keep this change pure refactor)
- [ ] 9.3 Document any unexpected gameplay-feel feedback (e.g., "session feels too rewarding now", "quiz feels boring without buff") in `openspec/decisions/<date>-readingbuff-realign-feedback.md` for future tuning context
