# Tasks — add-neurons-question-bank-search

## 1. Matching helpers (pure, exported for tests)

- [x] 1.1 `buildHaystack(q)` — `${id} ${stem} ${options} ${explanation ?? ''}` → NFKC → lowercase (tolerates missing explanation)
- [x] 1.2 `tokenizeSearchQuery(query)` — trim → NFKC → lowercase → split `/\s+/` → drop empties

## 2. Search state + filtering

- [x] 2.1 State: `searchInput` (controlled), `committedQuery` (debounced, drives filtering), `composingRef`
- [x] 2.2 `searchRows` useMemo (co-located `{q, haystack}` per question) + `searchTokens` useMemo
- [x] 2.3 Fold search into the existing `filtered` useMemo: AND with the 科別/年份/次別 chip predicates; keep a question only if every token is a substring of its haystack
- [x] 2.4 `searchMatchTotal` useMemo (search-only hit count, for the clear-filter hint)
- [x] 2.5 200ms debounce `useEffect` (skipped while `composingRef.current`); `committedQuery` added to the page-reset effect deps

## 3. UI (inline styles, cream/brown pixel aesthetic)

- [x] 3.1 Labeled search box above `filterBarStyle` — `type="text"`, aria-label, custom × clear button when input non-empty
- [x] 3.2 IME handlers: `onCompositionStart` sets the ref, `onCompositionEnd` clears it and commits immediately
- [x] 3.3 Filter-aware empty state (search-only vs search+chips wording, 清除搜尋 / 清除篩選 actions, clear-filter hint) replacing the plain empty `<p>`
- [x] 3.4 `aria-live="polite"` on the result-count chip; `hasChipFilter` / `hasFilter` split + `clearSearch` / `clearAllChipFilters` helpers

## 4. Verify

- [x] 4.1 `apps/neurons-tw/src/__tests__/question-bank-search.test.ts` (9 tests: NFKC fold ＳＯＤ１→sod1, token AND, id match, CJK substring, missing-explanation tolerance)
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; 664 vitest green (+9); build clean
- [x] 4.3 Live smoke (dev, navigate via 題庫 nav click): 「乙醯膽鹼」 4600→36; 「乙醯膽鹼 受體」 AND→20; +解剖學 chip→1; gibberish→0 + 清除搜尋; 「巴拉松」+藥理學 chip→0 + 「清除篩選後可找到 1 題」; 清除篩選 restores; zero console errors

## 5. Deploy (owner-gated)

- [ ] 5.1 Deploy the neurons app (Cloudflare Pages) via `pnpm run deploy:cf` from the deploy worktree `~/coding-scratch/study-rpg`
- [ ] 5.2 Prod Chrome MCP smoke on `med-study-rpg.com/neurons/bank`: keyword narrows count, gibberish → empty state, chip + search AND, clear restores; zero console errors
