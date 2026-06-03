## 1. Figure extraction

- [x] 1.1 Write a local extraction helper (PyMuPDF) that, given a question id → maps to the source PDF (`~/Desktop/國考/一階國考/陽明國考考古/<年>-<場次>醫學(一|二).pdf`), searches for a stem fragment to locate the page, and renders a preview PNG of the candidate page(s) for visual verification. (NFKC-normalize both stem + page text to bridge the reconciled-corpus CJK-compat chars.)
- [x] 1.2 For each target id, visually verify the figure↔question match on the rendered page, then extract the figure to `packages/content-neurons-tw/figures/<id>.png` (native resolution; multi-image pages disambiguated by rect position = figure adjacent to the 題幹; 2 screenshot-style 詳解 figures cropped to drop stem/answer text). **19 extracted**.
- [x] 1.3 Confirm every extracted PNG visibly contains the expected figure (montage spot-check). **Findings:** (a) `111-2-醫學一-生理學-Q57` is a FALSE POSITIVE — pure ECG-concept question, no stem figure reference, flagged only by the unreliable `**有附圖**：是` marker → set `hasImage:false`, no figure. (b) `111-1-醫學一-解剖學-Q29` dermatome figure is OMITTED from the only available 詳解 source → no figure extracted; `hasImage` stays true → `[圖]` fallback.

## 2. Build pipeline

- [x] 2.1 In `packages/content-neurons-tw/scripts/build.ts`: read the `figures/` directory once; for every output question whose `<id>.png` exists, set `imagePath = content/neurons-tw/figures/<id>.png` and force `hasImage = true`. Also force `hasImage:false` for the `FALSE_POSITIVE_HASIMAGE` set (`111-2-醫學一-生理學-Q57`).
- [x] 2.2 In `build.ts`: copy `figures/*.png` into `dist/figures/`, and add a counter log line (figures wired / copied / flagged-without-figure).
- [x] 2.3 In `apps/neurons-tw/scripts/copy-content.mjs`: copy `dist/figures/*` → `apps/neurons-tw/public/content/neurons-tw/figures/` (create dir if absent).
- [x] 2.4 Ran `pnpm --filter @study-rpg/content-neurons-tw build`: 19 figures wired, `110-2-...-Q97` flipped false→true, `111-2-...-Q57` flipped true→false, `111-1-...-Q29` kept hasImage:true with no imagePath (fallback). dist/figures has 19 PNGs.

## 3. Frontend rendering

- [x] 3.1 In `apps/neurons-tw/src/components/QuizModal.tsx`: added inline `QuestionFigure` component (rendered after the stem with `key={q.id}`) that shows `<img src={`${import.meta.env.BASE_URL}${q.imagePath}`}` constrained to `maxHeight:340px / objectFit:contain` so it doesn't dominate the modal.
- [x] 3.2 `QuestionFigure` has an `onError` handler that swaps to the `[圖]` placeholder, and renders the `[圖]` placeholder directly when `q.hasImage` is true but `q.imagePath` is unset.
- [x] 3.3 Attribution unaffected — the 陽明國考考古題小組 + 考選部 credits render on `OverviewPage.tsx` via the content pack `credits` array (neurons-tw surfaces it there, not per-card); the figure change adds a block and removes nothing.

## 4. Attribution

- [x] 4.1 Created `packages/content-neurons-tw/CREDITS.md` (none existed): question-figures section lists all 19 published figures' provenance (id = year/session/醫學一or二/subject/Q-number) + CC-BY-NC + 24h takedown + the two known gaps (111-1 Q29 unavailable, 111-2 Q57 false-positive cleared).

## 5. Verification

- [x] 5.1 `predev` (content build + copy-content) ran clean; 19 figures present under `apps/neurons-tw/public/content/neurons-tw/figures/`. Dev server booted (vite 5175).
- [x] 5.2 `pnpm -r typecheck` clean across all 11 packages/apps (content-neurons-tw + neurons-tw included).
- [x] 5.3 Chrome MCP smoke on running dev app: (a) console clean on boot; (b) the served `questions.json` has 19 `imagePath` set, only `111-1-...-Q29` flagged-without-path, `111-2-...-Q57` hasImage:false; (c) the exact URL the `<img>` builds (`${BASE_URL}${imagePath}`) loads a valid image for `106-1 Q92` (904×669) + both crops `110-2 Q97` (930×485) / `Q100` (905×289); (d) visual artifact: figure `108-1 Q94` served correctly at the component path. Reaching a specific figure question through the shuffled 3200-pool quiz UI was impractical (figures ≈0.5% of corpus + heavy connectome re-render), but render inputs (data + asset + URL) are all verified and the render condition `imagePath && !error → <img>` is logically guaranteed.
