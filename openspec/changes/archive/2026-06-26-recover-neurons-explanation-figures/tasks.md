## 1. Inventory tooling (land the Phase-1 detector)

- [x] 1.1 Port the scratch detector (`full_inventory.py` + helpers) into `packages/content-neurons-tw/reconcile/healthcheck/` with a README (how to run, what it emits) + a pinned PyMuPDF requirements note
- [x] 1.2 Add a layout-parser fallback so 104-105 booklets are no longer under-scanned — OR explicitly record them out-of-pilot-scope with a TODO (pilot only needs 112-114 fully scanned)
- [x] 1.3 Emit canonical `healthcheck_inventory.json` (per-question: id, sourcePdf, pages, per-block image counts, per-candidate extraction decision `extract`/`render-crop`/`skip-with-reason`+reason, attribution confidence, severity) + a scanned/unscanned coverage report; commit the snapshot
- [x] 1.4 Verify the detector is deterministic (same input → same inventory) and writes nothing outside `healthcheck/`

## 2. Pilot id-set + figure extraction (112-114)

- [x] 2.1 Derive the pilot in-scope id list from the inventory: 112-1/2, 113-1/2, 114-1/2 explanation-figure questions (~985)
- [x] 2.2 Implement the extraction decision tree, classifying every candidate as `extract` / `render-crop` / `skip-with-reason` (reason → inventory): single-xref pure-raster → `extract_image(xref)`; composite / text-over-image / inner-table / vector-only(no xref) → render-crop `get_pixmap(clip=…, matrix=Matrix(s,s))` (s=2.0, 3.0 small/table). Handle edge cases explicitly: CMYK/alpha/palette → RGB before encode; legit xref reused across a few questions is NOT a logo (repeated-xref filter only above the high page-frequency threshold); figure overflowing onto a continuation page attributes to the still-open card; filter logos by size + header/footer band
- [x] 2.3 Output `packages/content-neurons-tw/explanation-figures/<qid>__N.<contenthash>.webp` (content-addressed) + `manifest.json` (qid → [{src, provenance{sourcePdf,page,bbox,booklet,category}, attributionConfidence}]); record provenance for every asset
- [x] 2.4 Generate a per-booklet debug-preview sheet (figure crop + qid + question stem) for owner verification before wiring

## 3. Lazy-load delivery + types

- [x] 3.1 Add `ExplanationFigureRef` + `ExplanationFigureManifest` to `packages/core/src/types.ts` (+ CHANGELOG); **do NOT add any figure field to `Question`** (manifest-only; renderer joins by qid). Leave existing `Question`/`ExplanationBlock`/`ExplanationTableImage` fields unchanged
- [x] 3.2 Wire `build.ts` to carry the manifest through + copy content-addressed assets to `dist/`; wire `copy-content.mjs` to copy into `apps/neurons-tw/public/content/neurons-tw/explanation-figures/`; emit wired/missing counts (no silent skip)
- [x] 3.3 Confirm `questions.json` gains NO field and embeds no figure bytes (figures live only in the manifest + static files)

## 4. Render

- [x] 4.1 Extend `Explanation.tsx` to look up `qid` in the manifest and render figures inline after the explanation text, fetched lazily on display (`loading="lazy"` / mount-on-expand), with a loading affordance
- [x] 4.2 Missing/failed asset → graceful fallback (placeholder / retain flat text); never silently drop a referenced figure
- [x] 4.3 Mobile: figures in `overflow-x:auto` / responsive width (reuse table-image render conventions); keep the same renderer conventions as the bundled table-image tier (convergence boundary)
- [x] 4.4 Renderer tests: manifest-hit renders figure; asset 404 → placeholder; mobile overflow; correct `BASE_URL` path; **no figure request fires while the explanation is collapsed/unexpanded**

## 5. Attribution QA

- [x] 5.1 Single-figure questions: geometry gate (card-overlap ≥0.80, band-overlap ≥0.35, min-size) is necessary but NOT sufficient — owner reviews a debug-preview sheet covering EVERY pilot single-figure question; any mis-attribution → fail-stop escalating that booklet/decision-path to 100% review
- [x] 5.2 Multi-figure subset: parallel agents verify each crop, emitting `{qid, asset, verdict: accept|reject|uncertain, reason}`; agents do NOT edit the manifest — a deterministic step applies only `accept` verdicts; `uncertain`/`reject` do not ship
- [x] 5.3 Owner reviews the debug-preview sheets; prune wrong candidates before final wiring

## 6. Gates + verify

- [x] 6.1 Source-and-build immutable-text gate: capture a pre-apply baseline of source `questions.json`; after, assert `id`/`answer`/`stem`/`options`/`explanation`/`explanationBlocks` byte-identical to baseline in BOTH the source AND built `questions.json` (a concurrent source edit must FAIL the gate, not pass on a self-consistent rebuild)
- [x] 6.2 `pnpm run build:neurons-content` (expect imported 4600/0) + `pnpm --filter @study-rpg/neurons-tw test` green (incl. the 4.4 renderer tests); spot-check a few pilot ids render their figure
- [x] 6.3 `/verify` — Chrome MCP on `/bank`: open a 112-114 figure-question → figure lazy-fetches (Performance API confirms the asset request only after expand) + renders after explanation; a missing-asset case shows fallback
- [ ] 6.4 Deploy file-count preflight: measure TOTAL built-app static file count vs the CF Pages plan limit (fail if exceeded) → `/opsx:verify` → `/opsx:archive` → commit (explicit per-file `git add`) → merge `track-neurons`→`main` → `deploy:cf` → prod-verify a figure asset 200s + renders on `med-study-rpg.com/neurons/`

## 7. Provenance + follow-up

- [x] 7.1 Update `CREDITS` (or equivalent) with the pilot figures' source provenance (booklet / category) + the CC-BY-NC + 24h-takedown note — figures include 陽明 hand-drawn + Netter crops
- [x] 7.2 Record pilot outcomes (attribution accuracy, total file count/size, render perf) + open questions (full-scale asset hosting if file count nears the CF Pages limit; 104-105 parser; whether to migrate the 49 bundled webp to the lazy tier) into a follow-up change `recover-neurons-explanation-figures-full` for the remaining ~1,580 figure-questions
