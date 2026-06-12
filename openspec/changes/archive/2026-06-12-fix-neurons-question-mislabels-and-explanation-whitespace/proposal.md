## Why

Two in-app bug reports against the neurons 題庫 (`bug_reports`: `c7a36c0c` 歸類錯誤 / `4a9cf788` 詳解空行). Investigation showed **both are systemic**, not one-off:

1. **Subject mis-classification** — `107-1-醫學二-病理學-Q66` (a pharmacology drug-choice question) was labeled 病理學. A scan found this is one of a structural cluster: in the upstream extraction, runs of questions sitting *below* a subject's canonical qNumber block were swept into the wrong subject. The 病理學 block is canonically Q76–Q100 in 醫學二; 15 questions below Q76 were mislabeled, and the same bug bled parasitology / immunology / micro / anatomy questions into wrong subjects in other papers. **29 questions total** are mislabeled.

2. **Explanation whitespace cruft** — the reported blank-line issue is a bank-wide PDF-extraction artifact: **3747 explanations** carry trailing whitespace, **1896** have 3+ blank-line runs, **727** have stray bare page-number lines.

## What Changes

- **29 subject reclassifications** in `packages/content-neurons-tw/data/medexam-reconciled/questions.json` (the in-repo source the build reads). Only the `subject` field changes; the `id` (a stable key used by questionHistory / bookmarks) is untouched. 21 high-confidence + 8 medium, each double-validated by content judgment (3 Fable-5 review agents) AND a deterministic out-of-block qNumber check.
- **Build-time explanation normalizer** in `packages/content-neurons-tw/scripts/build.ts` (`normalizeExplanation`) — SAFE SUBSET applied to every question: strip per-line trailing whitespace, drop isolated bare 2–3-digit page-number lines, collapse blank-line runs to one, trim. Verified to never alter a content line (0 content lines changed across the corpus). Vertical single-char-per-line runs (30 questions) are intentionally left intact (auto-rejoin is risky → held for separate handling).
- Rebuilt content artifacts (`apps/neurons-tw/public/content/neurons-tw/{questions,subjects,meta}.json`) regenerate from the above.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-corpus-ingestion`: ADD a requirement formalizing the build-time explanation whitespace normalizer (safe subset; content-preserving). The 29 subject reclassifications are pure data corrections (correcting the reconciled source to match question content) — no spec delta; subject family counts shift (e.g. 病理學 586→571, 藥理學 575→585) but the 11-subject framework is unchanged.

## Impact

- **Files**: source reconciled JSON (29 subject tokens), `build.ts` (+normalizer ~25 lines), regenerated `questions.json` (29 subjects + 3747 normalized explanations) / `subjects.json` (per-subject counts) / `meta.json` (builtAt). No app code, no Dexie/R2/Worker/D1, no schema/sync, no economy change.
- **Player-visible**: 29 questions now appear under the correct neuron family/subject; explanations render without stray blank lines / page numbers.
- **Risk**: low. `id` stable → no user-data orphaning. Normalizer proven content-safe. `pnpm -r typecheck` clean, 635 vitest green, content build `imported 4600 / skipped 0 / total 4600`, app build green, subject-distribution deltas reconcile exactly with the 29 moves.
- **Follow-up (not in this change)**: the 30 vertical-char-run explanations; book-name footer lines (醫學一/醫學二) as a standalone-line artifact; whether to add the normalizer's logic upstream of the reconciled JSON.
