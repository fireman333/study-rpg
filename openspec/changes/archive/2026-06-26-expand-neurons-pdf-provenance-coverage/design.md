## Context

Phase 1 mapped 1128 figure questions (free from the manifest). The ~3472 text questions had no page. The figure-detector `detect_figures.py` already resolves every born-digital question's page (`find_question_starts`/`offset_to_page`/`build_full_text_and_pagemap`) but only persisted figure pages. Owner picked "deterministic-first + agents to verify" over an LLM page-finding fleet.

## Goals / Non-Goals

**Goals:** maximize *correct* coverage deterministically; never ship a guessed page (a wrong page is worse than no button); make the text map a reproducible committed artifact; precisely scope the residual for a later agent pass.

**Non-Goals:** OCR of scanned booklets (this change); LLM page-finding for the bulk; runtime/UI change; mapping questions the two signals can't agree on.

## Decisions

### D1 — Reuse the trusted detector primitives, not an LLM fleet
`resolve_all_pages.py` imports `parse_filename` / `build_full_text_and_pagemap` / `find_question_starts` / `offset_to_page` from `detect_figures.py` (the exact code that produced the 1128). Deterministic, seconds over 46 PDFs, verifiable. **Alternatives:** ~46 agents reading PDFs to count pages — slower, costlier, off-by-one ×thousands, hard to trust.

### D2 — Two independent signals; ship only on agreement / unverifiable, exclude on conflict
Signal A = 題號 anchor (`find_question_starts`) gated by within-booklet monotonicity. Signal B = corpus-stem distinctive token searched in the PDF. `verified` (A≈B ±1) and `anchoronly` (B absent — 詳解 may not reproduce the stem) ship; `disagree` (A≠B) excluded. Catches the "coincidental number anchor" failure deterministically; the off-by-one we hit in Phase 1 would surface as systematic anchor-absence (it didn't — 97.5% anchor-present audit).

### D3 — Page indexing stays 0-based in both committed sources; builder does the single +1
Manifest and the text map both store 0-based PyMuPDF pages; `build-provenance-map.mjs` adds +1 once → 1-based `#page=N`. One conversion point, consistent with Phase 1's off-by-one fix.

### D4 — Exclude scanned (notext) booklets from the shipped map
5 booklets (104-1一/二, 104-2一, 105-1一/二) have no usable text layer → `find_question_starts` yields spurious anchors. Their resolutions are excluded (routed to the OCR/agent residual) rather than shipped as guesses. Only 17 had leaked; now 0.

### D5 — Committed text map + resolver as SOURCE; public map stays gitignored build output
The resolver needs the owner's local PDFs, so its *output* (`question-page-map.json`) is committed (like the manifest); the builder reads committed JSON in CI without the PDFs. Mirrors Phase 1's D3b (public/ = regenerated, never hand-committed).

## Risks / Trade-offs

- **anchoronly (350) unverified by stem** → ~3% wrong-page risk (anchor audit 97.5%). **Mitigation:** a wrong page is a minor scroll, not a crash; the later agent pass can spot-check; conflicts are already excluded.
- **Resolver not reproducible in CI** (needs PDFs). **Mitigation:** output committed; CI only merges. Re-run locally when the corpus changes.
- **Residual 1233 (80 disagree + 157 suspect + 996 unresolved)** stays unmapped. **Mitigation:** graceful (button hidden); follow-up agent/OCR change.

## Migration Plan

Additive: new committed source + builder merge. Deploy via normal CF Pages (the new `public/provenance/` allowlist entry already landed in `0d90564`). Rollback = revert the builder merge + remove the text map → back to 1128. No data risk.

## Open Questions

1. **Follow-up agent pass** (separate change): adjudicate 80 disagree + 157 suspect; OCR/visually resolve 996 unresolved (incl. 5 scanned booklets). Scope + cost TBD with owner.
2. Whether to also ship `anchoronly` behind a confidence flag, or hold until the agent pass verifies them — currently shipped (owner chose the 3415/3398 batch including anchor-only).
