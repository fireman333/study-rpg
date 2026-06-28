## 1. Core field + build merge contract

- [x] 1.1 Add `optionExplanations?: Record<string, string>` to the `Question` interface in `packages/core/src/types.ts` (additive, optional; doc-comment notes it is build-injected and never alters id/answer/options/stem/explanation); rebuild `@study-rpg/core` (`pnpm --filter @study-rpg/core build`)
- [x] 1.2 In `packages/content-neurons-tw/scripts/build.ts`, read `provenance/option-explanations.generated.json` (if present) and merge each entry's `optionExplanations` onto the matching baked question by `id` — additive only; never touch `id`/`answer`/`stem`/`options`/`explanation`
- [x] 1.3 Print merged / skipped / total 簡答 counts in the build output (No-Silent-Errors), mirroring the existing figures/table-images merge logging
- [x] 1.4 Add a `verify:option-explanations` content-pack script (or extend `verify-normalize`) asserting: every shipped sidecar entry's keys equal its question's `options` keys, each entry 12–60 CJK chars, correct-answer key present, `sourceHash` matches — fail the build on any violation

## 2. Generation pipeline (offline, not in app/CI)

- [x] 2.1 Add a `sourceHash` util: `sha256({stem, options, answer, acceptedAnswers, disputed, explanationNormalized})` with `explanationNormalized` = trim + normalize newlines + collapse whitespace + keep the 簡解：sentinel
- [x] 2.2 Write the deterministic validator module (pure, no LLM) enforcing the §6 spec gates (key-set parity, 12–60 CJK length, correct-key present, no empty/markdown/tables, sourceHash match) — reused by both the pipeline and `verify:option-explanations`; unit-tested
- [x] 2.3 Author the generation prompt (versioned `promptVersion`) encoding D3 hard rules: source-only, correct=why-right / wrong=why-wrong, `詳解未明確說明此選項錯因` for unsupported wrong options, no single-answer assertion for disputed/multi-answer, 12–60 CJK cap
- [x] 2.4 Build the resumable orchestrator (Workflow script) that loads the corpus, computes `sourceHash`, skips QA-passed unchanged rows, fans out Haiku generation at batch 4 / concurrency 8 (failed batch → 1/call retry), and appends results to `generated.jsonl`
- [x] 2.5 Wire the three-layer QA (D4): deterministic validator on 100%; Haiku LLM QA (batch 8 / conc 8, `{qid,pass,issues,severity}`, no rewrite) on the risky subset; per-subject + global random sample with escalation thresholds (>3%→30%, >8%→regen) — QA results to `qa.jsonl`
- [x] 2.6 Promotion + buckets: write only QA-passed rows to `option-explanations.generated.json`; failures (after max 2 single-question regens) to `option-explanations.manual-review.json`; run metadata to `option-explanations.meta.json`

## 3. Pilot (100 questions) + tune

- [x] 3.1 Run the pipeline on a 100-question pilot slice (spread across subjects, include some disputed + short-詳解 + 115-1 AI-generated)
- [x] 3.2 Human-review all QA-fail rows + a sample of 20 QA-pass rows; tune prompt / length cap / risky heuristics; re-run the pilot until stable
- [x] 3.3 Record pilot fail-rate per subject + token cost in `meta.json`; confirm Haiku cost is acceptable (else evaluate agy-bulk fallback per D1)

## 4. Full corpus run

- [x] 4.1 Run the pipeline over the full corpus; verify resume (re-run is a no-op on unchanged rows)
- [x] 4.2 Commit the three sidecar JSONs in the content pack; rebuild `questions.json` (`pnpm run build:neurons-content`) and confirm `optionExplanations` present on baked questions + merge counts logged
- [x] 4.3 Review the `manual-review.json` size; decide whether the remaining gap is acceptable to ship (absent field → renders nothing) or needs another pass

## 5. Display

- [x] 5.1 Implement the per-option list rendering — extend `Explanation.tsx` with an `optionExplanations`-first branch (render only `(<key>) <簡答>` rows, suppress prose/table tiers) OR a small dedicated component; mark the correct option's row; render nothing when `optionExplanations` is absent
- [x] 5.2 Re-enable the inline slot on all three surfaces (QuestionBankPage / QuizModal / MockExamRunner) pointed at the per-option list (flip `SHOW_INLINE_EXPLANATION` true / repoint, or a dedicated flag); keep the 「看原始詳解 PDF」 button alongside
- [x] 5.3 Unit-test the renderer: full per-option list for a question with `optionExplanations`; nothing rendered when absent; correct row marked

## 6. Verify + ship

- [x] 6.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green
- [x] 6.2 Chrome MCP smoke on all three surfaces (dev): per-option list shows, prose/table 詳解 not shown inline, correct row marked, a no-簡答 question renders nothing; RWD check on the list
- [x] 6.3 `/opsx:verify` (completeness/correctness/coherence) → `/opsx:archive` → commit on track-neurons → merge main → CF Pages deploy → prod SPA 三件套 + spot-check a few baked questions on `med-study-rpg.com/neurons/`
