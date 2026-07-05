## Context

今日處方箋（`neurons-daily-prescription`）現況：`apps/neurons-tw/src/lib/services/prescription.ts` 的純函式 `buildPlan(pool, history, subjects, opts)` 只吃 `questionHistory`，訂正線的 eligible pool 用 `lastResult==='wrong'`，開發線用「未答過」的題。它**沒讀** `questionFlags`（`easyMarked` / `guessedMarked`，存於 `apps/neurons-tw/src/lib/services/question-flags.ts` 的 `questionFlags` table），也**沒讀** `quiz.yearFilter`（`apps/neurons-tw/src/lib/services/year-filter.ts` 的 `getYearFilter()` / `effectiveYearSet()` / `ALL_YEARS`，首頁 `YearFilterBar` 已用它 gate 一般 quiz）。

現有架構把 I/O 收在 impure 的 `getOrCreateTodayPlan()`（讀 meta / history、凍結 plan），`buildPlan` 維持純函式便於單元測試。本 change 沿用此分層：impure 層多抓「flags map」與「year set」，以參數餵進純 `buildPlan`，不破壞 frozen-plan 語意與可測性。

距考試 12 天、dogfood 玩家焦慮，目標是「更穩健地答題、訂正錯題」。

## Goals / Non-Goals

**Goals:**
- 修補池納入「猜對的心虛題」、排除「已精通題」，讓訂正線修的是「根基不穩」而非只有「答錯」。
- 處方箋抽題與首頁 `quiz.yearFilter` 一致（消除「一般 quiz 篩年份、處方箋卻吃全 pool」的不一致），並對時間不多的玩家提供「穩定練近年」的路徑。
- 把答錯從「失敗事件」reframe 成「修補中 → 已固化」的可完成工作單元；移除數個 anxiety-inducing 的措辭。
- 全程 zero/tiny schema（不 bump Dexie、不動 R2 `SYNCED_META_KEYS`；新讀取皆來自既有 table）。

**Non-Goals（列為 next，本 change 不做）:**
- 小份處方 dose toggle（A）、考前 taper、答題前穩定起手式、錯因分類 tag（需新欄位）。
- 不改 `neurons-quiz-year-filter` / `neurons-wrong-answer-list` 的 requirements（僅唯讀消費）。
- 不新增抽卡/貨幣/排行榜軸（維持既有 `neurons-daily-prescription` 經濟中立要求）。

## Decisions

### D1 — 修補池 = (currently-wrong ∪ guessed-correct) − too-easy
訂正線的 eligible pool 由「`lastResult==='wrong'`」改為 `( lastResult==='wrong' ∪ guessedMarked ) − easyMarked`；開發線的 unseen pool 額外 `− easyMarked`。N/M 的數值階梯不變，只是**餵給 N-scaling 的池換成修補池大小**。
- **理由**：`guessedMarked`（🤔 我猜對的）data 上是 correct、看似無虞，卻是隱形弱點——正是「更穩健地訂正」要抓的。`easyMarked`（✨ 太簡單）= 已精通，重複抽是浪費焦慮考生的時間。
- **實作**：impure 層 `db.questionFlags.toArray()` → `Map<questionId,{easyMarked,guessedMarked}>`，傳入 `buildPlan`。純函式據此做集合運算。
- **Alternatives**：另開「心虛題」第三條線（棄——Codex 指出增加每日決策負擔，違背 forgiving 精神）；把 guessed 當一般 wrong 混入而不區分（採用其精神，但保留「已固化」reframe 對兩者一致）。

### D2 — Year-scope：盲區完全 scoped、修補 scoped-first-then-fallback
`buildPlan` 收一個 `yearSet: Set<number>`（= `effectiveYearSet(await getYearFilter())`），對 `q.meta.year` 過濾。
- **開發新連結（盲區）線**：完全 year-scoped——`unseen/total` 覆蓋分數在選定年份內計算（「覆蓋缺口」只在你選的範圍內才有意義）。
- **修補線**：scoped-first——先取範圍內的修補題；範圍內為空才 fallback 到全年份修補題（舊年份的錯/猜仍是真弱點，但不能在玩家選近年時硬塞舊題、破壞信任）。
- **Alternatives**：兩線都硬 scope（棄——會永久隱藏真實弱點）；兩線都不 scope（棄——與 `YearFilterBar` 不一致）。

