## 1. Schema + types (Dexie v14 → v15)

- [x] 1.1 Extend `QuestionHistoryRow` (apps/neurons-tw/src/lib/db.ts) with `interval: number`, `easeFactor: number`, `nextDueAt: number | null`, `attempts: number`, `correctCount: number`
- [x] 1.2 Add `this.version(15)` with `questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt'` (additive — keep PK `questionId`, all other stores unchanged)
- [x] 1.3 v15 upgrade callback: backfill rows where `lastResult === 'wrong'` → `nextDueAt = now`, `interval = STANDARD_INITIAL_INTERVALS[0]`, `easeFactor = DEFAULT_EASE`; leave `lastResult === 'correct'` rows with `nextDueAt = null`; default new counters (`attempts`/`correctCount`) from existing data where derivable else 0
- [x] 1.4 v14→v15 upgrade fixture test `apps/neurons-tw/src/__tests__/db-v14-to-v15-migration.test.ts` (literal `.version(14).stores(`; seed a wrong row + a correct row at v14, open at v15, assert wrong→due / correct→null) — satisfies `dexie-fixture-lint.yml`

## 2. SRS scheduling (engine wiring)

- [x] 2.1 New `apps/neurons-tw/src/lib/services/srs-scheduler.ts`: `getNextDueCardForFamily(familyId, consumedIds, now, { yearFilter })`, `getDueQueueAllFamilies(now)`, `dueCountByFamily(now)` — built on `questionHistory.nextDueAt <= now`, oldest-due-first, exclude `hasOptionImages` + year-filtered, cap `SRS_DAILY_CAP`
- [x] 2.2 Extend `apps/neurons-tw/src/lib/services/question-history.ts`: after recording result, upsert SRS fields via `reviewCardBinary({ correct, prev, now })` reading prev `{interval, easeFactor, nextDueAt}` off the existing row; best-effort try/catch logging `[srs]` channel
- [x] 2.3 Unit tests: `srs-scheduler` due selection + oldest-first + `SRS_DAILY_CAP` cap; `reviewCardBinary` integration (correct lengthens, wrong sets near-term `nextDueAt`)

## 3. Pool selection

- [x] 3.1 Add `filterPoolByNewOnly(pool, historyRows)` to `apps/neurons-tw/src/lib/services/quiz-pool.ts` — keep only questions with no `questionHistory` row
- [x] 3.2 Unit test `filterPoolByNewOnly` (composes with `filterPoolByFamily` + `filterPoolByYear`)

## 4. QuizModal wiring

- [x] 4.1 Add `mode: 'fresh' | 'review'` prop to `apps/neurons-tw/src/components/QuizModal.tsx`; review-mode consumes the srs-scheduler due queue (due-first), fresh-mode consumes the new-only pool
- [x] 4.2 In `handlePick`, after existing `recordCorrectAnswer/recordIncorrectAnswer` + `recordQuestionResult`, capture prevSrs (pre-answer) and trigger the §2.2 SRS upsert (every mode)
- [x] 4.3 (D7 — confirm at GATE 1) Render ✨「太簡單」/🤔「我亂猜的」 after a correct reveal; wire to `reviewCardBinaryEasy` (clears `everWrong`) / `reviewCardBinaryGuessed` (preserves `everWrong`); three-state apply/restore using the persisted `questionFlags` service
- [x] 4.4 Unit test: ✨/🤔 modifier application + restore-default snapshot

## 5. FamilyPicker + OverviewPage UI

- [x] 5.1 `apps/neurons-tw/src/components/FamilyPicker.tsx`: replace the single 🎯 答題 button per `FamilyCard` with two chips [🆕 新題 (unseen-count badge)] + [🔄 錯題 (due-count badge)]; disable 新題 when unseen=0 (「全部答過」), disable 錯題 when due=0 (「今日無到期」)
- [x] 5.2 `apps/neurons-tw/src/routes/OverviewPage.tsx`: extend `quizEntry` to `{ familyId: string; mode: 'fresh' | 'review' } | null | undefined` (null = 🎲 random unchanged, undefined = closed); build `quizPool` per mode (fresh → `filterPoolByNewOnly`; review → srs due queue); keep year-filter compose; pass `mode` to QuizModal
- [x] 5.3 Wire per-family unseen-count + due-count (liveQuery on `questionHistory`, group by family) into FamilyPicker chip badges
- [x] 5.4 Confirm 🎲 cross-family random + ⚔️ 出征 CTAs behave exactly as before (no regression)

## 6. R2 sync

- [x] 6.1 Bump `SCHEMA_VERSION` 13 → 14 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (+ SCHEMA_VERSION history comment)
- [x] 6.2 Confirm the `questionHistory` R2 TableAdapter spreads the new SRS fields through under existing per-row LWW (no adapter rewrite expected; verify `everWrong` monotonic-OR untouched)
- [x] 6.3 Cross-version test: v13 client reads v14 bundle (drops SRS fields, no throw) + v14 client reads v13 bundle (defaults absent SRS fields)

## 7. Verification

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` green (incl. new §1.4 / §2.3 / §3.2 / §4.4 / §6.3)
- [x] 7.2 `pnpm -r typecheck` clean + `pnpm lint:dexie-fixtures` passes for v15
- [x] 7.3 Chrome MCP functional smoke (preflight `list_connected_browsers`): two chips render with correct counts; 新題 serves only never-seen; answer wrong → becomes due → appears under that family's 錯題; ✨/🤔 adjust schedule (if §4.3 kept)
- [x] 7.4 SPA 三件套 (in-app nav + direct `/` URL + F5) — homepage family chips intact under reload
