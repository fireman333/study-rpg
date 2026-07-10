## Why

考前講義(beta) 解剖學已上線，內容經 Codex 對抗審 + OpenEvidence 逐條驗證（內容本身不改）。但實際 dogfood 後，reading UX 有四個明顯落差：頂部水平 TOC chip bar 違反長文閱讀習慣（章節被水平捲動藏住、無 active 高亮）；讀完一章沒有直接測驗的入口；沒有把講義存成 PDF 的方法；沒有閱讀進度 / 回到上次位置 / 分享章節連結。這批全是 UI/UX + 前端功能，且集中在單一檔案，值得一個新 change 收攏。

## What Changes

- **TOC 改左側 sticky sidebar + scroll-spy + 去 emoji**：以三段式 RWD 取代頂部水平 chip bar — `≥1024px` 常駐左側 sidebar、`768–1023px` header「章節」鈕開左抽屜、`<768px` 右下 FAB 開底部抽屜；`IntersectionObserver`（root = 內部 scroll 容器）驅動 active 章節高亮；TOC 標籤去除開頭 emoji（章節標題本身保留 emoji）。**BREAKING（UX 契約）**：水平 chip bar 導覽移除。
- **每章末尾「測驗本章」CTA**：以 typed chapter map（`HandoutSubject.chapterQuizzes`）在每個 region 區塊末尾掛按鈕，開既有 `QuizModal`（practice 模式，複用 /cram「答1題看看」on-ramp）；quiz 路由資料放 typed data，不塞進 140 KB 授權 HTML。
- **右上角「一鍵下載PDF」**：client `window.print()` + 專屬 `@media print` CSS（隱藏場景 chrome、表格還原 `display:table`、A4 分頁），不引入 headless Chromium 或 committed PDF blob。
- **閱讀 UX + a11y**：內部捲動進度指示、per-subject 上次閱讀位置存 `localStorage`、`#region-id` / `?section=` deep-link resume/share；a11y：開啟時 focus 管理、`Esc` 關閉、抽屜 focus-trap、`nav aria-label`。

## Capabilities

### New Capabilities
<!-- 無新增 capability — 全部是既有 neurons-anatomy-handout 的增強 -->

### Modified Capabilities
- `neurons-anatomy-handout`: ADD 五條 requirement — 「章節側邊導覽與 scroll-spy」（取代原本純實作的頂部水平 TOC，無既有 normative TOC requirement 可 MODIFY）、「每章測驗入口」、「一鍵下載 PDF」、「閱讀進度與章節深連結」、「講義場景無障礙」。既有 requirement（全螢幕場景、內容契約、blueprint 分章、事實 grounding 與押題誠實、CI-safe 靜態內容交付）不變且不得違反。

## Impact

- **主要檔案**：`apps/neurons-tw/src/routes/HandoutPage.tsx`（TOC 版面、scroll-spy、region 切塊 render、print 鈕、進度/deep-link/a11y、`@media print` CSS 全在此）。
- **內容契約**：`HandoutSubject` 型別加 optional `chapterQuizzes`（`packages/content-neurons-tw/src/handout/handout-types.ts` + `apps/neurons-tw/src/lib/handout.ts`）；`packages/content-neurons-tw/scripts/build-handout.ts` 在 build 時讀既有 `dist/concept-recurrence.json` + `dist/concept-tags.json`，依授權的 `regionId → chapterId` 對映產生 `chapterQuizzes`（region → leafIds → sourceQuestionIds），emit 進 `handout.json`。授權內容 HTML 不改。
- **quiz launch**：複用既有 `QuizModal`（`pool: Question[]` + `practice` 模式），不改 QuizModal API；fallback 用既有 `/bank` 深連結。
- **零後端 / 零 schema**：不動 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS`、sync engine；不改 CF Pages asset-dir allowlist；build 仍 CI-safe（無 headless Chromium、無網路）。`localStorage` 為純 device-local，不進雲端同步。
