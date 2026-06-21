## Why

Follow-up to `fix-neurons-corpus-subject-and-recovered-explanations` (which fixed 9 reported questions). A full content-level health audit of all 4600 questions (46 per-sitting agents) found the same upstream-extraction defect class at scale: questions whose 陽明 詳解 failed to extract were left with empty or mis-paired explanations, and a subset carried a content-wrong subject. Structural integrity was otherwise clean (0 duplicate id, 0 invalid answer, 0 missing options, 0 empty stem).

The audit surfaced: ~443 empty explanations, ~53 mis-paired/off-topic/truncated explanations, and ~57 candidate subject mislabels. A second pass (46 per-sitting agents) then recovered the **authoritative** values from the original 陽明 詳解 PDFs (`~/Desktop/國考/一階國考/陽明國考考古/*.pdf`), which carry both a per-question 科目 label (authoritative subject) and the full 詳解 (explanation). Cross-checking the audit's content-guesses against each question's PDF 科目 label filtered out 12 audit false-positives (e.g. Lyme disease / 鼠疫 — bacterial pathogens that 陽明 nonetheless classifies under 寄生蟲學 because they are tick/flea-borne, matching the exam's own subject blocks).

## What Changes

- **22 subject corrections** in `packages/content-neurons-tw/data/medexam-reconciled/questions.json`, each taken from the authoritative PDF 科目 label (not a content guess). Includes eliminating all 5 non-canonical labels (`免疫學`×3 / `微生物學`×2 → `微生物暨免疫學`). Only the `subject` field changes; `id` and `answer` are untouched.
- **476 explanation recoveries** (424 fill a previously-empty explanation; 52 replace a mis-paired/张冠李戴 explanation with the question's own), each recovered from the original 陽明 PDF and OCR-cleaned (header/footer/page-number cruft stripped, medical content + mnemonics + 參考資料 preserved). All 9 answers-per-question verified unchanged; spot-checks confirm each recovered explanation matches its own stem.
- **20 questions left untouched** (not-found): the 陽明 PDF genuinely never published 詳解 for them (mostly 106-1 解剖/組織/生化 + 107-1 寄生蟲 Q34–36); their explanations stay empty rather than fabricated.
- Rebuilt content artifacts regenerate from the above (empty explanations 443 → 19).

## Capabilities

### Modified Capabilities
- `neurons-corpus-ingestion`: ADD a requirement that the corpus `subject` SHALL match the authoritative 陽明 PDF 科目 classification (the source-of-truth for which exam subject block a question belongs to), superseding content-only guesses — this is what filtered the 12 audit false-positives. The 476 explanation recoveries fall under the existing «explanations belong to their question, recovered from source» requirement (no new requirement; this change applies it corpus-wide).

## Impact

- **Files**: source reconciled JSON (22 subject tokens + 476 explanation values; byte-safe surgical re-serialization of only the 479 target objects; other 4121 byte-identical; corpus re-parses to 4600), regenerated `questions.json` / `subjects.json` (per-subject counts shift) / `meta.json`. No app code, no Dexie/R2/Worker/D1, no schema/sync, no economy change. **`answer` unchanged on all 479** (verified diff: 0 answer changes).
- **Player-visible**: 22 questions move to the correct neuron family; 424 previously-blank explanations now render the recovered 詳解; 52 张冠李戴 explanations now match their question.
- **Risk**: low–medium. `id`/`answer` stable → no user-data orphaning, no grading change. Subjects are PDF-authoritative (not LLM guesses). Explanations are LLM-extracted-from-PDF; spot-checked across mis-paired + empty-fill samples (all matched their stems), but the 476 recoveries were not each individually human-reviewed — owner spot-check recommended. `pnpm -r typecheck` clean, 637 vitest green, content build 4600/0/4600.
- **Residual (not in this change)**: 19 still-empty explanations (PDF lacked them) + ~1 not-recovered mis-pair; 2 high-confidence subject mislabels (111-1 醫一 Q74/Q75 酵素動力學 生理→生化) the PDF could not confirm because it also lacked those questions; 21 audit MEDIUM-confidence subject candidates left for a future closer look.
