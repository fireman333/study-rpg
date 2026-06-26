# Design — raise-neurons-pdf-provenance-agent-coverage

## Context

`expand-neurons-pdf-provenance-coverage` left an agent worklist (80 disagree + 157 suspect + 996 unresolved). Profiling it showed three disjoint slices: 200 un-sourceable (115-1 has no 陽明 PDF), 500 scanned (no text layer), and ~502 born-digital that the base resolver's single-token 題號-anchor missed. Owner opted into a multi-agent pass.

## Decision 1 — Hybrid: deterministic bulk + agents for the genuinely hard

A 40-agent fan-out over ~500 PDF-reading tasks is slow, costly, and off-by-one-prone at scale. Instead a **second-layer deterministic resolver** (`resolve_residual.py`) recovers the bulk, and agents resolve only what determinism can't. Measured split: **393 deterministic + 109 agent worklist** (not 502 agent tasks).

- **Clean-text booklets** → multi-token stem voting in the within-booklet monotonic window. A distinctive ≥6-char CJK stem run on a page is a near-unique content fingerprint.
- **Garbled-text booklet (104-2 醫學二)** → its CJK text layer is mojibake (broken embedded font, no ToUnicode), but Latin terms + the per-card question number survive and the pages render perfectly as images. Resolved by numeric-anchor + Latin cross-check; the residual verified by **vision agents reading rendered page images**.

## Decision 2 — Stem-run, not monotonicity, is the authoritative validator

陽明's internal card numbers do **not** match 考選部 qNumbers (booklets skip/renumber cards), and a single PDF page holds **multiple** question cards. Two consequences:

- A pure **monotonicity** heuristic false-rejects correct answers: in 106-1, 22 agent answers with the full 題目 stem verbatim on the page (run = 24) were killed because one off earlier anchor poisoned the chain. Fix: monotonicity is only a *fallback* (for garbled booklets and reworded-stem agent answers); the primary gate is **longest contiguous stem run ≥ 8** on the chosen page — direct proof the 題目 line is there, immune to numbering quirks.
- The **audit agent was unreliable**: it judged from a truncated page-top snippet and was fooled every time by multi-card pages (all 4 of its 30-sample "failures" were false positives — independent stem-run ground truth confirmed the original pages correct). Audit verdicts are therefore **informational only**; the deterministic stem-run check is the authority.

Agents still add irreplaceable value where stem-run can't reach: reworded stems they locate by 題號/options, image-heavy cards (run = 0 but visible), and **correctly refusing to map** questions whose 詳解 simply isn't in the PDF (caught corpus/booklet qNumber mismatches in 106-1 醫學二) — those stay unmapped (button hidden) rather than guessed.

## Decision 3 — Layered, reproducible sources

`question-page-map-residual.json` is a **separate committed layer** from the base `question-page-map.json`, so re-running either resolver never clobbers the other's coverage. Agent results are committed as `agent-resolved.json` ({id: page0}) and folded back via `resolve_residual.py --agent-results`, re-gated identically — so the residual layer is fully reproducible from committed JSON (CI needs no PDFs). The builder merges three sources with earlier sources winning (manifest figure-page > base text > residual).

## Outcome

Coverage 3398 → **3881 / 4600**. Remaining unmapped (button hidden, graceful): 500 scanned + 200 no-source-115-1 + 19 born-digital (agent-null / reworded-no-run). Scanned + 115-1 are deferred to a separate change only if owner wants 100%.
