## Context

115-1 (200 Q: 100 醫學一 + 100 醫學二, 10 subjects) currently lives on the corpus's **AI-generated escape path** because it was ingested before 陽明 published its 詳解. All three explanation-adjacent artifacts are placeholders:

- `explanation` = AI-generated (`explanationSource: 'ai-generated'`, `正解：(X)…（本詳解由 AI 生成，未經陽明審定）`, 364–532 chars) vs real 陽明 詳解 that runs 1200–1700+ chars with a `簡解：…────…詳解` structure.
- No PDF page-link (0/200 in `question-pdf-map.v1.json`) — 「看原始詳解 PDF」 hidden.
- Per-option 簡答 sidecar has 200 entries, but condensed from the AI placeholder (content-stale; will also go hash-stale once `explanation` changes, since `sourceHash` folds in `normalizeExplanationForHash(explanation)`).

The two real 陽明 PDFs are now on disk and are clean modern-format (real CJK text layers, no PUA/garble): `115-1 醫學一合併總檔.pdf` (108 pp) + `115-1 醫學二統整版.pdf` (116 pp). Drive links already registered in `booklet-drive-links.json` and already match the owner's links. Every pipeline this change uses (extract → reconcile helpers → resolvers → provenance builder → 簡答 sidecar) already exists and has run over the other 44 booklets; this is a reproduction over new data, not new machinery.

## Goals / Non-Goals

**Goals:**
- Replace the 200 × 115-1 AI explanations with the real 陽明 詳解 (+ 簡解 Key head), on the 陽明-reconcile path.
- Map all 200 × 115-1 questions to their real 詳解 pages (詳解連結) with zero drift on the 44 already-tuned booklets.
- Regenerate the 200 per-option 簡答 from the real 詳解, gated by the existing deterministic validator + verify gate.
- Ship-ready corpus (build + typecheck + verify + dev smoke green). No schema/sync churn.

**Non-Goals:**
- No deploy to prod (separate 對外發布 gate).
- No change to stem/options/answer (考選部 authoritative; 更正 Q66/Q95 already applied).
- No new pipeline/spec mechanism, no Dexie/R2/sync-adapter change.
- No re-audit of the other 44 booklets' page-maps.

## Decisions

**D1 — Route B (surgical per-id swap) over Route A (full `finalize.py` re-run).** Replace only `explanation` / `sourceCredit` / `explanationSource` on the 200 × 115-1 objects, via `extract_exam.py` → a small `(book, qNumber)`-keyed merge reusing `reconcile.py`'s `load_ym_paper` + `clean_explanation`. *Why not A:* the full pipeline re-derives ids/stems/answers for all sittings, needs the 115 考選部 試題 PDFs (only 答案/更正 are on disk; the AI path pulled stems from `~/Downloads/115020_*.pdf` which no longer exist), and re-touches fields we must not change. Route B is minimal-diff and matches the byte-safe single-line-JSON edit convention (`json.dumps(list, ensure_ascii=False, separators=(", ", ": "))` + round-trip count assert).

**D2 — Get the 簡解 Key via `restore_jianjie_key.py`, not by hand.** `clean_explanation` deliberately emits 詳解-only; the `簡解：` head is prepended separately by `restore_jianjie_key.py`. Remove `("115","1")` from its `EXCLUDE_YS` so 115-1 joins 106–114's Key-restore path (degenerate/empty Keys are skipped per its own guards).

**D3 — Page-map by re-running the committed resolvers, guarded by a diff check.** `resolve_all_pages.py` + `resolve_residual.py` (`.venv-fitz`, PyMuPDF **1.27.2.3** — the same version that produced the committed map) pick up the two new PDFs automatically. These regenerate the **whole** base/residual maps, so the guard is: `git diff` must show **only 115-1 additions**, no page changes to pre-existing entries. Any 115-1 question the resolvers + residual + optional agent pass can't place is left unmapped (button hidden) or pinned in `verified-overrides.json` — never mapped to an unverified page.

