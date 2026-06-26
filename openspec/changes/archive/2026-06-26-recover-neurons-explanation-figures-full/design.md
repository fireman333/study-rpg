## Context

The pilot (`recover-neurons-explanation-figures`, archived 2026-06-26) shipped the entire figure-recovery mechanism to `main` and proved it on the 112-114 booklets (636 q / 926 figures; agent-QA 502 accept / 0 reject / 9 decorative pruned). Every component is generic and reusable verbatim:

- **Detector** `packages/content-neurons-tw/reconcile/healthcheck/detect_figures.py` — per-page 題號 region-split attribution → `healthcheck_inventory.json` (already covers 3,624 q across booklets).
- **Extractor** `reconcile/healthcheck/extract_figures.py` — render-crop (zoom 2.4), content-hash webp, appends to `explanation-figures/manifest.json` + writes a debug-preview `figure-preview/index.html`.
- **Build wiring** (generic, on `main`): `build.ts` injects `explanationFigures` from the manifest into the BUILT `questions.json` (source untouched) + copies webp, failing on a missing asset; `copy-content.mjs` → public; `Explanation.tsx` renders lazily; `core` `ExplanationFigure` type at 0.6.4.

So the follow-up is "run the proven pipeline over the non-pilot booklets" — almost no new code, with one genuine new piece: a layout-parser fallback for the old-layout 104-105 booklets.

Per-owner scope decisions (2026-06-26): **(1)** the 49 bundled `table-images` → lazy-tier migration is **deferred** to a separate convergence follow-up, NOT this change. **(2)** Apply-time discovery (below) revised the booklet scope: this change ships **106-114** only; the no-`題號`-anchor booklets (104-105 + 109-1 醫學一 + 111-1 醫學二) are deferred to a follow-up.

### Apply-time discovery — the no-`題號`-anchor sweep bug

The detector's region-split attributes figures using `題號` row-label y-positions as region anchors. Two 106-111 booklets — **109-1 醫學一** and **111-1 醫學二** — have only ONE `題號` hit across the whole booklet (vs ~100 in healthy booklets), so the region-split degenerates: every page's figures fall into the `last_open` continuation region and one early question sweeps the entire booklet (109-1 醫一 Q38 absorbed 61 figures across pp.46-122; 111-1 醫二 Q1 absorbed 45 across pp.9-129 — every other question in those booklets got zero). This is the SAME root cause as 104-105 (no `題號` anchors; 104-105 additionally fails text-layer question-start parsing). The pilot's 112-114 booklets are all anchor-rich, so the bug was latent. **Resolution:** drop those 2 booklets' mega-questions from this batch (never ship mis-attributed figures — spec "ambiguous → no figure, retain flat text"); defer 104-105 + the 2 reflow booklets to a follow-up that adds a no-`題號`-anchor layout-parser fallback. The remaining 541 of 543 106-111 questions are anchor-attributed and healthy.

## Goals / Non-Goals

**Goals:**
- Recover the embedded 詳解 figures for the remaining 104-114 booklets under the identical pilot contract (rasterized, provenance-recorded, lazy-loaded, question text byte-identical).
- Make the detector scan the 104-105 old layout honestly (no silent skip) via a layout-parser fallback.
- Ship with the same safety gates the pilot used: immutable source-and-build text gate, multi-figure agent-QA, owner preview review, deploy file-count preflight.

**Non-Goals:**
- No app-code change to `Explanation.tsx`, `core`, Dexie, R2 sync, the Worker, or game economy.
- No edit to the hand-maintained source `questions.json` (figures are build-injected).
- No `table-images`→lazy-tier migration (separate follow-up).
- No re-extraction of the already-shipped 112-114 pilot figures.

## Decisions

### D1 — Reuse the pilot pipeline verbatim; the only code change here is the extractor manifest-merge fix
The detector + extractor are reused unchanged EXCEPT one bug fix: `extract_figures.py` built a fresh `manifest = {}` and wrote only the `--only`-filtered batch, which would have OVERWRITTEN the whole manifest and wiped the 112-114 pilot's 636 entries. Fixed to **merge-by-qid** (load existing manifest, update the processed qids, write) — idempotent because content-hash filenames mean a re-render produces identical bytes. This directly satisfies the spec's "earlier-shipped figures SHALL be unaffected by later batches" requirement. **The detector's no-`題號`-anchor fallback is NOT built here** — it is the deferred follow-up (see the discovery note above). **Alternative considered:** re-extract all booklets (pilot + 106-111) in one invocation to rebuild a complete manifest — rejected (wasteful re-render of the shipped pilot; merge is cleaner + idempotent).

