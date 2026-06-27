## Why

`fix-neurons-pdf-provenance-base-offbyone` (archived 2026-06-27) deterministically fixed 65 base-map off-by-ones but explicitly **deferred 44 suspect entries** that its run≥10 gate could not adjudicate: 12 flagged off-by-one with no strong text page, 13 garbled-font (104-2 醫學二), and 19 image-rendered cards. Those 44 shipped **live as-is and could be wrong** (a wrong page sends the player to the wrong 詳解).

A fresh stem-run health-check (`reconcile/healthcheck/alignment_healthcheck.py`) over the 44 — measuring each entry's verbatim stem run on its current page vs a ±3 neighbour window — split them sharply:

- **6 deterministic off-by-one**: current page has the stem **absent** (run 0) while a neighbour carries a long verbatim run (9–24). Unambiguous. (Notably 5 were in the handoff's "image-card, low-priority" bucket — the health-check caught them.)
- **30 already-correct**: a per-booklet vision pass (15 agents reading the rendered pages) confirmed each stem on its currently-mapped page (these were the run-6/7 "local-max" entries + the garbled-but-right 104-2二 cards).
- **5 cross-booklet mis-filed**: 陽明 printed the 106-1 醫學一 公衛 詳解 inside the **醫學二** PDF and the 醫學二 病理 詳解 inside the **醫學一** PDF (a symmetric card-order≠qNumber swap). A cross-booklet full-text search relocated all 5 at run 18–30.
- **3 解剖 (106-1 醫學一 Q5/Q6/Q8)**: stem absent from both entire booklets' text layers; a wider vision scan settled whether 陽明 wrote them (→ override) or never did (→ removed from the base map so the action hides).

## What Changes

- **`provenance/base-corrections.json`** += 6 deterministic off-by-one re-resolutions (65 → 71), each confirmed by verbatim stem-run on the corrected page.
- **`provenance/verified-overrides.json`** += 5 cross-booklet relocations (4 → 9) — the exact "physical card order differs from the 考選部 qNumber" case the existing spec scenario already covers.
- **`provenance/question-page-map.json`** (base): the 3 解剖 entries are corrected (if a 詳解 was found) or **removed** (if 陽明 never wrote it → action hidden, never mapped to a wrong page).
- **30 entries unchanged** — vision-confirmed correct; recorded only as verification.
- **No code change**: `build-provenance-map.mjs` already reads all five sources; this is data only. Map `count` changes only by however many of the 3 解剖 are removed.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: adds a requirement making explicit two cases this pass exercised — a verified-override MAY relocate a question to the **sibling booklet** PDF (cross-booklet mis-file), and a question with **no 詳解 anywhere** SHALL be removed from the map (action hidden) rather than left at a wrong page. (The base-corrections-win and same-booklet override behaviours were already specified by `fix-neurons-pdf-provenance-base-offbyone` / `add-neurons-local-pdf-provenance`.)

## Impact

- **Modified data**: `provenance/base-corrections.json` (+6), `provenance/verified-overrides.json` (+5), `provenance/question-page-map.json` (3 解剖 entries fixed/removed).
- **New tooling** (committed, reproducible): `reconcile/healthcheck/alignment_healthcheck.py`, `render_for_vision.py`, `wider_search.py`.
- **No** runtime / UI / sync / schema change. Public map stays a gitignored build artifact (regenerated on build/deploy).
- **Deploy**: push main → GH Actions `Deploy Cloudflare Pages` → `med-study-rpg.com/neurons/`; prod-smoke = curl the live map, assert the corrected ids resolve to the new pages.
