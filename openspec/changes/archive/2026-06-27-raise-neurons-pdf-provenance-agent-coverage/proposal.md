## Why

`expand-neurons-pdf-provenance-coverage` raised the「看原始詳解 PDF」map from 1128 → **3398/4600** with a deterministic anchor+stem resolver, and deferred a follow-up **agent pass** for the questions it could not confidently map: **80 disagree + 157 suspect + 996 unresolved** (its `resolve-report.json` worklist). This change is that pass.

Investigating the worklist showed the residual is smaller and more structured than the headline 733/996 numbers suggested:

- **200 are simply un-sourceable** — booklet **115-1** (醫學一+二) has **no 陽明 PDF** on disk (newest exam, not yet published). Nothing can map them until a PDF exists; they stay unmapped.
- **500 are the 5 scanned (no-text-layer) booklets** (104-1一/二, 104-2一, 105-1一/二) — need OCR/vision, the heaviest + lowest-value slice. **Deferred** (separate change if owner wants 100%).
- The genuinely addressable born-digital residual is **502**, of which a stronger deterministic resolver recovers **393** outright, leaving **109** for agents.

Most of the 502 failed the base resolver for one of two reasons, both fixable: (1) its single-token 題號-anchor missed the question (but the stem's distinctive CJK runs are still findable), or (2) booklet **104-2 醫學(二)** has a **broken custom-font text layer** (CJK extracts as mojibake) — yet its Latin terms + per-card question numbers survive, and every page renders correctly as an image.

So this is a hybrid, not a 40-agent fan-out: a stronger deterministic resolver does the bulk (verified by an independent stem-token-on-page content check + visual spot-checks), and a tightly-scoped **agent Workflow** resolves only the genuinely-uncertain remainder — reading rendered pages for the garbled booklet (vision) and PDF text for the clean ambiguous/no-hit/mono-violation cases — returning `{id, page0}` that is re-gated for monotonicity + content before merge. A wrong page is never shipped (button just stays hidden).

## What Changes

- **New committed resolver** `reconcile/healthcheck/resolve_residual.py` — a *second layer* on top of the base resolver (never clobbers `question-page-map.json`). Resolves the born-digital residual via **multi-token stem voting** within the base map's monotonic window (clean booklets) and **numeric-anchor + Latin cross-check** (garbled 104-2二), folds in agent-confirmed pages via `--agent-results`, and re-applies the monotonic + content gate. Emits a third committed source `provenance/question-page-map-residual.json` + a refreshed `provenance/residual-agent-worklist.json`.
- **Agent Workflow** (one-time, ~18 agents over 2 waves): per-booklet agents independently resolve the **109 born-digital uncertain** questions + a **30-question audit sample** of the auto-merged deterministic layer. 104-2二 agents read rendered page images; clean-booklet agents read PDF text. Their `{id, page0}` results (after monotonic + content re-gate) are committed as the `--agent-results` input so the layer is fully reproducible from committed JSON.
- **Builder reads a third source**: `apps/neurons-tw/scripts/build-provenance-map.mjs` now merges manifest (wins) + base text map + residual map, all 0-based → +1.
- **New committed helper** `reconcile/healthcheck/pdf_page_text.py` (read-only page-text dump for the agent pass).
- **Coverage**: 3398 → **~3850/4600** (348 auto-merged + ~109 agent-resolved born-digital, exact count after the agent pass). Remaining unmapped: 500 scanned + 200 no-source-115-1 + a handful of genuinely-unlocatable — all keep the button hidden (graceful, already specced).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the resolved-page coverage is extended by a second resolver layer (multi-token stem voting; numeric-anchor + Latin cross-check for garbled-text-layer booklets) and an agent-verified residual, all re-gated for monotonicity + on-page content. Scanned, no-source, and still-conflicting questions remain unmapped (button hidden).

## Impact

- **New**: `reconcile/healthcheck/resolve_residual.py` · `reconcile/healthcheck/pdf_page_text.py` · `provenance/question-page-map-residual.json` (committed residual layer) · `provenance/residual-agent-worklist.json` (refreshed worklist) · the agent-results JSON folded into the residual layer.
- **Modified**: `apps/neurons-tw/scripts/build-provenance-map.mjs` (merge a third source).
- **No** runtime/UI change (`LocalPdfButton` + adapter unchanged — they just see a bigger map). No Dexie / R2 / sync / Vitest schema change. Public map stays a gitignored build artifact.
- Resolver + agent pass need the 陽明 source PDFs (owner's `~/Desktop/…`, not in repo/CI); their **outputs are committed**, so CI builds the public map from committed JSON without the PDFs.
- **Deferred** (separate change, only if owner wants 100%): the 500 scanned questions (OCR/vision over 5 booklets) and the 200 115-1 questions (blocked until a 115-1 PDF exists).
