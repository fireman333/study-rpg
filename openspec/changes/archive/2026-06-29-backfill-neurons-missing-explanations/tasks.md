## 1. Locate + render PDF windows

- [x] 1.1 `locate-missing-explanation-pages.ts` computed the 12 empty-`explanation` questions + each one's 陽明 詳解 PDF + estimated page (interpolated by qNumber from same-paper mapped neighbours; 2 direct-map). Per-question input files + manifest written
- [x] 1.2 Rendered each question's ±3 page window (PyMuPDF 2.5×, isolated venv) → 84 PNGs. (The 2 mapped pages were eyeballed at propose time: real 陽明 詳解 cards present)

## 2. Recover (vision) — recover-first

- [x] 2.1 12 parallel Sonnet vision agents over the windows. **2 recovered** (Q37 antibody / Q38 gluconeogenesis — faithful 陽明 詳解 transcribed). **10 no-card** — and the reports are positive evidence 陽明 skipped them, not window misses: 107-1 Q34/35/36 + 111-1 Q74/75 + 112-2 Q75 sit where the card numbering JUMPS over them (Q30→Q37, Q73→Q76); 106-1 生化 Q45/46/47/48's distinctive terms (carbamoyl/Cytochrome/Krebs/kinase A) are absent from the whole PDF
- [x] 2.2 Split = **2 recovered / 10 AI-generate**. (Recover-first honoured; no widen needed — the missing 10 are genuine 陽明 skips.)

## 3. AI-generate the 陽明-skipped subset (fallback)

- [x] 3.1 Generated all 10 `no-card` 詳解 via **Gemini (agy, owner's choice)** in the exact 115年 format (`正解：(X)` + per-option prose + footer `（本詳解由 AI 生成，未經陽明審定）` appended deterministically) + `explanationSource:'ai-generated'`. Ran sequentially in the background (parallel agy timed out — heavy binary). 10/10 clean format
- [x] 3.2 Eyeballed all 10 — medically accurate + affirm the official answer (spot-checked Q34 West-Nile=mosquito-not-tick, Q46 Cytochrome=Fe, Q74 [S]≫Km=zero-order, Q75 iron=deferoxamine, Q36 cohort=multi-exposure). Tagged unverified per design

## 4. Write corpus + run 簡答 pipeline

- [x] 4.1 Wrote all 12 `explanation` (+ `explanationSource:'ai-generated'` on the 10 AI ones) into `questions.json` **byte-safe** (targeted per-qid replace of the empty `"explanation": ""`, no `json.dump` reformat; id/options/answer untouched). Validated: parses, 0 empty explanations remain, corpus still 4600
- [x] 4.2 Built 簡答-gen inputs (with the now-present 詳解) → `jianda-workflow.mjs` gen+QA (Sonnet text, condense 詳解 → per-option 簡答; resumed once for 4 rate-limited QA). 12/12 QA-pass; `merge-jianda-batch.ts` merged 12 (2 needed a length-trim) into `option-explanations.generated.json` with `source: text-from-{ai,recovered}-詳解`
- [x] 4.3 `resync-sidecar-hashes.ts` 0 drift (entries created with correct hashes); `verify:option-explanations` **4600 ok / 0 failed**

## 5. Build + verify + ship

- [x] 5.1 `pnpm run build:neurons-content` → **`option-explanations: merged 4600 / without 簡答 0 / total 4600` = 100% coverage**. `pnpm -r typecheck` green; `pnpm --filter @study-rpg/neurons-tw test` 742 passed
- [x] 5.2 Chrome MCP dev smoke (localhost:5175 /bank): recovered Q38 shows 📖 簡答 + NO AI note; AI Q46 shows 📖 簡答 + 「※ 本題原始詳解由 AI 生成，僅供參考。」 note
- [ ] 5.3 commit (explicit per-file) → `/opsx:archive` (sync `neurons-corpus-ingestion` ADDED reqs) → merge track-neurons → main → CF Pages deploy → prod spot-check a completed qid on `med-study-rpg.com/neurons/bank`
