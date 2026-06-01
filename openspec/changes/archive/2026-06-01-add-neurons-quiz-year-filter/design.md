## Context

neurons-tw 首頁 [OverviewPage](apps/neurons-tw/src/routes/OverviewPage.tsx) 的答題啟動有兩條路：CTA toolbar 的「🎲 隨機跨 family 答題」(`setQuizEntry(null)`) 與 `FamilyPicker` 每張卡的「🎯 答題」(`setQuizEntry(familyId)`)。`quizPool` 由 `filterPoolByFamily(pack.questions, quizEntry)`（[quiz-pool.ts](apps/neurons-tw/src/lib/services/quiz-pool.ts)，純函式）建構後傳給 QuizModal。

二階對應功能 = [`services/year-filter.ts`](apps/medexam2-hospital-tw/src/services/year-filter.ts)（`quiz.yearFilter` meta、`ALL_YEARS`、`effectiveYearSet`，null/[]=全選）+ [`YearFilterBar.tsx`](apps/medexam2-hospital-tw/src/components/YearFilterBar.tsx)（`useLiveQuery(getYearFilter)` + chip + pager，用共用 `.filter-bar` CSS）。

neurons 既有資料：全 3600 題帶 `q.meta.year`（106–114，9 年，每年 400 題、每科每年皆 ≥7 題）。neurons `MetaRow.value` 型別是 **string**（二階是 freeform），且 neurons 首頁用 inline-style 像素風（無 `.filter-bar` 共用 class）。

## Goals / Non-Goals

**Goals:**
- 首頁答題可依考試年份（106–114）篩選題庫，兩條啟動路徑都生效。
- 選擇持久（記住上次）、預設全選、本機。
- Mirror 二階 year-filter 的語意（null/[]=全選、effectiveYearSet）。

**Non-Goals:**
- 不接雲端同步（本機 gameplay 偏好；對齊二階）。
- 不動 `/bookmarks` 年份 chip（兩套獨立）。
- 不改 content build（meta.year 已存在）。
- 不新增 Dexie 表 / 不 schema bump（複用 meta 表一個 key）。
- 不為空池做快捷修復鈕（純文字空狀態）。

## Decisions

### D1 — 新 capability `neurons-quiz-year-filter`，不開 neurons-mode delta

年份 gate 與既有 family picker 正交、可組合，不推翻 neurons-mode「family picker filters the pool」的契約 → additive，新 capability 自有其 requirement。**Alternative**：改 neurons-mode pool-filter requirement（delta）— 拒絕（年份 gate 是新增維度，非修改既有行為；mirror 上一個 change `neurons-wrong-answer-list` 的 additive 取捨）。

### D2 — 年份服務 mirror 二階，但 meta.value 用 JSON 字串

`year-filter.ts`：`YEAR_FILTER_META_KEY='quiz.yearFilter'`、`ALL_YEARS=[106..114]`、`getYearFilter()`（讀 meta，`JSON.parse` 後過濾合法年份；解析失敗 / 無 row → `null`）、`setYearFilter(years)`（`JSON.stringify`）、`effectiveYearSet(persisted)`（`null`/`[]` → `new Set(ALL_YEARS)`，單一真實來源的「預設全選」語意）。**neurons MetaRow.value 是 string** 是與二階唯一實作差異。

### D3 — YearFilterBar 常駐 CTA toolbar，9 年單列無分頁

放進 OverviewPage 的 CTA section（閱讀 + 🎲 那區），讓它在視覺上 gate 兩條啟動路徑。9 年（106–114）chip 一列放得下（全部 + 9 顆），**不需二階那種分頁**。樣式用 inline / 沿用 BookmarksPage 的 chip helper 風格（neurons 無 `.filter-bar` 共用 class），不引入二階的 CSS。`useLiveQuery(getYearFilter)` 驅動,點 chip → `setYearFilter`。

### D4 — Pool gate 在 OverviewPage quizPool memo，套兩條路

`quizPool` memo 改為：`filterPoolByFamily(pack.questions, quizEntry)` 後再 `.filter(q => effectiveYearSet(persisted).has(q.meta.year))`。persisted 由 `useLiveQuery(getYearFilter)` 取得並進 memo deps。因為 gate 在 quizPool 共同出口，**特定 family 與跨 family 隨機（quizEntry=null）兩條路自動都套**（符合拍板「一致」）。`effectiveYearSet.size === ALL_YEARS.length` 時可短路（no-op，回傳 family-filtered pool 原樣）。**Alternative**：把年份參數塞進 `filterPoolByFamily` 簽名 — 拒絕（保持該純函式單一職責；年份過濾留在 OverviewPage 組裝層，與 `/bookmarks` replay 等其他 `filterPoolByFamily` caller 解耦）。

### D5 — QuizModal 區分兩種空狀態

QuizModal 現況：pool 空時 `sessionPool=[]` → `exhausted` 真 → 走「答完」end state。要加判斷：若**進場時 pool 就是空**（`pool.length === 0`），顯示「所選年份下這科沒題目」純文字空狀態 + 關閉；否則維持原「答完」文案。以 `pool.length === 0`（初始 prop）區分,不污染既有 exhausted 邏輯。

### D6 — 本機 only

`quiz.yearFilter` **不**加進 `lib/sync/tables.ts` 的 `SYNCED_META_KEYS`，純本機偏好（對齊二階：grep 確認二階該 key 未進 sync）。

## Risks / Trade-offs

- **空池實際觸發不到** → 現行資料每科每年 ≥7 題（已實測），空狀態純防呆；保留是為未來題庫變動。文案要中性（不要讓正常使用者誤以為壞了）。
- **meta.value JSON 解析失敗** → `getYearFilter` 對非陣列 / parse error 回 `null`（= 全選），不 throw，不破壞答題。
- **live-query reactivity** → 改年份要即時反映在 🎲 按鈕的「X 題」計數與 family 卡（若顯示計數）；用 `useLiveQuery` 確保 quizPool memo 重算。
- **既有玩家** → 無 meta row → `getYearFilter` 回 null → 全選，行為與升級前一致（零迴歸）。

## Open Questions

- QuizModal 空狀態文案最終措辭（apply 時定）；現有 exhausted end-state 的 JSX 結構決定怎麼插入「pool 初始為空」分支。
- YearFilterBar 在 CTA section 的確切排版（與閱讀 / 🎲 同列還是另起一列）— apply 時看 RWD 決定，預設另起一列避免擠壓。
