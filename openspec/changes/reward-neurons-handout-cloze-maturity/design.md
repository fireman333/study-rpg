## Context

動機見 proposal.md。行號為 2026-10-01、`track-neurons` `27897160` 實查；`app/…` = `apps/neurons-tw/src`，`content/…` = `packages/content-neurons-tw`。本 change 以收藏 change（`add-neurons-handout-cloze-collection-and-review`）定案的欄位與函式為前提。

**熟記 latch（收藏 change）**：`rateDueClozeCard` 只在到期複習把 interval 推到 ≥ 21 天且列上無 `maturedAt` 時寫入；回傳 `{row, matured}`。提前複習不寫卡片列。合併時 `maturedAt` 取兩邊有限值中較早者。列只為語料內的卡建立、取消收藏不刪列。`status.ts` 的 `countMaturedRows(rows)` 只數 `maturedAt` 為有限數的列。

**帳本**：`meta` key `clozeMaturityDrawsCredited` 已在 `SYNCED_META_KEYS` 與 `backfill/counters.ts` `MAX_MERGE_KEYS`（收藏 change 3.3）；production 無讀寫。

**DMN 抽權**（`app/lib/services/dmn-trigger.ts`）：
- 帳本是兩個單調計數器：`dmnGrantsTotal`（lifetime 發放）與 `dmnLifetimeDrawsConsumed`（lifetime 消耗）；`dmnDrawsAvailable` = `max(grants − consumes, 0)`，是推導出來的顯示值（`neurons-dmn-fate-cards`〈DMN daily counters…〉）。
- 發放樣板 `grantBehaviorAxisDraw`（`:176-195`）：單一 `db.meta` rw 交易內讀每日計數、`readSeededGrantsTotal()`（缺 `dmnGrantsTotal` 時以 available + consumes 種子）、寫 grants、重新推導 available。`creditExpeditionDraws`（`:217`）同形。
- 每日上限：出征軸 2（`DMN_EXPEDITION_DAILY_CAP`）、行為軸 3（`DMN_BEHAVIOR_AXIS_DAILY_CAP`），定義在 `content/src/dmn-types.ts:191-199`。
- 一次性本機遷移 `migrateDmnGrantsTotal`（`:152`）在 `initializeDmnTrigger`（`:253`）啟動時跑。
- pull 後合併：`backfill/dmn-daily.ts` 對 grants / consumes 取 MAX 再重新推導 available；`runOnPullComplete`（`backfill/index.ts:19`）第 1 步是 `backfillMaxMergeCounters`。

**neurons 的 meta 是逐 key 同步**：沒有 2nd 那種「整列 LWW 的 singleton」，所以 2nd 必須等 initial sync barrier 才寫 `monotonicCounters` 的理由（冷啟動前寫入會讓整列 LWW 丟掉雲端的非單調欄位）在 neurons 不存在。neurons 也沒有 barrier 機制；同步引擎只有「第一次 push 等 startup force-pull」（`lib/sync/engine.ts:303-309`）。

**其他 faucet**：maze 能量 `accrueMazeEnergy(familyId, base)`（`lib/maze/economy.ts:119`，per-family `maze:${f}:earned` MAX 合併），每答對 3、每閱讀分鐘 3；AP 是答題分數，已不 gate 進度（`realign-dmn-event-rewards-to-maze`）。

## Goals / Non-Goals

**Goals:**
- 一個發放函式、三個觸發點，同一套「交易內重算 owed、只升不降」邏輯。
- 發放上界可從出貨語料推導並以測試釘住。
- 經濟界線可被守衛證明：只有一個檔案寫 `clozeMaturityDrawsCredited`，呼叫端集合固定。

**Non-Goals:**
- 不改熟記定義（21 天、到期複習才算）。
- 不做字卡成就或排行榜。
- 不處理 DMN 帳本本身在多裝置並行發放時的 MAX 吸收（既有性質，見 D5）。
- 不新增全域 toast；pull / 載入補發保持靜默。

## Decisions

### D1 獎勵選 DMN 抽權（每 N=10 張熟記 1 抽），不選 maze 能量或 AP

