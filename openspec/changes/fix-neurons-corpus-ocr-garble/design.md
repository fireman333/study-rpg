# Design — fix-neurons-corpus-ocr-garble

## Context

Two correction surfaces, chosen by what kind of garble it is:

- **Uniform, mechanical glyph loss** (PUA Wingdings/Symbol) → a build-time transform in
  `normalizeExplanation`, so it is applied to every explanation, is idempotent, and covers future
  re-ingests without hand-editing source. This mirrors the existing whitespace safe-subset already
  living there (`build.ts:229`).
- **Specific factual typos** (`乙烯膽鹼`, `derpession`, …) → surgical edits to the in-repo **source**
  `questions.json`, because they are content corrections that should be visible/auditable in the
  source-of-truth, not hidden in a build string-replace that could over-match.
- **Garbled image-tier prose** (Q55, Q91) → `table-images/prose.json` (the image-question prose
  store), recovered from the PDF render.

## Goals / Non-Goals

**Goals**
- Map the 23 PUA codepoints to faithful Unicode equivalents so arrows/bullets/checks render.
- Correct the confirmed content typos (esp. `乙烯膽鹼`→`乙醯膽鹼`, a wrong NT name in 5 questions).
- Recover Q55/Q91 prose from source.
- Every change deterministic, PDF-verified, no agent fan-out.

**Non-Goals**
- No context-dependent mass rewrites (SOz-style subscript loss is 1 source occurrence; `一`-as-arrow
  is per-case) — explicitly deferred.
- No page-number-junk pass (already handled by the shipped normalizer).
- No `id` / `answer` edits. No schema / app / sync change. No Workflow.

## Decisions

### Decision 1 — PUA map is verified per-codepoint against the PDF render, not guessed
The 23 codepoints are standard Wingdings/Symbol-font PUA (`F0xx` = font byte `xx`). Rather than trust
a from-memory Wingdings table, each mapping is confirmed by rendering a question that uses it from the
source PDF (`fitz.get_pixmap`, clip the line) and reading the actual glyph. Confirmed so far:
`U+F0E0`→`→` (arrow; context「變凸 → accommodation」), `U+F0FC`→`✓`, `U+F06C`→`•`. The map is a plain
dict in `build.ts`; applying it is `str.replace` per codepoint. **Safety rule:** a codepoint is only
mapped to a *semantic* glyph (arrow/check) when the PDF confirms it; ambiguous list-marker glyphs map
to a neutral `•`; any codepoint that cannot be confirmed is **left as-is and logged** (No-Silent-
Errors), never guessed.

### Decision 2 — Idempotent + uniform, beside the whitespace subset
The PUA replacement runs inside `normalizeExplanation`, before/after the existing whitespace pass, so
one function owns all build-time explanation hygiene. It is idempotent (mapping ASCII/Unicode targets
that contain no PUA) and uniform (all 4581 explanations), so re-runs and future sittings are covered.
The spec's existing whitespace requirement is unchanged; a sibling requirement is added for PUA.

### Decision 3 — Content typos are surgical source edits, byte-safe
Edits use targeted `str.replace` on the loaded JSON value for the specific question ids, then write
back preserving formatting (no `json.dump` reformat of all 4600 — mirrors the prior subject-relabel
change's discipline). Each typo is unambiguous and self-verifying: `乙烯膽鹼`→`乙醯膽鹼` is confirmed
by the inline English「acetylcholine」/「Ach」in the same explanations; the singletons are exact
known OCR errors. The original `explanation` is otherwise byte-identical.

### Decision 4 — Faithfulness gate + no Workflow
Every kept/edited passage stays a faithful representation of the source: PUA→Unicode is a
glyph-restoration (no words change); content typos and Q55/Q91 prose are corrections traced to the
PDF render. **No agent fan-out / no Workflow** (the batch-1 proofread Workflow mis-counted its arg
and burned 19.5M tokens). The 2 disputed prose items are recovered by reading the PDF render directly
(the path that salvaged Q59/Q93 in batch 1).

## Risks / Open Questions

- **PUA map completeness**: some of the 20 long-tail codepoints may be ambiguous list markers; those
  map to `•` or are left + logged. Acceptable — no semantic loss either way, and the No-Silent-Errors
  count surfaces anything skipped.
- **Over-match on content typos**: mitigated by anchoring each `str.replace` to the specific question
  id(s) found in the scan, not a global replace.
- **`乙烯膽鹼` legitimacy**: ruled out — it is not a standard compound here; all 5 contexts are
  acetylcholine (cholinesterase, ACh receptor, ACh release), Q54 prints the English beside it.
