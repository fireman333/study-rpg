## Context

neurons-tw rebuilds its corpus from baked artifacts (`packages/content-neurons-tw/data/medexam-reconciled/`) via `scripts/build.ts`, which passes questions through (plus the 微生物暨免疫學 split) and writes `dist/{meta,subjects,questions}.json`. The app's `scripts/copy-content.mjs` then copies those three JSONs into `apps/neurons-tw/public/content/neurons-tw/`, and `App.tsx` loads them with `getContentPack(`${import.meta.env.BASE_URL}content/neurons-tw`)`. `Question.imagePath` exists in `@study-rpg/core` types ("relative path under app's /public; prepend BASE_URL at render") but is never populated; `QuizModal.tsx:253` renders the stem as plain text with no figure handling.

21 questions reference a figure in their stem but have no image. The figures exist in the owner's local exam PDFs (`~/Desktop/國考/一階國考/陽明國考考古/<年>-<場次>醫學(一|二).pdf`, 106–114). PyMuPDF 1.27.2 is available locally; embedded images are locatable by xref + bounding box.

## Goals / Non-Goals

**Goals:**
- The 21 figure-dependent neurons-tw questions render their actual figure during quiz.
- A repeatable, low-ceremony figure path: drop `<id>.png` into the content package → build wires it automatically → app renders it.
- A `[圖]` fallback so a figure that is flagged but missing is visible (never silently dropped).
- Correct the one mis-flagged question (`110-2-醫學二-病理學-Q97`).
- Figure provenance recorded for attribution + takedown.

**Non-Goals:**
- 一階 medexam-tw (maintenance mode, different worktree; track-neurons→main merge paused).
- `hasOptionImages` questions (options that are images) — separate concern.
- Any image OCR, redrawing, or enhancement beyond crop/extract from the source PDF.
- Cloud sync / Dexie / backend impact — figures are static public assets.

## Decisions

### D1 — Figures co-located in the content package; flow dist → public (mirror JSON)
Commit figures at `packages/content-neurons-tw/figures/<question-id>.png`. `build.ts` copies them into `dist/figures/`; `copy-content.mjs` copies `dist/figures/*` → `apps/neurons-tw/public/content/neurons-tw/figures/`. This makes the build the single source of truth (the same package that emits `questions.json` owns the figures) and mirrors the existing `dist → public` JSON flow rather than inventing a parallel asset path.
- *Alternative rejected*: figures directly in `apps/neurons-tw/public/...`. Then the build (which runs in the content package) can't see them to set `imagePath`, forcing a separate manifest. More moving parts, easy to desync.

### D2 — `imagePath` value + render contract
`imagePath = "content/neurons-tw/figures/<id>.png"` (no leading slash). QuizModal renders `src={`${import.meta.env.BASE_URL}${q.imagePath}`}`. `BASE_URL` ends with `/` (Vite), so this resolves to `/neurons/content/neurons-tw/figures/<id>.png` in prod and `/content/...` in dev — exactly parallel to how `questions.json` itself is fetched (`${BASE_URL}content/neurons-tw/...`). This matches the `@study-rpg/core` type doc verbatim, so **no core type change**.

### D3 — Figure existence drives `imagePath` AND `hasImage` (no hardcoded id list)
In `build.ts`, read the `figures/` directory once; for every output question whose `<id>.png` exists, set `imagePath` and force `hasImage = true`. This is self-documenting (presence of the file IS the flag) and, as a free consequence, **corrects `110-2-醫學二-病理學-Q97`**: once its extracted figure file exists, the build flips its `hasImage` to true with zero special-case code. The build also logs the figure count (imported figures / questions still flagged-without-figure) per the No-Silent-Errors principle.
- *Alternative rejected*: a hardcoded id→file map or a `figures.json` manifest. Extra artifact to keep in sync with the actual files; the filesystem already encodes the mapping.
- **Refinement (found during extraction)**: one flagged question — `111-2-醫學一-生理學-Q57` — turned out to be a *false positive* (a pure ECG-concept question with no stem figure reference; flagged only by the unreliable `**有附圖**：是` source marker). Since figure-existence can only *add* `hasImage`, clearing a bad upstream flag needs an explicit override: a small `FALSE_POSITIVE_HASIMAGE` set forces `hasImage = false` for such ids. This is the one place a hardcoded id is justified — there is no file whose absence could encode "this flag is wrong."

### D4 — Per-question extraction with mandatory visual verification
For each of the 21 questions: locate the page in the matching PDF by searching for a robust stem fragment (latin terms / numbers / distinctive CJK), render the page to a preview PNG, **visually confirm** which embedded image belongs to that question number, then extract that image (by xref at native resolution, cropping the region if the figure is a composite). With only 21 figures, per-figure human verification is affordable and is the only way to guarantee the right figure lands on the right medical question.
- *Alternative rejected*: bulk auto-extract every embedded image and auto-map by page proximity. Figure↔question mismatch risk is unacceptable for medical content (a wrong pathology slide on a diagnosis question is worse than no figure).

### D5 — `[圖]` fallback, never a silent drop
QuizModal: `imagePath` present → `<img>`; else `hasImage` true but no `imagePath` → a visible `[圖]` placeholder block. This lets the pipeline ship incrementally (if any single figure can't be cleanly extracted, the question still signals "a figure exists but is unavailable" instead of looking like a complete text question) and upholds the No-Silent-Errors principle.

## Risks / Trade-offs

- **Wrong figure matched to a question** → D4 per-question visual verification (render page, read Q-number + stem + figure together) before extracting.
- **PDF text search misses** (reconciled stem text ≠ OCR'd PDF text, fancy unicode) → search by robust fragments (numbers, latin terms like "Lineweaver", "chromogranin") and fall back to manual page browsing of the subject section; the page count per PDF is bounded.
- **Figure image quality** (some PDFs are scans / low-res embeds) → extract at native embedded resolution; acceptable for a study-reference figure. No upscaling.
- **Copyright** (some pathology/histology figures originate from third-party atlases) → owner has decided 全放 (route 2): CC-BY-NC + attribution in CREDITS + 24h takedown SLA, consistent with the project's existing posture for the 3600 hosted questions. Marginal risk unchanged by ~21 same-nature figures.
- **`<img>` layout shift / broken src** → fixed-aspect container + `onError` falls back to the `[圖]` placeholder so a missing/renamed file degrades gracefully.

## Migration Plan

Additive only — no data migration. Deploy = normal build (`prebuild` runs the content build + copy). Rollback = delete `packages/content-neurons-tw/figures/`, revert `build.ts` / `copy-content.mjs` / `QuizModal.tsx`; `imagePath` simply returns to unset and questions revert to the prior text-only behaviour (now with the `[圖]` placeholder still showing for flagged questions, which is strictly better than before).

## Open Questions

None blocking — copyright posture and scope (neurons-tw only) are resolved.
