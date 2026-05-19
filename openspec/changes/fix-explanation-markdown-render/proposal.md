## Why

Live prod dogfood (https://fireman333.github.io/study-rpg/hospital/) 確認二階 quiz modal 跟 bookmarks page 都把 explanation 當 **literal monospaced 文字** render — `### 選項詳解`、`**A. ...**`、`  - ✗ 錯誤` 全部以 raw markdown 字元呈現，沒有 heading / bold / bullet 樣式。

這是**實作未對齊既有 spec** 的 bug：`hospital-quiz/spec.md:223,244` 已明文要求「the explanation SHALL display the full text with markdown rendering (headings, bold, bullet points)」，但 `QuizModal.tsx:375-377` 跟 `BookmarksPage.tsx:99-101` 都用 `<pre>{question.explanation}</pre>`，純文字 render。

題庫 statistics 確認影響面：6080 題二階 explanation 中 **6057 (99.6%) 含 `### ` heading + 6058 含 `**bold**` + 6057 含 `-` list**（LLM-generated 詳解 © WLK + Claude Haiku 4.5 + OpenEvidence 驗證）。零題含 GFM table。一階 medexam-tw 0 題含 markdown header（純 OCR 文字 from 陽明小組），**不受此 bug 影響**，`<pre>` + `pre-wrap` 對純文字 render 是正確的。

## What Changes

- **新增 `<ExplanationMarkdown>` component**（二階 app 內部，不放 core）— `apps/medexam2-hospital-tw/src/components/ExplanationMarkdown.tsx`，接 `text: string` prop，render with strict allowlist：`paragraph` / `heading (h1-h4)` / `strong` / `em` / `list (ul, ol, li)` / `code (inline)` / `br`。**禁用 raw HTML passthrough**（`react-markdown` default `skipHtml` 等同）。
- **`QuizModal.tsx:375-377` 改用 `<ExplanationMarkdown text={question.explanation} />`** — 移除 `<pre>`。`(解析待補)` placeholder 仍走原 fallback path（empty / null → 顯示 placeholder 文字）。
- **`BookmarksPage.tsx:99-101` 改用 `<ExplanationMarkdown text={q.explanation} />`** — 同上。
- **新增 dependency**: `react-markdown@^9.0.0`（pin minor，~30 KB gzipped，依賴 `unified` / `remark-parse` / `mdast-util-*`，純 ESM、零 dev plugin chain）。不加 `remark-gfm`（無 table 需求）；不加 `remark-math` / `rehype-highlight` / 任何 plugin。
- **CSS 微調**: `apps/medexam2-hospital-tw/src/styles.css` 新增 `.explanation-markdown` rule 集，inherit `font-family / color`；`h3 / h4` 字級對齊現有 `.quiz-modal__explanation h3`；`p / ul / li` 維持 `line-height: 1.6`；保留 `white-space: normal`（不再 pre-wrap，因為 markdown render 已處理 newline 結構）。**既有 card frame `.quiz-modal__explanation` / `.bookmarks-page__entry-explanation` outer container 完全不動**。
- **一階 medexam-tw 不動** — Phase 1 grep 確認 explanations 無 markdown header（0/3291）；改了反而要新加 dep + bundle 增重，違反 surgical change 原則。如未來 LLM-augment 一階 explanations 再開新 change。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `hospital-quiz`:
  - MODIFY requirement「Wrong answer SHALL reveal explanation, update mastery and history, with no penalty」— Bullet point 5 補實作 reference（`<ExplanationMarkdown>` component + react-markdown + whitelist node set）；scenario「Explanation rendered from corpus」補 DOM 結構驗收（render 出 `<h3>` / `<strong>` / `<ul>` / `<li>`，非 raw text）。

- `question-bookmarks`:
  - MODIFY requirement「A `/bookmarks` route SHALL list all bookmarked questions with full content inline」— Explanation rendering 補 markdown 對齊；scenario「Each entry shows full question content inline」補 markdown 結構驗收。

## Impact

- **新檔**:
  - `apps/medexam2-hospital-tw/src/components/ExplanationMarkdown.tsx`（~30 lines；props `{ text: string; className?: string }`；whitelist via `allowedElements`）
- **改動檔**:
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（行 372–378 區塊：`<pre>` → `<ExplanationMarkdown>`，placeholder fallback 行為不變）
  - `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`（行 97–102 區塊：同上）
  - `apps/medexam2-hospital-tw/src/styles.css`（新增 `.explanation-markdown` 區塊；`.quiz-modal__explanation-body` 與 `.bookmarks-page__entry-explanation-body` 兩個 `<pre>`-targeted rule 可保留（fallback safety）或標 deprecated；本 change 偏向保留註解標 `// kept for placeholder text fallback`）
  - `apps/medexam2-hospital-tw/package.json`（dependencies 新增 `react-markdown: ^9.0.0`）
  - `pnpm-lock.yaml`（自動）
- **不動檔**:
  - `apps/medexam-tw/**`（一階 explanations 無 markdown header）
  - `packages/core/**`（不放共用 component — 一階目前不需要、core 應保持 content-agnostic per config.yaml rule `no-medical-hardcode-in-engine`）
  - 任何 corpus build script、`questions.json` 內容、Supabase schema、sync engine
- **Bundle size**: react-markdown core (~12 KB gz) + remark-parse + mdast-util-to-hast + small react reconciler glue ≈ +30 KB gzipped to medexam2-hospital-tw bundle（現 760 KB → ~790 KB）。Static SPA on GitHub Pages CDN 可接受。
- **Security**: `react-markdown` v9 預設 `skipHtml=true`，不會 render raw HTML（即使 LLM 之後在 explanation 內插 `<script>` 也安全）。Whitelist `allowedElements` 進一步收緊到僅 `p / h1-h4 / strong / em / ul / ol / li / code / br`，移除 `a` / `img` / `table` / `pre` 等。
- **Performance**: explanation 平均 500-1500 chars，per-question parse < 1ms（unified pipeline 對短 markdown 極快）；QuizModal 一次只 render 一題，BookmarksPage 視書籤數量（典型 < 50 entries）— 無虛擬列表需求。
- **Out of scope（明確留給未來 change）**:
  - 一階 medexam-tw markdown render（待 explanations 升級成 LLM-generated 後再開）
  - GFM 支援（table / strikethrough / autolink）— 現 corpus 0 題用 table
  - Syntax highlighting / math (KaTeX)
  - Mock exam result page (`MockResultRoute` 二階若有 — 本 change 範圍只覆 quiz modal + bookmarks)
- **驗收面**:
  - `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 全綠
  - `pnpm --filter @study-rpg/medexam2-hospital-tw build` 全綠 + 確認新 bundle size 在預估範圍
  - Chrome MCP smoke on dev server: 開 quiz → 答題 → 「解析」區渲染為 `<h3>` + `<strong>` + `<ul>` + `<li>` DOM 結構，非 raw `###` / `**` / `-` 字元
  - Chrome MCP smoke: 進 `/bookmarks` → 同上 DOM 結構驗收
  - 視覺對比：build 出來的卡片 frame border / background / padding 與 baseline 一致（CSS 只動 inner content）
  - `(解析待補)` placeholder fallback path 仍可觸發（拿一個 `explanation = ""` 的 mock test）
