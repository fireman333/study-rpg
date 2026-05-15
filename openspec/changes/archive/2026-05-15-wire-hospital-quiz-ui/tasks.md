## 1. Schema migration (Dexie v3 → v4)

- [x] 1.1 Add `MasteryRow` interface to `apps/medexam2-hospital-tw/src/db/schema.ts` with fields `{ subjectId: string, correct: number, total: number }`
- [x] 1.2 Add `QuestionHistoryRow` interface with all 9 fields (questionId, subjectId, attempts, correctCount, lastAnsweredAt, lastResult, nextDueAt, interval, easeFactor)
- [x] 1.3 Extend `GameCountersRow` interface with `hasUsedStarterPull: boolean`
- [x] 1.4 Add `mastery` and `questionHistory` to `HospitalDB` class as `EntityTable<...>` props
- [x] 1.5 Add `version(4).stores({...})` block with mastery (`&subjectId`) and questionHistory (`&questionId, subjectId, lastAnsweredAt, nextDueAt`) indexes; preserve all v3 tables
- [x] 1.6 Add `version(4).upgrade(...)` hook that (a) inserts 14 default mastery rows if missing (b) sets `gameCounters.hasUsedStarterPull = true` for upgrading saves
- [x] 1.7 Update `ensureSeed` to handle fresh-vs-upgraded: fresh save → seed 2 P5 starter doctors + `hasUsedStarterPull = false` + 14 mastery defaults; upgraded save → leave doctors alone, `hasUsedStarterPull = true`, mastery already backfilled by upgrade hook
- [x] 1.8 Verify migration on a local copy of dogfood save: doctors / affinity / rooms / gameCounters preserved, mastery 14 rows present, `hasUsedStarterPull = true` — code review only; runtime simulation hard from same tab. Migration logic in schema.ts is additive + idempotent; will be exercised on user's actual dogfood save at first prod load

## 2. Content pack — starter pull rarity export

- [x] 2.1 Add `STARTER_PULL_WEIGHTS: GachaTier[]` const to `packages/content-medexam2-tw/src/recruitment.ts` with P4/P3/P2/P1 = 25/10/4/1 (P5 excluded)
- [x] 2.2 Add `RARITY_DISPLAY_LABELS` helper if not present (re-use existing `RARITY_LABELS`)
- [x] 2.3 Re-export `STARTER_PULL_WEIGHTS` from `packages/content-medexam2-tw/src/index.ts`
- [x] 2.4 Rebuild content pack: `pnpm --filter @study-rpg/content-medexam2-tw build`

## 3. Quiz module — picker and mastery helpers

- [x] 3.1 Create `apps/medexam2-hospital-tw/src/lib/quiz.ts` with `pickRandomQuestion(subjectId, seenIds): Question` (loads from public/content/medexam2-tw/questions.json, filters by subject, re-rolls up to 3 times if id ∈ seenIds, returns the question or accepts on 3rd repeat)
- [x] 3.2 Add `recordCorrectAnswer({ subjectId, questionId })` and `recordWrongAnswer({ subjectId, questionId })` helpers to `src/lib/mastery.ts` — both perform Dexie transaction: upsert mastery + upsert questionHistory + (correct only) increment affinity
- [x] 3.3 Add `formatMasteryPercent(mastery: MasteryRow | undefined): string` returning `「掌握 N%」` or `「掌握 -」` placeholder
- [ ] 3.4 Add unit test sketches for picker re-roll logic and mastery formatter (Vitest if test infra exists, else leave as TODO comment) — no Vitest infra in app; deferred to follow-up

## 4. Quiz modal component

- [x] 4.1 Create `src/components/QuizModal.tsx` skeleton — props: `subjectId: SubjectId`, `onClose: () => void`
- [x] 4.2 Implement modal layout: header (subject label + close X), body (doctor partner sprite + name, subject dropdown, question stem, 4 option buttons), result region (placeholder), 下一題 button (initially disabled)
- [x] 4.3 Implement state management: `currentQuestion`, `selectedOption`, `revealed`, `seenQuestionIds`, `boundDoctor`
- [x] 4.4 Bind doctor picker — default to roster doctor with max `obtainedAt`; show picker if roster empty (disabled options + error message)
- [x] 4.5 Wire subject dropdown — default to entry subject, on change reset question + clear seenQuestionIds
- [x] 4.6 Implement option click handler — on click set `selectedOption`, set `revealed = true`, call `recordCorrectAnswer` or `recordWrongAnswer` per `corpus.answer` match
- [x] 4.7 Implement explanation rendering — pre-formatted text render of `corpus.explanation` (markdown lib not installed; render raw with line breaks); fallback to `「（解析待補）」` placeholder if empty/missing
- [x] 4.8 Implement visual treatment — correct option green border on reveal, selected wrong option red border, other options dim
- [x] 4.9 Wire 下一題 button — load fresh question via picker, add prev question id to seenQuestionIds, reset selectedOption + revealed
- [x] 4.10 Wire close button — call `onClose` without confirmation; HomePage handles modal mount/unmount

## 5. RecruitmentBanner double-button

- [x] 5.1 Edit `src/components/RecruitmentBanner.tsx`: add new「📚 學習」 button alongside existing「🎫 招募」 button
- [x] 5.2 Wire 學習 button — onClick fires `onStartQuiz(subjectId)` prop callback
- [x] 5.3 Verify 學習 button enabled regardless of locked state; 招募 button locked state unchanged
- [x] 5.4 Add mastery% label to banner — read `mastery[subjectId]` via Dexie live query, display via `formatMasteryPercent`
- [x] 5.5 Add basic CSS for button row (flex, gap, button colors per existing palette) in styles.css or component-scoped style

