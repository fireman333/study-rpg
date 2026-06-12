## Why

Follow-up to `fix-neurons-question-mislabels-and-explanation-whitespace`. That change used an out-of-block qNumber detector, which by construction cannot catch a mislabeled question whose qNumber sits *inside* the (wrong) subject block. A full content scan of the two demonstrably-scrambled 醫學二 papers (107-1, 108-2 — the only ones with residual subject-range overlap after the first pass) found 8 such in-block mislabels. Separately, the explanation normalizer left a recurring footer artifact untouched: standalone book-name lines (`醫學一` / `醫學二`).

## What Changes

- **8 in-block subject reclassifications** (content-verified by 2 full-paper Fable-5 scans; `subject` field only, `id` unchanged):
  - `107-1` Q36/37/38 (寄生蟲學 → 公共衛生學 — epidemiology/biostatistics spillover) and Q44/46/47/48 (藥理學 → 公共衛生學 — environmental health / social epidemiology / public mental health). These restore 107-1 醫學二 to clean contiguous blocks (寄生蟲 Q29-35 · 公衛 Q36-50 · 藥理 Q51-75 · 病理 Q76-100).
  - `108-2` Q28 (藥理學 → 免疫學 — natalizumab, a therapeutic monoclonal antibody at the tail of the Q1-28 micro/immune block; supersedes the prior change's medium-confidence 藥理 call).
- **Footer-line rule added to `normalizeExplanation`** (`build.ts`): drop standalone lines that are exactly `醫學一` / `醫學二` (page-footer artifacts). Multi-char section headers (參考資料 / 補充 / 筆者的話 / 校稿補充 …) are NOT matched and remain untouched.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-corpus-ingestion`: MODIFY the explanation-normalizer requirement to add standalone book-name footer-line removal. The 8 subject reclassifications are pure data corrections (no spec delta).

## Impact

- **Files**: `build.ts` (+1 footer rule), reconciled source (8 subject tokens), regenerated `questions.json` / `subjects.json` / `meta.json`. No app code, no Dexie/R2/Worker/D1, no schema/sync/economy.
- **Risk**: low. Normalizer re-verified content-safe (0 content lines changed; 0 of 2325 參考資料 headers lost; 362 footer lines → 0). 107-1/108-2 blocks now contiguous. `id` stable. typecheck clean; 635 vitest green; content build 4600/0/4600.
- **Coverage note**: only the two papers with residual structural scrambling were full-scanned. A complete content audit of all 4600 questions (to catch any hidden contiguous-but-wrong block with no structural signal) remains a larger, separate effort — NOT done here. The 31 vertical single-char extraction runs are still intentionally left intact (they are a mix of table-column cells and word-splits; auto-rejoining would corrupt table data).
