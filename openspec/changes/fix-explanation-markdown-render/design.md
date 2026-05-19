## Context

Live prod dogfood (2026-05-19) on `https://fireman333.github.io/study-rpg/hospital/` 抓到兩個 surface 把 LLM-generated markdown explanation render 成 literal text：

1. **Quiz modal** (`QuizModal.tsx:375-377`) — `<pre className="quiz-modal__explanation-body">{question.explanation}</pre>`
2. **Bookmarks page** (`BookmarksPage.tsx:99-101`) — `<pre className="bookmarks-page__entry-explanation-body">{q.explanation}</pre>`

兩個 surface 共用 corpus（`apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json`，6080 題），其中 6057 題（99.6%）的 `explanation` 欄位含 `### 選項詳解` heading、`**A. ...**` bold、`  - ✗ 錯誤 [P1 夯]` 等 markdown 結構。

`hospital-quiz/spec.md:223` 已要求 "rendered from `corpus.explanation`; supports markdown including `### 選項詳解` headings and `**A.** ... ✓ / ✗ [P_N XXX] 詳解...` patterns"。實作未對齊，是 P2 頂級 bug（impact 整個 quiz / bookmarks UX）。

一階 medexam-tw 不受影響（grep 確認 0/3291 題含 `### ` header — 一階 explanations 是純 OCR 文字 from 陽明小組 PDF）。

## Goals / Non-Goals

**Goals**:
- 把兩個 surface 的 explanation 從「raw markdown literal」改為「rendered headings/bold/lists」
- 維持既有卡片 frame（border, background, padding）視覺不變
- 維持 `(解析待補)` placeholder fallback
- Surgical change — 不動 一階、不動 core、不動 corpus build

**Non-Goals**:
- 不引入 syntax highlighting、math、KaTeX、Mermaid、GFM table
- 不重構 quiz / bookmarks 元件結構（只換 leaf `<pre>` 為 `<ExplanationMarkdown>`）
- 不把 markdown renderer 放進 `@study-rpg/core`（一階目前不需要、core 應保持 content-agnostic）
- 不處理 mock-exam 結果頁（二階目前沒 MockResultRoute；一階的不在範圍）

## Decisions

### Decision 1: 用 `react-markdown@9` 而非 `marked` / `markdown-it` / 手寫 regex

**選項評估**:

| 候選 | Bundle (gz) | XSS surface | React-native | Maintenance |
|---|---|---|---|---|
| `react-markdown` v9 | ~30 KB | Low (skipHtml default) | Native React tree | 高 (unified ecosystem) |
| `marked` + `dangerouslySetInnerHTML` | ~15 KB | High (raw HTML inject) | 不 native | 高 |
| `markdown-it` + `dangerouslySetInnerHTML` | ~25 KB | High (raw HTML inject) | 不 native | 高 |
| 自寫正則 (split lines, match `###` / `**` / `-`) | 0 KB | 0 | Native | 低（每個 edge case 自己處理）|

**選 `react-markdown`** 理由：
1. **零 XSS 風險** — 預設 `skipHtml: true`、輸出純 React node tree，沒有 `dangerouslySetInnerHTML`。即使 LLM-generated 內容裡塞 `<script>` 也不會 render。
2. **Whitelist 機制原生支援** — `allowedElements={['p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'br']}` 一行收緊到必要 node。
3. **Vibe-coding-friendly** — API 就是 `<ReactMarkdown>{text}</ReactMarkdown>`，作者非 CS 背景可維護。
4. **30 KB gz 可接受** — 現 bundle 760 KB，到 ~790 KB 仍在 GitHub Pages CDN load 預算內。
5. **無 dev plugin chain** — 不加 `remark-gfm` / `rehype-*`，純 vanilla parse → tree → React。

**拒 `marked` / `markdown-it`** 因 `dangerouslySetInnerHTML` 在 LLM-generated 內容上是不可接受的 XSS surface（即使現在內容信任，未來如果加入 community-contributed explanation 就破口）。

**拒手寫正則** 因 explanation 結構複雜（heading + nested bullet + bold 混合），corner case 多（escape char、line break、empty line），自己寫 regex 維護成本 > 30 KB bundle 成本。

### Decision 2: Component 放在 `apps/medexam2-hospital-tw/src/components/`，不放 `packages/core/`

**理由**:
- 一階 medexam-tw 不需要（explanations 0 markdown header）
- `packages/core/` 應保持 content-agnostic（config.yaml rule `no-medical-hardcode-in-engine`）— ExplanationMarkdown 雖然不是醫學特化，但放 core 強迫一階也 bundle react-markdown 的話違反 surgical 原則
- 若未來一階也需要 markdown explanation（e.g. LLM-augment 升級），開新 change `lift-explanation-markdown-to-core` 把 component 抽出來

### Decision 3: Whitelist node set — 僅 `p / h1-h4 / strong / em / ul / ol / li / code / br`

**Exclude**:
- `a` (link) — explanation 內不該有外連、避免 phishing
- `img` — explanation 不放圖
- `table` — 0 題用 table（grep 確認）
- `pre` / `code-block` — 0 題用 fenced code
- `blockquote` — 不需要
- `hr` — 不需要
- 任何 HTML element via raw HTML — `skipHtml: true`

**Include `code` (inline)** 因藥名 / 化驗縮寫偶有 backtick markup（e.g. `\`ALT\``）— 雖然 grep 看到的少，但容錯成本低。

### Decision 4: CSS 策略 — 新增 `.explanation-markdown` scope rule，保留 outer card frame

