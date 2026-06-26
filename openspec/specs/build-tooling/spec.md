# build-tooling Specification

## Purpose
TBD - created by archiving change fix-tsc-noemit. Update Purpose after archive.
## Requirements
### Requirement: Production build does not pollute source directories

Running the app's production build script SHALL NOT leave transpiled JavaScript, declaration files, or TypeScript incremental-build artifacts inside any `src/` directory or anywhere outside the designated `dist/` output.

The TypeScript compiler invocation in any app's build script MUST be configured to typecheck without emitting (`"noEmit": true` in the app's `tsconfig.json`, or `tsc --noEmit` in the script). Bundler emit (Vite, etc.) remains the sole producer of build output.

#### Scenario: Building leaves src/ clean

- **WHEN** `pnpm --filter <app> build` completes successfully for any app under `apps/`
- **THEN** `find apps/<app>/src -name "*.js"` SHALL return zero results
- **AND** `find apps/<app>/src -name "*.d.ts"` SHALL return zero results
- **AND** no `tsconfig.tsbuildinfo` file SHALL be created at the app root or inside `src/`
- **AND** `apps/<app>/dist/` SHALL contain the Vite-emitted bundle (`index.html` + `assets/`)

#### Scenario: Type errors still fail the build

- **WHEN** an app's source file contains a TypeScript error and `pnpm --filter <app> build` is run
- **THEN** the build SHALL exit non-zero before Vite emits any bundle
- **AND** the error message SHALL identify the offending file and line

### Requirement: Build prints imported / skipped / total counter

At the end of every build run, the script SHALL print three line-aligned numbers summarizing parse outcomes:

- `imported`: number of questions successfully written into `dist/questions.json`
- `skipped`: number of `## Q<n>` blocks the parser rejected (missing required section, options-not-parseable, answer-not-parseable, or any other parser warning)
- `total`: `imported + skipped` (i.e., total `## Q<n>` blocks encountered across all source `.md` files matching the active subject filter)

The script MUST exit non-zero if `skipped > 0` AND the user did not opt in via `MEDEXAM_ALLOW_SKIPS=1` (so silent loss of questions is impossible).

Per-skip details (which file, which Q-number, what reason) MAY remain on `console.warn` as they already do — but the aggregate three-number summary is the contract.

#### Scenario: Clean build prints zero skipped

- **WHEN** the build runs against source files that all parse cleanly
- **THEN** stdout SHALL contain a line matching `imported: <N>, skipped: 0, total: <N>` (or equivalent visually-aligned format)
- **AND** the script SHALL exit 0

#### Scenario: Skipped questions fail the build by default

- **WHEN** the build encounters one or more unparseable Q-blocks and `MEDEXAM_ALLOW_SKIPS` is unset
- **THEN** stdout SHALL print the three-number summary showing `skipped > 0`
- **AND** the script SHALL exit non-zero
- **AND** the error message SHALL direct the user to fix the source or re-run with `MEDEXAM_ALLOW_SKIPS=1`

#### Scenario: Opt-in allows non-fatal skips

- **WHEN** the build encounters unparseable blocks and `MEDEXAM_ALLOW_SKIPS=1` is set
- **THEN** the three-number summary SHALL still print
- **AND** the script SHALL exit 0 even with `skipped > 0`

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

### Requirement: Deploy file-count preflight

Before a figure-bearing deploy, the build/deploy step SHALL measure the **total** built-app static file count (not just the newly added figures) and confirm it stays within the Cloudflare Pages limit for the project's plan (Free = 20,000 files; per-file ≤ 25 MiB), failing fast if it would exceed. The same preflight SHALL govern the full-scale follow-up.

#### Scenario: Deploy aborts if total file count would exceed the limit

- **WHEN** a figure-bearing build would push the total static file count over the plan's limit
- **THEN** the deploy step SHALL fail with the measured count rather than ship a truncated/failed deployment
