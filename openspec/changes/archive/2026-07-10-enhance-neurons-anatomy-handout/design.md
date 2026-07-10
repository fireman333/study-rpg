## Context

考前講義(beta) 已上線（`/cram/handout`），實作集中在單一元件 `apps/neurons-tw/src/routes/HandoutPage.tsx`（282 行）：`createPortal` 到 body 的全螢幕場景，內部 `scrollRef` 容器以 `dangerouslySetInnerHTML` 渲染授權的 140 KB 教學 HTML；`deriveToc()` 用 `DOMParser` 掃 `.hdt-region` / `.hdt-region__head` 生成頂部水平 chip bar；`jumpTo()` 用 `getElementById().scrollIntoView()`。

授權 HTML 有 8 個 region（`hdt-overview` / `hdt-neuro-central` / `hdt-neuro-brainstem` / `hdt-head-neck` / `hdt-thorax` / `hdt-abdomen` / `hdt-pelvis-perineum` / `hdt-extremities`）。題庫概念資料已存在於 content pack `dist/`：`concept-recurrence.json`（`chapters[]` = 解剖學 4 個 blueprint chapter `neuroanatomy` / `head-and-neck` / `chest-abdomen-pelvis` / `upper-lower-extremities`；`concepts[]` = 545 leaf，各帶 `{leafId, chapterId, subjectId, ...}`）與 `concept-tags.json`（`qid → leafId[]`）。既有 `QuizModal` 收 `pool: Question[]` prop + `practice` 模式，/cram 已用此開「答1題看看」on-ramp。

已有 Codex 610 行實作指南（`~/.claude/scratch/handout-codex-optimize-2026-07-10.md`）+ handoff（`~/.claude/scratch/handoff-neurons-handout-followups-2026-07-10.md`）作為 how 的一級參考。

## Goals / Non-Goals

**Goals:**
- 把頂部水平 TOC 換成 docs-style 側邊導覽 + scroll-spy active 高亮 + 去 emoji，三段式 RWD。
- 每個有題章節末尾一鍵開該章 practice quiz（複用 QuizModal / `/bank`，不改 quiz API）。
- 一鍵 `window.print()` 產 PDF（`@media print` CSS），零 build 依賴。
- 閱讀進度指示 + per-subject 上次位置（`localStorage`）+ 章節 deep-link；a11y focus 管理。

