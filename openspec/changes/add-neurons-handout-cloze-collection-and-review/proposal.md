## Why

講義挖空字卡的語料層（capability `neurons-handout-cloze-corpus`，archive `2026-10-01-add-neurons-handout-cloze-corpus`）已出貨 `handout-cloze.json`（試點 胚胎學＋寄生蟲學 46 張），但 neurons app **沒有任何消費端**：玩家看不到卡、存不了卡、也沒辦法複習。study-rpg-2nd 已上線同一套 app 端功能（archive `2026-09-29-add-handout-cloze-collection-and-review`），本 change 把它移植到 `apps/neurons-tw`：讓玩家**收藏**字卡並以字卡自己的間隔排程**複習**，並從第一天就接好量測。

讀本螢光重點層（`render-neurons-handout-cloze-highlights`）與熟記獎勵（`reward-neurons-handout-cloze-maturity`）刻意**不在本 change**：前者晚 1–2 週上線，這段期間量到的收藏率就是「沒有重點層」的對照基準；後者需要的持久欄位與同步合併規則在本 change 一次就位，讓它不必再升版。

neurons 與 2nd 的架構差異很大（講義是 HTML 而非 markdown、同步是 R2-only 的固定 `'neurons'` bundle、題目沒有 SRS 到期佇列、經濟是 DMN 抽卡與 maze 能量），所以這不是逐字照抄；每一處改寫都列在 design.md「與 2nd 的差異」。

## What Changes

