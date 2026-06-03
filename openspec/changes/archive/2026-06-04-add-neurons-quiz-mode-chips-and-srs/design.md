## Context

neurons-tw 重用一階題庫，但答題層刻意 feature-light：`neurons-mode` spec §347 明示「no SRS due-bias, no quality modifiers — deferred to follow-up」。現況：
- `apps/neurons-tw/src/components/QuizModal.tsx` 把整個 family（或跨 family）題池洗牌依序出，**作答只更新 connectome（AP / synapse / mastery / streak）+ `questionHistory`（lastResult / everWrong）**，從不碰 SRS。
- `@study-rpg/core/src/lib/srs.ts` 已 export 二階變體 `reviewCardBinary` / `reviewCardBinaryEasy` / `reviewCardBinaryGuessed` / `dueCards` / `SRS_DAILY_CAP=20` / `STANDARD_INITIAL_INTERVALS=[3,7]` —— neurons 一次都沒呼叫。
- `questionHistory` store 現為 `questionId(PK), family, lastResult, everWrong, lastAnsweredAt, updatedAt`（Dexie v14；`everWrong` 非索引欄位）。其 R2 TableAdapter 走 per-row LWW（on `updatedAt`/`lastAnsweredAt`）+ `everWrong` monotonic-OR。R2 bundle `SCHEMA_VERSION = 13`。
- `questionFlags` 服務（v8）已持久化 `easyMarked`/`guessedMarked`，但 QuizModal 目前**未渲染** ✨/🤔 按鈕、也無人消費這些 flag。
- family 卡片入口由 `neurons-homepage` spec 擁有（單一 🎯 答題 進入答題）。年份過濾由 `neurons-quiz-year-filter` 擁有。

本設計借**二階的 SRS 引擎 + 資料模型**，但套上**新的 per-family 雙 chip UI**（二階自己用的是 quiz 內 skipSrs checkbox + 獨立複習頁，不是雙 chip）。

## Goals / Non-Goals

**Goals:**
- 每個 family 卡片提供兩個意圖明確的入口：🆕 新題（只出沒答過的）/ 🔄 錯題（SRS 到期複習）。
- 把真正的 SRS 排程接進 neurons：每次作答（不分 mode）用 `reviewCardBinary` 更新該題 SRS 欄位；錯題 mode 依 `nextDueAt` 到期出題。
- 資料 / 同步改動最小且 additive（擴充既有 row、bundle 版本 forward-compat）。
- 既有 🎲 隨機跨 family、⚔️ 出征、年份過濾、/bookmarks 行為不回歸。

**Non-Goals:**
- 不改 ⚔️ 出征（全科錯題）為 SRS-driven（維持現狀，可日後 follow-up）。
- 不引入一階式 0–5 quality 自評（用 binary + ✨/🤔 modifier）。
- 不新開 SRS store、不動 Worker、不改 reading-timer / study-category。

## Decisions

### D1 — 擴充既有 `questionHistory` row 加 SRS 欄位（不新開 store）
mirror 二階：`questionHistory` row 加 `interval: number`、`easeFactor: number`、`nextDueAt: number | null`、`attempts: number`、`correctCount: number`。Dexie **v14 → v15**，index 串加 `nextDueAt`（供到期掃描）：`'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt'`。
- **為何**：SRS 欄位與題目史 1:1（同 PK `questionId`）；既有 R2 adapter / sync 路徑可直接沿用，不增同步面。
- **替代（否決）**：另開 `srsCards` store —— 重複 PK、多一個 adapter + bundle key + Dexie store + fixture，二階也選 merged。

### D2 — SRS 排程「每次作答都跑」，mode 只決定選題（二階 skipSrs 語意）
作答流程（QuizModal `handlePick`）在既有 `recordCorrectAnswer/recordIncorrectAnswer` + `recordQuestionResult` 之後，**不分 mode** 都用 `reviewCardBinary({ correct, prev, now })` upsert SRS 欄位。mode 只在「選哪些題進池」分歧。
- **為何**：複習池要有來源。若新題 mode 不排程，新題答錯的題永遠不會到期、錯題 mode 永遠空。使用者已鎖此決策。
- **替代（否決）**：mode 決定是否排程 → 迴圈斷裂。

### D3 — 用 `reviewCardBinary` 系列，非一階 `reviewCard(quality 0..5)`
作答 UI 是「選項對/錯」二元，對應 binary 變體；✨/🤔 用 `reviewCardBinaryEasy`/`Guessed`。
- **替代（否決）**：`reviewCard` + 5 級自評按鈕 → 多 UI、非使用者要的。

### D4 — chip 啟用條件 + badge 語意（無空池）
- **🆕 新題**：badge = 該 family 未作答數（pool 中 `questionHistory` 無 row 者）；數=0 → disable，提示「全部答過」。
- **🔄 錯題**：badge = 該 family **今日到期數**（`nextDueAt <= now`）；數=0 → disable，提示「今日無到期」。
- **為何**：清楚的 affordance，永不開到空 quiz。家族有排程但今日未到期時**不**提前出題（提前出會破壞間隔語意）。

