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

### Requirement: Content build default subject scope

The `packages/content-medexam-tw` build script SHALL default to ingesting all subjects present in the source extraction folder when `MEDEXAM_SUBJECTS` environment variable is not set.

The script MUST still honor `MEDEXAM_SUBJECTS=<comma-separated-list>` for narrowing the build to specific subjects (developer fast-iterate use case).

The value `MEDEXAM_SUBJECTS=all` MUST remain accepted as an explicit synonym of the default (backward compatibility for existing CI / shell scripts).

#### Scenario: Default build ingests all subjects

- **WHEN** `pnpm --filter @study-rpg/content-medexam-tw build` is run with `MEDEXAM_SUBJECTS` unset
- **THEN** the resulting `dist/subjects.json` SHALL contain entries for every distinct `subject` value found in the source `.md` frontmatter
- **AND** the resulting `dist/questions.json` SHALL include questions from all of those subjects (not a single subject)

#### Scenario: Single-subject narrowing still works

- **WHEN** the build is run with `MEDEXAM_SUBJECTS=藥理學`
- **THEN** `dist/subjects.json` SHALL contain exactly one entry (`藥理學`)
- **AND** `dist/questions.json` SHALL contain only questions whose `subject` is `藥理學`

#### Scenario: Explicit `all` synonym still works

- **WHEN** the build is run with `MEDEXAM_SUBJECTS=all`
- **THEN** the output MUST be identical to running it with `MEDEXAM_SUBJECTS` unset

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
