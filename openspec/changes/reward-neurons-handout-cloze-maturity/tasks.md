> 路徑：`app/…` = `apps/neurons-tw/src`，`content/…` = `packages/content-neurons-tw`。新測試一律 node tier（fake-indexeddb、純函式、source-text 守衛）。每條守衛做 mutation probe。

## 0. 前置

- [ ] 0.1 確認 `add-neurons-handout-cloze-collection-and-review` 已 archive：主 spec `neurons-handout-cloze-review` 存在；逐字比對本 change 的 REMOVED / MODIFIED 對象與主 spec 文字一致（不一致就以主 spec 為底重寫 delta）
- [ ] 0.2 確認帳本已就位：`clozeMaturityDrawsCredited` 在 `SYNCED_META_KEYS` 與 `backfill/counters.ts` `MAX_MERGE_KEYS`；production 無讀寫（grep 只命中這兩處）。若不在 → 停下，本 change 需要升 SV（見 design 決策清單最後一列）
- [ ] 0.3 確認 `rateDueClozeCard` 回傳 `{row, matured}`、`countMaturedRows` 存在
- [ ] 0.4 baseline：`pnpm -r typecheck`、`pnpm --filter @study-rpg/neurons-tw test`、`openspec validate --all --strict`

## 1. 常數與共用函式

- [ ] 1.1 `content/src/dmn-types.ts`：`DMN_CLOZE_MATURED_PER_DRAW = 10`（DOGFOOD-TUNABLE 註解），從 content 套件 index export
- [ ] 1.2 `app/lib/services/dmn-trigger.ts`：export `readSeededGrantsTotal`（或移到 `dmn-entitlement.ts`）供發放函式共用；行為不變，既有 DMN 測試全綠
- [ ] 1.3 `status.ts` 的 `countMaturedRows` 判準確認為 `typeof === 'number' && Number.isFinite`

## 2. 發放函式（D2）

- [ ] 2.1 新檔 `app/lib/services/handout-cloze-maturity-draws.ts`：`reconcileClozeMaturityDraws()`（rw 交易 `[handoutClozeState, meta]`；交易內讀全表、ledger、grants、consumes；`owed > 0` 才寫三個 key；回傳 `{credited}`；`console.info`）與 `scheduleBootClozeMaturityDraws()`（`void`、永不 reject、錯誤 log `[cloze-maturity]`）
- [ ] 2.2 不寫任何 DMN 每日計數器、不呼叫 `maybeRunDailyReset`

## 3. 觸發點（D3）

- [ ] 3.1 複習：`lib/handout-cloze/review.ts` 的 `commitClozeRating`（若收藏 change 沒有這層包裝就新增）在 `rateDueClozeCard` 成功且 `matured === true` 後呼叫發放；錯誤只 log；回傳 `{ok:true, drawsCredited}`
- [ ] 3.2 pull：`lib/sync/backfill/index.ts` `runOnPullComplete` 新增一步，排在計數器 MAX 合併與 `backfillDmnDailyCounters` 之後，自己的 try/catch
- [ ] 3.3 載入：在 DMN 初始化處、`migrateDmnGrantsTotal` 之後呼叫 `scheduleBootClozeMaturityDraws()`

## 4. 玩家可見文案（D7）

- [ ] 4.1 `ClozeReviewModal` 結束畫面：本 session `drawsCredited` 加總 > 0 時加一行「熟記獎勵：+n 次 DMN 抽卡」；文字函式 export 並測試
- [ ] 4.2 HelpMenu 講義字卡段：加熟記說明（天數、每 N 張 1 抽、取消收藏 / 下架照算，皆從常數渲染）；改寫「字卡不發任何遊戲獎勵」那句
- [ ] 4.3 HelpMenu DMN 抽卡段：加第三個來源「字卡熟記」（N 從常數渲染，註明不受每日上限）
- [ ] 4.4 source-text 守衛：兩段文案不含 `10`、`21` 字面值（以常數插值）

## 5. 測試（D8、D9）

- [ ] 5.1 `handout-cloze-maturity-draws.test.ts`：spec 全部 scenario（第 10 張發 1、載入回溯 23 → 2、取消收藏 / 下架照算、壞 `maturedAt` 不算、credited 超前不發不降、無 grants key 時以 available + consumes 種子、兩軸達上限仍發且兩軸計數不變）
- [ ] 5.2 上界：從出貨 `handout-cloze.json` 推導卡數 C，每卡造熟記列，跑三次 → `credited === floor(C/N)`、grants 恰增加這麼多；不寫字面值
- [ ] 5.3 兩裝置：兩份 meta + 兩份卡片列，經 `handoutClozeStateAdapter.apply`、`backfillMaxMergeCounters`、`backfillDmnDailyCounters` 互相合併，驗「同里程碑 → 一抽」與「不同里程碑 → 補第二抽」
- [ ] 5.4 經濟界線：收藏 change 的快照測試加「無熟記」前提後仍綠；新增 commit 包裝熟記第 10 張 → `meta` 只有三個 key 各 +1、其他 store 不變
- [ ] 5.5 改寫收藏 change 的「maturity grants nothing」測試為「`rateDueClozeCard` 本身只寫卡片表」，並與 5.4 並存
- [ ] 5.6 守衛：呼叫端集合（`review.ts`、`backfill/index.ts`；boot 函式只在 DMN 初始化處）；唯一寫入者（含 `clozeMaturityDrawsCredited` 的 production 檔扣掉 `tables.ts`、`counters.ts` = 發放函式檔）
- [ ] 5.7 mutation probe：發放改成「每次都寫 `credited = floor(matured/N)`」（會降低）→「credited 超前」紅；判準改 `!== null` →「壞 maturedAt」紅；把熟記發放改成寫 `dmnBehaviorAxisDrawsConsumedToday` → 5.1 兩軸案例紅；在另一檔寫 ledger → 5.6 紅

## 6. 真實瀏覽器驗證（內建 Browser 對 localhost dev）

- [ ] 6.1 以 DEV handle 或 IndexedDB 直接把 9 列設為熟記、第 10 列 interval 18 且到期 → 在 `/cram/cards` 有把握 → 結束畫面顯示「+1 次 DMN 抽卡」、DMN 按鈕可用數 +1、`meta` 三個 key 各 +1
- [ ] 6.2 reload：不再發（冪等）；把 `clozeMaturityDrawsCredited` 刪掉後 reload → 靜默補 1
- [ ] 6.3 到 DMN 頁實際抽一次，確認熟記抽與一般抽行為相同
- [ ] 6.4 HelpMenu 兩段文案正確、數字隨常數

## 7. 收尾與 prod 驗證

- [ ] 7.1 `/simplify`；`/opsx:verify`（clause-level）；typecheck / test / `openspec validate --all --strict` 與 baseline 對照
- [ ] 7.2 `/verify` 與 `/cdx review`（經濟改動，互審必跑）
- [ ] 7.3 commit 等 owner 確認；deploy 屬對外發布，owner 批准才跑；push 後確認 Deploy Cloudflare Pages 綠
- [ ] 7.4 prod：開站 console 無 `[cloze-maturity]` 錯誤；owner 帳號若已有熟記卡，確認首次載入靜默補發數 = `floor(matured/10) − credited`（需 owner 已登入瀏覽器，Chrome MCP；不在時標 `[~]`）
- [ ] 7.5 decision 檔記錄：未使用 SV 31、每日上限決策結果、未驗項目
