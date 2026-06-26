## 1. Environment + baseline

- [x] 1.1 Recreate the venv (`python3 -m venv .venv-fitz && .venv-fitz/bin/pip install pymupdf pillow`); confirm source PDFs at `~/Desktop/國考/一階國考/陽明國考考古/*.pdf` (44 booklets present)
- [x] 1.2 Capture a pre-apply baseline digest of the source `questions.json` (id/answer/stem/options/explanation/explanationBlocks per question) + record pilot manifest counts (636 q / 926 figures / 926 webp, 1:1)

## 2. Extract 106-111

- [x] 2.1 Fix `extract_figures.py` manifest semantics: was a fresh `manifest={}` overwrite (would wipe the pilot) → **merge-by-qid** (load existing, update processed qids, write); idempotent via content-hash filenames
- [x] 2.2 Extract 106-111 via the existing render-crop extractor (`--only 106-`…`--only 111-`; zoom 2.4; render-crop not extract_image; content-hash webp) → 543 q / 829 figures merged into the manifest; pilot's 636 q preserved
- [x] 2.3 Figure-count sanity check (sweep detector): found the 2 no-`題號`-anchor booklets (109-1 醫一 Q38 = 61 figs p46-122; 111-1 醫二 Q1 = 45 figs p9-129) had swept their whole booklet → drop both mega-questions + delete their 106 webp; **541 q / 723 figures** remain, all anchor-attributed. Defer those 2 booklets + 104-105 to the no-anchor-fallback follow-up
- [x] 2.4 Provenance (sourcePdf/page/bbox/booklet/category) recorded per asset; preview sheet `figure-preview/index.html` generated

## 3. Attribution QA (106-111)

- [x] 3.1 Multi-figure agent-QA: 139 multi-fig questions / 321 figures → 18 chunks, dispatched in waves of 6 general-purpose agents (each Reads the crops + emits `{qid, file, verdict, reason}`); verdicts collected to `/tmp/figqa-out/`
- [x] 3.2 Deterministic apply (multi-fig): kept 304 `accept`; pruned 10 `reject` + 7 `uncertain` from `manifest.json` + deleted their webp; reconciled 295/295 multi-fig figures have a verdict; manifest↔webp 1:1 clean (1632)
- [x] 3.3 Single-fig QA (owner-upgraded from preview to agent-QA): Workflow `singlefig-figure-qa` = 42 agents, 411/411 crops judged (0 chunks failed) → **364 accept / 47 reject**; pruned the 47 (off-topic neighbour-bleed, pure-text screenshots, a meme, banner-only) from manifest + deleted webp; reconciled 411/411 covered; manifest↔webp 1:1 clean at 1585

## 4. Gates + rebuild + verify

- [x] 4.1 Cleared stale `dist/explanation-figures` + `apps/neurons-tw/public/content/neurons-tw/explanation-figures` before rebuild (no orphan crops)
- [x] 4.2 Source-immutable gate: source `questions.json` byte-identical to HEAD (`4f88718`) — this change touches only the manifest + webp; figures are build-injected
- [x] 4.3 Post-prune rebuild → imported 4600/0, explanation-figures wired **1128 q / 1585 webp** / missing-asset 0; dist+public both 1585; `pnpm --filter @study-rpg/neurons-tw test` → 683/683 green (test expectations 636→1128 / 926→1585 / regex 106-114). Spot-check ✓ (Chrome: 107-1-公衛-Q45 IARC table renders)
- [x] 4.4 File-count preflight: 1761 static files in public/ (1632 explanation-figures webp) — 18,239 headroom under the 20,000 CF Pages limit ✓
- [x] 4.5 Chrome MCP on `/bank`: 4 sampled 106-111 figures serve `image/webp` 200 + decode to valid dims; a 106-111 figure (107-1-公衛-Q45 IARC carcinogen table) renders live in the 詳解; pruned rejects are NOT referenced in the built corpus + NOT on disk (dev 200 is `text/html` SPA fallback). Lazy-load = the proven pilot path

## 5. Provenance + ship

- [x] 5.1 Updated `packages/content-neurons-tw/CREDITS.md` "Recovered 詳解 figures": 106-114 scope (1,128 題 / 1,585 張), agent-QA prune note, CC-BY-NC + §65 + 24h-takedown; scope note now lists 104-105 + 109-1醫一 + 111-1醫二 as the deferred no-anchor follow-up
- [ ] 5.2 `/opsx:verify` → `/opsx:archive` → commit (explicit per-file `git add`; `git diff --cached --name-status` confirms only this change's files) → merge `track-neurons`→`main` → `deploy:cf` → prod-verify a 106-111 figure asset 200s + renders on `med-study-rpg.com/neurons/`; confirm `gh run list --branch main` CF Pages + Dexie-lint green

## 6. Deferred follow-up (recorded here, NOT implemented in this change)

- [x] 6.1 Recorded a decision note + follow-up scope for `recover-neurons-explanation-figures-no-anchor`: a no-`題號`-anchor layout-parser fallback in `detect_figures.py` covering 104-105 + 109-1 醫學一 + 111-1 醫學二 (for 109-1/111-1, advance regions from question-start y-positions; for 104-105, also add a `<n> <stem>` question-start fallback). Re-run the sweep sanity check after.
