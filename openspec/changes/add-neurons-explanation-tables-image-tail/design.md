# Design — add-neurons-explanation-tables-image-tail

## Context

This is batch 2 of the image-crop tier. Batch 1 (`add-neurons-explanation-table-images`, archived
2026-06-25) built and shipped the entire mechanism for 27 questions; this change reuses it for 29
more. The full data-model + build + render path already exists and is unchanged:

- **Type** (already shipped): `Question.explanationTableImages?: ExplanationTableImage[]`
  (`{src, caption?}`) in `@study-rpg/core@0.6.3`. No core change here.
- **Wiring** (already shipped): `build.ts` `wireFigure` chokepoint attaches `explanationTableImages`
  from `table-images/manifest.json` + prose-only `explanationBlocks` from `table-images/prose.json`;
  copies `table-images/*.webp` → `dist/` → app public via `copy-content.mjs`.
- **Renderer** (already shipped): `Explanation.tsx` renders the images after the prose, lazy, in an
  `overflow-x:auto` framed container with caption + alt.
- **Tooling** (already present): `packages/content-neurons-tw/scripts/table-images/`
  (`locate.py` / `crop.py` / `process_owner_crops.py` / `for_owner.py` / overrides sidecar).

So this change touches **only content/assets**: the 29 candidates' crops, manifest/prose entries,
and provenance — plus the integrity test's expected count.

## Goals / Non-Goals

**Goals**
- Give the recoverable subset of the 29 destroyed-OCR tables a faithful image crop + clean prose.
- Keep every guarantee of batch 1: rasterized (not transcribed) crops, owner-verified framing,
  faithful prose (verbatim substrings + PDF-sourced OCR corrections only), `id`/`answer` untouched.

**Non-Goals**
- No structured-text reconstruction of these tables (that's exactly what the faithfulness gate
  refused — the cell order is destroyed).
- No render/type/build code changes. No Dexie/R2/Worker/economy changes.
- Not every one of the 29 must get an image: a question whose explanation turns out to be a prose
  list (no real table) correctly stays flat.

## Decisions

### Decision 1 — Owner hand-crops, agents only assist
Batch 1's pivot stands: auto-vision bbox banding framed too loosely, so the owner hand-cropped all
27 (exact framing, domain-expert verified, lets a question carry multiple images). Batch 2 follows
the same path. Agentable / scriptable parts: build the `{year,session,book}`→PDF map and candidate
page window per qNumber (reuse `locate.py`), render candidate pages for owner review, encode WebP,
assemble `manifest.json` / `prose.json` / provenance, run the integrity test. The crop framing
itself is owner-driven.

### Decision 2 — Triage before cropping
The 29 are *presumed* tables (all fragment-heavy, 23–73 short lines), but a few may be prose lists.
Each id is triaged on the rendered source page into: **crop candidate** (real table visible) or
**stays flat** (no actual table). Only candidates proceed. The stays-flat outcome is a legitimate
terminal state (per the existing "Question that cannot be located stays flat text" scenario).

### Decision 3 — Clean prose is mandatory wherever an image is added
When an image replaces the on-screen garbled table, the flattened-table gibberish must be removed
from what is shown (batch-1 rule). Prose entries go in `prose.json`, gated by the existing exact
NFKC+PUA-tolerant substring check (every shown passage is verbatim from the original explanation,
except OCR-garble corrections sourced from the PDF pixels — e.g. `SOz`→`SO₂`). The original flat
`explanation` string stays in the data for search/fallback.

### Decision 4 — Cost discipline for any agent fan-out
Batch 1's prose proofread Workflow mis-read its work-list as 558 (not 27) → ~356 agents / 19.5M
tokens / hit the monthly spend cap. For batch 2: if any multi-agent step is used, **validate the
work-list length against the known id count before fan-out, cap per-agent token budget, and bound
escalation depth**. For the disputed handful, prefer re-reading the source PDF pixels directly over
agent fan-out (the path the owner used to salvage Q59/Q93 last time).

## Risks / Open Questions

- **Yield**: some of the 29 may be prose lists, not tables → fewer than 29 images. Acceptable; the
  triage records the disposition per id so nothing is silently dropped.
- **Source-PDF locating**: the same fuzzy filename/format variance as batch 1 (`醫學(一)` vs
  `醫學一`, 校正/修 variants, ~6 layout formats). Mitigated by reusing the batch-1 map + the
  whole-question-region fallback crop.
- **Multi-question crops**: as in batch 1 (Q83/Q94), a candidate crop can depict a neighbour's
  table → excluded per the existing scenario.
