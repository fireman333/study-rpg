## Context

`rework-neurons-connectome-expedition-driven`（已上線）讓 connectome 唯一由「錯題出征共同修復」驅動。但首頁的 ⚔️出征 把兩個本質不同的入口塞進同一個 `expeditionMenu='choose'` chooser，兩選項（錯題遠征 / 年份回數遠征）共用 `examMenuOptionStyle`、長得一模一樣 → 玩家分不出哪個會長 connectome。年份回數遠征一份綁醫學一＋醫學二共 200 題（`expedition.ts` 的 pool/coverage 以 `(year, session)` 為 key），顆粒太粗。

現況關鍵檔：
- `apps/neurons-tw/src/routes/OverviewPage.tsx` — CTA toolbar（🎲 + 單一 ⚔️出征）、`expeditionMenu` 三態（`closed`/`choose`/`exam`）、`chooseWrongExpedition`（credit connectome via `handleWrongExpeditionComplete`）、`chooseExamPaper`（只給 DMN via `onExpeditionComplete`）。
- `apps/neurons-tw/src/lib/services/expedition.ts` — `buildExamSetExpeditionPool(pool, history, year, session)` / `examSetCoverage(...)` / `listExamPapersWithCoverage(...)` / `ExamPaperCoverage`，全部以 `(year, session)` 為 key。
- 內容 `meta` 已帶 `book: '醫學一' | '醫學二'`（驗證過：`{year,session,book,paper,qNumber}`，一份 sitting = 醫一 100 + 醫二 100）。

## Goals / Non-Goals

**Goals:**
- 讓「wire（connectome）機制」在首頁突出：錯題出征視覺主導、模考次要且明確「不長連線」。
- 模考改成 per-book：選醫學一**或**醫學二、一份 ~100 題。
- 文案明確兩模式獎勵差異（錯題出征 → 連線 + 傳導 + DMN；模考 → 純測驗 + DMN）。

**Non-Goals:**
- 不改 connectome credit 規則（`creditConnectomeFromExpedition`）。
- 不改 DMN expedition 軸獎勵 / 每日上限 / milestone。
- 不改 Dexie schema / R2 bundle / Worker / D1。
- 不改 canonical 機制 / capability id（`neurons-exam-set-expedition`、`expedition.ts` 函式名）；只改玩家可見 label 為「模考」。

## Decisions

### D1 — IA 用「主/次階層」而非 co-equal 兩按鈕對等（讓 wire 突出）
移除 `expeditionMenu='choose'` 中間層。CTA toolbar 直接放三個入口：🎲 隨機 → **⚔️ 錯題出征（主，accent + 連線/突觸視覺語彙 + 「修復錯題＝建立連線」副標 + 錯題數 badge）** → **📋 模考（次，中性 exam-room 視覺 + 「純測驗 · 不產生連線」標示）**。
- 替代方案 (a)：保留 chooser、只把兩選項視覺差異化 → 否決：chooser 把兩者藏在同一層、仍讀成對等，wire 不突出。
- 替代方案 (b)：兩顆對等 top-level 按鈕 → 否決：對等無法傳達「錯題出征才是每日核心 loop」。
- 採用：**非對稱階層**（primary 大/亮、secondary 小/靜），最能凸顯 wire-building 是主動作。

### D2 — 模考 per-book 100 題，用既有 `meta.book`，零 schema
pool/coverage/picker 全部從 `(year, session)` key 改為 `(year, session, book)` key，過濾 `q.meta.book === book`。一份 = 一冊 ~100 題。`已答 X / Y`（Y≈100）。
- 用既有 `meta.book`（已存在）→ 不需內容重建、不需 schema。coverage 仍由 `questionHistory` 推導。
- picker 排序：年份 desc → 次別 asc → 冊別（醫學一 在 醫學二 前）。
- 替代方案：維持 200 合卷 → 否決（owner 明確要一冊 100 題各別練）。

### D3 — 模考保留 DMN 獎勵 + 共用每日上限；「不產生連線」= 只是不長 connectome
模考完成仍走 `onExpeditionComplete → creditExpeditionDraws`（與錯題出征共用同一條 DMN expedition 軸與每日 cap，符合既有 `neurons-study-squad` reward 規則）。「不產生連線」僅指**不** credit connectome（本來就沒有）。獎勵鏈零改動。

### D4 — canonical 機制名不動，只動玩家可見 label
`neurons-exam-set-expedition` capability id、`expedition.ts` 函式名、`onExpeditionComplete` 等保留；UI label 從「年份回數遠征」改為「模考」。避免無意義的 rename churn 與跨檔連鎖。

### D5 — `expeditionMenu` 狀態瘦身
移除 `'choose'`；保留 `'closed'` 與 `'exam'`（per-book 選卷 picker）。⚔️ 錯題出征按鈕直接 `openExpedition()`；📋 模考按鈕直接 `setExpeditionMenu('exam')`。

## Risks / Trade-offs

- **[模考 picker 列表變長：每年每次別 × 2 冊]** → picker 已是 scrollable list（`examPaperListStyle`）；清楚標冊別 + coverage chip；排序穩定（年 desc / 次別 asc / 冊別）。
- **[3 顆按鈕在窄螢幕 reflow]** → `ctaButtonRowStyle` 既有 responsive；用 Chrome MCP class-override RWD probe 驗手機換行不破版。
- **[突觸光暈在 reduced-motion]** → 主 CTA 的「連線」視覺用 accent 邊框/底色（靜態）為主，動態 glow 在 `prefers-reduced-motion` 退化為靜態 accent，不靠動畫傳達。
- **[既有玩家覆蓋率語意]** → coverage 仍由 `questionHistory` 推導，per-book filter 後跨模式答過的題仍算覆蓋；resumable 行為不變（pool = 該冊未答餘集）。

## Migration Plan

純前端 UI/IA + content-pool 粒度。零 schema / 零 sync / 零 owner dashboard 動作。
- Deploy：archive → merge `track-neurons` → main → push → CF Pages 自動部署（`deploy-cf-pages.yml`）。
- Rollback：revert 本 change（無資料遷移、無相容性風險）。

## Open Questions

無 blocking。命名（模考）+ scope（per-book 100 題、合併在本 change）已由 owner 拍板。
