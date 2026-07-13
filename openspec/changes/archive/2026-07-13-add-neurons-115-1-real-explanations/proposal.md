## Why

115-1 was ingested (`2026-06-03-expand-neurons-corpus-104-105-115`) while 陽明國考考古題小組 had not yet published its 詳解, so all 200 × 115-1 questions carry **AI-generated placeholder explanations** (`explanationSource: 'ai-generated'`, 「本詳解由 AI 生成，未經陽明審定」), have **no PDF page-link**, and their per-option 簡答 sidecar was condensed from the AI placeholder (content-stale). 陽明 has now published the real 115-1 詳解 (醫學一合併總檔 + 醫學二統整版, on the owner's disk; Drive links already registered), so 115-1 can join the same 陽明-reconcile provenance path as every other sitting.

## What Changes

- **Replace the 200 × 115-1 AI explanations with the real 陽明 詳解** extracted from the two new PDFs (`extract_exam.py` → `_extracted/…/115-1.md`, then targeted per-`(book, qNumber)` merge via `reconcile.py` `load_ym_paper` + `clean_explanation`). Each 115-1 question drops the `explanationSource: 'ai-generated'` tag and its `sourceCredit` reverts to the 陽明 credit string.
- **Restore the 陽明 簡解 Key head** for 115-1 (remove `("115","1")` from `restore_jianjie_key.py` `EXCLUDE_YS`) so 115-1 explanations gain the `簡解：…────…詳解` structure the other 陽明-path sittings have.
- **Add PDF page-map coverage (詳解連結) for 115-1** by re-running the existing resolvers over the source root; the 200 questions become mapped so 「看原始詳解 PDF」 opens each at its real 詳解 page. Drive links already match — no link edit.
- **Regenerate the per-option 簡答 for 115-1 from the real 詳解** (parallel agy/Gemini generation → `merge-jianda-batch.ts`, which recomputes each `sourceHash` against the real 詳解). The 200 stale AI-derived sidecar entries are overwritten, not resynced.
- **Fact-gate**: 考選部 remains authoritative for stem/options/answer. 陽明 supplies 詳解 only; a 陽明 詳解 that disagrees with the baked answer is spot-checked but the answer is NOT changed (unless a 考選部 更正 PDF supersedes — 115-1 corrections Q66/Q95 already applied).
- No Dexie `.version()`, R2 `SCHEMA_VERSION`, or sync-adapter change (pure content/provenance/sidecar data + build artifacts).

## Capabilities

### New Capabilities
<!-- none — reuses the existing corpus / provenance / 簡答 pipelines -->

### Modified Capabilities
- `neurons-corpus-ingestion`: the 115-1 explanation provenance flips from the **AI-generated path** to the **陽明-reconcile path** — 115-1 no longer carries `explanationSource: 'ai-generated'`, is sourced from the real 陽明 詳解, and retains a real 簡解 Key head (removed from the no-Key sitting list). The AI-generated-path requirement itself is retained as the general escape-hatch for any future sitting 陽明 has not covered, but 115-1 is no longer its example.

## Impact

- **Data**: `packages/content-neurons-tw/data/medexam-reconciled/questions.json` (200 × 115-1 `explanation` / `sourceCredit`, drop `explanationSource`); `provenance/question-page-map.json` + `question-page-map-residual.json` (add ~200 × 115-1 entries; possibly `verified-overrides.json` for stubborn cases); `provenance/option-explanations.generated.json` (overwrite 200 × 115-1 entries). Source `_extracted/…/115-1.md` (owner-local, not in repo).
- **Build artifacts (regenerated)**: `apps/neurons-tw/public/provenance/question-pdf-map.v1.json`, content pack `dist/`, `apps/neurons-tw/public/content/neurons-tw/`.
- **Scripts touched**: `packages/content-neurons-tw/reconcile/restore_jianjie_key.py` (`EXCLUDE_YS`); a small one-off merge helper for Route B. Resolvers / builder / `merge-jianda-batch.ts` reused as-is.
- **Gates**: `verify:option-explanations`, content-build No-Silent-Errors counters, `pnpm -r typecheck`, Chrome dev smoke on `/bank`. Deploy to prod is a separate 對外發布 gate (out of scope here).
- **Meta**: `data/medexam-reconciled/meta.json` `aiGenerated: 200` becomes stale → set to 0 (cosmetic; the app's AI banner is driven per-question by `explanationSource`, not by meta).
