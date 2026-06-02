## Why

21 figure-dependent exam questions (病理 / 解剖 / 生化 / 生理 / 組織) in neurons-tw reference an image in their stem ("圖示為…", "如圖", "附圖", "下圖黑色陰影區域…") but render as **text only** — the figure is missing entirely, so these questions are effectively unanswerable. neurons-tw has no image pipeline at all: the `Question.imagePath` contract field exists but is never populated, and QuizModal renders the stem as plain text with no figure and no placeholder. The source figures already live in the owner's local exam PDFs; we just need a pipeline to extract, host, wire, and render them.

## What Changes

- **Extract 21 figures** from the source exam PDFs (`~/Desktop/國考/一階國考/陽明國考考古/*.pdf`) and commit them as `<question-id>.png`, co-located in the content package so the build is the single source of truth for which questions have figures.
- **Build injects `imagePath`**: `packages/content-neurons-tw/scripts/build.ts` auto-sets `imagePath` for every question whose figure file exists; `copy-content.mjs` copies the figures directory into `apps/neurons-tw/public/`.
- **Correct one mis-flagged question**: `110-2-醫學二-病理學-Q97` (睪丸切除手術標本) is currently `hasImage: false` despite its stem referencing a figure — corrected to `true` so it joins the pipeline.
- **QuizModal renders the figure**: when `imagePath` is set, render the `<img>` (prepending `BASE_URL`); when `hasImage` is true but `imagePath` is absent, render a `[圖]` fallback placeholder instead of silently dropping the figure.
- **Attribution + takedown**: record the 21 figures' provenance (exam year / session / source) in `CREDITS`, under the project's existing CC-BY-NC + 24h-takedown posture.

## Capabilities

### New Capabilities
- `neurons-question-figures`: the end-to-end figure path for neurons-tw — build-time detection of co-located figure assets, `imagePath` injection into `questions.json`, asset copy into the app's public dir, and in-quiz rendering of the figure with a `[圖]` fallback when an expected figure is absent.

### Modified Capabilities
<!-- None. `imagePath` is already part of the content-pack contract (packages/core types); this change populates it for neurons-tw without altering the contract. Figure rendering is owned by the new capability rather than amending quiz-runner. -->

## Impact

- **Scope**: neurons-tw (M_3rd track) only. **Out of scope**: 一階 medexam-tw (maintenance mode, different worktree / main branch; track-neurons→main merge currently paused for a parallel session), `hasOptionImages` questions, and any image OCR/processing beyond crop/extract.
- **Code**:
  - `packages/content-neurons-tw/figures/<id>.png` (new asset directory, 21 files)
  - `packages/content-neurons-tw/scripts/build.ts` (set `imagePath`; fix `110-2-醫學二-病理學-Q97` hasImage)
  - `packages/content-neurons-tw/scripts/copy-content.mjs` (copy figures dir → public)
  - `apps/neurons-tw/src/components/QuizModal.tsx` (figure `<img>` + `[圖]` fallback)
  - `apps/neurons-tw/public/content/neurons-tw/questions.json` + `figures/` (build outputs)
  - `CREDITS` (figure attribution + takedown note)
- **Data / contract**: no `@study-rpg/core` type change (`imagePath` already exists). `questions.json` gains populated `imagePath` strings for 21 questions; one `hasImage` flag flips false→true.
- **No backend / sync / Dexie impact**: figures are static public assets; nothing touches R2, leaderboard, or IndexedDB schema.