**Non-Goals:**
- 不改授權教學 HTML 的內容文字（已驗證）；`chapterQuizzes` 走 typed data 而非嵌 HTML。
- 不改 `QuizModal` 對外 API；不新增 quiz 模式。
- 不做 committed PDF blob / headless Chromium / server-side 產檔。
- 不動 Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` / sync engine；不改 CF Pages asset-dir allowlist；`localStorage` 不進雲端同步。
- 不做第二層（sub-section）TOC；不虛擬化長文（會壞瀏覽器 find / print / anchor / scroll-spy）。

## Decisions

### D1. 版面：`.hdt-scene` flex-column → 內含 `.hdt-layout`（sidebar + scroll）
`.hdt-scene` 維持 `display:flex; flex-direction:column`（header 在上）。新增 `.hdt-layout { flex:1; min-height:0; display:flex }`，內含 `.hdt-sidebar { flex:0 0 248px; overflow-y:auto }` + 現有 `scrollRef` 容器 `.hdt-scroll { flex:1; min-width:0; overflow-y:auto }`。**`min-height:0` 是硬需求** — 巢狀 flex child 不加會拒絕收縮、內捲壞掉（Codex 明列的地雷）。RWD：`≤1023px` sidebar `display:none` + 顯示「章節」toggle（header）；`<768px` toggle 改右下 FAB；兩者都開同一份 `TocList` 於 drawer。
- *Alternative*：sticky sidebar 用 `position:sticky` 疊在單一 scroll 容器內 → 放棄。內部 scroll 容器 + IntersectionObserver root 的組合下，兩欄各自 `overflow-y:auto` 比 sticky 穩、scroll-spy 也乾淨。

### D2. scroll-spy：`IntersectionObserver` root = `scrollRef.current`（非 window）
active 章節用 IO 追蹤，`root: scrollRef.current`、`rootMargin: '-12% 0px -70% 0px'`、`threshold:[0,0.1,0.25]`；可見 entry 取最上緣者設 active，套 `aria-current="true"`。**root 錯設 window 會全錯**（場景是內部捲動、window 不捲）。observer 於 `active.html` / `toc` / `subjectId` 變動時重建。保留 `.hdt-region { scroll-margin-top }`。`jumpTo` 續用 `scrollIntoView`（目標在同一內部容器內，可行）。
- *Alternative*：scroll 事件 + 手算 offset → 放棄，IO 較省、較準。

### D3. 章節測驗資料：build 時產 `chapterQuizzes`，authored `regionId → chapterId` 對映
`HandoutSubject` 加 optional `chapterQuizzes?: { regionId; leafIds: string[]; sourceQuestionIds?: string[] }[]`（型別在 `handout-types.ts` + `apps/.../lib/handout.ts` 同步）。`build-handout.ts` 在 build 時：讀既有 `dist/concept-recurrence.json` + `dist/concept-tags.json`；用一份**授權的 8→4 對映**（`hdt-overview`→無、`hdt-neuro-central`/`hdt-neuro-brainstem`→`neuroanatomy`、`hdt-head-neck`→`head-and-neck`、`hdt-thorax`/`hdt-abdomen`/`hdt-pelvis-perineum`→`chest-abdomen-pelvis`、`hdt-extremities`→`upper-lower-extremities`）；每 region → 其 chapterId 的 leafIds（`concepts` filter）→ qids（反轉 `concept-tags`），emit 進 `handout.json`。內容 HTML 完全不動。
- **Build ordering**：`build-handout` 必須在 `concept-recurrence` + `concept-tags` 之後跑（讀其 `dist/` 產物）。確認 content pack build script 的 step 順序；若 `build:handout` 可被單獨呼叫，加 `existsSync` guard + 明確錯誤（缺檔即 fail，不 silent）。仍 CI-safe（純讀 JSON、無網路 / 無 chromium）。
- *Alternative A*：runtime 於 HandoutPage fetch concept JSON 現算 → 放棄，多 2 個大 JSON 的 runtime fetch。
- *Alternative B*：在 HTML 放 `data-quiz-region` 佔位 + delegated click → 次選（Codex 也列為 acceptable shortcut）；但把行為留在 HTML 較難維護，優先 typed map。

### D4. 章節測驗啟動：region 切塊 render + QuizModal practice 模式（fallback `/bank`）
因 `dangerouslySetInnerHTML` 無法在 HTML 樹內插 React 元件，改用 Codex 首選：load 時把 `active.html` 用 `DOMParser` 切成 region blocks（`deriveRegions()`，一次 parse、`useMemo`），逐塊 `<section>` render，每塊末尾若 `chapterQuizzes` 有該 region 就掛 React「測驗本章」鈕。點擊 → 由該 region 的 `sourceQuestionIds` 從既有 questions 來源建 `pool: Question[]` → 開 `<QuizModal pool={...} practice preserveOrder onClose={...} />`（複刻 CramPage `practice.pool` 路徑）。建不出 pool（來源缺 / 空）時 fallback `navigate('/bank?concept=' + leafIds.join(','))`。
- **Open**：`QuizModal` 收 `pool: Question[]`，故需一個「qids → Question[]」的既有 helper（CramPage 建 `practice.pool` 的同款）。apply 時定位並複用，不重寫 loader。`/bank` 是否吃逗號多 concept 亦於 apply 時確認；不吃就退成單一最高 yield leaf 或維持 pool 主路徑。

### D5. PDF：`window.print()` + `@media print`（不 committed blob）
右上「一鍵下載PDF」呼叫 `window.print()`。`@media print`：`.hdt-scene`/`.hdt-layout`/`.hdt-scroll` 還原 `position:static; overflow:visible; height:auto`；隱藏 header/sidebar/drawer/print鈕/測驗鈕/close；`table.hdt-tbl` 從螢幕 `display:block; overflow-x:auto` 覆寫回 `display:table`、`thead{display:table-header-group}`；`@page{size:A4; margin:14mm 12mm}`；region/tr/li/p `break-inside:avoid`，region head `break-after:avoid`。Safari + Chrome 都測（表格分頁差異最大）。
- *Alternative*：committed PDF blob（比照 cram `render-speed-review-pdf.mjs`）→ 只在要 pixel-perfect 分頁才用；此教學文 print 已夠、且避免手動 artifact lifecycle。

### D6. 進度 / last-read / deep-link：純 `localStorage` + URL，不進 store
進度 = `scrollTop / (scrollHeight - clientHeight)`，scroll 事件（passive）算。last-read：key `handout:{subjectId}:scrollTop`，debounce 寫、切 subject / render 後還原。deep-link：load 時讀 `?section=` 或 `#hash` → `requestAnimationFrame(jumpTo)`；點 TOC 可 `history.replaceState('#id')`（不觸發 route）。全 device-local，零雲端。

