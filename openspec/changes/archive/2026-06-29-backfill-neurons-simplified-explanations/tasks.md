## 1. Setup + queue split

- [x] 1.1 `pip install pymupdf` (offline only); confirm `python3 -c "import fitz"` works — installed PyMuPDF 1.27.2 into an isolated venv (system pip3 is PEP-668-blocked; avoided `--break-system-packages`)
- [x] 1.2 From `manual-review.json` + the two page maps, compute the 3 queues. **Recomputed by issue-type** (handoff estimate was off): `compress` = det-fail whose only issues are length (2); `pdf` = needs-regen (qa-major OR structural det-fail: empty/markup/keys) AND has a page map (60); `fallback` = needs-regen with no map (18). Total 80. `backfill-prep.ts` writes per-question input files + manifest.json
- [x] 1.3 Render the `pdf_queue` pages with `render-backfill-pages.py` (venv python; 2.5×, 0-based). **2-page window** (mapped page + next page) because older continuous-flow 詳解 spills onto page+1; newer years are self-contained cards. 120 PNGs. Spot-checked Q88 (104-1, flow→spillover) / Q50 (107-2, card) / Q95 (114-1, card) — all show the right question's 詳解

## 2. compress_queue (Haiku text)

- [x] 2.1 Compress queue = 2 (true length-only det-fails; the other 24 det-fails are markup/structural → routed to pdf/fallback). Generated via the unified Sonnet workflow (queue branch "compress": shorten-only, no new facts) → both passed validator + QA. (Used Sonnet not Haiku for the whole fan-out — only 2 items, not worth a separate model lane.)

## 3. pdf_queue (Sonnet vision)

- [x] 3.1 Workflow fan-out (Sonnet vision): 60 pdf-queue agents, each reads its 2-page window + qid/qNumber/stem/options/answer, locates the question by number/stem, returns NEEDS_REVIEW rather than borrowing a neighbour, writes `out/<qid>.json`. Ran the whole 80 as one `gen → QA` pipeline (`backfill-workflow.mjs`); concurrency auto-capped (≥ the 4–6 target)
- [x] 3.2 Every output re-run through the COMMITTED deterministic validator (`backfill-finalize.ts`) + an independent Sonnet QA judge stage (faithfulness + neighbour flag). Round 1: 58 pass-pass shipped, 22 fail (14 det = length/markup, 8 qa-major). `repair-workflow.mjs` repair+re-QA round recovered 19 more (kept good lines, treated acceptedAnswers as credited, returned needs_review on answer-key conflict). No crop-retry was needed (the 2-page window already captured spillover)

## 4. fallback_queue (Sonnet text) + finalize

- [x] 4.1 Fallback queue = 18 (qa/structural-det with no page map). Sonnet text strong-regen (`source='text-strong-regen'`) from stem/options/answer + text 詳解; all 18 shipped after validate + QA (incl. 2 recovered in the repair round). No derive-page retry needed
- [x] 4.2 Merged 78 pass-pass into `option-explanations.generated.json` (`sourceHash` recomputed from corpus; per-entry `source` + model `claude-sonnet-4-6` + promptVersion `backfill-v1` + pdfFile/pdfPage/pdfScale for pdf entries). Removed shipped qids from `manual-review.json` (2 remain); refreshed `meta.json` (+ `backfill` block). Added additive `source?` to `OptionExplanationEntry` in `validate.ts` (build + verify ignore it)
- [x] 4.3 `pnpm run build:neurons-content` → `option-explanations: merged 4588 / without 簡答 12` (the 12 = corpus-ineligible: no 詳解 / <2 options). `verify:option-explanations` gate: **4588 ok / 0 failed** = 100% of eligible questions now have a 簡答.

## 4b. Re-sync after the coupled corpus fix (commit 2f05bc2)

- [x] 4b.1 While this change was in flight, a sibling commit `2f05bc2` fixed 18 `104-1-醫學二` option-A extraction defects + Q74 answer A→B (corpus `questions.json` only, no sidecar re-sync). That changed the `sourceHash` of 17 sidecar entries (16 in the ORIGINAL 4508 + my Q65) → `verify` went red. Wrote `resync-sidecar-hashes.ts`: rehashes only entries whose 簡答 still validates AND has no blank/placeholder line; reports the rest. 16 rehashed safely (their option-A 簡答 already named the correct drug — the original model read it from the leaked stem text), 1 flagged (`Q11`).
- [x] 4b.2 Regenerated/completed the 3 entries the corpus fix unblocked or broke: `Q11` (placeholder "選項A為空白" → faithful MAP-calc line for option "70"), `Q74` (answer-key conflict resolved → vision-authored 簡答 from its 詳解 BZD half-life table, answer B Prazepam), `Q86` (corpus was correct; conservative conditional-probability distractor lines, no fabricated trap derivations). **Final: 80/80 manual-review resolved → sidecar 4588, 0 remaining.**

## 5. Verify + ship

- [x] 5.1 `pnpm -r typecheck` green (all packages incl. new backfill scripts) + `pnpm --filter @study-rpg/neurons-tw test` green (742 tests)
- [x] 5.2 Chrome MCP dev smoke (localhost:5176, /bank): backfilled `104-1-醫學一-公共衛生學-Q88` renders 📖 簡答 with per-option lines A–D + 正解 (D); a no-簡答 qid showed none. Console clean. Also verified in the built public `questions.json`.
- [ ] 5.3 commit (explicit per-file; exclude foreign in-flight `eliminate-cross-device-*` / `remove-reading-loop-*`) → `/opsx:archive` (sync the neurons-simplified-explanations ADDED reqs) → merge track-neurons → main → CF Pages deploy → prod spot-check a backfilled qid on `med-study-rpg.com/neurons/bank`