| 候選 | 與 2nd「免費命運抽」的相似度 | 問題 |
|---|---|---|
| **DMN 抽權（採用）** | 高：都是「一次抽卡機會」、獎勵內容由既有卡池決定、可留著自選時機用 | 新增一個不受每日上限的來源（D6） |
| maze 能量 | 低：連續貨幣、per-family；熟記一張卡的「一次性里程碑」感會被稀釋成小數字 | 要決定記到哪個 family（字卡的 subjectId 是講義科名，與 maze family 的對應要另查）；數量要另訂平衡 |
| AP | 低：AP 已不 gate 進度，淪為純分數 | 發了等於沒發 |

`N = 10` 沿用 2nd 的起始值；試點 46 張時終身最多 4 抽，fan-out 到上千張後約百抽級，且每張熟記至少需要一個月，速率很低。常數 `DMN_CLOZE_MATURED_PER_DRAW = 10` 放在 `content/src/dmn-types.ts`，與其他 DMN 上限常數並列，HelpMenu 從它渲染。DOGFOOD-TUNABLE。

### D2 一個發放函式 `reconcileClozeMaturityDraws()`，新檔 `app/lib/services/handout-cloze-maturity-draws.ts`

- 開 `db.transaction('rw', [db.handoutClozeState, db.meta], …)`；在交易內讀全表、`countMaturedRows`、讀 `clozeMaturityDrawsCredited`（缺 = 0、非有限非負整數 = 0）；`owed = max(0, floor(matured / N) − credited)`。
- `owed > 0` 時同一交易內：`grants = readSeededGrantsTotal() + owed`、寫 `dmnGrantsTotal`、`dmnDrawsAvailable = deriveDrawsAvailable(grants, consumes)`、`clozeMaturityDrawsCredited = credited + owed`。這滿足 `neurons-dmn-fate-cards`〈DMN daily counters…〉的 Atomicity：grants、推導值與該來源的「上限計數器」（這裡是 credited 帳本）同一交易。
- 回傳 `{credited: owed}`；`console.info('[cloze-maturity] +owed DMN draw(s)')`。
- `readSeededGrantsTotal` / `deriveDrawsAvailable` 從 `dmn-trigger.ts` / `dmn-entitlement.ts` 匯出共用，不複製邏輯。
- 全表 `toArray()` 上界是語料卡數，三個觸發點都低頻，成本可接受；不為 `maturedAt` 加索引（會要升 Dexie）。

### D3 觸發點：剛熟記後、每次 pull 完成後、每次載入；不需要 barrier

- **觸發 1（複習）**：複習 modal 的提交包裝（`commitClozeRating`）在 `rateDueClozeCard` 成功、回傳 `matured === true` 之後呼叫發放；錯誤只 log、不影響評分結果。回傳型別擴成 `{ok: true, drawsCredited: number}`。
- **觸發 2（pull）**：`runOnPullComplete` 新增一步，排在 step 1 計數器 MAX 合併（讓 `credited` 先收斂）與 `backfillDmnDailyCounters`（讓 grants / consumes 先收斂）之後，自己的 try/catch。舊版（只有收藏 change 的）裝置熟記的卡，在新版裝置 pull 到那些列時補發。
- **觸發 3（載入）**：`scheduleBootClozeMaturityDraws()`，在 `initializeDmnTrigger` 跑完 `migrateDmnGrantsTotal` 之後以 `void` 呼叫，永不 reject；同時就是回溯補發。
- **為什麼不需要 2nd 的 initial-sync barrier**：2nd 的 barrier 是為了保護「整列 LWW 的 singleton」裡的非單調欄位；neurons 的 `dmnGrantsTotal`、`dmnLifetimeDrawsConsumed`、`clozeMaturityDrawsCredited` 都是各自獨立、MAX 合併的 key，冷啟動 pull 前寫入不會讓任何其他值被 LWW 蓋掉。冷啟動前在舊快照上算出的 owed，經 D5 的分析不會造成多發。

### D4 熟記數包含已取消收藏與已下架的卡，且不依賴語料