### D7. a11y：既有 dialog 補 focus 管理
場景已 `role="dialog" aria-modal`。補：open 時 focus close/heading、close 時歸還觸發元素；`Esc` 關；sidebar/drawer 為 `nav aria-label="章節導覽"`、active `aria-current`；drawer 開時 focus-trap + backdrop/Esc 關。

## Risks / Trade-offs

- **[Region 切塊 render 可能改變授權 HTML 的整體樣式脈絡]** → `deriveRegions` 用 `section.outerHTML` 保留每塊原標記，僅在塊間插 CTA；SCENE_CSS 選擇器（`.hdt-region` 等）不變。apply 後 e2e 目視比對切塊前後排版一致。
- **[Build ordering 依賴：handout build 讀 concept dist 產物]** → 加 `existsSync` guard + 明確 fail（非 silent skip，遵 No Silent Errors）；在 tasks 明列驗證 build step 先後。
- **[8→4 region 對映是手寫、易與內容漂移]** → 對映表註明「regionId 是 TOC/scroll-spy/quiz/deep-link 共同 contract」；build 時對 `chapters[]` 實際 chapterId 做存在性檢查，未知 chapterId 即 fail。
- **[scroll-spy IO root 誤設 / `min-height:0` 漏掉]** → 兩者都是 Codex 明列地雷，寫進 tasks 驗證項；用 RWD class-override probe（非 resize_window）驗 breakpoint（per import `chrome_mcp_rwd_probe.md`）。
- **[print 表格跨瀏覽器分頁差異]** → Safari + Chrome 各測一輪列印預覽；只在 owner 要 pixel-perfect 才升級 committed blob。
- **[`localStorage` 還原位置在 HTML/字型 reflow 前跑會偏]** → 還原排在 subject/html render 後（effect 依賴 `active.subjectId`），必要時 `requestAnimationFrame` 一拍。

## Migration Plan

- 純前端增強，無資料遷移、無 schema/sync 改動 → 無 backfill、無雲端相容性顧慮。
- 部署 = 走既有 `track-neurons` → merge `main` → CF Pages（merge = 對外部署 gate，owner 確認）。
- Rollback = revert 本 change 的 commit(s)；`localStorage` key 為新增、舊版忽略即失效，無殘留破壞。
- 內容 pipeline：改 `build-handout.ts` 後跑 `pnpm --filter @study-rpg/content-neurons-tw build:handout` + `node apps/neurons-tw/scripts/copy-content.mjs` 重生 `handout.json`（含 `chapterQuizzes`）。

## Open Questions

- `QuizModal` 的 `pool: Question[]` 需要的「qids → Question[]」建池 helper 具體位置（CramPage `practice.pool` 同款）— apply 時定位複用，不重寫。
- `/bank`（`QuestionBankPage`）是否支援逗號分隔多 concept filter — apply 時確認；不支援則 fallback 退為單一最高 yield leaf，或維持 pool 為主路徑。
- 進度指示的視覺形式（頂部細條 vs sidebar 內百分比）— 低風險，apply 時取最小干擾版本，owner 可微調。
