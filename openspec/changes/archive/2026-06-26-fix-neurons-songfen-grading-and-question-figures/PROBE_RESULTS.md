# Phase 0 — Probe Results (read-only)

Run 2026-06-26 against `~/Desktop/國考/一階國考/一階國考107-115/` (34 question PDFs +
`解答/` 32 answer files in 107-115 scope + 2 stray 106) and the oracle
`packages/content-neurons-tw/data/medexam-reconciled/questions.json` (4600 q, 104-115).
Probe script: `probes/probe_corpus.py` (in this change). PyMuPDF `1.27.2.3` via
`reconcile/healthcheck/.venv-fitz`.

## Headline

The corpus rebuild is **low-risk and id-stable**, but probe 0.1 surfaces **one design
refinement that needs an owner nod before Phase 1**: do **not** regenerate the subject
(→ id) from rigid `SUBJECT_MAP` qNumber bands — **inherit subject from the oracle by
`(year, session, book, qNumber)`** and only swap in clean stem / options / answer / images
from the official PDF. This makes the rebuild a **content-swap joined to the oracle**, which
is strictly safer than a from-scratch id regeneration and automatically preserves every prior
詳解 / 簡解 / table-image / OCR fix.

## 0.1 — Id-mapping cross-validation

Official filename → `(year, session, book)` (year=first 3 digits; session = ascending
sitting-code rank within year; book-code {1,5}→醫學一, {2,6}→醫學二) is **correct for all
34 papers**. Generating ids as `filename-map + SUBJECT_MAP(qNumber→subject)` over Q1..100:

- **3335 / 3400 (98.1%)** ids match the oracle exactly.
- **65 mismatches across 17 papers — 100% subject-label drift, 0 qNumber drift** (every
  paper is Q1..Q100 by construction; the mismatch is always the same qNumber under a
  different subject). The real per-paper subject-block boundaries vary year-to-year, and the
  oracle's QA'd/manually-corrected subjects are ground truth. e.g. SUBJECT_MAP puts 醫學一 Q74
  in 生物化學, but the oracle (correctly) has several years' Q74 as 生理學.

**Resolution (REFINEMENT vs design D2):** join the official PDF content to the oracle by
`(year, session, book, qNumber)` and take the **subject (→ id) from the oracle**. → **100%
id-stable** for the 107-114 overlap + 115; the 詳解 join becomes trivial (same id). D2's
GOAL (id-stable) is met; D2's literal mechanism (SUBJECT_MAP reproduces ids) is replaced by
the oracle-join. **No hard stop** — the 65 are explained, not corrupt.

## 0.2 — Answer files

- Clean **text-layer** PDFs (not scanned). Answers are fullwidth Ａ–Ｄ in a column-jumbled
  grid; a spatial parser (pair each 題號 with the answer cell directly below) is required —
  naive reading order fails (the `答案` label glues to the first letter of each block).
- **Cross-check vs oracle: 100% precision — 2970/2970 cleanly-parsed answers agree with the
  oracle, ZERO disagreements.** Confirms the oracle already holds the official answers AND the
  parser is sound. The unparsed cells are the `＃`-disputed (送分/更正) ones the quick parser
  skipped — they need `＃`-cell + 備註-text decoding (e.g. `第40題一律給分`).
- Split: **27 MOD (有更正) / 5 ANS (無更正)** in 107-115 → 27 papers carry ≥1 correction.
- **2 papers have NO official answer file**: `113-1-醫學二`, `115-1-醫學二` (both have a
  question PDF + oracle answers) → **fall back to the oracle answer** for these two.
- 2 stray 106 answer files in `解答/` (106-2 醫一/醫二) — out of scope, ignore.

## 0.3 — 詳解 join hit-rate

Because subject+explanation are inherited from the oracle by id, the 詳解 "join" is the
oracle's own explanation field. Coverage for 107-115 (3400 q): **3394 real / 6 placeholder**
(99.8%). Placeholders: 107×3, 111×2, 112×1. **115 fully covered (200/200)** — owner's
AI-marked 詳解 reaches it. `explanationSource: 'ai-generated'` marks are present and carry
over untouched. All prior 詳解 work (簡解 restore, 27 table-images, OCR-garble fixes) is
preserved automatically by the by-id inherit.

## 0.4 — Question-image volume

**49 raster images across all 34 PDFs; 25/34 papers have ≥1 (1–5 each).** Trivial extractor
(vs the 詳解-figure pipeline). Caveat: `get_images` counts embedded raster only — vector
line-art is not counted, but basic-science 醫學一/醫學二 MCQs rarely carry figures (matches
the oracle's sparse `hasImage`). The extractor maps each raster to its question by
y-position; small enough to eyeball-QA.

## 0.5 — Orphan-safety surface inventory

**Dexie tables keyed on `questionId` (PK):** `questionBookmarks`,
`questionBookmarkTombstones`, `questionFlags`, `questionHistory` (the last carries
`everWrong` / `lastResult` / `nextDueAt` SRS due / `family`). `mockExamDrafts` is keyed on
`paperKeyHash = ${year}-${sitting}-${book}` (paper-level).

**Already safe (no corpus-size dependency):**
- `familyMastery` (correct/total per family) + `achievements` are **monotonic accumulators**
  incremented on answer — not recomputed from corpus, never decrement, no crash on a shrunk
  corpus. `achievement.ts` totals reduce over the counters, not corpus size.
- Corpus-size reads are already **live**: `QuestionBankPage` uses `questions.length`;
  `CollectionPage` gacha denominator is catalog/`held.length`; `exam-set.ts` scores per live
  paper. No hard-coded "4600".
- `BookmarksPage` already guards bookmarks with `questionMap.has(b.questionId)`.

**Reads to harden (read-side only; matches design D6 — NO Dexie/R2 schema bump):** the
history-driven paths must skip ids absent from the loaded corpus:
- expedition wrong-pool builder (`services/expedition.ts`)
- `BookmarksPage` 「歷史曾錯」 / 「目前未答對」 lists (filter `questionHistory` to present ids)
- any SRS due-queue read off `questionHistory.nextDueAt`
Derived counts (mastery%, 科目精通數, coverage) already recompute against present data.

## Content sanity (parse feasibility)

32/34 papers parse cleanly to Q1..Q100 with the crudest `^N.` regex (all 400 option groups
present). 2 papers miss exactly one question by that naive regex — `111-1-醫學一` Q56,
`112-2-醫學二` Q99 — line-wrap quirks (the number isn't at line start); a coordinate/font-aware
parser recovers them. Not broken.

## Net effect on the pipeline (Phase 1)

The rebuild reduces to: **filter the oracle to 107-115; for each question replace
`stem`/`options`/`hasImage`/image assets from the official PDF and re-verify `answer` from
the official 解答 file (oracle fallback for the 2 missing answer papers + the ＃-disputed
shape for 27 MOD papers); keep `id`/`subject`/`meta`/`explanation`/詳解-figures from the
oracle; drop 104-106.** Then filter the 詳解-figure manifest to surviving 107-114 ids. This
is a content-swap, not an id regeneration — lower risk, fully id-stable.