### D5 — v15 升級回填「目前答錯」的題為立即到期
v15 upgrade callback：對既有 `questionHistory` row 中 `lastResult === 'wrong'` 者，種下 SRS card（`nextDueAt = now`、`interval = STANDARD_INITIAL_INTERVALS[0]`、`easeFactor = DEFAULT_EASE`），使其升級後**立即**可在錯題 mode 複習。`lastResult === 'correct'` 的 row 不種（`nextDueAt` 留 null）。
- **為何**：玩家已累積錯題史；不回填則錯題 chip 升級當下全空、要重新答錯才長出來，first-run 體驗差。只回填「目前答錯」是有界、可測（v14→v15 fixture 斷言）。
- **替代（否決）**：完全不回填（呼應 wrong-answer-list「不回填」先例，但那是顯示用 list；本處是可複習池，空池無用）。`everWrong` 全回填 → 把已答對的題也拉回複習，過度。

### D6 — `quizEntry` state 帶 mode，保留 🎲 路徑不動
`OverviewPage` 的 `quizEntry: string | null | undefined` 擴成 `{ familyId: string; mode: 'fresh' | 'review' } | null | undefined`：
- `undefined` = 關閉（不變）
- `null` = 🎲 跨 family 隨機（**完全不變**，沿用現行整池洗牌行為）
- `{ familyId, mode }` = 雙 chip 進入。`QuizModal` 收 `mode` prop；`quizPool` memo 依 mode 組池（fresh = `filterPoolByNewOnly`；review = srs 到期佇列），再與既有年份過濾 compose。

### D7 —（可選，GATE 1 可砍）✨/🤔 quality modifier 接線
`questionFlags` 服務已存在（且 QuizModal 已渲染 ✨/🤔 按鈕，但只 persist flag、無人消費）。本 change 把按鈕接上 SRS：✨ → `reviewCardBinaryEasy`（interval×3、ease×1.5）、🤔 → `reviewCardBinaryGuessed`（interval=1）；三態（點擊套用 / 再點還原預設 SRS 快照）mirror 二階 `applyQualityModifier`。**與二階的關鍵差異**：neurons 的 ✨ **不清 `everWrong`** —— neurons `questionHistory` adapter 對 `everWrong` 走 monotonic-OR（`neurons-wrong-answer-list` 永久錯題庫不變量），本地清掉會被下次 sync re-set 且抵觸該 capability，故 ✨ 只調排程、不動 everWrong。**若 GATE 1 砍此項**，SRS 迴圈仍以純 `reviewCardBinary` 完整運作。

### D8 — 每場複習上限 = `SRS_DAILY_CAP`
錯題 mode 單場最多服務 `SRS_DAILY_CAP`(20) 題到期卡（oldest-due-first），mirror 二階 daily cap，避免複習堆積一次爆量。

## Risks / Trade-offs

- **Dexie v15 升級壞 prod**（pk-change footgun 前科）→ 嚴守 additive（**不**改 pk、只加欄位+索引）+ 強制 v14→v15 upgrade fixture（`dexie-fixture-lint.yml`），fixture 斷言「升級後既有 wrong row 取得 `nextDueAt`」。
- **R2 bundle v13↔v14 cross-version**：v13 client 讀 v14 bundle → 丟未知 SRS 欄位（既有 `schema_version > local` tolerance）；v14 client 讀 v13 bundle → SRS 欄位缺 → 預設（interval 0 / nextDueAt null）→ 該題回到「尚未排程」（下次作答重新排）。→ 加 round-trip 測試。
- **SRS 排程在 best-effort try/catch**（不可破壞作答）→ 若寫入 throw，log `[srs]` channel（No Silent Errors），且 `lastResult` 已先記、下次作答會重排，可接受。
- **homepage 每 family 算到期數**（掃 `questionHistory` by `nextDueAt`）→ 用 `nextDueAt` 索引 + 單一 liveQuery group-by-family；family ~11 個，成本可忽略。

## Migration Plan

1. Dexie v15 additive 升級 + D5 回填（wrong rows → 立即到期）。無 pk change、無破壞性。
2. R2 bundle `SCHEMA_VERSION` 13 → 14；reader tolerance 已在 `bundles.ts`（保留）。
3. 部署即生效；既有玩家無需操作。**Rollback**：因屬 client 端 + bundle forward-compat，倒回前一版 app 即可（舊 client 忽略 SRS 欄位）；Dexie 不支援降版但舊 code 不讀新欄位 → 無資料毀損。

## Open Questions

- **✨/🤔 是否納入本 change**（D7）→ GATE 1 由 owner 拍板；預設納入。
- 錯題每日上限要 per-family 還是全 app 共用 `SRS_DAILY_CAP`？預設 per-session（單場 ≤ 20），dogftelemetry 後再調。
