## 1. 模考 per-book pool layer (`expedition.ts`)

- [x] 1.1 `ExamPaperCoverage` 介面加 `book: string` 欄位
- [x] 1.2 `listExamPapersWithCoverage(pool, history)` 改以 `(year, session, book)` 為 key 聚合；排序年份 desc → 次別 asc → 冊別（醫學一 在 醫學二 前，`bookRank`）；缺欄位 exclude
- [x] 1.3 `buildExamSetExpeditionPool(pool, history, year, session, book)` 加 `book` 參數，filter `examMeta(q).book === book`（僅該冊未答題、保持 `examOrderCompare` 排序）
- [x] 1.4 `examSetCoverage(pool, history, year, session, book)` 加 `book` 參數，per-book 計 `已答 / total`
- [x] 1.5 四處都用既有 `examMeta()` 讀 `meta.book`，零 schema / 零新 persistence

## 2. 首頁 IA — 主/次兩入口 (`OverviewPage.tsx`)

- [x] 2.1 CTA toolbar：移除單一 ⚔️出征；改放 🎲 隨機 +「⚔️ 錯題出征（primary）」+「📋 模考（secondary）」
- [x] 2.2 ⚔️ 錯題出征 = 主 CTA：terracotta + synaptic-cyan 光暈 + 「🔗 修復錯題＝建立連線」副標 + 錯題數 badge；`onClick` 直接 `openExpedition()`；空錯題池 disabled
- [x] 2.3 📋 模考 = 次要入口：slim 虛線 parchment + 「純測驗 · 不產生連線」標示；`onClick` 直接 `openExamMode()`（`setExpeditionMenu('exam')`）
- [x] 2.4 新增差異化 styles（`wrongExpeditionButtonStyle`/`...Disabled`/`ctaCard*`/`examMode*`）；glow 為靜態 box-shadow（reduced-motion 安全）；移除 orphan `expeditionButtonStyle` + `examMenuOptionDisabledStyle`
- [x] 2.5 `expeditionMenu` 型別縮為 `'closed' | 'exam'`；移除 `'choose'` 區塊 + `openExpeditionMenu` + `chooseWrongExpedition`

## 3. 模考 per-book 選卷 UI (`OverviewPage.tsx`)

- [x] 3.1 `examPapers` 吃 per-book `listExamPapersWithCoverage`；每筆顯示「{year} 第{session}次 · {book}」+ coverage chip（`已答 X / Y`）
- [x] 3.2 `examSelection` state 加 `book`；`chooseExamPaper(year, session, book)` 帶冊別；`examSetPool` 傳 `book` 給 `buildExamSetExpeditionPool`
- [x] 3.3 模考標題 / hint 文案改「模考 · 選試卷」「每份＝單冊（醫學一或醫學二）約 100 題…模考為純測驗、不產生連線，但與錯題出征共用每日 DMN 抽卡上限」
- [x] 3.4 模考完成仍走 `onExpeditionComplete`（DMN 軸，不 credit connectome）— 確認無誤改動

## 4. 測試

- [x] 4.1 `exam-set-expedition.test.ts`：per-book pool 只含該冊未答題（不含另一冊）
- [x] 4.2 `exam-set-expedition.test.ts`：per-book coverage（同 sitting 的醫學一/醫學二各自、互不混算）
- [x] 4.3 `exam-set-expedition.test.ts`：`listExamPapersWithCoverage` 同 (year, session) 產出兩筆（醫學一 + 醫學二）、排序正確、completed marker、缺欄位 exclude
- [x] 4.4 `pnpm --filter @study-rpg/neurons-tw test`（425 passed）+ `pnpm -r typecheck`（all Done）全綠

## 5. 驗證 (走 `/verify`)

- [x] 5.1 dead-code audit：typecheck（all Done）+ orphan-grep；移除 `expeditionButtonStyle` + `examMenuOptionDisabledStyle` 兩孤兒
- [x] 5.2 Chrome MCP：三入口可見（DOM 驗）、⚔️ 錯題出征 h54 + synaptic glow boxShadow 主導 vs 📋 模考 h29 dashed 次要 + 「純測驗 · 不產生連線」；「選擇遠征」chooser 文字已消失
- [x] 5.3 Chrome MCP：模考選卷 46 筆 per-book paper（`{年} 第{次}次 · {冊}` + `已答 X/100`、年desc/次asc/醫一→醫二）；點 paper 開 `答題中` drill
- [x] 5.4 Chrome MCP RWD probe（360px inline-width override）：三入口 reflow 成單欄 3 列、maxOverflow −17px 不破版；console 0 errors
- [x] 5.5 F5 reload `/`：root 重新 render、三入口在、no 404（本 change 無新 route）
