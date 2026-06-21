## Why

Three in-app bug reports against the neurons 題庫 (`bug_reports`: `08536f4a` 109-1 醫二 Q35 無詳解 / `0d2915a0` 108-1 醫二 Q8 題目和詳解對不上 / `3ac5ac66` + `259703cc` 114-2 醫一 Q51 題目和詳解配對錯誤、題目其實是解剖的). Investigation showed all three share one upstream root cause: **questions whose 陽明 詳解 failed to extract from the source PDF (`_extracted/.../*.md` marks them `未從 PDF 擷取到此題`) were left with an empty or mis-paired explanation, and in some cases a wrong subject label** during reconcile.

Concretely:

1. **`114-2-醫學一-…-Q51`** (自主神經系統 — a physiology question) was labeled 微生物暨免疫學, a subject that does not exist in the 醫學一 paper at all (醫學一 subjects = 解剖/胚胎/組織/生理/生化). It sits as a single mislabeled island inside the 生理學 block (Q47–Q73). Its explanation was a virus/HBV paragraph belonging to a different question.
2. **`109-1-醫學二-…-Q35`** (病媒 vectors — a parasitology question) had an empty explanation. The source manifest `醫學二/寄生蟲學/109-1.md` declares `question_range: "29-35", subject: 寄生蟲學` but all 7 of those questions were `未從 PDF 擷取到此題`, so the reconciled corpus carried the 考選部 stems under the wrong 微生物暨免疫學 label with no explanation. **Q35 is one of a 7-question block (Q29–35) all mislabeled 微免 + all explanation-empty.**
3. **`108-1-醫學二-…-Q8`** (韋爾病 / Leptospira — correctly 微生物暨免疫學) carried a Roseola/HHV-6 explanation belonging to a different question (108-1 Q8 is in the source `缺漏題號 [8,9,10]`).

The fix recovers the authentic 陽明 詳解 for all 9 affected questions **from the original source PDFs** (`~/Desktop/國考/一階國考/陽明國考考古/*.pdf`, owner-confirmed source of truth) and corrects the 8 mislabeled subjects.

## What Changes

- **8 subject reclassifications** in `packages/content-neurons-tw/data/medexam-reconciled/questions.json`: `109-1-醫學二-…-Q29…Q35` 微生物暨免疫學 → **寄生蟲學** (7), `114-2-醫學一-…-Q51` 微生物暨免疫學 → **生理學** (1). `108-1-…-Q8` subject is already correct (Leptospira = bacteriology). Only the `subject` field changes; `id` (the stable key used by questionHistory / bookmarks / variant provenance) is untouched, and `answer` (考選部 authority) is untouched — all 9 answers were cross-checked against the original PDF 解答 and already match.
- **9 explanation recoveries** in the same source JSON: the authentic 陽明 詳解 for Q8, Q29–Q35, and Q51, transcribed from the original 詳解 PDFs (OCR cleaned, page-footer/author-header stripped). Q8 and Q51 replace a wrong (mis-paired) explanation; Q29–35 fill an empty one.
- Rebuilt content artifacts (`apps/neurons-tw/public/content/neurons-tw/{questions,subjects,meta}.json`) regenerate from the above via the `build:neurons-content` + copy-content prehook.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-corpus-ingestion`: ADD a requirement formalizing that a 陽明-reconcile-path question SHALL carry the explanation that belongs to *that* question, and that when the upstream `_extracted` step left it empty or mis-paired it SHALL be recovered from the original 陽明 source PDF rather than left wrong. The 8 subject reclassifications are pure data corrections toward the existing «舊分組 contiguous subject blocks» invariant (the 109-1 寄生蟲 block Q29–35 and the 114-2 生理 island Q51) — no spec delta; subject family counts shift but the 11-subject framework is unchanged.

## Impact

- **Files**: source reconciled JSON (8 subject tokens + 9 explanation values; +1279 bytes; byte-safe surgical re-serialization of only the 9 target objects, other 4591 untouched), regenerated `questions.json` / `subjects.json` (per-subject counts: 寄生蟲學 +7, 生理學 +1, 微生物暨免疫學 −8) / `meta.json` (builtAt). No app code, no Dexie/R2/Worker/D1, no schema/sync, no economy change.
- **Player-visible**: Q51 now appears under the 生理學 family; Q29–35 under 寄生蟲學; all 9 render the correct, on-topic explanation instead of empty / wrong-question text.
- **Risk**: low. `id` stable → no user-data orphaning. `answer` unchanged and PDF-verified. Surgical edit verified to leave the other 4591 questions byte-identical; corpus re-parses to 4600.
- **Follow-up (not in this change)**: a systematic sweep for *other* fully-unextracted source blocks (`未從 PDF 擷取到此題`) that may have produced the same empty/mislabeled pattern in other sittings; the 30 vertical single-char-run explanations (carried from the prior change).
