# Strip 陽明 chapter/page-break footers from explanations at build time

## Why

A corpus-wide audit (prompted by player-reported 詳解 「空行問題」) found that the
build's `normalizeExplanation` safe-subset leaves a class of page-furniture lines
that the upstream 陽明 paginated PDF injected **into the middle of** explanations:
`陽明醫學系110 級`, `108 第二次（暑）醫學二`, `陽明醫學系歷屆國考詳解`, `回目錄`.
These split a single explanation across "pages" and render as stray lines / blank
gaps. They are confined to the 106–109 papers and total **553 questions (12% of
the corpus)**. A scan confirmed these regexes match only a handful of distinct
furniture strings — no legitimate content line can take these forms (zero
false-positive risk).

(The bigger, separate problem — PDF *tables* flattened to one-cell-per-line — is a
follow-up handled by structured `explanationBlocks` reconstruction, not this
whitespace normalizer.)

## What Changes

- Extend `normalizeExplanation` in `packages/content-neurons-tw/scripts/build.ts`
  with four additional line-drop regexes (run in the same safe-subset loop, before
  the existing trailing-whitespace strip + blank-run collapse, so a removed footer
  between two blanks auto-merges):
  - `^\s*陽明醫學系\s*\d+\s*級\s*$`
  - `^\s*\d+\s*第[一二三四]次（?[暑寒]?）?\s*醫學[一二]\s*$`
  - `^\s*陽明醫學系歷屆國考詳解\s*$`
  - `^\s*回目錄\s*$`
- Bare SINGLE-digit lines are deliberately NOT dropped — sampling showed they are
  broken table-cell fragments (e.g. Cephalosporin generation numbers), not page
  footers; dropping them would corrupt table semantics (high FP risk).

## Impact

- Affected specs: `neurons-corpus-ingestion` (MODIFIED: the build-time whitespace
  normalizer requirement now also drops 陽明 chapter/page-break footer lines).
- Affected code (build only, content-data pipeline; never touches `id`/`answer`):
  `packages/content-neurons-tw/scripts/build.ts`.
- Verified: after rebuild, all four footer patterns drop to **0** residual lines
  across the corpus; 4600/4600 imported (0 skipped).
- **Deploy**: neurons app only (Cloudflare Pages). No Worker / D1 / sync / Dexie /
  R2 change → no dexie-fixture-lint concern.
- L2 content-quality fix.
