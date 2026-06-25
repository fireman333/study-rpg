# Tasks — fix-neurons-corpus-ocr-garble

> Surgical + deterministic. NO Workflow / NO agent fan-out (batch-1 proofread burned 19.5M tokens).
> Every fix traces to the source-PDF *render* (clean pixels), not the OCR text layer.
> Source PDFs: `~/Desktop/國考/一階國考/陽明國考考古/`. Never touch `id` / `answer`.

## 1. PUA glyph map (build-time)

- [ ] 1.1 Confirm each of the 23 PUA codepoints against the source-PDF render: render a question that
  uses it (`fitz.get_pixmap`, clip the line) and read the actual glyph. Build the codepoint→Unicode
  map (started: `U+F0E0`→`→`, `U+F0FC`→`✓`, `U+F06C`→`•`). Ambiguous list markers → `•`; unconfirmable
  → leave + log
- [ ] 1.2 Add the map + replacement step to `normalizeExplanation` (`packages/content-neurons-tw/scripts/build.ts`)
  — deterministic, idempotent, applied to every explanation; whitespace subset unchanged
- [ ] 1.3 Emit a build count of PUA codepoints mapped vs left-unmapped (No-Silent-Errors)

## 2. Content-typo corrections (source data)

- [ ] 2.1 Surgical byte-safe edits to `packages/content-neurons-tw/data/medexam-reconciled/questions.json`
  `explanation` for: `乙烯膽鹼`→`乙醯膽鹼` (5 q: 104-2-藥理-Q66, 105-2-藥理-Q65, 106-1-藥理-Q71,
  111-1-生理-Q54, 114-2-組織-Q38), `derpession`→depression (104-2-藥理-Q62),
  `transmembrance`→transmembrane (104-2-生化-Q48), `MgS04`→MgSO4 (104-2-藥理-Q62), `Thl`→Th1
  (104-2-微免-Q72), `typel`→Type I (104-2-生理-Q7) — verify each replacement target in context first
- [ ] 2.2 Targeted `str.replace` on the loaded value per id; write back WITHOUT a full `json.dump`
  reformat (preserve formatting; diff must be only the corrected substrings); `id`/`answer` untouched

## 3. Deferred prose items (prose.json)

- [ ] 3.1 Q55 (`104-2-醫學二-藥理學-Q55`): render PDF p67, recover the -terol mnemonic OR drop the
  half-garbled fragment (owner's call from §0 scope) → fix `table-images/prose.json`
- [ ] 3.2 Q91 (`106-1-醫學一-公共衛生學-Q91`): render PDF p83, recover the radiation-unit-conversion
  line (侖琴 / C/kg / 2.58×10⁻⁴) → fix `prose.json` (do NOT trust the low-vote agent rewrite)
- [ ] 3.3 Confirm Q61/Q60 stay as-is (keep — real content), Q48/Q63 cosmetic (optional). prose.json
  edits gated by the existing exact NFKC+PUA-tolerant substring check

## 4. Build + verify

- [ ] 4.1 `pnpm run build:neurons-content` (expect 4600/0) + `node apps/neurons-tw/scripts/copy-content.mjs`
- [ ] 4.2 Re-scan the built output: 0 PUA codepoints remain except any deliberately-left/logged ones;
  `乙烯膽鹼` count == 0; the singletons fixed
- [ ] 4.3 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` green (no app/type change)
- [ ] 4.4 `/verify` — Chrome MCP `/bank` smoke: an arrow/bullet question renders the real glyph; a
  corrected 乙醯膽鹼 question reads correctly; 0 page overflow

## 5. Ship

- [ ] 5.1 Deploy neurons (Cloudflare Pages); prod-verify the built `questions.json` shows the fixes
- [ ] 5.2 `/opsx:archive` (sync the MODIFIED `neurons-corpus-ingestion` delta) + commit (explicit
  per-file `git add` of content/build/openspec paths only — coordinate via session-bus; do NOT touch
  the sync engine files)