### D2 — Ship the 541 healthy 106-111 questions; defer the no-anchor booklets
106-111 are already inventoried; 541 of 543 figure-questions are `題號`-anchor-attributed and healthy. The 2 reflow booklets (109-1 醫一, 111-1 醫二) and 104-105 share the no-anchor root cause and are deferred to a follow-up that adds the layout-parser fallback (a larger detector change with unknown 104-105 payoff). Owner chose (2026-06-26) to ship the confident win now rather than block it on the meatier fallback. **Alternative:** build the fallback now and ship 104-114 together — rejected by owner given the unknown 104-105 figure count + bigger detector rewrite.

### D3 — render-crop, never extract_image (orientation correctness)
`extract_image(xref)` ignores the page matrix → 90° rotations on rotated source pages. The pilot standardized on `get_pixmap(clip=…, matrix=Matrix(2.4, 2.4))` render-crops with content-hash filenames (cache-bust). Keep that verbatim. CMYK/alpha/palette → RGB before encode.

### D4 — Multi-figure attribution verified by agents in waves of 6; only `accept` ships
Single-figure questions pass the geometry gate + owner preview review. Multi-figure questions go to general-purpose agents that Read the crop images and emit `{qid, asset, verdict: accept|reject|uncertain, reason}`; a deterministic step applies only `accept`; `reject`/`uncertain` are pruned (manifest entry + webp deleted). Dispatch **6 agents per wave + checkpoint** to respect the fan-out hook. Expect ~2× the pilot's 17 chunks. The pilot found the only reject-class items are the author's decorative memes/wallpapers.

### D5 — Owner preview-sheet gate is fail-stop
`extract_figures.py` writes `figure-preview/index.html` (crop + qid + stem). Owner `open`s it and reviews before shipping; any mis-attribution fail-stops and escalates that booklet/decision-path to 100% review (per the existing spec requirement).

## Risks / Trade-offs

- **A booklet with sparse `題號` anchors silently sweeps all figures into one question** (the bug found at apply time) → Mitigation: a post-extraction figure-count sanity check (any question with an implausibly high figure count / pages-spanned is a sweep signal) flags these before QA; in this change the 2 affected booklets are dropped + deferred. The follow-up's no-anchor fallback must re-run this sanity check.
- **Stale `dist/` + public `explanation-figures` orphan crops after a prune** (pilot hit this) → Mitigation: clear `dist/explanation-figures` + `apps/neurons-tw/public/content/neurons-tw/explanation-figures` before rebuild so only manifest-referenced webp ship.
- **Concurrent edit to the shared source `questions.json`** (multi-session repo) → Mitigation: the source-and-build immutable-text gate captures a pre-apply baseline and fails on any question-text diff (a self-consistent rebuild is not sufficient).
- **File count nears the CF Pages limit** → Mitigation: deploy file-count preflight; ~1,700 figures ≈ ~1,900 total static files vs the 20,000 free limit — ample headroom, asserted not assumed.
- **CJK webp filenames are git-quoted** → `grep '\.webp'` (no `$` anchor) so quoted names aren't missed in counts/cleanup.

## Migration Plan

1. Fix the extractor manifest-merge bug; extract 106-111 → manifest (merged) + webp + preview sheet.
2. Drop the 2 no-anchor sweep booklets' mega-questions (109-1 醫一 Q38, 111-1 醫二 Q1) — never ship mis-attributed figures.
3. Owner preview review (D5 fail-stop) over the 106-111 sheet.
4. Agent-QA the 106-111 multi-figure subset in waves of 6 → apply `accept`, prune `reject`/`uncertain`.
5. Clear stale dist/public figure dirs → `build:neurons-content` (expect 4600/0) → immutable gate → file-count preflight → vitest → Chrome-MCP `/bank` lazy-fetch verify.
6. `/opsx:verify` → `/opsx:archive` → per-file `git add` commit → merge `track-neurons`→`main` → `deploy:cf` → prod-verify a 106-111 figure asset 200s + renders.

**Rollback:** figures are purely additive and build-injected. Revert = drop the new manifest entries (or revert the content commit) + rebuild; no schema/data migration to undo, the source corpus was never touched.

## Open Questions

- **Deferred follow-up** (`recover-neurons-explanation-figures-no-anchor` or similar): add a no-`題號`-anchor layout-parser fallback to `detect_figures.py` covering 104-105 + 109-1 醫一 + 111-1 醫二. For 109-1/111-1 the text-layer question-starts already parse (98-100 starts) — the fix is to advance `last_open` / build regions from question-start y-positions when `題號` anchors are absent. 104-105 additionally needs a question-start fallback (their `<n> <stem>` layout + `Ans：`/`Key：` labels don't match the current patterns). 104-105 real figure count is unknown until that lands.
- venv is not in the repo — recreate `python3 -m venv .venv-fitz && .venv-fitz/bin/pip install pymupdf pillow`; source PDFs at `~/Desktop/國考/一階國考/陽明國考考古/*.pdf`.
