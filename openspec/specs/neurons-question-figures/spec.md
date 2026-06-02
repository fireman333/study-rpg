# neurons-question-figures Specification

## Purpose

End-to-end figure path for neurons-tw so figure-dependent exam questions show their image instead of rendering as text only. Figures are committed as `<question-id>.png` co-located in the content package (`packages/content-neurons-tw/figures/`); the build treats a figure file's existence as the source of truth — setting `imagePath` + forcing `hasImage` — copies them into the app's public dir, and `QuizModal` renders the `<img>` with a `[圖]` fallback so a flagged-but-unavailable figure is never silently dropped. A small explicit false-positive set clears bad upstream `hasImage` flags. Created by archiving change `add-neurons-question-figures` (19 figures from official 考選部 exam PDFs, CC-BY-NC + 24h takedown).

## Requirements

### Requirement: Build wires figures from co-located assets

The neurons-tw content build (`packages/content-neurons-tw/scripts/build.ts`) SHALL treat the presence of a figure file `figures/<question-id>.png` in the content package as the source of truth for that question's figure. For every output question whose figure file exists, the build SHALL set `imagePath` to `content/neurons-tw/figures/<question-id>.png` and SHALL force `hasImage` to `true`. The build SHALL also force `hasImage` to `false` for an explicit set of false-positive ids (questions whose upstream `hasImage` flag came from the unreliable `**有附圖**：是` source marker but whose stem references no figure). The build SHALL emit a count of figures wired and a count of questions still flagged `hasImage` without a figure file.

#### Scenario: Question with a co-located figure file

- **WHEN** the build runs and `packages/content-neurons-tw/figures/108-1-醫學二-病理學-Q94.png` exists
- **THEN** the built `questions.json` entry for `108-1-醫學二-病理學-Q94` has `imagePath` = `content/neurons-tw/figures/108-1-醫學二-病理學-Q94.png` and `hasImage` = `true`

#### Scenario: Previously mis-flagged question is corrected by its figure file

- **WHEN** the build runs and `packages/content-neurons-tw/figures/110-2-醫學二-病理學-Q97.png` exists
- **THEN** the built `questions.json` entry for `110-2-醫學二-病理學-Q97` has `hasImage` = `true` and a populated `imagePath`, even though the upstream reconciled corpus flagged it `hasImage` = `false`

#### Scenario: Question with no figure file is unchanged

- **WHEN** the build runs and no figure file exists for a given question id (and it is not in the false-positive set)
- **THEN** that question's `imagePath` remains unset and its upstream `hasImage` value is preserved

#### Scenario: False-positive flag is cleared

- **WHEN** the build runs and a question id is in the false-positive set (e.g. `111-2-醫學一-生理學-Q57`)
- **THEN** that question's `hasImage` is forced to `false` and no `imagePath` is set, so it shows neither a figure nor a `[圖]` placeholder

#### Scenario: Build reports figure wiring counts

- **WHEN** the build completes
- **THEN** it prints the number of questions wired with a figure and the number of questions still flagged `hasImage: true` without a figure file (no silent skip)

### Requirement: Figure assets are published to the app

The build SHALL copy the figure files into `dist/figures/`, and `apps/neurons-tw/scripts/copy-content.mjs` SHALL copy `dist/figures/*` into `apps/neurons-tw/public/content/neurons-tw/figures/`, so each figure is served at `${BASE_URL}content/neurons-tw/figures/<question-id>.png` at runtime.

#### Scenario: Figures land in the app public directory

- **WHEN** `pnpm --filter @study-rpg/neurons-tw build` (or `predev`) runs
- **THEN** every `figures/<id>.png` from the content package is present under `apps/neurons-tw/public/content/neurons-tw/figures/`

### Requirement: Quiz renders the question figure

When a question has a populated `imagePath`, the quiz UI (`QuizModal`) SHALL render the figure as an `<img>` with `src` = `${import.meta.env.BASE_URL}${imagePath}`, displayed between the stem and the answer options, without removing the existing 陽明國考考古題小組 source attribution.

#### Scenario: Figure question shows its image

- **WHEN** the player reaches a question whose `imagePath` is set
- **THEN** the figure image is displayed under the stem and the answer options remain interactive

#### Scenario: Broken image source degrades to placeholder

- **WHEN** a figure `<img>` fails to load (missing or renamed file)
- **THEN** the UI shows the `[圖]` placeholder instead of a broken-image icon

### Requirement: Missing figures show a placeholder, never a silent drop

When a question is flagged `hasImage: true` but has no `imagePath`, the quiz UI SHALL render a visible `[圖]` placeholder block in place of the figure, so a flagged-but-unavailable figure is never silently omitted.

#### Scenario: Flagged question without an extracted figure

- **WHEN** the player reaches a question with `hasImage: true` and no `imagePath`
- **THEN** a `[圖]` placeholder is shown under the stem indicating a figure exists but is unavailable

### Requirement: Figure provenance is recorded

The repository SHALL record, for each published figure, its source exam (year / session / 醫學一or二 / subject / question number) plus the project's CC-BY-NC license note and 24-hour takedown contact, in the `CREDITS` documentation.

#### Scenario: Attribution present for published figures

- **WHEN** a reviewer inspects `CREDITS`
- **THEN** the published question figures are listed with their source exam provenance and the CC-BY-NC + takedown note
