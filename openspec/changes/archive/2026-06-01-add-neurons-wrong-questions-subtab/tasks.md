## 1. Dexie schema (v9) + types

- [x] 1.1 Add `QuestionHistoryRow` interface to `apps/neurons-tw/src/lib/db.ts` (`{ questionId, family, lastResult: 'correct'|'wrong', everWrong: boolean, lastAnsweredAt: number, updatedAt: number }`) + declare `questionHistory!: EntityTable<QuestionHistoryRow, 'questionId'>`
- [x] 1.2 Add `this.version(9).stores({ ...v8 tables, questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt' })` — additive, no PK change. `everWrong` is omitted from the index (IndexedDB cannot index booleans; the 歷史曾錯 tab filters in JS)
- [x] 1.3 Add `db-v8-to-v9-migration.test.ts` upgrade fixture (seed v8 via literal `.version(8).stores(`, write a bookmark + flag, reopen at v9, assert no `DatabaseClosedError` + bookmarks/flags intact + `questionHistory` empty) — required by `pnpm lint:dexie-fixtures`

## 2. Recording service

- [x] 2.1 Create `apps/neurons-tw/src/lib/services/question-history.ts` with `recordQuestionResult(questionId: string, family: string, isCorrect: boolean)` implementing monotonic-OR `everWrong` (`(prev?.everWrong ?? false) || !isCorrect`) + LWW `lastResult`/`lastAnsweredAt`/`updatedAt = Date.now()`
- [x] 2.2 Add a single `useQuestionHistory()` live-query hook (full table, sorted by `lastAnsweredAt` desc, mirroring `useAllBookmarks`); BookmarksPage derives 目前未答對 (`lastResult==='wrong'`) + 歷史曾錯 (`everWrong===true`) from this one subscription (consolidated during /simplify to avoid two subscriptions on the same query)
- [x] 2.3 Wire `QuizModal.handlePick` (`apps/neurons-tw/src/components/QuizModal.tsx`) to `await recordQuestionResult(q.id, q.subject, isCorrect)` after the existing `recordCorrectAnswer`/`recordIncorrectAnswer` await, wrapped in its own try/catch logging `[question-history]`

## 3. R2 sync adapter

- [x] 3.1 Add `questionHistoryAdapter` to `apps/neurons-tw/src/lib/sync/tables.ts`: snapshot = `db.questionHistory.toArray()`; apply = per-row merge with `everWrong = (local?.everWrong ?? false) || incoming.everWrong`, other fields LWW by max `lastAnsweredAt`, `updatedAt = max(...)`. Add inline comment "MONOTONIC-OR — DO NOT replace with LWW" (mirror `dmnEventLogAdapter`)
- [x] 3.2 Register `questionHistoryAdapter` in `NEURONS_ADAPTERS`
- [x] 3.3 Bump `SCHEMA_VERSION` 4 → 5 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` + add v5 line to the SCHEMA_VERSION history comment
- [x] 3.4 Add `question-history-merge.test.ts` locking: (a) local correct-after-wrong keeps everWrong; (b) stale incoming correct row does NOT clear everWrong; (c) newer incoming correct adopts lastResult but keeps everWrong; (d) bundle round-trip preserves everWrong

## 4. `/bookmarks` three-tab UI

- [x] 4.1 Add pure helper `apps/neurons-tw/src/lib/wrong-answer-filter.ts`: `parseExamYear(id)` (split `-`, validate `/^\d+$/`, else `'unknown'`) + a shared `matchesFilter(row, { excludedFamilies, selectedYears, easyOnly, guessedOnly }, flagMap)` predicate + unit test
- [x] 4.2 Refactor `apps/neurons-tw/src/routes/BookmarksPage.tsx` into a tabbed container: header → shared filter bar → tab strip (手動收藏 / 目前未答對 / 歷史曾錯, default 手動收藏 via local `useState`) → active list
- [x] 4.3 Add exam-year chip set to the shared filter bar (distinct years across relevant rows, descending) alongside existing family + flag chips; all three chip groups apply to all tabs
- [x] 4.4 Render 手動收藏 list with existing per-row actions unchanged (🎯 重新作答 / ★ 取消)
- [x] 4.5 Render 目前未答對 + 歷史曾錯 as display-only rows (family badge + parsed year + truncated stem + relative `lastAnsweredAt`), reuse 200-row cap + empty-state styling; no inline action buttons
- [x] 4.6 Per-tab empty states (no wrong answers yet / nothing matches current filter)

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green (db-v9 + merge + filter tests)
- [x] 5.2 `pnpm --filter @study-rpg/core build && pnpm -r typecheck` clean; `pnpm lint:dexie-fixtures` passes
- [x] 5.3 Chrome MCP end-to-end smoke on dev: answer a question wrong → appears in 目前未答對 + 歷史曾錯; answer it right → leaves 目前未答對, stays 歷史曾錯; family + year + flag filters apply across all three tabs; console clean
- [x] 5.4 `pnpm --filter @study-rpg/neurons-tw build` (prod Vite + TS strict) passes