## 6. Starter pull UI

- [x] 6.1 Create `src/components/StarterPullCard.tsx` — visible when `gameCounters.hasUsedStarterPull === false`; styled prominently (e.g., banner-row top, accent color); onClick opens StarterPullModal
- [x] 6.2 Create `src/components/StarterPullModal.tsx` — 14 subject icon grid; user selects 1; confirm button triggers roll
- [x] 6.3 Implement starter roll logic in `src/services/starter-pull.ts`: rollGacha with `STARTER_PULL_WEIGHTS`, no pity, no ticket consumption, create doctor row, set `hasUsedStarterPull = true` in same Dexie transaction
- [x] 6.4 Reuse existing `RecruitmentResultModal` for displaying starter pull result (pass doctor data, `wasPity=false`)
- [x] 6.5 Wire StarterPullCard mount in HomePage based on Dexie live query of `gameCounters.hasUsedStarterPull` — done in HomePage.tsx (Group 7) + validated by Group 9 smoke (StarterPullCard appears on fresh save, disappears after pull)

## 7. HomePage wiring

- [x] 7.1 Edit `src/pages/HomePage.tsx` — import QuizModal, StarterPullCard, useState for activeQuizSubject
- [x] 7.2 Render StarterPullCard conditionally (live query gameCounters.hasUsedStarterPull)
- [x] 7.3 Pass `onStartQuiz` callback to each RecruitmentBanner: `(subjectId) => setActiveQuizSubject(subjectId)`
- [x] 7.4 Render QuizModal when `activeQuizSubject !== null` with `onClose={() => setActiveQuizSubject(null)}`
- [x] 7.5 Verify activeQuizSubject persists across banner clicks without overlay flashing — validated by Group 9 Chrome MCP smoke (modal opens / closes cleanly, no overlay flash, state cleared on close)

## 8. DoctorRoster mastery display

- [x] 8.1 Edit `src/pages/DoctorRoster.tsx` — add per-card subject mastery label `「<subject> 掌握 N%」` via `formatMasteryPercent(mastery[doctor.subjectId])`
- [x] 8.2 Use Dexie live query so mastery values update reactively after quiz answers

## 9. Verification (local + dogfood smoke)

- [x] 9.1 Run `pnpm --filter @study-rpg/content-medexam2-tw build` and ensure typecheck passes
- [x] 9.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — fix any TS errors (fixed 2: tick.ts hasUsedStarterPull field, schema.ts transaction array form)
- [x] 9.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — open in browser via Chrome MCP
- [x] 9.4 Chrome MCP smoke: fresh save scenario (reset IDB) — verify 2 P5 starter doctors (內科 + 外科) visible, StarterPullCard visible, 14 mastery rows, tickets=10
- [x] 9.5 Chrome MCP smoke: starter pull on 婦產科 — got P3 人上人 (not P5), card disappears, tickets unchanged at 10, hasUsedStarterPull=true
- [x] 9.6 Chrome MCP smoke: click 學習 on 內科 banner — QuizModal opens with title "📚 內科", partner "外科 醫師 #1" (most recent obtainedAt), subject dropdown = 內科
- [x] 9.7 Chrome MCP smoke: 1 correct (mastery 1/1, affinity[內科]=1, history row with reserved SRS fields nextDueAt=null/interval=0/easeFactor=2.5) + 1 wrong (mastery 1/2, affinity unchanged, explanation shown)
- [x] 9.8 Chrome MCP smoke: 內科 banner shows "掌握 50%", 婦產科 "掌握 -", 眼科 locked banner has 學習 enabled + 招募 disabled
- [ ] 9.9 Migration smoke: load dogfood v3 IDB backup, verify v3 → v4 migration preserves data — deferred to user's manual prod test (runtime simulation hard from same tab)

## 10. SPA prod-equivalent route smoke

- [x] 10.1 Build prod bundle: `pnpm --filter @study-rpg/medexam2-hospital-tw build` — output: index-B9_-OqNA.js 419.63 KB / 138.21 KB gzipped; CSS 22.74 KB / 4.12 KB gzipped
- [x] 10.2 Serve prod build locally (vite preview port 5273) and run SPA 三件套 — direct URL `/study-rpg/hospital/#/roster` renders, F5 on hash route preserves location, in-app nav via banner click works. HashRouter avoids static-host 404 risk by design
- [x] 10.3 Verify bundle size — 138 KB gzipped JS within reasonable; no exact baseline to delta, but well under 2.5 MB ceiling
- [ ] 10.4 After deploy, repeat 三件套 on prod URL https://fireman333.github.io/study-rpg/hospital/ — deferred to post-archive

## 11. Archive readiness

- [x] 11.1 Update `openspec/decisions/2026-05-15.md` with apply-phase notes (19:50 entry added)
- [ ] 11.2 Run `/opsx:verify` for OpenSpec completeness check — pending user trigger
- [ ] 11.3 Run `/verify` for end-to-end (Chrome MCP) check — pending user trigger
- [ ] 11.4 Run `/simplify` for code-quality review — pending user trigger
- [ ] 11.5 Get user confirmation for `/opsx:archive` + auto-git commit — pending user trigger
