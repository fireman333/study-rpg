## ADDED Requirements

### Requirement: Question SHALL carry `imagePath` when extracted PNG exists

The build script SHALL set `Question.imagePath` to a relative path under the app's public image dir when a matching PNG file exists on disk, and SHALL leave it `null` (or omit it) otherwise.

Specifically, for each parsed question, after constructing the question id `<year>-<sitting>-<paper>-<subject>-Q<n>`:

1. Compute candidate image path `apps/medexam2-hospital-tw/public/images/medexam2-tw/<id>.png` (absolute path relative to monorepo root)
2. If the file exists (`existsSync`), assign `Question.imagePath = "images/medexam2-tw/<id>.png"` (relative path, app-base-URL prepended at render time)
3. If the file does NOT exist, omit `imagePath` from the question object (or set to `null`); the question is still emitted with all other fields intact

This SHALL apply uniformly to all 6066 questions; questions with `hasImage = false` will normally have no PNG on disk and therefore no `imagePath`, but the spec does not forbid manually adding PNGs for false-negative cases.

The `imagePath` value SHALL be a forward-slash path suitable for browser URL concatenation; absolute filesystem paths SHALL NOT be written into `questions.json`.

#### Scenario: hasImage question with matching PNG gets imagePath set

- **GIVEN** question `108-2-醫學三-內科-Q45` has `hasImage = true`
- **AND** the file `apps/medexam2-hospital-tw/public/images/medexam2-tw/108-2-醫學三-內科-Q45.png` exists
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL equal `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`

#### Scenario: hasImage question with no PNG omits imagePath

- **GIVEN** question `109-1-醫學四-外科-Q12` has `hasImage = true`
- **AND** no matching PNG file exists at the expected path
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** the question SHALL still be emitted with all other fields (id, stem, options, answer, explanation, hasImage, meta) intact

#### Scenario: Plain text question (no hasImage) has no imagePath

- **GIVEN** question `111-2-醫學六-麻醉科-Q3` has `hasImage = false`
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** no filesystem lookup SHALL be required for plain-text questions (optimization permitted)

### Requirement: `hasImage` detection regex SHALL cover all image-reference patterns

Before applying the detection regex, the build script SHALL strip the following 7 false-positive phrases from the stem (none refer to images):

```
意圖 / 試圖 / 企圖 / 構圖 / 地圖 / 圖書 / 圖表 / 插圖
```

The script SHALL then detect `hasImage` using a whitespace-tolerant regex matching any of:

- Explicit markers: `[圖]` / `（圖）` / `(圖)`
- 附圖 / 上圖 / 下圖 / 左圖 / 右圖
- 圖一/二/三/四/五/六/七/八/九/十/甲/乙/丙/丁/A/B/C/D/E/1/2/3/4/5
- 箭頭所指 / 箭號所指
- 如圖 / 圖示 / 示意圖 / 流程圖 / 圖像 / 圖為
- 圖中 [Ａ-Ｅ / A-E / a-e / ★ / ▲ / △ / ○ / ● / ◇ / ◆ / □ / ■ / ☆ / ◎ / *]
- (心|肌|腦)電圖 + (如|為|顯示如|紀錄如|檢查如) — display verb required to exclude narrative ECG description
- 如下所示 / 如下列圖 / 兩張圖

All matches are whitespace-tolerant (e.g., `附 圖` with intervening space matches `附\s*圖`), because PDF text extraction occasionally inserts spaces mid-word.

Audit history during apply:
- Iteration 1 — original `/\[圖\]|（圖）|\(圖\)|附圖/` → 76 questions
- Iteration 2 — attempted to tighten 附圖 to specific phrasings → 13 false negatives → reverted
- Iteration 3 — broader audit added `下圖`, `如下圖`, `圖N`, `箭號所指`, `如圖` patterns → 76 → 364 (+288 verified genuine)
- Iteration 4 — second audit found whitespace artifacts (`附 圖`) + extra patterns (`心電圖如下`, `圖中Ａ`, `流程圖`, `圖像`, `圖為`, `如下所示`, `兩張圖`) + false-positive guard (`意圖`/`試圖`/...) → 364 → **394** (+30 verified genuine, 0 removed)

No question in the corpus has been observed where any of the matched patterns referred to something other than a visual aid.

#### Scenario: Stem with "如附圖" matches

- **GIVEN** a stem containing the substring `"如附圖所示，胸部 X 光檢查..."`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with "下圖" matches

- **GIVEN** a stem containing the substring `"心電圖顯示如下圖"` or `"血液抹片如下圖所示"`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with "箭號所指" matches

- **GIVEN** a stem containing `"電腦斷層檢查呈現如圖，箭號所指之異常..."`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Stem with numbered figure marker matches

- **GIVEN** a stem containing `"靜態核醫心肌灌流（圖一）及 F-18 FDG 正子掃描（圖二）"`
- **WHEN** the regex matches against the stem
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Marker variants match independently

- **GIVEN** a stem containing `"[圖]"` or `"（圖）"` or `"(圖)"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Whitespace-split "附 圖" still matches

- **GIVEN** a stem from PDF extraction artifacts contains `"如附 圖左、右"` or `"檢查影像如附 圖"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: ECG with display verb matches

- **GIVEN** a stem containing `"心電圖如下"` or `"心電圖檢查如下"` or `"心電圖如下所示"`
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `true`

#### Scenario: Narrative ECG description does NOT match

- **GIVEN** a stem containing `"心電圖呈現心房顫動"` or `"心電圖出現窄波"` (descriptive only, no display verb)
- **AND** no other matching pattern in the stem
- **WHEN** the regex matches
- **THEN** `hasImage` SHALL be `false`

#### Scenario: False-positive guard excludes 意圖 / 試圖

- **GIVEN** a stem containing `"曾經有自殺意圖"` or `"試圖阻擋對手"`
- **AND** no other matching pattern in the stem
- **WHEN** the regex matches (after stripping the guarded phrase)
- **THEN** `hasImage` SHALL be `false`
