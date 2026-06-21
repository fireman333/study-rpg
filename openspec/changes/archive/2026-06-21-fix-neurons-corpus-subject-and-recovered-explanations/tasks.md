# Tasks

## 1. Investigate
- [x] 1.1 Reproduce the 3 reports from `bug-queue/neurons-tw.md`; extract the 3 questions from the reconciled source JSON.
- [x] 1.2 Confirm `114-2-…-Q51` is physiology (autonomic NS) and that 醫學一 has no 微生物暨免疫學 subject; locate it as a single mislabel inside the 生理學 Q47–Q73 block.
- [x] 1.3 Confirm `109-1-…-Q35` is parasitology; find `醫學二/寄生蟲學/109-1.md` manifest (`question_range: 29-35, subject: 寄生蟲學`, all 7 `未從 PDF 擷取到此題`) → Q29–35 are a mislabeled + explanation-empty block.
- [x] 1.4 Confirm `108-1-…-Q8` (韋爾病/Leptospira) subject is correct but explanation is a mis-paired HHV-6 paragraph (source `缺漏題號 [8,9,10]`).
- [x] 1.5 Cross-check all 9 `answer` fields against the original PDF 解答 → 9/9 match (answer untouched).

## 2. Apply
- [x] 2.1 Recover the authentic 陽明 詳解 for Q8 / Q29–Q35 / Q51 from the original `~/Desktop/國考/一階國考/陽明國考考古/{108-1,109-1,114-2}*.pdf` via PyMuPDF (owner-confirmed source).
- [x] 2.2 Surgical byte-safe edit (`apply-neurons-corpus-fix.py`): 8 `subject` reclassifications + 9 `explanation` recoveries; only the 9 target objects re-serialized, other 4591 byte-identical; corpus re-parses to 4600.
- [x] 2.3 Rebuild content pack (`pnpm run build:neurons-content`) + copy-content → regenerate app `questions/subjects/meta.json`.

## 3. Verify
- [x] 3.1 Built output (app public): Q51 under 生理學; Q29–35 under 寄生蟲學; Q8/Q29–35/Q51 explanations present + on-topic.
- [x] 3.2 Subject-distribution deltas reconcile exactly with the 8 moves (寄生蟲學 158→165 +7, 生理學 610→611 +1, 微生物暨免疫學 676→668 −8); empty-explanation count 450→443 (7 filled; Q8/Q51 replaced wrong text).
- [x] 3.3 `pnpm -r typecheck` clean; 637 vitest green (87 files); content build `imported 4600 / skipped 0 / total 4600`.
- [x] 3.4 `openspec validate fix-neurons-corpus-subject-and-recovered-explanations --strict` passes.
- [x] 3.5 Mark bug-queue ids `08536f4a` / `0d2915a0` / `3ac5ac66` / `259703cc` fixed (neurons queue → 0 active).
- [ ] 3.6 Owner prod spot-check: Q51 appears under 生理學 family; Q35 renders the 病媒 explanation. (pending deploy)