**Pattern**:
```css
.explanation-markdown {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: var(--frame-dark);
}
.explanation-markdown h3,
.explanation-markdown h4 {
  margin: 8px 0 4px;
  font-size: 14px;
  font-weight: 600;
}
.explanation-markdown p { margin: 4px 0; }
.explanation-markdown ul,
.explanation-markdown ol { margin: 4px 0; padding-left: 20px; }
.explanation-markdown li { margin: 2px 0; }
.explanation-markdown strong { font-weight: 700; }
.explanation-markdown code { /* inline code style */ }
```

`.quiz-modal__explanation` 跟 `.bookmarks-page__entry-explanation` outer container（border / background / padding）**完全不動** — 視覺一致性保證。

`.quiz-modal__explanation-body` / `.bookmarks-page__entry-explanation-body` 兩個 `<pre>` 既有 rule：因 `<pre>` 已被替換，這兩個 rule 變 orphan。**留還是刪？**

**選保留** + 加 comment `/* Kept for placeholder text fallback path (still uses <pre> when explanation is empty) */`。原因：placeholder `(解析待補)` 走 fallback path 時 component 設計上仍可 render `<pre>` (見 component shape 章節)；保留 rule 讓 placeholder 顯示樣式跟之前一致。

實際上更乾淨的設計是 placeholder 也走 plain `<p>`，這樣就可以刪 `<pre>` rule。Apply 階段決定（兩個都 ok，看 component 最終長相）。

### Decision 5: 不加 `remark-gfm`

**理由**: grep 確認 0/6080 題二階 explanation 含 GFM table（`|...|` + `|---|` pattern）。`remark-gfm` 多 ~10 KB gz、多一層 plugin chain，無 ROI。如果未來 LLM-generated explanation 開始用 table，再開新 change 加。

## Component shape

```tsx
// apps/medexam2-hospital-tw/src/components/ExplanationMarkdown.tsx
import ReactMarkdown from 'react-markdown'

const ALLOWED_ELEMENTS = [
  'p', 'h1', 'h2', 'h3', 'h4',
  'strong', 'em',
  'ul', 'ol', 'li',
  'code', 'br',
] as const

interface Props {
  text: string
  className?: string
}

export function ExplanationMarkdown({ text, className }: Props) {
  if (!text || text.trim() === '') {
    return <p className={className}>（解析待補）</p>
  }
  return (
    <div className={`explanation-markdown ${className ?? ''}`}>
      <ReactMarkdown
        allowedElements={[...ALLOWED_ELEMENTS]}
        unwrapDisallowed
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
```

Call sites:

```tsx
// QuizModal.tsx (改前)
<div className="quiz-modal__explanation">
  <h3>解析</h3>
  <pre className="quiz-modal__explanation-body">
    {question.explanation || '（解析待補）'}
  </pre>
</div>

// QuizModal.tsx (改後)
<div className="quiz-modal__explanation">
  <h3>解析</h3>
  <ExplanationMarkdown text={question.explanation ?? ''} />
</div>
```

`question.explanation` 為 empty / null 時，component 內部 short-circuit render placeholder `<p>（解析待補）</p>`，原 fallback 行為保留。

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| react-markdown v9 breaking change in future minor | 中 | Pin `^9.0.0`（minor 內安全），lockfile commit。Major bump 開新 change |
| LLM explanation 內含 `<script>` 或 raw HTML | 低（內容信任）| `skipHtml: true` + whitelist `allowedElements` 雙重防護 |
| Bundle size +30 KB 觸發 GH Pages 載入慢 | 低 | 760 KB → 790 KB 在合理範圍；CDN 上有 gzip |
| Markdown render 出來樣式 break 既有 card frame | 中 | CSS 只動 inner `.explanation-markdown` scope；outer container 0 change；Chrome MCP visual diff 驗收 |
| Bookmarks 匯出 markdown 已 export markdown 結構（spec.md:99）| 0 | 不影響 — export 邏輯本來就 echo raw markdown string，不經 component |
| 一階 14 題含偶發 `**` bold（OCR artifact）| 低 | 一階不改、繼續 `<pre>` render，這 14 題使用者看到原樣 `**xx**` 仍可讀，且 corpus 後續可清。改了反而要新加 dep |

## Migration Plan

1. 安裝 dep：`pnpm --filter @study-rpg/medexam2-hospital-tw add react-markdown@^9.0.0`
2. 建 component `ExplanationMarkdown.tsx`
3. 改 QuizModal.tsx 兩行 + import
4. 改 BookmarksPage.tsx 兩行 + import
5. 新增 CSS scope rule
6. `pnpm -r typecheck` + `pnpm --filter @study-rpg/medexam2-hospital-tw build`
7. Chrome MCP smoke on dev server (quiz modal + `/bookmarks` 各一輪)
8. `/opsx:verify` → archive

無 schema migration、無 corpus 改動、無 sync engine 改動。回滾成本低（revert 1 commit、`pnpm install` 移除 dep）。

## Open Questions

1. **`<pre>` CSS rule 留還是刪？** — 偏向保留 + comment（safety net for placeholder）；apply 階段如果 component 內 placeholder 走 `<p>` 而非 `<pre>`，就可以刪。
2. **一階要不要同步處理？** — 目前 grep 確認 explanations 0 markdown header，**不處理**。若 user 後續希望統一兩 app render path（即使一階目前無 markdown），開 follow-up change 把 component 抽到 core 而非塞在這個 change。
