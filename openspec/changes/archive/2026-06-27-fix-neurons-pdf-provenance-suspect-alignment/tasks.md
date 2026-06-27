# Tasks — fix-neurons-pdf-provenance-suspect-alignment

## 1. Health-check the 44 deferred suspects (deterministic)

- [x] 1.1 `reconcile/healthcheck/alignment_healthcheck.py`: for each of the 44, build the merged 0-based page (same 5-source priority as `build-provenance-map.mjs`) and measure verbatim stem-run on its current page vs a ±3 neighbour window → split into 6 deterministic off-by-one / 14 likely-correct (run 6–7, local max) / 24 truly-weak.
- [x] 1.2 Apply the **6 deterministic off-by-one** to `provenance/base-corrections.json` (65 → 71): each had stem run 0 on its current page and a verbatim run 9–24 on the neighbour (107-1-生化-Q86, 111-1-生化-Q97, 113-1-生化-Q91, 113-1-生理-Q55, 113-1二-公衛-Q40, 113-1二-病理-Q83).

## 2. Vision pass over the remaining 38 (per-booklet agents)

- [x] 2.1 `render_for_vision.py` rendered ±3 page windows (120 dpi) for the 38 across 11 booklets; 15 `general-purpose` agents read the rendered pages and returned `{id, page0}` matched by 題目 stem content (not 陽明 card number).
- [x] 2.2 **30 confirmed already-correct** — each stem on its currently-mapped page (the run-6/7 local-max entries + the garbled-font 104-2 醫學二 cards, which render fine even though their text layer is mojibake). No change; recorded as verification.
- [x] 2.3 **5 cross-booklet mis-files** located by `wider_search.py` (full-text scan of BOTH the 醫學一 + 醫學二 booklets) at run 18–30 and written to `provenance/verified-overrides.json` (4 → 9): 106-1 醫學一 公衛 Q93/Q94/Q96 → **106-1醫學(二).pdf**; 106-1 醫學二 病理 Q93/Q94 → **106-1醫學(一).pdf** (陽明 swapped these two booklets' cards). Covered by the existing spec scenario "Human-verified override bypasses the automated gates (… physical card order differs from the 考選部 qNumber)".
- [x] 2.4 **3 解剖 (106-1 醫學一 Q5/Q6/Q8)**: a wider vision scan of the whole 解剖 region (pages 0–30) confirmed 陽明 never wrote 詳解 for them (the booklet's anatomy cards cover diaphragm/uterine-artery/pelvic-inlet/TMJ, not bladder/rectum/shoulder-ligaments). **Removed** from `provenance/question-page-map.json` (2270 → 2267) so the action hides instead of opening the wrong page. Covered by the existing "un-sourced → excluded (action hidden)" scenario.

## 3. Rebuild + verify

- [x] 3.1 `node apps/neurons-tw/scripts/build-provenance-map.mjs` → mapped **4381** (figure 1128 + text 2267 + residual 982 + baseCorr 71 + override 9). Count 4384 → 4381 (3 解剖 removed).
- [x] 3.2 Verified the built `question-pdf-map.v1.json`: 6 deterministic land on the +1 corrected pages; 5 overrides point to the sibling booklet at the corrected page; Q95 unchanged; 3 解剖 absent.
- [x] 3.3 Re-ran `alignment_healthcheck.py` post-fix: all 11 corrected entries now resolve OK (stem-run 9–24 on their mapped page).
- [x] 3.4 `openspec validate fix-neurons-pdf-provenance-suspect-alignment --strict` passes.

## 4. Ship

- [ ] 4.1 Commit on `track-neurons` (explicit per-file staging — leave the parallel session's `eliminate-cross-device-r2-412-storm/` + `remove-reading-loop-orphan-spec/` untouched).
- [ ] 4.2 `--no-ff` merge `track-neurons` → `main` from the deploy worktree, push.
- [ ] 4.3 Watch GH Actions `Deploy Cloudflare Pages`; prod-smoke = `curl` the live `question-pdf-map.v1.json`, assert count 4381 + the corrected ids resolve to the new pages (and the 3 解剖 are absent).
