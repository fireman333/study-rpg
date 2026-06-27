## Why

The owner's end-to-end **44-PDF verification** (sample mapped questions from each 陽明 PDF against the live prod map, confirm the page actually holds that question) surfaced a **pre-existing correctness bug in the base map** (`question-page-map.json`, shipped in `expand-neurons-pdf-provenance-coverage`): the base resolver's 題號-anchor with a lenient ±1 stem cross-check sometimes mapped a question to the **previous card's page** (the stem token leaked into the prior card's 詳解, and ±1 accepted it). A full stem-run audit of the live 4384-entry map found:

- **manifest (1128) + verified-overrides (4): 0** weak entries (bbox/human-verified).
- **residual (982): 78** run<8 — almost all the garbled 104-2一/二 (mojibake text; vision-verified, correct).
- **base (2270): 109** run<8 → categorized: **77 genuine off-by-one** (a *different* qNumber sits on the mapped page), 19 correct image-rendered cards (qNumber present), 13 garbled.

Of the 77 off-by-ones, **65 are deterministically fixable** — re-resolving to the booklet page carrying the longest contiguous run of the question's own stem lands a clear winner (run ≥10, almost always **+1**; verified 65/65). The remaining 12 are image-rendered 公衛/病理 cards with no extractable stem text (deferred to a vision pass).

## What Changes

- **New committed `provenance/base-corrections.json`** (65 entries) — deterministic stem-run re-resolutions of the base off-by-ones, each confirmed at run ≥10 on the corrected page.
- **Builder reads it as a 5th source** (`build-provenance-map.mjs`), winning over base + residual (below verified-overrides). Map `count` is unchanged (4384) — only the *pages* of 65 questions are corrected.
- **No** other change. The base resolver itself is unchanged (a separate hardening could fold the stem-run gate into `resolve_all_pages.py`; this surgical correction layer fixes the known-wrong pages without re-validating all 2270).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: a committed base-corrections source carries deterministic stem-run re-resolutions for base-resolver off-by-one errors, winning over the base and residual maps.

## Impact

- **New**: `provenance/base-corrections.json` (65 corrected pages).
- **Modified**: `apps/neurons-tw/scripts/build-provenance-map.mjs` (5th source).
- **No** runtime/UI/sync change. Public map stays a gitignored build artifact.
- **Deferred** (follow-up): 12 image-rendered base cards (公衛/病理, no extractable stem) + 13 garbled-104-2 base anchoronly entries → a vision pass can verify/correct them; low count, currently low-confidence-but-shipped.