數 `maturedAt` 為有限數的列，不看 `collected`、不看語料。理由同 2nd D3：
- 下架卡不會再被複習，不會新熟記，只會停在原計數；
- 若排除下架卡，語料下架一張熟記卡會讓 `floor(matured/N)` 掉到 `credited` 以下，玩家要多熟記幾張才拿到下一抽、且看不出原因；
- 不依賴語料：語料 fetch 失敗那次載入照樣能發。
- 判準是 `typeof === 'number' && Number.isFinite`，壞資料（帳號切換用雲端逐字寫入的缺欄位或字串）不算。

### D5 多裝置：重複發不可能，漏發可能且接受

- grants 與 credited 都是 MAX 合併。同一里程碑兩台都發：兩邊都是 `E+1 / 1`，合併後仍是 `E+1 / 1`，合併熟記數 11 → owed 0。**不重複**。
- 不同里程碑兩台都發：合併 `E+1 / 1`、聯集 20 張 → 下一次觸發 owed 1 → `E+2 / 2`。**不漏**。
- 一般情況：每台的本機熟記數 ≤ 帳號聯集熟記數（列不刪、latch 合併取較早），所以各台自己發過的熟記抽 ≤ `floor(聯集 / N)`；合併後 grants 的熟記部分不超過真實應得。**多發上界 0**。
- **會發生的漏發**：另一台同時從出征軸 / 行為軸增加 `dmnGrantsTotal` 時，MAX 會吃掉其中一邊的增量；若被吃掉的是熟記那一抽、而 credited 沒被吃掉，那一抽永久遺失。這是 DMN 帳本「scalar MAX」既有的性質，所有來源共同承擔（DMN spec 已接受「兩台並行消耗會退回一抽」的反向限制）。修它要改成 per-device 計數器，超出本 change。
- **反向（credited > floor(matured/N)）**：pull 中途帳本先到、卡後到時可能發生；owed 夾在 0，**絕不降低** credited。
- **冷啟動前發放**：裝置 B 帶舊快照（credited 0、本機已有 10 張熟記列）在 pull 前發 1 → `E+1 / 1`；若雲端已由 A 為同一里程碑發過（`E+1 / 1`），合併仍是 `E+1 / 1`。不多發。

### D6 不設每日上限、不佔兩個軸的每日上限

- 熟記抽是第三個獨立來源，不寫 `dmnTimeAxisDrawsConsumedToday` / `dmnBehaviorAxisDrawsConsumedToday`，也不受 `maybeRunDailyReset` 影響。
- 理由：(1) 熟記本身是強時間閘門（每張 ≥ 4 次按時複習、≥ 28 天）；(2) 終身上界 `floor(C / N)`；(3) 加每日上限需要一個 date-gated 的新 synced 計數器（就得升 SV 31 並寫跨午夜合併），換來的只是罕見的「同一天熟記 50 張以上」情境。
- 代價：DMN「每日總抽 ≤ 5」不再是硬上限——project.md 的 roadmap 敘述與 DMN 的兩條軸上限仍成立，但總量多一個無日上限的來源。**已決定（owner 2026-10-01）：不設每日上限。** 日後若要加，改成「每日最多 K 抽、owed 跨日保留」並升 SV（當時的下一號）。

### D7 玩家看得到的

- 複習結束畫面：本 session 有發抽時，在三鍵統計下方加一行「熟記獎勵：+n 次 DMN 抽卡」，n 是本 session 各次評分回傳的 `drawsCredited` 加總；文字函式化並 export 給 node 測試。
- HelpMenu 講義字卡段：加一句「同一張字卡第一次在到期複習後排到 ${HANDOUT_CLOZE_MATURE_INTERVAL_DAYS} 天以上算『熟記』；每熟記 ${DMN_CLOZE_MATURED_PER_DRAW} 張得 1 次 DMN 抽卡。已取消收藏或已下架的字卡，熟記紀錄照樣算。」並把收藏 change 的「字卡不發任何遊戲獎勵」改成「字卡複習本身不發 AP、能量或抽卡；熟記里程碑會換 DMN 抽卡」。
- HelpMenu「DMN 抽卡」段：加第三段「字卡熟記：每熟記 ${N} 張講義字卡 +1 draw（不受每日上限，終身上限依字卡總數）」。
- pull / 載入補發靜默，比照出征軸發放也只在 DMN 按鈕的可用數上反映。

