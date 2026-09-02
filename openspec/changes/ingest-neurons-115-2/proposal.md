## Why

考選部 has released 115 年第二次一階國考 (卷次 `115090`) — 試題、標準答案 and 更正答案 for both 醫學一 and
醫學二. 陽明國考考古題小組 has **not** published a 詳解 booklet for it and, judging by 115-1 (published roughly
five months after the sitting), will not for some time. A student sitting the next 一階 is revising against a
題庫 whose most recent paper is now one sitting stale, and against a 考前講義 that has never seen it.

The ingest itself is only half the work. Three numbers in this repo are **counts of the corpus written down
somewhere else**: `SITTINGS_TOTAL = 23` in the recurrence builder, `STAT_UP_TO = '115-1'` in the cram builder,
and the 「23 次考試」/「統計至 115-1」 strings in `CramPage`. None of them is checked against anything. Ingesting a
sitting without touching them does not break a build or a test — it just makes the app quietly lie about how
often a 考點 has been examined, which is the one thing the 考前猜題 view exists to state honestly.

## What Changes

- **Ingest 115-2** (200 questions, corpus 4600 → 4800, papers 46 → 48, sittings 23 → 24). 試題 / 標準答案 /
  更正答案 from 考選部; explanations on the existing **AI-generated escape-hatch path** (`explanationSource:
  'ai-generated'` + its own `sourceCredit`), exactly as 115-1 sat before 陽明 published.
- **Fix a silent text defect the existing parser has**: `pdftotext -layout` floats a raised super/subscript
  onto its own output row, where it lands at the end of the **previous** line and detaches from its word.
  115-2 醫二 Q43 came out as 「Cr 的毒性通常較 Cr 強」 with 「6+ 3+」 stranded on the stem tail; 8 questions /
  23 fields were affected. A new span-aware parser is added as an **oracle** (not a replacement) and the
  ingest swaps in its text only for the fields the two parsers disagree on.
- **Make the three corpus-derived constants derived**, so the next sitting does not repeat this change:
  `SITTINGS_TOTAL` = the corpus's own sitting count; `statUpTo` = the last sitting in
  `concept-recurrence.json`; `CramData` gains `sittingsTotal`; `CramPage` reads both instead of hard-coding.
- **Backfill the 考前講義**: 194 edits across all 11 handout fragments — one teaching line (or an enriched
  existing line) per 115-2 question, cited `<cite>115-2</cite>`.
- **Add the gate that would have caught a silent 講義**: `verify:handout` gains a third layer asserting that
  every question of the **latest ingested sitting** has its primary tagged concept land in a handout topic
  that cites that sitting. It currently reports `200 checked, 0 uncovered, 0 unmapped`.
- **Backfill 200 per-option 簡答** so sidecar coverage stays 4800/4800.

**Not BREAKING.** No id changes, no Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no sync-adapter
change. Bookmarks, SRS state, wrong-answer history and cloud-sync bundles are untouched; the corpus diff is
purely additive (verified per-id: 0 of 4600 pre-existing questions changed).

**Three retroactive effects are accepted, not fixed**, because they are the correct behaviour of a larger
corpus rather than defects:

1. **Recurrence tiers recompute corpus-wide.** `lastGap` is measured in sittings, so every 考點 absent from
   115-2 gains one. Observed: 常青必掃 93 → 115, 穩定考點 389 → 372, 經典但降溫 11 → 10 (近年新寵 was already 0
   before this change and still is). A player's 押題 list reshuffles overnight with no action on their part.
2. **Every 出題頻率 denominator moves from 23 to 24**, so a 考點 that read 「15/23」 yesterday reads 「15/24」 today.
   That is the honest number; the alternative is a stale one.
3. **Family completion counts grow** (e.g. 解剖學 698 → 731), so a player mid-way through a subject sees their
   completed fraction fall. It is the arithmetic of a bigger corpus and hiding it would mean lying about the
   denominator.

**One known gap is carried over, not introduced**: the year filter has no sitting dimension, so 「只練 115」 now
also draws 115-2 in quiz, SRS and bookmarks. Same gap the 二階 115-2 ingest recorded; out of scope here.

## Capabilities

### New Capabilities

None. This change extends the population four existing capabilities describe.

### Modified Capabilities

- `neurons-corpus-ingestion`: year coverage gains 115-2; the AI-generated path documents a whole sitting on
  it (not just individual uncovered questions); 更正答案 gains the 115-2 case; and a new requirement makes the
  detached-superscript check part of the ingest contract rather than a lesson someone has to rediscover.
- `neurons-concept-tags`: the recurrence requirement carries `23` **in its own title** (an OpenSpec matching
  key), so it is handled as `RENAMED` + `MODIFIED`. The denominator becomes "every ingested sitting", published
  as `meta.sittingsTotal`, rather than a frozen literal.
- `neurons-cram-tab`: the 押題 honesty requirement's example count and the version-stamp requirement's
  「統計至 115-1」 both become corpus-relative.
- `neurons-anatomy-handout`: adds the latest-sitting teaching-coverage requirement the new gate enforces.

## Impact

- **Corpus artifacts**: `questions.json` (4800), `subjects.json` (per-subject totals re-derived), `meta.json`
  (stats re-derived from the corpus rather than hand-copied — the previous block had drifted: it claimed
  `withExplanation: 4150` and `aiGenerated: 6` against a corpus that already had 4600 and 16, and carried a
  `gapsFilled` field nothing computed or read, now dropped).
- **Provenance**: `concept-tags.model.json` (+202 — 200 × 115-2 plus two previously-untagged questions that an
  earlier reclassification had left without tags), `option-explanations.generated.json` (+200).
- **New tooling** (committed, reusable next sitting): `reconcile/parse_moex_spans.py`,
  `reconcile/ingest_115_2.py`, `reconcile/generate_115_2.py`, `reconcile/finalize_115_2.py`,
  `scripts/option-explanations/gen-jianda-agy.mjs`.
- **Build/verify**: `build-concept-recurrence.ts`, `build-cram.ts`, `verify-handout.ts`,
  `merge-jianda-batch.ts` (provenance strings now env-overridable), `tag-concepts-batch.mjs` (agy's model
  roster moved — `Gemini 3.5 Flash` no longer exists).
- **App**: `CramPage.tsx`; `cram-types.ts` (`statUpTo` widened to `string`, `sittingsTotal` added); two test
  fixtures carrying `CramData` literals.
- **Content**: all 11 `src/handout/*.html` fragments.
- **Verified**: 8 content-pack gates green (`verify:option-explanations` 4800 ok / 0 failed;
  `verify:concept-tags` 100% coverage, 0 OOV; `verify:handout` latest-sitting 200/200), `pnpm -r typecheck`
  clean, **1175/1175 vitest**, dev smoke on `/cram` and `/cram/handout`.
- **Not affected, verified**: Dexie schema, R2 bundle schema version, `SYNCED_META_KEYS`, sync engine,
  leaderboard, and every existing question id.
