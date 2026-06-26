# neurons 詳解-figure health-check (Phase 1, read-only)

Deterministic detector that audits how faithfully the 陽明 source PDFs' embedded
詳解 figures survived extraction into `questions.json`. **Read-only** — it writes
only into this directory and never touches `questions.json` or any product asset.

## What it found (2026-06-26 baseline, per-page region-split attribution)

The corpus's biggest unrecovered gap is **embedded 詳解 figures** (hand-drawn
diagrams + Netter crops): `extract_exam.py` only set a page-level boolean and never
saved image bytes. Per the canonical inventory (each image attributed to exactly one
question via per-page 題號 region splitting — see "Attribution" below):

- scanned **3,624 / 4,600** questions (976 unscanned = 104-105 layout-parser miss, **not** all mojibake)
- **1,181** questions have a 詳解 figure; **1,063 net-new** (no existing `explanationBlocks`)
- **1,764** total figures; **355** multi-figure questions
- stem images **11**, option images **0** (near-empty side categories)
- no-text-layer booklets (OCR candidates): 104-1, 104-2-醫一, 105-1

> NOTE: an earlier greedy version (question page-range `[sp_N, sp_{N+1}]`) **over-counted ~4×**
> (2,582 q / 7,271 figs) because boundary-page images were double-counted across overlapping
> ranges and neighbours' figures were swept in (e.g. Q1 央被覆髓徑 absorbing a later visual-pathway
> figure). The region-split numbers above are the de-duplicated, correctly-attributed counts.

## Run

```bash
# needs PyMuPDF (fitz) >= 1.24 — uses page.get_image_rects. Pin: pymupdf==1.27.*
python detect_figures.py \
  --source-root "$HOME/Desktop/國考/一階國考/陽明國考考古" \   # dir of 陽明 *.pdf (not in repo)
  --corpus ../../data/medexam-reconciled/questions.json \
  --out healthcheck_inventory.json
# pilot subset only:
python detect_figures.py --only 112-   # (repeat for 113- / 114-)
```

Source PDFs live on the owner's machine (see project `CLAUDE.md` → "Source data path";
override with `--source-root`). The detector is deterministic — same input → same inventory.

## Outputs (this dir only)

- `healthcheck_inventory.json` — per-question records: `{year,session,book,qnum,pages,
  candidates[],counts,corpusId,corpusHasImage,corpusHasBlocks}`. Each candidate:
  `{page,xref,bbox,areaRatio,band(stem|option|explanation|unknown),decision(extract|render-crop)}`.
- `healthcheck_report.json` — corpus-wide rollup (the numbers above).

## How it works

Vendors the proven question-start parsing from `_scripts/extract_exam.py`
(`parse_filename` / `find_question_starts` / `offset_to_page` / `build_full_text_and_pagemap`
/ `SUBJECT_MAP`) so the tool is self-contained.

### Attribution (per-page 題號 region splitting)

A card can overflow onto the next page while the next question's card starts on that same page,
so a naive "question owns pages `[sp_N, sp_{N+1}]`" sweeps in the neighbour's figures. Instead,
**each page is split into question-owned vertical regions**: region boundaries come from the
`題號` anchor y-positions on that page (`search_for("題號")`); ownership comes from the
question-start map (the qnums whose start-page == this page, matched to the anchors in y-order);
the band from page-top to the first anchor is the **continuation tail of the still-open previous
question**, carried across pages. Each `>1.2%-page` raster (minus repeated-xref logos and
header/footer strips) is assigned to **exactly one** region by **vertical-overlap majority**
(`≥0.70` accept; `0.55–0.70` with margin → `review`; ~50/50 straddle → skipped). The band
(stem / explanation) is read from the row labels **within that region only**. Each candidate
carries `attributionConfidence` (`high` / `medium` / `review`). Invariant: an image attributes
to at most one question, and a question's figures fall between its `題號` anchor and the next.
