## ADDED Requirements

### Requirement: Build wires explanation-figure assets from the content package

The neurons-content build (`packages/content-neurons-tw/scripts/build.ts` and the app's `copy-content.mjs`) SHALL treat the presence of an explanation-figure manifest + content-addressed asset files in the content package as the source of truth for a question's recovered figures: it SHALL **inject the figure `src` references onto the question as `explanationFigures` in the BUILT `questions.json`** from the manifest (mirroring the `explanationTableImages` tier; the **source** `questions.json` is never edited and figure image **bytes** are never embedded), copy the figure asset files into `dist/` and then into the app's `public/content/neurons-tw/explanation-figures/`, and emit a count of figures wired and of manifest references whose asset file is missing (**failing the build** if any are missing — no silent skip). Figure asset filenames SHALL be content-addressed (include a content hash) so a re-cropped figure changes its path and caches never serve a stale image.

#### Scenario: Build injects figure refs, copies assets, and emits counts

- **WHEN** the neurons-content build runs with an explanation-figure manifest + assets present
- **THEN** it SHALL inject `explanationFigures` onto the matching questions in the built `questions.json`, copy the figure assets into the published app asset path, and print the number of questions wired and the number of manifest references with a missing asset file

#### Scenario: Build fails on a missing backing asset

- **WHEN** a manifest `src` has no backing webp file
- **THEN** the build SHALL fail (non-zero) rather than ship a manifest reference with no asset

#### Scenario: Source corpus is untouched; no figure bytes in the payload

- **WHEN** the build produces `questions.json`
- **THEN** the SOURCE `questions.json` SHALL gain no figure field, and the BUILT `questions.json` SHALL carry `explanationFigures` `src` references but embed no figure image bytes

#### Scenario: Re-cropped figure gets a new content-addressed path

- **WHEN** a figure's pixels change between builds
- **THEN** its emitted asset filename (and manifest `src`) SHALL change via its content hash, so a CDN/browser cache cannot serve the old image under the same path

### Requirement: Deploy file-count preflight

Before a figure-bearing deploy, the build/deploy step SHALL measure the **total** built-app static file count (not just the newly added figures) and confirm it stays within the Cloudflare Pages limit for the project's plan (Free = 20,000 files; per-file ≤ 25 MiB), failing fast if it would exceed. The same preflight SHALL govern the full-scale follow-up.

#### Scenario: Deploy aborts if total file count would exceed the limit

- **WHEN** a figure-bearing build would push the total static file count over the plan's limit
- **THEN** the deploy step SHALL fail with the measured count rather than ship a truncated/failed deployment