### D8 守衛

1. **呼叫端集合**：`reconcileClozeMaturityDraws` 的 production 呼叫端 = `lib/handout-cloze/review.ts`（或 commit 包裝所在檔）、`lib/sync/backfill/index.ts`；`scheduleBootClozeMaturityDraws` 的呼叫端只有 DMN 初始化處。從原始碼推導、定義檔排除。
2. **唯一寫入者**：含 `clozeMaturityDrawsCredited` 字面的 production 檔扣掉 `lib/sync/tables.ts`、`lib/sync/backfill/counters.ts` 後 = `lib/services/handout-cloze-maturity-draws.ts`。
3. **上界**：從出貨 `handout-cloze.json` 讀卡數 C，為每個 cardId 造熟記列，跑發放三次 → `credited === floor(C/N)`、grants 恰增加這麼多；斷言以常數與語料計算，不寫字面值。
4. **經濟界線**：沿用收藏 change 的快照測試（不熟記的 session 全部不變）；新增由 commit 包裝驅動的「熟記第 10 張 → `meta` 只有 `dmnGrantsTotal`、`dmnDrawsAvailable`、`clozeMaturityDrawsCredited` 三個 key 變動，其他 store 不變」。
5. **兩裝置**：兩份 meta 與兩份卡片列，經 `handoutClozeStateAdapter.apply`、`backfillMaxMergeCounters`、`backfillDmnDailyCounters` 互相合併，驗 D5 兩個 scenario。
6. **不吃每日上限**：發放前後 `dmnTimeAxisDrawsConsumedToday`、`dmnBehaviorAxisDrawsConsumedToday` 不變；兩軸已達上限時仍能發熟記抽。

每條守衛做 mutation probe。

### D9 既有測試的改寫

收藏 change 的「maturity grants nothing and leaves clozeMaturityDrawsCredited unchanged」改成：「`rateDueClozeCard` 本身仍只寫卡片表」（直接呼叫它，credited 不變），並新增「commit 包裝熟記第 10 張 → 發 1」。兩條並存，證明發放是包裝層做的。

## 與 2nd 的差異

| # | 2nd 的做法 | neurons 的做法 | 理由 |
|---|---|---|---|
| 1 | 每 10 張熟記發 1 張**普通免費命運抽**（`creditFreeDrawsToLedger` 寫 earned 欄位） | 每 10 張熟記發 1 個 **DMN 抽權**（`dmnGrantsTotal += 1`、重新推導 available） | neurons 無命運卡 / 免費抽帳本；DMN 抽權是最貼近的「一次抽卡機會」 |
| 2 | 帳本在 `monotonicCounters` singleton | 帳本是獨立 synced meta key | 架構不同（收藏 change D4） |
| 3 | 發放函式開頭擋 `isInitialSyncSettled()`，barrier 前一律不寫 | 不需要 barrier | neurons meta 逐 key MAX 合併，沒有整列 LWW 會被冷啟動寫入蓋掉的非單調欄位 |
| 4 | pull 觸發點排在 achievement backfill 之後 | 排在計數器 MAX 合併與 DMN 每日計數合併之後 | 先讓 credited 與 grants 收斂再算 owed |
| 5 | 載入觸發 `scheduleBootClozeMaturityDraws(whenInitialSyncSettled())` | 在 `migrateDmnGrantsTotal` 之後呼叫 | 先完成 grants 種子遷移 |
| 6 | 常數在命運卡常數區，共用「免費抽來源」句拿掉來源數目 | 常數在 `dmn-types.ts` 與 DMN 上限並列；HelpMenu DMN 段加第三個來源 | neurons 沒有共用來源句；DMN 說明是 HelpMenu 段落 |
| 7 | 經濟提醒：熟記抽可能開出招募券 / 營收 | 熟記抽可能開出消耗品或低機率裝備，照 DMN 既有規則 | 卡池不同 |
| 8 | 免費抽不擲衰運 | DMN 抽本來就沒有衰運機制 | — |
| 9 | 2nd 無每日上限議題 | 新增「不受 DMN 每日上限」的決策與待決問題 | neurons DMN 有每日上限文化（2 + 3） |
| 10 | 熟記 latch requirement 以 REMOVED + ADDED 取代 | 同（openspec MODIFIED 不能刪 scenario） | — |

