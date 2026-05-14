## 1. Spec — define medexam2-corpus-ingestion capability

- [x] 1.1 Write `specs/medexam2-corpus-ingestion/spec.md` — 5 requirements (source format / parser invariants / explanation merge strategy / output contract / license)
- [x] 1.2 Cross-reference Decision 1–8 in `design.md`

## 2. Build script — parse + normalize + merge

- [x] 2.1 Create `packages/content-medexam2-tw/scripts/build.ts` skeleton — TypeScript module reading env vars (`MEDEXAM2_SOURCE_DIR` / `MEDEXAM2_SUBJECTS` / `MEDEXAM2_ALLOW_SKIPS`), main() entry
- [x] 2.2 Implement `walkSourceDir()` — recursive walk `醫學{三,四,五,六}/<科別>/*.md`, exclude `*.explanations.md` + system folders (`_*`)
- [x] 2.3 Implement `parseQuestionFile(path)` — read YAML frontmatter (year/sitting/paper/subject) + extract `## Q<n> [<subspecialty> / <topic>]` blocks (stem + options + answer + topic), return `Question[]`
- [x] 2.4 Implement `parseExplanationsFile(path)` — read side-car `<basename>.explanations.md`; parse YAML frontmatter for model/oe_hit_rate; per-Q extract `### 選項詳解` block (full markdown) + confidence label
- [x] 2.5 Implement `mergeExplanations(question, explanations)` — match by Q number; fallback to `"詳解生成中..."` placeholder + `meta.explanationStatus: "pending"`
- [x] 2.6 Generate `Subject[]` — 14 subjects with id (Chinese name) / displayName / group (醫學三/四/五/六) / color (assign from theme palette) / totalQuestions (post-count)
- [x] 2.7 Construct Question.id = `<year>-<sitting>-<paper>-<subject>-Q<n>` (民國 year, sitting 1/2, paper 醫學X, subject 中文)
- [x] 2.8 Detect `hasImage` — look for `[圖]` / `(圖)` patterns in stem
- [x] 2.9 Track `importedQ` / `skippedQ` / `totalBlocksSeen` counters in main()
- [x] 2.10 Per-skip `console.warn` (filename + Q<n> + reason); aggregate exit non-zero unless `MEDEXAM2_ALLOW_SKIPS=1`

## 3. Statistics + output artifacts

- [x] 3.1 Compute `stats.json` per Decision 6 — perSubject (totalQuestions / explainedQuestions / coveragePercent / perYearCounts) + totalQuestions + totalSubjects + builtAt
- [x] 3.2 Write `packages/content-medexam2-tw/dist/{questions,subjects,meta,stats}.json`
- [x] 3.3 Copy artifacts to `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,subjects,meta}.json` (skip stats.json — internal only)
- [x] 3.4 Final console output: `imported: X, skipped: Y, total: Z` + per-subject table (subject name | totalQuestions | explained%)
- [x] 3.5 Print gzip size of questions.json (for NFR tracking)

## 4. License + content pack metadata

- [x] 4.1 Rewrite `packages/content-medexam2-tw/LICENSE.md` from TBD placeholder → full CC-BY 4.0 text + two-tier source attribution (考選部 公資源 + LLM-supervised by 康瑋麟)
- [x] 4.2 Update `packages/content-medexam2-tw/package.json` `license` field: `SEE LICENSE.md` → `CC-BY-4.0`
- [x] 4.3 Update `packages/content-medexam2-tw/package.json` `scripts.build` from placeholder echo → `tsx scripts/build.ts`
- [x] 4.4 Set `meta.json` credits array per Decision 5 (考選部 entry + 康瑋麟 LLM entry)

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/content-medexam2-tw build` runs clean — exit 0, prints 3-number summary + per-subject table
- [x] 5.2 `imported` sanity: expect ~10,000–13,000 (acceptable range; precise number TBD)
- [x] 5.3 `skipped` sanity: 0 if `MEDEXAM2_ALLOW_SKIPS` unset; document any skips in commit message if `=1` used
- [x] 5.4 14 subjects.json entries all have `totalQuestions > 0`
- [x] 5.5 stats.json per-subject `coveragePercent` ≥ 80% (allow some paper lacking LLM explanations)
- [x] 5.6 Check gzip size of questions.json — note in commit message; if > 2.5 MB, flag for follow-up lazy-load change
- [x] 5.7 `pnpm -r typecheck` 全綠
- [x] 5.8 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` boot — App.tsx status displays「台灣二階醫師國考 — N Q, 14 subjects」(N matches imported count)
- [x] 5.9 一階 regression check: `pnpm --filter @study-rpg/medexam-tw dev` 仍 boot 正常
- [x] 5.10 `openspec validate ingest-medexam2-tw-corpus` — passes

## 6. Verify + handoff

- [x] 6.1 `/opsx:verify` — 3-dim check
- [x] 6.2 `/verify` (or manual Chrome MCP) — 二階 app 顯示 ingest 後的真實題數 + 一階 regression OK
- [ ] 6.3 Confirm with user, then `/opsx:archive ingest-medexam2-tw-corpus`
- [ ] 6.4 auto-git commit (message template: `spec(archive): merge ingest-medexam2-tw-corpus — N Q / 14 科, ~X% explained, CC-BY 4.0 locked`)