- **字卡狀態表**：新增 Dexie **v21** 表 `handoutClozeState`（v20 → v21，只加表、不改任何主鍵、無 upgrade callback），每張收藏過的卡一列，以 `cardId` 為鍵。記錄收藏狀態、收藏來源、字卡 SRS 欄位、複習時間戳、上次看到的 `sentenceHash`，以及熟記 latch `maturedAt`（本 change 只寫不發獎勵）。附 v20 → v21 upgrade fixture（`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。
- **熟記獎勵帳本先就位**：新增 synced meta key `clozeMaturityDrawsCredited`（單調 MAX 合併）。本 change 只把它登記進 `SYNCED_META_KEYS` 與 MAX 合併規則，不讀不寫，讓 `reward-neurons-handout-cloze-maturity` 不必再升 R2 `SCHEMA_VERSION`。
- **同步**：新表以新的 R2 adapter 進固定 `'neurons'` bundle（逐列 LWW，比較欄位是列自己的 `updatedAt`；`maturedAt` 兩個方向都取較早的非空值，永不退回）。R2 bundle `SCHEMA_VERSION` **28 → 29**（新 top-level key + 新 synced meta key；沿用既有 409 downgrade fence，讓舊版 client 無法把新 key 從雲端剝掉）。帳號切換清除由 adapter registry 推導、自動涵蓋新表（加 Vitest 鎖；neurons 沒有 2nd 的本機備份機制）。兩台裝置在同步前各自複習同一張卡時，較晚那台整列勝出、另一台那次評分丟失——明確接受的取捨。
- **收藏入口 1：講義考點尾端**。`/cram/handout` 每個帶 `data-leaf-ids` 且有可玩卡的 `.hdt-topic`，在該考點既有內容（含既有考點控制項）之後渲染「📇 字卡 k / N ・收藏本考點 N 張」列，展開列出逐張挖空預覽與收藏切換。HTML 講義正文（`dangerouslySetInnerHTML` 的那段）一個字元都不動：字卡列由 React 以 portal 掛在 topic 尾端的 app 自有容器，不寫進講義 HTML 本身。寫入只經本 capability 的 seam。
- **收藏入口 2：考前中心 hub「我的字卡」**。`/cram` 新增「我的字卡」區塊，連到新全螢幕路由 `/cram/cards`：已收藏清單（含「來源已更新」「已下架」）、依科→考點瀏覽可收藏的卡、「開始複習」。
- **複習 modal**：顯示挖空原句（answer →「［　　］」，gloss 與 hint →「（…）」）→「顯示答案」→ 三鍵 **有把握／沒把握／答錯**。只推進字卡自己的排程；**不寫 `questionHistory`、不發 AP、不發 maze 能量、不發 DMN 抽、不計入出征或今日處方**。頁尾顯示出處考點與「📖 回去看這段」（`/cram/handout?subject=…&leaf=…`），並有 🐞 回報。
- **每日推播量，不設複習上限**（沿用 2nd owner 原話的解讀）：系統每天主動放到玩家面前的字卡數有上限（單一常數 `HANDOUT_CLOZE_DAILY_PUSH`，預設 30），推完就停；當日推播日誌記在本機 localStorage、依帳號分開、不同步。玩家在「我的字卡」可「繼續複習」其餘到期卡（推進排程）與「提前複習」未到期卡（純練習，不寫卡片列）。一次大量收藏時，首次到期日依推播量往後攤開。
- **首頁到期提示（不發獎勵、不併入出征）**：FamilyPicker header（考前救急入口旁）在今日推播數 ≥1 時顯示「📇 今日字卡 N 張」，點了進 `/cram/cards`；純導覽，不接 🔄 chip 計數、不接出征、不寫任何狀態、不發任何獎勵（見 design D9）。
- **講義更新後**：保留 SRS 進度；語料 `sentenceHash` 與列上記錄不同時標示「來源已更新」，到期複習一次後消失。語料中已不存在的 `cardId` 列為「已下架」，不進到期佇列、不刪列。
- **量測**：device-local telemetry（localStorage `neurons:handoutCloze:telemetry:v1`，上限 500，不進 Dexie 與同步引擎，比照救急 telemetry 前例）＋ DEV handle；同步列上的欄位足以從 R2 快照算出玩家閘指標。
- **說明與圖示**：HelpMenu 加「講義字卡」段（推播量從常數渲染）；所有字卡圖示走像素 sprite（新增 📇）。

## Capabilities

### New Capabilities
- `neurons-handout-cloze-review`：字卡的收藏、狀態表與同步合併規則、推播與複習、來源更新／下架處理、熟記 latch、量測與說明。

### Modified Capabilities
- `neurons-anatomy-handout`：〈閱讀進度與章節深連結〉原文寫「All persistence SHALL be device-local `localStorage` only and SHALL NOT touch Dexie, R2, or the sync engine」，以講義場景為範圍；本 change 把它收窄為「閱讀進度與位置的持久化」，並明列唯一例外：經 `neurons-handout-cloze-review` 的收藏／取消收藏動作。
- `neurons-exam-prep-hub`：〈/cram SHALL compose as a subject-led 考前中心 hub〉加入「我的字卡」區塊與其位置。
- `neurons-homepage`：ADDED〈Homepage SHALL surface a reward-free handout cloze due-card reminder〉。
- `neurons-cloud-sync`：新增一條 requirement，記錄 `'neurons'` bundle 自 `SCHEMA_VERSION` 29 起攜帶 `handout_cloze_state` 與 `clozeMaturityDrawsCredited`，以及帳號切換／wipe／備份的涵蓋。

## Impact

- **程式碼**：`apps/neurons-tw/src/lib/db.ts`（v21）、`src/lib/sync/r2/`（新 adapter、`SCHEMA_VERSION` 29、`SYNCED_META_KEYS` 與 MAX 合併）、帳號切換／wipe／備份路徑；新模組 `src/lib/handout-cloze/`（corpus / collection / review / queue / status / telemetry）；講義頁（考點尾端字卡列的 portal 掛載）、`/cram` hub、新頁 `/cram/cards`、新 `ClozeReviewModal`、HelpMenu、emoji icon 表、bug report context。
- **資料**：Dexie v21；R2 `SCHEMA_VERSION` 29；語料 `handout-cloze.json` 不變（已含 `bulletText`、`citeRanges`、`hint` mask）。
- **相依**：`render-neurons-handout-cloze-highlights` 與 `reward-neurons-handout-cloze-maturity` 依賴本 change 的 seam 函式與欄位，須在本 change archive 後才 apply。
- **不影響**：題目 `questionHistory`、出征、DMN、maze、今日處方、救急；`packages/core` 的公開型別（只 import 既有 SRS 純函式，不改 core）。
