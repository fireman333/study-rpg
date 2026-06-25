# Tasks — fix-neurons-corpus-ocr-garble

> Surgical + deterministic. NO Workflow / NO agent fan-out (batch-1 proofread burned 19.5M tokens).
> Every fix traces to the source-PDF *render* (clean pixels), not the OCR text layer.
> Source PDFs: `~/Desktop/國考/一階國考/陽明國考考古/`. Never touch `id` / `answer`.

## 1. PUA glyph map (build-time)

- [x] 1.1 Confirmed ALL 23 PUA codepoints against the source-PDF render (`fitz` line crops). 8 are
  directional arrows (F0E0/E8/F0/5F→`→`, F0E1/C7→`↑`, F0E2→`↓`, F0DF→`←`) — verification caught that
  F0E1/E2 are hormone-table ↑/↓ (NOT bullets); F0FC→`✓`, F0AB→`★`, F04A→`☺`; 12 list-markers→`•`
- [x] 1.2 Added `PUA_GLYPH_MAP` + `mapPuaGlyphs` to `normalizeExplanation` (`build.ts`) —
  deterministic, idempotent, applied to every explanation; whitespace subset unchanged
- [x] 1.3 Build reports `pua-glyphs: mapped 400 / left-as-is 0 across 0 unmapped` (No-Silent-Errors —
  the 23-codepoint map covers every PUA occurrence in the corpus)

## 2. Content-typo corrections (source data)

- [x] 2.1 Surgical edits to source `questions.json` `explanation`: `乙烯膽`→`乙醯膽` ×11 (5 q; trigram
  anchor handles 鹼/酶/newline-split, leaves the 9 legit 乙烯 alkene untouched), derpession→depression,
  transmembrance→transmembrane, MgS04→MgSO4 ×2, Thl→Th1, typel→Type I, typellA→Type IIA. Each context-verified
- [x] 2.2 Guarded raw-text `str.replace` (assert exact count per pattern, abort on mismatch); object-level
  diff confirmed ONLY 9 explanations changed, `id`/`answer` byte-identical, no json reformat

## 3. Deferred prose items (prose.json)

- [x] 3.1 Q55 — handoff qid was wrong (104-2 → actually `108-2-醫學二-藥理學-Q55`, a β-agonist
  image-tier question). Corpus search located it; the garbled mnemonic block was recovered FAITHFULLY
  from PDF p67 render: `*提供筆者的記法：terol 結尾的藥物，在 terol 前面四個字母的為短效，五個字母為較長效。`
  (OCR had dropped the middle clause). `prose.json` updated; built-output verified
- [x] 3.2 Q91 (`106-1-醫學一-公共衛生學-Q91`): block[2] OCR duplication removed faithfully (`國際單位
  (C/kg)：1 R = 2.58×10 國際單位…` dup → `1 R = 2.58×10-4 C/kg`); value PDF-confirmed (p83 table 庫侖/公斤)
- [x] 3.3 Q61/Q60 kept as-is (real content); Q48 transmembrance fixed in §2; Q48/Q63 cosmetic dashes skipped

## 4. Build + verify

- [x] 4.1 `pnpm run build:neurons-content` (4600/0) + `copy-content.mjs` — table-images intact (27/47)
- [x] 4.2 Re-scanned built output: **0 PUA** anywhere (explanation + blocks); `乙烯膽` == 0 (27 乙醯膽);
  Q91 dup gone; hormone arrows render (`T3/T4↓`, `缺碘→胎兒缺碘→`)
- [x] 4.3 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` = 676 passed (94 files)
- [x] 4.4 Chrome MCP `/bank` smoke — SKIPPED (owner choice): app code unchanged (content-data only);
  built-output programmatically verified (0 PUA, arrows render) + 676 tests + typecheck green

## 5. Ship

- [~] 5.1 Deploy neurons (Cloudflare Pages) — deferred to the next `track-neurons → main` merge
  (merge = deploy; the concurrent R2-412 session owns the main merge). Prod-verify after that merge
- [x] 5.2 `/opsx:archive` (synced the MODIFIED `neurons-corpus-ingestion` delta) + explicit per-file
  commit of source / build.ts / prose.json / built-output / openspec paths (NOT the sync engine files)
