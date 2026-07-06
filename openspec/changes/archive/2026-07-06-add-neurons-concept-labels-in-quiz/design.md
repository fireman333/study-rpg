## Context

`add-neurons-concept-tags` 已 ship：每題有 1–3 個 tested concept leaf，資料在 `concept-tags.json`（{qid→leafId[]}），app 端 `lib/concept-tags.ts` 提供 `useConceptTags()` / `conceptLabelsFor(q, tags)` / `ConceptLabel`（fetch 已用 `import.meta.env.BASE_URL`）。label chip 目前只 render 在 `QuestionReviewCard`（題庫 `/bank`、收藏、考前猜題來源展開），點擊在 standalone 題庫/收藏走 **in-app** navigate 到 `/bank?concept=`。

互動答題流程（`QuizModal` 首頁單題、`MazeExpedition` 錯題出征、`MockExamRunner` 模考）各自 render 題幹、**不經** `QuestionReviewCard`，所以看不到 label——這是 concept-tags §5.2 的 scope 邊界，非 bug。本 change 把 label 補進這三個 surface。

**約束**：純前端加法（讀既有 sidecar，不 bump Dexie/R2/sync）；復用既有 chip styles 與 `conceptLabelsFor`；pixel/legible 字體沿用既有。多 session 提醒：另有 peer session 在做 `add-neurons-study-room`（動 OverviewPage/FamilyPicker/CollectionPage/db.ts）——本 change 不碰那些檔，重疊風險低，但 apply 時仍照 multi-agent git safety（explicit per-file add）。

## Goals / Non-Goals

**Goals:**
- 三個互動答題 surface 在 **揭曉答案後** 顯示該題考點 label。
- label 點擊在互動流程 → **開新分頁** `/bank?concept=<zh>`（保留答題現場）。
- 抽共用 `ConceptLabelRow` 元件，消除四份重複 chip render（含把 `QuestionReviewCard` 重構成用它）。

**Non-Goals:**
- 不改 concept-tags 資料模型 / 標註 / recurrence（那是 `add-neurons-concept-tags`）。
- 不在答題前顯示 label（防劇透）。
- 不在模考「整回作答中」顯示 label（只交卷後 review）。
- 不改 review card 的 in-app 點擊行為（維持既有；只有互動流程用 new-tab）。
- 不動 Dexie / R2 / cloud sync / SYNCED_META_KEYS。

## Decisions

### D1. 劇透 gate：三 surface 皆 post-reveal 才顯示 label（owner 拍板 2026-07-06）
- 答題前顯示考點＝告訴你這題在考什麼＝劇透。故 label 只在「揭曉答案後」render。
- `QuizModal`：既有答案揭曉/詳解區已存在（reveal state），label row 掛在其後。
- `MazeExpedition`：per-question reveal 後顯示。
- `MockExamRunner`：**只在交卷後的 review 全展開**顯示；整回作答中（未逐題揭曉）不顯示。
- *Alternative rejected*: 一律顯示當提示（劇透，降低真實應考難度）。

### D2. 互動流程 label = 原生 `<a target="_blank">` 錨點開新分頁（與 review card 的 in-app navigate 刻意不同）
- 互動流程（QuizModal/MazeExpedition/MockExamRunner）的 label chip render 成**原生錨點** `<a href={`${import.meta.env.BASE_URL}bank?concept=${encodeURIComponent(zh)}`} target="_blank" rel="noopener">`，靠瀏覽器原生行為開新分頁。
- **不用 `window.open` + blur/focus 強制背景開啟**（現代瀏覽器會擋）：一般點擊照瀏覽器預設（多為前景）；使用者要背景開就 Cmd/Ctrl-click 或中鍵（OS 慣例），app 不腳本化 tab focus。
- 理由：答題/出征中途 in-app 跳去 `/bank` 會中斷 session（丟失當前題目/計時/出征進度）；新分頁保留現場。
- review card（題庫/收藏）維持 in-app（跳走無代價，用 `onClick`→`useNavigate`）。→ `ConceptLabelRow` 支援雙模式：caller 傳 `hrefFor(zh)`（互動流程 render 錨點）或 `onConceptClick(zh)`（review card render button），二擇一。
- `rel="noopener"` 防新分頁拿到 `window.opener`。

