## Why

The neurons-tw corpus (`packages/content-neurons-tw/data/medexam-reconciled/`) currently covers 106–114 (18 papers, 3600 questions). Three older/newer exam sittings the owner now has source material for — 104-1, 104-2, 105-1, 105-2 (陽明 詳解 available) and 115-1 (考選部 official only, no 陽明 詳解 yet) — are missing. Adding them grows the study pool to ~4200 questions and, for 115, exercises a new ingestion path: AI-generated explanations for sittings the 陽明 group has not yet published. Now is the right time because medexam-tw / content-medexam-tw is being torn down (`remove-medexam-tw-and-promote-neurons`), making the self-contained content-neurons-tw reconcile pipeline the canonical home for 一階 corpus growth.

## What Changes

- **Extend the 考選部-authoritative reconcile corpus** from 18 → 23 papers by adding 104-1 / 104-2 / 105-1 / 105-2 / 115-1, regenerating `packages/content-neurons-tw/data/medexam-reconciled/{questions,subjects,meta}.json` (~3600 → ~4200 questions). Question stems / options / answers are taken from 考選部 official PDFs as the authoritative source.
- **104 / 105 (陽明-reconcile path)**: download 考選部 official 試題 + 標準答案 + 更正答案 for the 4 papers (extend `reconcile/manifest.json` + `find_cs.py`), reconcile against the 8 陽明 詳解 PDFs already on disk (`~/Desktop/國考/一階國考/陽明國考考古/`, all text-extractable, no OCR), keeping only the cleaned 陽明 explanation. 104/105 belong to the **舊分組 era** (like the lone existing 106-1) and require manual continuous subject-block correction (mirror `finalize.py`'s `OLD_106_1`).
- **NEW ingestion path — 115 (AI-generated-explanation path)**: 115-1 has 考選部 questions + answers but no 陽明 詳解. Parse the 3 owner-supplied PDFs (醫學一 試題 + 醫學一 更正答案 + 醫學二 試題), fetch the missing 醫學二 標準答案 from 考選部, then generate per-question explanations via Gemini CLI + search (mirror the 二階 approach). Generated explanations SHALL be tagged with their provenance, pass a second-pass verification (answer-consistency + spot adversarial check), and any low-confidence item SHALL be flagged for owner review before ship.
- **更正答案 handling** (existing convention, extended to new years): 「一律給分」 → `disputed: true`; 「多選給分」 → `acceptedAnswers: [...]` (e.g. 115 醫學一 Q66 答 A 或 D 或 AD 均給分, Q95 一律給分).
- **Rebuild + propagate**: `pnpm --filter @study-rpg/content-neurons-tw build` → `node apps/neurons-tw/scripts/copy-content.mjs` → `apps/neurons-tw/public/content/neurons-tw/{questions,subjects,meta}.json`. Verify no hardcoded corpus-size assumption (subject mastery coverage, achievement thresholds) regresses with the larger pool.

## Capabilities

### New Capabilities
- `neurons-corpus-ingestion`: The contract for how the self-contained 一階 corpus (`content-neurons-tw/data/medexam-reconciled/`) is sourced, reconciled, and extended — 考選部 authority ordering, the two explanation-provenance paths (陽明-reconcile vs AI-generated), 舊分組 subject-block correction, 更正答案 (`disputed` / `acceptedAnswers`) handling, and the no-silent-errors build counter. Formalizes the previously-undocumented reconcile pipeline so future year additions amend a spec instead of editing scripts blind.

### Modified Capabilities
<!-- None. content-pack-contract (year/session/paper mock-exam metadata) and build-tooling (counter) already cover the generic shapes; this change adds data + a new ingestion path, not a change to those existing requirements. build-tooling is intentionally left untouched to avoid merge conflict with the in-flight remove-medexam-tw-and-promote-neurons change. -->

## Impact

- **Data (regenerated, committed)**: `packages/content-neurons-tw/data/medexam-reconciled/{questions,subjects,meta}.json` (~3600 → ~4200 Q); `apps/neurons-tw/public/content/neurons-tw/{questions,subjects,meta}.json` (rebuilt copy).
- **Reconcile toolchain (modified/extended)**: `packages/content-neurons-tw/reconcile/manifest.json` (+5 paper coordinates), and as-needed additions for the 115 AI-generated-explanation path + 104/105 舊分組 subject blocks (`finalize.py` / new generator script).
- **External fetches**: 考選部 考畢試題查詢平臺 (104/105 official 試題+答案; 115 醫學二 標準答案); Gemini CLI + web search (115 explanation generation).
- **Downstream (verify, no code change expected)**: `content-pack-contract` mock-exam metadata auto-surfaces the 5 new (year, session, paper) triples; neuron family/mastery/achievement subject totals shift with the larger corpus — checked, not redesigned.
- **Out of scope**: 104/105/115 圖片題附圖 recovery (figures stay as `[圖]` placeholder, like current corpus); any change to `content-medexam-tw` (being deleted); 116+ future years.
