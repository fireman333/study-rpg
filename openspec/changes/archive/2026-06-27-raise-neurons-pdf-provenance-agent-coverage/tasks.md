# Tasks — raise-neurons-pdf-provenance-agent-coverage

## 1. Deterministic residual resolver
- [x] 1.1 Write `reconcile/healthcheck/resolve_residual.py` (second layer; reads corpus + manifest + base `question-page-map.json` + `resolve-report.json`; multi-token stem voting in monotonic window for clean booklets; numeric-anchor + Latin cross-check for garbled 104-2二; `--agent-results` fold-in; monotonic + content gate).
- [x] 1.2 Write read-only helper `reconcile/healthcheck/pdf_page_text.py`.
- [x] 1.3 First pass → 393 resolved (348 cjk-vote + 14 latin-vote + 31 numeric+latin) + worklist (109 born-digital + 500 scanned + 200 no-source).
- [x] 1.4 Independent content-check the auto-merge layer (stem CJK token literally on assigned page): 348 clean pass 100%; route 104-2二 (garbled) + 12 clean token-absent to agents.

## 2. Agent Workflow (residual resolution + audit)
- [x] 2.1 Prep per-booklet agent context (15 clean text booklets + 104-2二 rendered pages, 3 chunks + 30-question audit sample of auto-merge).
- [x] 2.2 Run Workflow (19 agents, 2 waves): clean-booklet agents resolved 84 text questions (68 page + 16 correctly-null = corpus/booklet mismatch); vision agents resolved 69 garbled (104-2二) (62 page + 7 null); audit agent checked 30-sample.
- [x] 2.3 Collect `{id, page0}` results → `agent-resolved.json` (130 pages). **Audit flagged 4 — all FALSE POSITIVES** (audit judged a truncated page-top snippet, fooled by multi-card pages; independent stem-run ground truth confirmed all 4 auto-merge pages correct). Audit treated as informational, corrections NOT applied.

## 3. Reconcile + merge
- [x] 3.1 Fold agent results: `resolve_residual.py --agent-results agent-resolved.json` → re-gated `question-page-map-residual.json` (483 entries).
- [x] 3.2 Strengthened gate to **stem-run ≥8 (verbatim 題目 on page = authoritative)**, with monotonicity only as fallback (fixed 22 correct agent answers wrongly killed by the monotonic heuristic in 106-1). Final validation: 0 cross-source duplicates; 415/421 clean entries strong/ok run; 6 weak agent answers visually/content-confirmed correct; 62 garbled entries monotonic + visual spot-checks (Q1→p1, Q92→p106).
- [x] 3.3 Refreshed `provenance/residual-agent-worklist.json` (remaining: 500 scanned + 200 no-source-115-1 + 19 born-digital agent-null/reworded).

## 4. Builder + ship
- [x] 4.1 Update `apps/neurons-tw/scripts/build-provenance-map.mjs` to merge the residual map (third source).
- [x] 4.2 Rebuild public map: `count` 3398 → **3881** (1128 figure + 2270 text + 483 residual); newly-mapped questions verified (106-1 Q44→p43, 104-2二 Q92→p107, 105-2一 Q11→p14).
- [x] 4.3 `pnpm --filter @study-rpg/neurons-tw typecheck` clean. Confirmed `public/provenance/` is in CF `assetDirs` allowlist **on main** (fix `0d90564`; track-neurons is 3 behind → must catch up before merge).
- [ ] 4.4 Catch up `git merge main` (brings provenance allowlist fix); commit on `track-neurons` (explicit per-file staging — exclude pre-existing `eliminate-cross-device-r2-412-storm/` + `remove-reading-loop-orphan-spec/`); merge → `main`; CF Pages deploy. **[awaiting owner confirm — outward-facing]**
- [ ] 4.5 Prod-smoke: `fetch()` the public map on prod, assert `parseOk` + `count` 3881, and a newly-mapped question id is present.

## 5. Archive
- [ ] 5.1 `/opsx:verify` → `/opsx:archive` (sync delta into `neurons-explanation-pdf-provenance`).
- [ ] 5.2 Update project memory `neurons-local-pdf-provenance.md` (coverage + that the agent residual pass is done; scanned + 115-1 remain deferred/blocked).
