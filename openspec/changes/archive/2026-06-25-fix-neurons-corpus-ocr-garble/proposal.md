# Fix systemic OCR garble in the 詳解 corpus (PUA glyphs + content typos) + 2 deferred prose items

## Why

The 詳解 corpus (`packages/content-neurons-tw/data/medexam-reconciled/questions.json`, `explanation`
field) was OCR'd from a paginated upstream whose text layer is mojibake; the same garble patterns
recur corpus-wide. The `add-neurons-explanation-table-images` proofread surfaced them on the 27
image questions; a corpus scan now quantifies the systemic tail on all 4581 non-empty explanations:

- **PUA / Wingdings glyphs** — **23 distinct private-use codepoints, 400 occurrences across 118
  questions**. These are symbol-font glyphs that lost their font mapping and now render as empty
  boxes / nothing. The dominant three are semantically real: `U+F0E0` ×155 is a Wingdings **arrow →**
  (e.g.「睫狀肌收縮水晶體變凸 → accommodation」), `U+F0FC` ×46 a **✓**, `U+F06C` ×43 a **● bullet**;
  the rest are mostly list-marker glyphs. A blind strip would destroy the arrows' meaning → these
  need a **mapping**, not removal.
- **Confirmed content typos** — a handful of unambiguous, self-verifying OCR errors, most notably
  **`乙烯膽鹼`→`乙醯膽鹼`** (acetylcholine) in **5 questions / 9 spots** — a *wrong neurotransmitter
  name* players currently read (Q54 prints「acetylcholine」+「Ach」right beside the garble, so the
  correction is self-evident). Plus singletons: `derpession`→depression, `transmembrance`→
  transmembrane, `MgS04`→MgSO4, `Thl`→Th1, `typel`→Type I.
- **2 deferred prose items** from the image-tier proofread that need source-PDF recovery:
  `104-2-醫學二-藥理學-Q55` (half-garbled -terol mnemonic) and `106-1-醫學一-公共衛生學-Q91`
  (garbled radiation-unit-conversion line).

Trailing page-number junk (407 questions) is **out of scope** — it is already stripped by the
shipped build-time `normalizeExplanation` (the whitespace-normalizer safe subset).

## What Changes

Three surgical, deterministic, no-Workflow edits (the 27-question proofread Workflow over-ran to
19.5M tokens — this change uses no agent fan-out):

- **PUA glyph mapping (build-time)** — extend `normalizeExplanation` (the existing build normalizer)
  with a deterministic, idempotent Wingdings/Symbol-PUA → Unicode map for the 23 codepoints
  (`U+F0E0`→`→`, `U+F0FC`→`✓`, `U+F06C`→`•`, …), each mapping **verified against the source-PDF
  render** (clean pixels) before inclusion; unknown/ambiguous PUA codepoints are mapped to a neutral
  bullet only when context confirms a list marker, else left untouched and reported. Applied
  uniformly to every explanation (covers the 118 + any future re-ingest). The whitespace subset is
  unchanged.
- **Content typo corrections (source data)** — surgical, byte-safe edits to the in-repo source
  `questions.json` `explanation` field for the confirmed typos (`乙烯膽鹼`→`乙醯膽鹼` ×5, plus the
  five singletons), each verified against the PDF render / inline English. `id` / `answer` are never
  touched; edits are text-level (not a full `json.dump` reformat).
- **2 deferred prose items (prose.json)** — recover Q55 and Q91's garbled passages from the source
  PDF render and fix `packages/content-neurons-tw/table-images/prose.json`, gated by the existing
  exact NFKC+PUA-tolerant substring check (Q61/Q60 confirmed *keep*; Q48/Q63 cosmetic, optional).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-corpus-ingestion`: add a requirement that known OCR garble SHALL be corrected — a
  build-time deterministic PUA→Unicode mapping (alongside the existing whitespace normalizer) plus
  PDF-verified content-typo corrections in source — never altering `id` / `answer`.

## Impact

- **Content data + build only**: `packages/content-neurons-tw/data/medexam-reconciled/questions.json`
  (surgical typo edits), `packages/content-neurons-tw/scripts/build.ts` (`normalizeExplanation` PUA
  map), `packages/content-neurons-tw/table-images/prose.json` (Q55/Q91). Rebuild + `copy-content`.
- **No** change to `id` / `answer`, `@study-rpg/core`, any app component, Dexie, R2 / sync engine,
  the Worker, D1, leaderboard, or game economy. No dexie-fixture-lint concern.
- **Deploy**: neurons Cloudflare Pages only.
- **Method discipline** (per the corpus repair rules + the 19.5M-token incident): every fix traces
  to the source-PDF *render* (clean pixels, not the OCR text layer); corrections are the only allowed
  deltas; faithfulness is checked before applying; **no Workflow / no agent fan-out**.