### D3. 抽共用 `ConceptLabelRow` 元件
- 新 `components/ConceptLabelRow.tsx`：props `{ labels: ConceptLabel[]; hrefFor?: (zh: string) => string; onConceptClick?: (zh: string) => void }`。優先序：有 `hrefFor` → render `<a target="_blank" rel="noopener">`（互動流程新分頁）；否則有 `onConceptClick` → render `<button>`（review card in-app）；都無 → 靜態 chip（考前猜題 embedded）。搬既有 `conceptRowStyle`/`conceptChipButtonStyle`/`conceptChipStyle`。
- `QuestionReviewCard` 重構成呼叫 `ConceptLabelRow`（行為不變：題庫/收藏傳 `onConceptClick`、考前猜題 embedded 不傳）；三個答題 surface 傳 `hrefFor`。
- *Alternatives rejected*: 各 surface 各自複製 chip render（四份重複、樣式漂移）；`window.open` 強制背景（被瀏覽器擋，見 D2）。

### D4. label 資料來源與空值處理
- 各 surface 用 `useConceptTags()` 拿 map，對當前題 `conceptLabelsFor(q, tags)`；空陣列 → 不 render label row（enhancement-only，never block 答題）。
- concept-tags 載入失敗（sidecar 404 / parse fail）→ 既有 `loadConceptTags` 已 `console.warn` + 回 `{}`，label 靜默消失、答題不受影響。

## Risks / Trade-offs

- **BASE_URL 坑**（dev base `/` vs prod base `/neurons/`）→ 沿用 `concept-tags.ts` 既有 `import.meta.env.BASE_URL` 前綴；new-tab URL 也必帶 BASE_URL。verify 必在 **prod** real-browser 實測 render + 點擊（見 memory `neurons-content-fetch-base-url`）。
- **MockExamRunner reveal 狀態判斷**（何時算「交卷後 review」）→ 需定位其 review-mode flag，label 只在該 mode render；不可漏進作答中。
- **手機 label chip wrap 橫向捲** → `ConceptLabelRow` 用 `flex-wrap`，390px 實測不得橫向捲。
- **new-tab 被 popup blocker 擋** → 用原生 `<a target="_blank" rel="noopener">` 錨點（非 `window.open`），瀏覽器視為使用者導航、不被 popup blocker 擋。
- **多 session 撞檔** → 本 change 只碰 QuizModal/MockExamRunner/MazeExpedition/QuestionReviewCard/新 ConceptLabelRow；peer study-room session 不碰這些檔，apply 時仍 explicit per-file add。

## Migration Plan

純新增前端、無 schema/sync/deploy 資產改動：
1. 抽 `ConceptLabelRow`，把 `QuestionReviewCard` 重構成用它（行為不變，回歸測既有題庫/收藏 label）。
2. `QuizModal` reveal 區加 label row（new-tab handler）。
3. `MazeExpedition` reveal 後加 label row。
4. `MockExamRunner` 交卷後 review 加 label row。
5. Verify：typecheck/test + Chrome MCP end-to-end（dev）+ SPA 三件套 + 手機 RWD + **prod real-browser render + 點擊實測**。

**Rollback**：移除三 surface 的 label row + `ConceptLabelRow`，`QuestionReviewCard` 還原自帶 chip render 即回原狀。

## Open Questions

- `MockExamRunner` 的 review-mode 判斷 handle 名稱待 apply 時定位（reveal/submitted flag）。
- label row 在 `QuizModal` 的精確 placement（詳解上方 vs 下方）留 apply 時依實際版面微調，不影響 spec。
