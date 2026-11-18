## Why

`add-neurons-handout-cloze-collection-and-review` 讓每張字卡在第一次到期複習排到 ≥ 21 天時寫入永久的熟記 latch `maturedAt`，也預先登記了 synced 帳本 `clozeMaturityDrawsCredited`（MAX 合併），但刻意**不發任何獎勵**。熟記需要至少四次按時複習（最快首次複習後第 28 天），是 neurons 裡少數真正衡量「長期記住」的訊號；沒有回饋，玩家不會知道熟記有用。study-rpg-2nd 以「每熟記 10 張得 1 張普通免費命運抽」收尾（archive `2026-09-29-reward-handout-cloze-maturity`）。

neurons 沒有命運卡、聲望或免費抽帳本；最貼近的現有 faucet 是 **DMN 抽卡權**（`dmnGrantsTotal` 單調 MAX、`dmnDrawsAvailable` 由 grants − consumes 推導）。本 change 讓每 10 張熟記卡發 1 個 DMN 抽，作為 DMN 的第三個來源。取捨與替代方案（maze 能量、AP、per-day cap）寫在 design.md。

## What Changes

- **一個發放函式 `reconcileClozeMaturityDraws()`**：單一 `meta` + `handoutClozeState` 讀寫交易內，數 `maturedAt` 為有限數的列（含已取消收藏、已下架的卡；不依賴語料載入），算 `owed = max(0, floor(matured / N) − credited)`；`owed > 0` 時同一交易內 `dmnGrantsTotal += owed`、重新推導 `dmnDrawsAvailable`、`clozeMaturityDrawsCredited += owed`。`credited` 永不降低。`N = 10`（content 常數 `DMN_CLOZE_MATURED_PER_DRAW`，DOGFOOD-TUNABLE）。
- **三個觸發點**：到期複習剛熟記一張卡之後；每次 pull 完成的 backfill 鏈（排在計數器 MAX 合併與 DMN 每日計數合併之後）；每次 app 載入。發放冪等，任一觸發點漏跑由下一個補上；第一次載入即回溯補發收藏 change 上線後已熟記的卡。
- **不設每日上限、不佔出征軸 / 行為軸的每日上限**：熟記抽是 DMN 的第三個獨立來源，終身上界 `floor(曾出貨卡數 / N)`。
- **只發 DMN 抽權**：不直接發 AP、maze 能量、裝備或消耗品；抽到什麼由既有 DMN 抽卡規則決定。
- **玩家看得到的**：複習結束畫面在本次有發抽時加一行「熟記獎勵：+n 次 DMN 抽卡」；HelpMenu 字卡段說明熟記門檻與每 N 張 1 抽（從常數渲染）；HelpMenu「DMN 抽卡」段加第三個來源。pull / 載入時的補發靜默。
- **不升任何版本**：帳本 key 與 MAX 合併已在收藏 change 的 SV 29 就位；`dmnGrantsTotal` 既有。**本 change 不佔 SV 31**（原分配給它的號碼不使用）。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `neurons-handout-cloze-review`：熟記 latch requirement 以 REMOVED + ADDED 取代（拿掉「不讀不寫帳本、不發獎勵」的範圍邊界）；新增〈每 N 張熟記卡發 1 個 DMN 抽〉；MODIFIED〈不發任何東西〉加入唯一例外；MODIFIED〈說明與 sprite〉加入熟記說明。
- `neurons-dmn-fate-cards`：MODIFIED〈DMN fate-card draw entitlement SHALL accrue via mixed … triggers〉，加入第三個來源「字卡熟記」及其不受每日上限約束的界線。

## Impact

- **程式碼**：新檔 `app/lib/services/handout-cloze-maturity-draws.ts`；`app/lib/handout-cloze/review.ts`（熟記後呼叫）；`app/lib/sync/backfill/index.ts`（新步驟）；app 啟動處（與 `initializeDmnTrigger` 同一處，排在 `migrateDmnGrantsTotal` 之後）；`ClozeReviewModal` 結束畫面；HelpMenu 兩段；content 套件 `dmn-types.ts` 一個常數。
- **資料**：無 Dexie 升版、無 R2 `SCHEMA_VERSION` 變動、無 Worker 改動。
- **相依**：必須在 `add-neurons-handout-cloze-collection-and-review` archive 後 apply；與 `render-neurons-handout-cloze-highlights` 無相依，可在它之前或之後。
- **經濟**：DMN 每日總抽數原本由兩個軸的上限（2 + 3）界定；本 change 新增一個不受每日上限的來源，終身上界以語料卡數推導（試點 46 張 → 終身最多 4 抽）。
