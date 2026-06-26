## Context

This change started as `rebuild-neurons-corpus-from-official-pdfs` — a full re-source of the neurons question corpus from 考選部 official PDFs, premised on the corpus questions being garbled 陽明-sourced content. Phase-0 probes (read-only, evidence in `PROBE_RESULTS.md` + `probes/probe_corpus.py`) disproved that premise and the owner re-scoped to a surgical fix. The probe work was not wasted: it proved the corpus is already clean + id-stable, and it found two real defects.

## Key finding (why the rebuild was descoped)

`reconcile.py` is "Reconcile **考選部 authoritative** PDFs against 陽明" — stem/options/answer already come from 考選部, 詳解 from 陽明, stem diffs resolved 「以考選部為準」. A fresh official parse confirmed it:

- 107-115 stems: **3266/3400 byte-identical**; the 134 differences are cosmetic `pdftotext -layout` whitespace (e.g. `280 nm波長的 光`), **0 garble fixes, ~3 superscript regressions** (`PrP^C` → `PrP（）`).
- 0 garbled / 0 empty-option / 0 missing-answer questions in 107-115 **and** in 104-106.
- The garble the owner hit was in 陽明 **詳解** (kept, not re-sourced).

So a full re-source delivers ~0 content benefit while adding whitespace churn + superscript-regression risk, and dropping 104-106 would lose 1200 clean questions + player progress. Descoped.

## Decisions

### D1 — Deliver only the two real defects the probe found, surgically
The robust official-answer parser (`parse_moex_official.py`: spatial answer-grid + 備註 decode) re-verified 2970/2970 standard answers (0 conflicts) and found **3 送分/更正 the existing pipeline missed** — its positional `parse_answers` is 59% wrong on `MOD` files. Fix those 3 in place (`disputed`/`acceptedAnswers`). Everything else in the corpus is correct and is left byte-identical. **Alternative:** full re-source — rejected (no benefit, see above).

### D2 — Capture only genuine 題幹 figures; flag image-only-option questions
Of 35 questions with a raster image in the official PDF, most are decorative/inline (math/chemical symbols ≤25px). Extract the ~5 genuine diagram/table figures (visually QA'd) into `figures/<id>.png` — the existing `neurons-question-figures` build mechanism wires them. Two questions (`109-1-生化-Q100` DNA sequences, `114-1-生化-Q77` NAD structure) have **image-only options with no recoverable text** (even `pdftotext -layout` yields blank A./B./C./D.) → currently 4 blank, unanswerable options. Flag `hasOptionImages: true` so the existing `QuizModal` pool filter excludes them. **Alternative:** extract per-option images — rejected (no app render path for option images; exclusion is the established pattern).

### D3 — Keep the full corpus; no schema/sync change
All 4600 questions retained (104-115). This is a pure content-data + asset change: 5 question-field edits + 4 PNGs. No Dexie `.version()` bump, no R2 schema change, no app code change → the upgrade-fixture lint and orphan-tolerance work are all moot. **Alternative:** drop 104-106 (original grill) — rejected after the probe showed 104-106 are equally clean.

## Risks / Trade-offs

- **A 送分 edit credits the wrong option** → mitigated by deriving each from the official 備註 verbatim + the parser's 2970/2970 standard-answer agreement.
- **A figure crop is wrong/decorative, or mis-attributed to the wrong question** → real risk on 2-column PDF pages, where a naive y-based image→question map mis-owns figures. Caught in live Chrome-MCP QA (Q29 was showing Q13's figure) and fixed by re-extracting **column-aware** (nearest-preceding 題號 in the SAME column); a column-aware sweep of all 34 PDFs confirmed all 17 genuine figures are correctly owned. The `[圖]` fallback covers any future broken asset.
- **Flagging `hasOptionImages` hides 2 questions from the quiz** → acceptable: they are unanswerable as-is; they remain browsable in the question bank.

## Out of Scope

- The full official re-source (the original rebuild) — descoped.
- Dropping 104-106 — kept.
- 18 partially-blank-option questions — noted follow-up, not fixed here.
- The 6 remaining `[圖]` placeholders (104-105 病理/生理) — no official PDF source exists for those years.
- The 106-111 詳解-figure recovery (uncommitted `recover-neurons-explanation-figures-full` WIP) — ships as its own separate change.