### D3 — Reframe 為純 derived 狀態，不新增 schema
「修補中 / 已固化」不落任何新持久欄位：一題**在今日修補池內** = 修補中；**今日在訂正線被答對**（既有 `prescription:v1:wrong:{date}:{qid}` write-once key）= 當日已固化。池每日由 live flags + history 重算。
- **理由**：wrong→right 狀態已存在，reframe 是 copy/visual reskin，零 schema。
- **Alternatives**：persist 一個 `修補中` flag（棄——新 schema 且可 derive）。

### D4 — Range chip 讀 plan 快照、只在非全選時顯示
plan 生成時把當下的 `effectiveYearSet` 快照進 plan（新欄位 `yearScope: number[] | null`，`null`＝全選/未過濾）。UI range chip 讀**plan 的快照**而非 live filter（plan 當日凍結，讀 live filter 會與已凍結的抽題範圍不一致）。effective set 等於 `ALL_YEARS` 時 chip 不顯示（no-op invisible）。
- **理由**：Codex 建議「不要完全靜默」以免數字看起來怪，但也不能與凍結 plan 打架 → 快照 + 條件顯示兩者兼得。

### D5 — 飢餓 fallback：永不「沒題目可做」死狀態
- 範圍內盲區抽完 → 文案「範圍內連結已巡過，今日改做修補中連結」，配額移向修補線。
- 範圍內無修補題 → 依 D2 fallback 全年份修補；若全年份也無修補題 → 配額移向新連結線。
- 兩者皆空（極罕見）→ 中性 CTA「放寬到全部年份」或「今日完成」，不出現 error/dead 語氣。

### D6 — Copy-softening（純文案 requirement）
「盲區」UI label → 「開發新連結」（spec-internal 變數名可維持 `breadth`）。不外露修補池原始總數。accuracy 低 → N 縮減，措辭去除歸因（不寫「因為你正確率下降」），改中性「今天處方小一點，讓訂正保持清楚」。UI 不外露 snapshot/鎖定/防作弊語氣；不出現 missed-day calendar。

### D7 — 分層與凍結不變
`buildPlan` 維持純函式，新增兩個入參 `flagsByQuestion` + `yearSet`（mirror 現有 `history` 餵法）。`getOrCreateTodayPlan` 多抓 flags + year filter。frozen-plan 語意不變：snapshot 現在反映 year-scoped 的修補/unseen ids，plan 一旦凍結當日不變（含 `yearScope`）。

## Risks / Trade-offs

- **[年份 filter 當日變更與凍結 plan 不一致]** → plan 於首次存取凍結、含 `yearScope` 快照；當日改 filter **不** regenerate 今日 plan，chip 讀快照，新範圍隔日生效。與既有「plan 當日凍結」一致。
- **[猜對題不會自動消池，恐每日重現]** → 修補完成為「當日」計數（mirror 錯題線）；池每日由 live `guessedMarked` 重算。一題持續心虛 → 持續在修補池，直到玩家清 🤔 或標 ✨——這是**刻意且誠實**的（它確實還不穩），非 bug。自動在「有把握答對」時清 guessed 列為 next。
- **[舊 plan 無 `yearScope` 欄位]** → reader tolerance：缺欄位一律當「全選（不顯示 chip、不 scope）」，舊凍結 plan 照常運作。
- **[range chip 增加 UI 元素密度]** → 低調、只在非全選時出現、複用既有 chip 樣式，不搶處方箋主視覺。

## Migration Plan

無 schema migration（無 Dexie/R2 改動）。部署＝一般 push→CF Pages。Rollback＝revert commit（純 code + 文案 + 一個 plan optional 欄位，向後相容）。跨版本相容：新 code 讀舊 plan（缺 `yearScope`）視為全選；舊 code 遇新 plan 的多餘 `yearScope` 欄位忽略即可（既有 plan 讀取以已知欄位為準）。

## Open Questions

- 是否在「有把握答對」時自動清 `guessedMarked`，讓心虛題修補後真的離池？（傾向 next，先觀察 dogfood）
- 修補線 UI 是否視覺區分「答錯過」vs「猜對過」兩類修補中題？（傾向不分，兩者皆＝修補中，避免增加認知負擔；列 next 再看）