## Risks / Trade-offs

- **[改系統時鐘可提早讓卡片到期]** → 不緩解；終身上界有限，全 app 時間閘門同性質。
- **[MAX 合併漏發]** → 接受，見 D5。
- **[DMN 每日總抽不再是硬上限]** → owner 已接受（D6）。
- **[回溯補發集中在 deploy 當天]** → 收藏 change 上線到本 change 上線間的熟記數接近 0（熟記至少 28 天）；若間隔超過一個月，第一次載入可能一次補數抽，靜默入帳。
- **[平衡未量測]** → `N = 10` 是起始值，DOGFOOD-TUNABLE。

## Migration Plan

1. 無 Dexie 升版、無 R2 `SCHEMA_VERSION` 變動（仍為收藏 change 的 29，或螢光 change 上線後的 30）、無 Worker 改動。**本 change 不佔 SV 31**。
2. 部署：app 與 content 套件同一個 CF Pages deploy。
3. 舊版分頁仍開著：它熟記卡卻不發；新版裝置在下一次 pull 或載入時補發。
4. Rollback：CF Pages 退回前一版即可。已發的 DMN 抽留在帳本；`clozeMaturityDrawsCredited` 留在 meta、舊版只照 MAX 合併傳遞；重新上線時應發數以它為基準，不會重發。

## 決策清單

| 決策 | 理由 | 影響範圍 | 依賴的假設 | 想改怎麼改 |
|---|---|---|---|---|
| 獎勵 = DMN 抽權（D1） | 最貼近 2nd 的免費抽；一次性里程碑感 | `handout-cloze-maturity-draws.ts`、DMN 帳本 | DMN 卡池適合當學習獎勵 | 改成 `accrueMazeEnergy`（需定 family 對應與數量） |
| N = 10、常數在 `dmn-types.ts` | 沿用 2nd；與 DMN 上限並列 | content 常數、HelpMenu | — | 改常數 |
| **已決定（owner）**：不設每日上限（D6） | 熟記本身強時間閘門；終身有界；免升 SV 31 | DMN 總量 | 很少一天熟記 50+ 張 | 加 date-gated 計數器、升 SV 31 |
| 交易內重算、只升不降（D2） | 冪等、三觸發共用 | 發放函式 | 表上界 = 語料卡數 | 改 owed 算式 |
| 不需要 barrier（D3） | meta 逐 key MAX，無整列 LWW 風險 | 三個觸發點 | `dmnGrantsTotal` 維持 MAX 合併 | 若 DMN 帳本改成非單調結構就要補 barrier |
| 熟記數含取消收藏 / 下架、不依賴語料（D4） | latch 永久；語料載入失敗也能發 | `countMaturedRows` | 列只為語料內的卡建立、cardId 不重用 | 改 filter + 對應 scenario |
| 多裝置漏發接受（D5） | 重複發在 MAX 下不可能；漏發是 DMN 帳本既有性質 | 無 | grants 與 credited 都 MAX | 改 per-device 計數器（影響所有 DMN 來源） |
| 只在複習結束畫面提示（D7） | 無全域 toast；出征軸發放也不跳提示 | `ClozeReviewModal`、HelpMenu | 玩家在 modal 內熟記 | 改成 toast 需新管線 |
| REMOVED + ADDED 取代 latch requirement | MODIFIED 不能刪「Maturity grants nothing yet」scenario | spec | openspec 1.8.0 行為 | — |
| 不使用 SV 31 | 帳本已在 SV 29 就位、DMN key 既有 | 版本號 | 收藏 change 照設計登記帳本 | 若收藏 change 拿掉帳本登記，本 change 要升 SV（31 或當時的下一號） |
