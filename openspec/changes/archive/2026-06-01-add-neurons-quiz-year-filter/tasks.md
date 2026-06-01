## 1. Year-filter service

- [x] 1.1 Create `apps/neurons-tw/src/lib/services/year-filter.ts`: `YEAR_FILTER_META_KEY='quiz.yearFilter'`, `ALL_YEARS=[106..114]`, `getYearFilter()` (read `db.meta`, `JSON.parse`, filter to valid years, return `null` on no-row/parse-error/non-array), `setYearFilter(years)` (`JSON.stringify` into `meta.value`), `effectiveYearSet(persisted)` (null/[]→`new Set(ALL_YEARS)`)
- [x] 1.2 Add `apps/neurons-tw/src/__tests__/year-filter.test.ts`: effectiveYearSet boundaries (null / [] / subset / full), getYearFilter corrupt-value → null, round-trip persist, and a pool-gate filter assertion (family + year)

## 2. YearFilterBar component

- [x] 2.1 Create `apps/neurons-tw/src/components/YearFilterBar.tsx`: `useLiveQuery(getYearFilter)` → `effectiveYearSet`; 「全部」 chip (select-all) + one chip per year 106–114 (single row, no pager); toggle calls `setYearFilter`; inline-styled to match OverviewPage pixel aesthetic (reuse BookmarksPage chip-style pattern), NOT 二階's `.filter-bar` CSS
- [x] 2.2 Show effective count (e.g. `X / 9 年`) and `aria-pressed` per chip for a11y

## 3. Wire pool gate into OverviewPage

- [x] 3.1 In `apps/neurons-tw/src/routes/OverviewPage.tsx`, add `const persistedYears = useLiveQuery(getYearFilter, [], null)` and fold the year filter into the `quizPool` memo: after `filterPoolByFamily(...)`, `.filter(q => yearSet.has(q.meta.year))` where `yearSet = effectiveYearSet(persistedYears)`; short-circuit when `yearSet.size === ALL_YEARS.length`
- [x] 3.2 Mount `<YearFilterBar />` in the CTA toolbar section (separate row below the reading / 🎲 buttons); update the 🎲 button's count to reflect the year-filtered total pool size
- [x] 3.3 Confirm both paths gated: 🎲 random (`quizEntry === null`) and per-family card (`quizEntry === familyId`) both flow through the same `quizPool`

## 4. QuizModal empty-state differentiation

- [x] 4.1 In `apps/neurons-tw/src/components/QuizModal.tsx`, when the incoming `pool.length === 0`, render a plain text empty state (「所選年份下這科沒題目」) + close, distinct from the normal 「答完」 completion wording

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green (year-filter unit tests + existing suite)
- [x] 5.2 `pnpm --filter @study-rpg/core build && pnpm -r typecheck` clean; `pnpm lint:dexie-fixtures` still OK (no schema change expected)
- [x] 5.3 Chrome MCP dev smoke: select year 114 only → 🎲 count drops; launch random → only 114 questions; launch a family → only that subject × 114; deselect to a 0-cell (force via a sparse combo) → QuizModal empty state; reload → selection persisted; `/bookmarks` year chips unaffected; console clean
- [x] 5.4 `pnpm --filter @study-rpg/neurons-tw build` (prod Vite + TS strict) passes
