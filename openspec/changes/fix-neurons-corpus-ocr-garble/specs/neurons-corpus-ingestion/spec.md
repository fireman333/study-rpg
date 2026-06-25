## ADDED Requirements

### Requirement: Known OCR garble SHALL be corrected (PUA glyph mapping + content typos)

The corpus pipeline SHALL correct known, deterministic OCR garble in the `explanation` field without
ever altering a question's `id` or `answer`, and without inventing or paraphrasing content. Two
mechanisms apply:

1. **Build-time PUA glyph mapping.** The build normalizer SHALL map private-use-area (Wingdings/
   Symbol-font) codepoints that lost their font mapping to their faithful Unicode equivalents
   (e.g. the Wingdings arrow `U+F0E0` → `→`, check `U+F0FC` → `✓`, bullet `U+F06C` → `•`), applied
   uniformly to every explanation and idempotently. Each codepoint's mapping SHALL be confirmed
   against the source-PDF render (the clean pixels), not guessed; a semantic glyph (arrow/check)
   SHALL be assigned only when the render confirms it, otherwise an unambiguous list-marker glyph
   maps to a neutral bullet. A PUA codepoint whose glyph cannot be confirmed SHALL be left unchanged
   and reported (No-Silent-Errors), never guessed.

2. **Source content-typo corrections.** Confirmed, unambiguous OCR content errors SHALL be corrected
   in the source corpus by surgical text-level replacement on the affected question ids (never a
   wholesale reformat), each traced to the source-PDF render or self-evident inline context — in
   particular the wrong neurotransmitter name `乙烯膽鹼` SHALL be corrected to `乙醯膽鹼`
   (acetylcholine) wherever it appears. Only the garbled substring changes; the rest of the
   `explanation` stays byte-identical.

This requirement is a sibling to the whitespace safe-subset normalization (which is unchanged);
trailing page-number / page-furniture stripping remains owned by that requirement and is not part of
this one.

#### Scenario: A Wingdings arrow renders as a real arrow

- **WHEN** an explanation contains the private-use codepoint `U+F0E0` (a Wingdings arrow whose font
  mapping was lost in OCR)
- **THEN** the build SHALL emit `→` in its place
- **AND** the surrounding words SHALL be unchanged

#### Scenario: An unconfirmable PUA glyph is left intact and reported

- **WHEN** an explanation contains a private-use codepoint whose intended glyph cannot be confirmed
  from the source-PDF render
- **THEN** the build SHALL leave that codepoint unchanged and report it (No-Silent-Errors)
- **AND** SHALL NOT substitute a guessed character

#### Scenario: A wrong neurotransmitter name is corrected in source

- **WHEN** an explanation contains the OCR garble `乙烯膽鹼` (in an acetylcholine context, e.g. ACh
  receptor / cholinesterase / ACh release)
- **THEN** the source `explanation` SHALL be corrected to `乙醯膽鹼`
- **AND** the question's `id` and `answer` SHALL be unchanged, and the rest of the `explanation`
  SHALL be byte-identical
