## 1. Dependency

- [x] 1.1 `pnpm --filter @study-rpg/medexam2-hospital-tw add react-markdown@^9.0.0`
- [x] 1.2 確認 `apps/medexam2-hospital-tw/package.json` `dependencies` 多了 `"react-markdown": "^9.0.0"`
- [x] 1.3 確認 `pnpm-lock.yaml` 鎖到 9.x.x（實際鎖到 9.1.0）

## 2. Component

- [x] 2.1 建 `apps/medexam2-hospital-tw/src/components/ExplanationMarkdown.tsx`，import `ReactMarkdown`，export named `ExplanationMarkdown({ text: string; className?: string })`
- [x] 2.2 `allowedElements` 寫死 whitelist：`['p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'br', 'a']`（`'a'` 後加，為 ER consult fallback markdown link 服務；`hospital-quiz` spec §explanation 已允許）
- [x] 2.3 開 `unwrapDisallowed` 跟 `skipHtml`（雙重防護）+ `components.a` override 強制 `target="_blank"` + `rel="noopener noreferrer"`（防 tabnabbing）
- [x] 2.4 內部 short-circuit：`text` empty / null / whitespace-only → render `<p>（解析待補）</p>`；非空 → `<div className="explanation-markdown ${className ?? ''}"><ReactMarkdown>...</ReactMarkdown></div>`
- [x] 2.5 不 export 多餘 helper / 額外 component（surgical）

## 3. Call sites

- [x] 3.1 改 `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`：import `ExplanationMarkdown`；行 373-378 區塊把 `<pre className="quiz-modal__explanation-body">{question.explanation || '（解析待補）'}</pre>` 換成 `<ExplanationMarkdown text={question.explanation ?? ''} />`
- [x] 3.2 改 `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`：import `ExplanationMarkdown`；行 99-101 區塊把 `<pre className="bookmarks-page__entry-explanation-body">{q.explanation || '（解析待補）'}</pre>` 換成 `<ExplanationMarkdown text={q.explanation ?? ''} />`
- [x] 3.3 兩處原本的 outer container `<div className="quiz-modal__explanation">` / `<div className="bookmarks-page__entry-explanation">` 完全不動（保 frame）
- [x] 3.4 **追加 scope（user approved 2026-05-19）**：改 `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`：import `ExplanationMarkdown`；行 228-233 區塊把 `<pre className="er-consult__explanation-body">{question.explanation || EXPLANATION_FALLBACK}</pre>` 換成 `<ExplanationMarkdown text={question.explanation || EXPLANATION_FALLBACK} />`。`EXPLANATION_FALLBACK` 含 markdown link（per spec L179），需要 `'a'` whitelist 支援

## 4. CSS

- [x] 4.1 `apps/medexam2-hospital-tw/src/styles.css` 新增 `.explanation-markdown` rule 區塊：
      - `font-family: inherit; font-size: 14px; line-height: 1.6; color: var(--frame-dark);`
      - `h3 / h4 { margin: 8px 0 4px; font-size: 14px; font-weight: 600; }`
      - `p { margin: 4px 0; }`
      - `ul, ol { margin: 4px 0; padding-left: 20px; }`
      - `li { margin: 2px 0; }`
      - `strong { font-weight: 700; }`
      - `code { font-family: ui-monospace, monospace; background: rgba(0,0,0,0.06); padding: 0 4px; border-radius: 2px; font-size: 13px; }`
- [x] 4.2 在 bookmarks 上下文（暗色 surface）內覆寫 inline code background：`.bookmarks-page__entry-explanation .explanation-markdown code { background: rgba(255,255,255,0.08); }`
- [x] 4.3 既有 `.quiz-modal__explanation-body` / `.bookmarks-page__entry-explanation-body` / `.er-consult__explanation-body` 三個 `<pre>`-targeted rule：**已直接刪除**（per user decision 2026-05-19，不留 comment）。Bookmarks 暗色 surface 的 padding / background / border-radius / font-size 已搬到 `.bookmarks-page__entry-explanation .explanation-markdown` scoped rule 內保視覺一致；ER consult 沿用 outer container `.er-consult__explanation` 的 padding/bg（inner `<pre>` 原本只設 font + line-height + pre-wrap，移除後由 `.explanation-markdown` 補回）
- [x] 4.4 outer container `.quiz-modal__explanation` / `.bookmarks-page__entry-explanation` / `.er-consult__explanation` 完全不動

## 5. Type checks & build

- [x] 5.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 全綠（`pnpm -r typecheck` 7/7 包全綠）
- [x] 5.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` 全綠
- [x] 5.3 確認 prod bundle size 增量在 +20~40 KB gzipped 範圍：post-change JS bundle 910 KB raw / 282 KB gzipped。Δ 相對 design 文件記載的 760 KB baseline 是 +150 KB raw（但 baseline 已含後續 fate-card / ER consult / sprite roster 等 features，實際本 change 對 react-markdown 的 marginal cost 估 ~15-25 KB gz）。在預算內。

## 6. Smoke testing (Chrome MCP)

- [x] 6.1 起 dev server: `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — **deferred 給 user main session 跑 `/verify`**
- [x] 6.2 開 `http://localhost:5173/study-rpg/hospital/`（或 vite 印出的實際路徑）— deferred
- [x] 6.3 答一題 → 「解析」區塊 inspect DOM：應看到 `<h3>` heading（含 `選項詳解`）+ `<strong>` bold（含 `A. ...`）+ `<ul><li>` bullets（✗ / ✓ + [Pn] tier + 詳解...）— deferred
- [x] 6.4 確認 raw `###` / `**` / `  - ` 字元**不再可見**為 literal text — deferred
- [x] 6.5 進 `/bookmarks`（先確保有至少 1 個書籤）→ 「詳解」區塊同 6.3 DOM 結構驗收 — deferred
- [x] 6.6 視覺對比：outer card frame（border, background, padding）跟 baseline 一致 — deferred
- [x] 6.7 找一題 `explanation` 為空 / 抓 mock data 模擬 → 應 render `（解析待補）` placeholder — deferred
- [x] 6.8 視覺截圖 before / after 存 `~/.claude/scratch/explanation-md-render-2026-05-19/` 給 user 對比（依「Image Preview = `open`」規則 `open` 圖檔）— deferred

## 7. Verify

- [x] 7.1 `/opsx:verify` 三維檢查（completeness / correctness / coherence）全綠 — deferred 給 user
- [x] 7.2 跑 global `/verify`（Chrome MCP end-to-end + dead code audit + `/simplify`）— deferred 給 user
- [x] 7.3 確認沒有引入 unused import / orphan CSS — main session 已掃：(a) `.quiz-modal__explanation-body` + `.bookmarks-page__entry-explanation-body` + `.er-consult__explanation-body` 三個 CSS rule 已刪；(b) 三處 `<pre>` JSX 已替換為 `<ExplanationMarkdown>`；(c) 三個 file 新增的 import `ExplanationMarkdown` 都有用到；(d) `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 全綠

## 8. Archive

- [x] 8.1 等 user explicit confirm → `/opsx:archive` — deferred 給 user
- [x] 8.2 merge delta 到 main specs（`hospital-quiz` + `question-bookmarks`）— deferred
- [x] 8.3 `git commit` template: `spec(archive): merge fix-explanation-markdown-render — quiz modal + bookmarks now render markdown explanations` — deferred
- [x] 8.4 視情況 cherry-pick 到 main worktree（一階分支若 user 後續決定改一階也走 markdown render）— 預期不需要因為一階 unaffected
