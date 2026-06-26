## Why

The pilot `recover-neurons-explanation-figures` proved the recovery mechanism on the 112-114 booklets (636 q / 926 figures, LIVE on `med-study-rpg.com/neurons/`), but the rest of the corpus's embedded 詳解 figures (hand-drawn diagrams / Netter & textbook crops) are still unrecovered — players see flat text where the original 陽明 booklet had a diagram. The whole pipeline (detector / render-crop extractor / build-injection / lazy renderer / `ExplanationFigure` type / agent-QA recipe) is already on `main`; recovering the remaining figures needs **no app-code change** — growing `explanation-figures/manifest.json` + a rebuild ships them.

- **Fix the extractor's manifest semantics** (`extract_figures.py`): it was overwriting the whole manifest with only the `--only`-filtered batch (would have wiped the 112-114 pilot). Change to **merge-by-qid** so per-batch runs preserve earlier batches (satisfies the spec's "earlier-shipped figures SHALL be unaffected" requirement).
- **Extract 106-111 figures** (already fully scanned in `healthcheck_inventory.json`, 543 figure-questions ready) via the existing render-crop extractor, completing figure coverage for the **106-114** booklets.
- **Agent-QA the multi-figure subset** in waves of 6 general-purpose agents (each Reads the crop images, emits `accept | reject | uncertain`); a deterministic step applies only `accept` verdicts; `reject`/`uncertain` crops are pruned from the manifest and their webp deleted.
- **Owner preview-sheet review** (fail-stop on any mis-attribution) before shipping.
- **Rebuild + ship**: source-and-build immutable-text gate, deploy file-count preflight vs the CF Pages limit, vitest green, Chrome-MCP `/bank` lazy-fetch verify → archive → per-file commit → merge `track-neurons`→`main` → `deploy:cf` → prod-verify a figure asset 200s.
- **Explicitly deferred to a follow-up change (NOT here):** the **104-105** booklets AND the **109-1 醫學一 / 111-1 醫學二** booklets all lack `題號` row-label anchors, so the detector's region-split degenerates (one early question sweeps the whole booklet). They need a **no-`題號`-anchor layout-parser fallback** in `detect_figures.py` — a larger detector change with unknown 104-105 payoff. Also deferred: migrating the 49 bundled `neurons-explanation-table-images` webp to the lazy figure tier (pilot design D4).

## Capabilities

### New Capabilities

<!-- none — reuses the existing figure-recovery capability -->

### Modified Capabilities

- `neurons-explanation-figures`: broaden the **Pilot scope and batch-extensible contract** requirement so the in-scope id set extends from the 112-114 pilot to the **106-114** booklets (under the identical contract — rasterized provenance-recorded crops, lazy-loaded, question text byte-identical), explicitly excluding the two `題號`-anchor-less reflow booklets (109-1 醫學一, 111-1 醫學二) that are deferred with 104-105 to a follow-up.

## Impact

- **Content package** (`packages/content-neurons-tw/`): `reconcile/healthcheck/extract_figures.py` gains merge-by-qid manifest semantics (idempotent; preserves prior batches); `explanation-figures/manifest.json` + content-addressed `*.webp` grow by the 106-111 batch (the only shipped data change). Source `questions.json` is **never** edited — figures are build-injected. `detect_figures.py` is **not** changed in this change (the no-anchor fallback is the follow-up).
- **Build / deploy**: `build:neurons-content` re-injects the larger manifest into the BUILT `questions.json` + copies webp; `copy-content.mjs` → public; `deploy:cf` ships. File count grows from 926 figures (pilot) to ~1,600 (pilot + 106-111, minus QA-pruned) — far under the 20,000 CF Pages free-tier limit; preflight asserts.
- **No change** to `core` (`ExplanationFigure` type already at 0.6.4), `Explanation.tsx`, Dexie schema, R2 sync, the Worker, or game economy.
