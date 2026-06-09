## 1. Extract QuestionFigure (non-behavioral refactor)

- [x] 1.1 Create `apps/neurons-tw/src/components/QuestionFigure.tsx` — move the local `QuestionFigure` function + its `figureWrapStyle` / `figureImgStyle` / `figurePlaceholderStyle` consts out of `QuizModal.tsx`; export the component.
- [x] 1.2 In `QuizModal.tsx`, delete the moved definitions and `import { QuestionFigure } from './QuestionFigure'`. Confirm the current-question `<QuestionFigure key={q.id} q={q} />` at the stem still renders.

## 2. By-id loader + PrecedingContext

- [x] 2.1 Create `apps/neurons-tw/src/lib/services/continuation-context.ts`: a module-memoized `loadQuestionsByIdMap(): Promise<ReadonlyMap<string, Question>>` that calls `getContentPack(\`${import.meta.env.BASE_URL}content/neurons-tw\`)` once (cache the promise) and returns `new Map(pack.questions.map(q => [q.id, q]))`.
- [x] 2.2 Create `apps/neurons-tw/src/components/PrecedingContext.tsx`: takes `{ question }`; import `isContinuationQuestion` / `resolvePrecedingChain` from `@study-rpg/core` and `loadQuestionsByIdMap` from the new service. On a continuation question, load the by-id map and set the resolved chain; clear it for ordinary questions; render `null` when the chain is empty. Render a "承上題・前文情境" box (inline styles, neurons idiom): per preceding item show id + stem; if the item has an image, reuse `<QuestionFigure q={item} />` (single-item chain shows image by default, longer chains behind a 顯示圖片 toggle).

## 3. Wire into the quiz

- [x] 3.1 In `QuizModal.tsx`, mount `<PrecedingContext question={q} />` inside the `bodyStyle` container, immediately above `<p style={stemStyle}>{q.stem}</p>`.

## 4. Regression test (node-env, reads real corpus)

- [x] 4.1 Add `apps/neurons-tw/src/__tests__/continuation-corpus.test.ts` (or sibling of existing tests): read `public/content/neurons-tw/questions.json` via `fs`, build a by-id map, and assert with the core helpers that the count of 承上題 ≥ 1, that at least 11 resolve a non-empty chain, and that the known orphan `105-2-醫學二-病理學-Q75` resolves to an empty chain. (Reads the live file so it self-reports drift instead of hard-pinning the total.)
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw test` → green.

## 5. Verify (no deploy)

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + `pnpm -r typecheck` → exit 0.
- [x] 5.2 Chrome MCP boot smoke on the dev server: home renders, start a quiz, answer a question, advance — no console errors; the current-question image still renders (QuestionFigure extraction regression check). Note that forcing a specific 承上題 in the random pool is non-deterministic, so the 承上題 box correctness is gated by task 4, not a live click.
