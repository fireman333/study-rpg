# Add a search box to the neurons 題庫 tab

## Why

Classmates use the app's 題庫 (`/bank`) mainly to *look up* past questions, but
neurons only offers 科別 / 年份 / 次別 chip filters — there is no way to find a
question by a keyword, drug name, or 題號. 二階 (`study-rpg-2nd`) shipped the same
search box for the shared ~4600-Q 一階 corpus (commit `ddeb7fe`); neurons reuses
that corpus and has a near-identical 題庫 page, so it should offer the same lookup.

## What Changes

- Add a search box above the filter chips on `QuestionBankPage` (`/bank`):
  - **Substring match** (no search library) over a precomputed, NFKC-lowercased
    haystack per question (題號 + 題幹 + 選項 + 詳解). NFKC folds full/half-width
    Latin so 藥名 / 英文縮寫 match regardless of width.
  - Whitespace-split tokens are **AND-combined** (all must be present).
  - The search **composes with the existing chip filters** (科別 ∧ 年份 ∧ 次別 ∧
    search) — search narrows the already-chip-filtered set.
  - **IME-safe** for 注音 / 拼音: a `compositionStart`/`End` guard suppresses
    commits mid-composition and commits immediately on `compositionEnd`; the
    input is otherwise debounced 200ms into the active query.
  - **Filter-aware empty state**: distinguishes 「找不到包含「X」的題目」 (search
    only) from 「目前篩選條件下找不到符合「X」的題目」 (search + chips), offers a
    清除搜尋 / 清除篩選 action, and a 「清除篩選後，「X」可找到 N 題」 hint when
    chips have hidden all otherwise-matching hits.
- neurons divergences from 二階 (same logic, different presentation layer):
  inline `React.CSSProperties` (no CSS classes), `type="text"` + a custom × button
  (avoids the native search-cancel double-× 二階 hit), and the field is
  `q.meta.session` not `sitting`.

## Impact

- New capability: `neurons-question-bank-search` (the 題庫 search box behavior).
- Affected code (presentation/derived only, no logic/schema change):
  `apps/neurons-tw/src/routes/QuestionBankPage.tsx` (+ exported `buildHaystack` /
  `tokenizeSearchQuery` helpers), `apps/neurons-tw/src/__tests__/question-bank-search.test.ts` (new).
- **Zero** Dexie / R2 / SYNCED_META / economy touch → no schema bump, no
  dexie-fixture-lint concern.
- **Deploy**: neurons app only (Cloudflare Pages). No Worker / D1 / sync change.
- L2 UI feature (port of an already-vetted 二階 feature).
