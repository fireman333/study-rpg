## ADDED Requirements

### Requirement: Build script SHALL detect option-image markers and emit `hasOptionImages`

The 二階 build script SHALL inspect each parsed question's `options` map. When any option value matches the marker pattern `/_\(圖片或缺失\)_/`, the emitted `Question.hasOptionImages` SHALL be `true`. Otherwise, `hasOptionImages` SHALL be `false`.

The marker `_(圖片或缺失)_` is the upstream PDF-extractor's placeholder for an option whose body is a graphic (not text). Questions with this marker in any option are un-renderable in a text-only UI and SHALL be marked so host apps can exclude them from quiz pools.

Detection SHALL run after the existing option-parser loop and SHALL NOT affect the existing skip rules (questions whose entire options block was replaced with the standalone marker `_(選項缺失或為圖片題；參見原 PDF)_` are still dropped by the existing `< 2 options` guard — those produce no parseable `- A. ...` lines).

#### Scenario: Option containing image-marker flags the question

- **GIVEN** a parsed question with `options = { A: "_(圖片或缺失)_", B: "_(圖片或缺失)_", C: "點", D: "_(圖片或缺失)_" }` (e.g. `109-2-醫學六-耳鼻喉科-Q27`)
- **WHEN** the build script emits the `Question`
- **THEN** the emitted object SHALL include `hasOptionImages: true`

#### Scenario: Option set with no marker yields false

- **GIVEN** a parsed question whose every `options` value is plain medical text
- **WHEN** the build script emits the `Question`
- **THEN** the emitted object SHALL include `hasOptionImages: false`

#### Scenario: Whole-options-block missing pattern is still skipped by existing guard

- **GIVEN** a question body whose `### 選項` region is the literal `_(選項缺失或為圖片題；參見原 PDF)_` standalone line with no `- A. ...` items
- **WHEN** the build script parses the block
- **THEN** zero options SHALL be extracted
- **AND** the existing `< 2 options` skip path SHALL drop the question (no new behavior needed; `hasOptionImages` detection does NOT need to handle this case)

#### Scenario: Built corpus count of flagged questions is stable

- **GIVEN** the 二階 corpus snapshot at `~/Desktop/國考/二階國考/二階國考_拆分/` as of 2026-05-18
- **WHEN** `pnpm --filter @study-rpg/content-medexam2-tw build` runs to completion
- **THEN** exactly 10 questions across 9 papers and 7 subjects (內科 / 外科 / 婦產科 / 家醫科 / 小兒科 / 神經內科 / 耳鼻喉科) SHALL have `hasOptionImages: true` in `dist/questions.json`
- **AND** `imported / skipped / total` counters SHALL match the prior-baseline values (this change is detection-only at build time; questions are not dropped from the pack)