**D4 — Regenerate 簡答, never resync.** Once real 詳解 replaces the AI text, all 200 sidecar `sourceHash`es go stale. `resync-sidecar-hashes.ts` would silently rehash the AI-derived lines against the real 詳解 (its guard only checks validator-pass + no-placeholder, both of which the AI lines satisfy) — blessing wrong summaries. So: pre-clear the 200 stale entries, generate fresh per-qid `jianda-out/<qid>.json` from the real 詳解, and feed `merge-jianda-batch.ts` (recomputes `sourceHash` from the current corpus, `source: 'text-from-recovered-詳解'`). Run `resync` afterward only as a 0-drift consistency check.

**D5 — agy/Gemini for the 200-Q 簡答 generation (owner's choice), with modest concurrency.** The finalize/validate/build machinery is model-agnostic (validator reads only the 簡答 text + `sourceHash`; `model`/`source` are metadata), so agy output feeds the identical gate. Because agy's binary is heavy and parallel agy timed out in the 2026-06-29 backfill (forced sequential), run 4–6 concurrent agy processes in batches with a background monitor, not a wide fan-out. Prompt encodes the design.md-D3 contract of `neurons-simplified-explanations` (only the 詳解; correct=why-right / wrong=why-wrong; sentinel `詳解未明確說明此選項錯因` last-resort; disputed neutral; every option key; 8–80 CJK). The 2 disputed 115-1 questions (醫學一 生理 Q66 acceptedAnswers A/D, 生化 Q95 disputed) MUST be framed neutrally.

**D6 — Fact-gate: 考選部 answer stays authoritative.** 陽明 supplies 詳解 only. During extraction, spot-check any 陽明 詳解 that appears to endorse an answer other than the baked one; do NOT change the answer (a genuine 陽明↔考選部 disagreement is 陽明's editorial view, not authority) unless a 考選部 更正 PDF supersedes. Mirrors the corpus-repair discipline that 陽明 "errors" are often the official answer.

## Risks / Trade-offs

- **醫學一 resolver anchored 94/100 in dry-run** → 6 questions may land in residual/unmapped. Mitigation: `resolve_residual.py` multi-token stem vote recovers most; genuinely unresolved stay button-hidden (never wrong page); pin in `verified-overrides.json` only with a visual page confirm.
- **Whole-map rewrite could drift older booklets** → strands the 71 `base-corrections` + 209 `verified-overrides`. Mitigation: same fitz version + hard `git diff`-only-115-1 gate before commit; abort + investigate on any pre-115 delta.
- **合併總檔 may contain a question-paper section before the 詳解** (114-2 precedent) → an early P6 option-anchor could mis-fire. Mitigation: dry-run showed ≈1 page/question spacing (詳解-only cadence) + 0 non-monotonic; spot-check Q1's resolved page renders Q1's *詳解*, not a question-paper page.
- **parallel agy timeout** → Mitigation D5 (modest concurrency + monitor; fall back to sequential batches or the Claude Workflow path if agy stalls — same downstream gate either way).
- **stale `meta.json aiGenerated: 200`** → cosmetic (app banner is per-question `explanationSource`). Mitigation: set to 0.
- **sidecar coupling** → a corpus edit that skips the sidecar breaks `verify:option-explanations` across shipped entries. Mitigation: the change's finalize step re-runs the verify gate over all 4600 before declaring done.

## Migration Plan

Additive data + build-artifact regeneration; no runtime migration. Rollback = `git checkout` the touched data/provenance/sidecar files + rebuild (nothing shipped to prod in this change; deploy is a later gate). Order: (1) 詳解 replace + Key restore, (2) page-map, (3) 簡答 regen — 3 depends on 1; 2 is independent.

## Open Questions

- Do all 200 × 115-1 questions have a real 陽明 詳解 card, or did 陽明 skip some (as with earlier sittings)? If a handful are genuinely absent, they stay on the AI path (leave as-is, still tagged) rather than being fabricated — confirm during extraction and report the count.
