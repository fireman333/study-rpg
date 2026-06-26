# Tasks — Expand neurons PDF-provenance coverage (deterministic text-page resolution)

> Coordination: same guards as Phase 1 — explicit per-file `git add`; never sweep the R2 `eliminate-cross-device-r2-412-storm/tasks.md` or `remove-reading-loop-orphan-spec/`; `public/provenance/` stays gitignored build output.

## 1. Deterministic resolver

- [x] 1.1 `reconcile/healthcheck/resolve_all_pages.py` — imports the detector primitives; per booklet resolves every question's page via 題號 anchor + `offset_to_page`; within-booklet monotonicity gate (non-monotonic → `suspects`).
- [x] 1.2 Independent stem cross-check (`_distinctive` token search → `_stem_page`): classify `verified` (±1) / `anchoronly` (stem absent) / `disagree` (excluded → `disagreements`).
- [x] 1.3 Exclude scanned (`notext`) booklets entirely (route to OCR/agent residual). Emit clean text-only `provenance/question-page-map.json` (0-based) + `resolve-report.json` (coverage + disagree/suspect worklist).

## 2. Builder merge

- [x] 2.1 `build-provenance-map.mjs` reads manifest (figure, bbox-precise — wins on overlap) **and** `question-page-map.json` (text); both 0-based → +1; sha256 over both sources; emits combined gitignored `public/provenance/question-pdf-map.v1.json`.
- [x] 2.2 Run: **mapped 3398 (figure 1128 + text 2270)**, 0 entries from notext booklets.

## 3. Verify

- [x] 3.1 Resolver self-audit: 39/40 anchor-present sample; double-verified = 1920 (two independent signals agree); anchor-only = 350.
- [x] 3.2 Dev (Chrome MCP): served map count 3398; a text question (110-2-醫學二-公衛-Q46 → p45) now mapped + 「看原始詳解 PDF」button shows (button code unchanged).
- [x] 3.3 `openspec validate expand-neurons-pdf-provenance-coverage --strict`.

## 4. Ship

- [ ] 4.1 commit (explicit per-file: resolver + question-page-map.json + resolve-report.json + builder + openspec change) → merge track-neurons→main → CF Pages deploy → **prod smoke** (map count 3398, a text question opens its PDF page).

## 5. Follow-up (separate change — NOT here)

- [ ] 5.1 Agent pass: adjudicate 80 disagree + 157 suspect (authoritative page from reading the PDF) + OCR/visually resolve 996 unresolved (incl. 5 scanned booklets 104-1/104-2一/105-1). Scope + cost with owner.
