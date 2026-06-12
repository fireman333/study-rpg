# Tasks

## 1. Investigate
- [x] 1.1 Confirm `107-1-醫學二-病理學-Q66` is pharmacology (drug-choice: leuprolide).
- [x] 1.2 Scan all 586 病理學 questions (3 Fable-5 agents) → 15 mislabels; corroborate with deterministic qNumber<76 check (100% agreement).
- [x] 1.3 Cross-subject out-of-block scan (38 candidates) → Fable-5 content verify → 29 total reclassifications (owner approved all 29).
- [x] 1.4 Characterize explanation whitespace artifacts (2118 affected; 5 types). Owner chose safe-subset normalizer.

## 2. Apply
- [x] 2.1 Surgical 29 `subject` edits in the reconciled source JSON (id unchanged; exact-match, formatting preserved).
- [x] 2.2 Add `normalizeExplanation` to `build.ts` + apply in the `wireFigure` chokepoint (safe subset; vertical-runs left intact).
- [x] 2.3 Rebuild content pack + copy-content → regenerate app `questions/subjects/meta.json`.

## 3. Verify
- [x] 3.1 Built output: 29 reclassifications present (Q66 → 藥理學); Q82/Q66 explanations cleaned.
- [x] 3.2 Normalizer content-safety: 0 non-blank/non-pagenum content lines changed across corpus.
- [x] 3.3 Subject-distribution deltas reconcile exactly with the 29 moves.
- [x] 3.4 `pnpm -r typecheck` clean; 635 vitest green; content build 4600/0/4600; app build green.
- [x] 3.5 Mark bug-queue ids `c7a36c0c` / `4a9cf788` fixed.
- [ ] 3.6 Owner prod spot-check: Q66 appears under 藥理學 family; a sample explanation renders clean.
