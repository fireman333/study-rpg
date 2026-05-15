## 1. Content pipeline — surface year + paper metadata

- [x] 1.1 Inspect `packages/content-medexam-tw/scripts/build.ts` and `dist/questions.json` (after rebuild) to verify whether `meta.year` + `meta.paper` are already emitted; document findings as a 2-line comment
- [x] 1.2 If absent, decode `(year, paper)` from source `.md` file path (e.g. `_extracted/醫學一/2024/...`) and write into each question's `meta`
- [x] 1.3 Bump build log to also report distinct `(year, paper)` pairs found, in addition to imported / skipped / total counts
- [x] 1.4 Rebuild `pnpm --filter @study-rpg/content-medexam-tw build` and copy fresh `questions.json` to `apps/medexam-tw/public/content/medexam-tw/`
- [x] 1.5 Add `supportsMockExam: true` to `content-medexam-tw/src/meta.ts` `examMeta` block

## 2. Core engine — REWARD table mockExamPass

- [x] 2.1 Add `mockExamPass` entry to `REWARD` table in `packages/core/src/lib/xp.ts` with values `{ xp: 800, subjectXp: 240, stat: { name: 'knowledge', delta: 4 } }`
- [x] 2.2 Export `MOCK_PASS_LOOT_GUARANTEED_TIER = 'SR'` constant alongside REWARD (or fold into loot-mechanics' existing tier guarantee map)
- [ ] 2.3 _(deferred — no test framework in repo yet; pure-function design preserves testability for future vitest bootstrap)_
- [x] 2.4 Run `pnpm --filter @study-rpg/core build` and confirm no typecheck regression

## 3. Core engine — MockAttempt + mock-exam pure functions

- [x] 3.1 Add `MockAttempt` interface to `packages/core/src/types.ts` matching `persistence` spec record shape
- [x] 3.2 Add `MockInProgress` interface for the singleton state
- [x] 3.3 Create `packages/core/src/lib/mock-exam.ts` with pure functions: `scoreMock(attempt: MockAttemptInput): { totalScore, perQuestionAnswers }`, `computeProgressDelta(currentScore, priorAttempts)`, `applyMockPassReward(player, paperPrimarySubject)`
- [ ] 3.4 _(deferred — same reason as 2.3; pure-function shape preserves testability for future vitest bootstrap)_
- [x] 3.5 Re-export `MockAttempt`, `MockInProgress`, `scoreMock`, `computeProgressDelta`, `applyMockPassReward` from `packages/core/src/index.ts`

## 4. App — Dexie schema bump for mockAttempts + mockInProgress

- [x] 4.1 Locate the existing Dexie database init in `apps/medexam-tw/src/db/`; bump schema version by 1
- [x] 4.2 Add `mockAttempts` store with primary key `id` and index on `paperId`
- [x] 4.3 Add singleton table for `mockInProgress` (single-row keyed by literal `'mockInProgress'`)
- [x] 4.4 Create `apps/medexam-tw/src/db/mock-attempts.ts` DAO with `saveAttempt`, `listAttemptsByPaper`, `getLatestAttempt`, `getInProgress`, `saveInProgress`, `clearInProgress`
- [ ] 4.5 _(deferred to manual dogfood — covered in task 10.4)_

## 5. App — Mock picker screen

- [x] 5.1 Create `apps/medexam-tw/src/screens/MockExamPicker.tsx` rendering a grid of `(year, paper)` cells, sorted year-desc then medexam-1 before medexam-2
- [x] 5.2 Each cell shows year, paper kind ("醫一" / "醫二"), question count; overlay shows latest `MockAttempt` score + timestamp if any
- [x] 5.3 Add fallback "尚無歷年原卷可挑選" when content pack is empty for mock filtering
- [x] 5.4 Wire React Router entry `/mock` → MockExamPicker
- [x] 5.5 Add nav link from main screen to `/mock`
- [x] 5.6 Style with existing CSS variables; ensure mobile (< 768px) reflows to single column

## 6. App — Mock runner screen

- [x] 6.1 Create `apps/medexam-tw/src/screens/MockExamRunner.tsx` with question 1..N navigation (where N is the paper total, ≈100) (prev / next / jump)
- [x] 6.2 Implement stopwatch UI (top-right `mm:ss`); start on first "開始作答" click
- [x] 6.3 Implement `document.visibilitychange` listener → pause stopwatch when hidden; resume on visible
- [x] 6.4 Implement 180-second idle detection (debounce on `pointerdown` / `keydown` / `scroll`) → pause stopwatch + show "已暫停（無互動）" hint
- [x] 6.5 Pause `reading-loop` timer for the duration of the mock (read existing reading-loop hook, add mock-active flag)
- [x] 6.6 Persist `MockInProgress` singleton every 5 seconds (debounced) while active
- [x] 6.7 On mount, check Dexie for `mockInProgress` singleton → if non-stale, restore state + show "已從上次中斷處恢復" toast
- [x] 6.8 No per-question reward emission during answering (verify by adding assert in dev mode)
- [x] 6.9 "交卷" button always visible; clicking opens confirm dialog if any questions unanswered

## 7. App — Mock submit + reward application

- [x] 7.1 On submit, compute `totalScore` via `scoreMock()` from core
- [x] 7.2 `db.mockAttempts.put(...)` with full record including unanswered questions marked
- [x] 7.3 `db.mockInProgress.clear()` after successful write
- [x] 7.4 Apply `REWARD.mockExamPass` via `applyMockPassReward()` (bypass any rate-limit guards; spec scenario)
- [x] 7.5 Trigger 1× guaranteed SR loot roll via existing `loot-mechanics` orchestrator
- [x] 7.6 Navigate to `/mock/result/:attemptId`

## 8. App — Mock result screen

- [x] 8.1 Create `apps/medexam-tw/src/screens/MockExamResult.tsx`; route param `:attemptId` loads the `MockAttempt` record from Dexie
- [x] 8.2 Top region: total score `N / paperTotal`, elapsed time, paper identifier
- [x] 8.3 Per-question cards: stem / options (with user's selection highlighted vs correct answer highlighted) / explanation (markdown rendered)
- [x] 8.4 Empty `explanation` field → placeholder text with link to 陽明國考考古題小組 (per `mock-exam` spec scenario)
- [x] 8.5 Unanswered question card shows "未作答" instead of selection chip
- [x] 8.6 Progress curve panel: query prior `mockAttempts` for same `paperId`, render line chart of `totalScore` over time; current attempt visually distinct
- [x] 8.7 First-attempt case: show "首次嘗試 — 之後可看進步曲線" instead of empty chart
- [x] 8.8 "將 N 道錯題加入 SRS 排程" button: count wrong answers; on click invoke `srsQueue.enqueueMany()` (or equivalent existing batch API); toast confirmation; button → disabled "已加入"
- [x] 8.9 Hide SRS button on perfect score (0 wrong answers); show congratulatory message
- [x] 8.10 Performance: render ~N cards (≈100 per paper) via skeleton + `requestIdleCallback` hydration to avoid first-paint stall

## 9. Tests

- [ ] 9.1 _(deferred — no test framework; pure-function design preserves testability)_ Unit-test `scoreMock` with all-correct / all-wrong / mixed / unanswered inputs
- [ ] 9.2 _(deferred — no test framework; pure-function design preserves testability)_ Unit-test `computeProgressDelta` with no priors / 1 prior / multiple priors
- [ ] 9.3 _(deferred — no test framework; pure-function design preserves testability)_ Unit-test `applyMockPassReward` produces correct XP / subject XP / stat delta
- [ ] 9.4 _(deferred — no test framework; pure-function design preserves testability)_ Add Dexie integration test (jest + fake-indexeddb): save + retrieve a `MockAttempt`
- [x] 9.5 Chrome MCP smoke test: full happy path (pick → run 3 questions → submit early → see result with placeholder for unanswered) on `localhost:5173/study-rpg/`
- [x] 9.6 Chrome MCP SPA route smoke: F5 on `/mock`, `/mock/run`, `/mock/result/:id` all render correctly on prod (GitHub Pages with 404.html fallback)
- [x] 9.7 Mid-mock reload smoke: start mock, answer 3 questions, reload tab, verify state restored + toast appears

## 10. Verification + archive prep

- [x] 10.1 Run `pnpm -r typecheck` — all green
- [x] 10.2 Run `pnpm --filter @study-rpg/medexam-tw build` — bundle builds cleanly
- [x] 10.3 Run `/verify` skill: Chrome MCP three-route SPA smoke (in-app nav + direct URL + F5) on dev + prod
- [ ] 10.4 Manual dogfood: complete 1 real mock attempt with `(2024, medexam-1)` paper end-to-end; confirm reward burst feels right (telemetry note in scratch)
- [x] 10.5 Update `openspec/project.md` Roadmap M5 entry from ⏳ to "🚧 mock exam ✓ (M5 has more — 宿舍 + cosmetic still ⏳)" or open a separate change for the remaining M5 items
- [x] 10.6 `/opsx:verify add-mock-exam-mode` — 3-dim spec coherence check
- [ ] 10.7 `/opsx:archive add-mock-exam-mode` — sync deltas into main specs, move change folder to archive/
- [ ] 10.8 Commit via auto-git: `spec(archive): merge add-mock-exam-mode — mock-exam capability + REWARD.mockExamPass locked + Dexie mockAttempts store`
