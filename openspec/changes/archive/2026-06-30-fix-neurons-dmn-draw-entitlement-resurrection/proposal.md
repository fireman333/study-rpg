## Why

神經元玩家回報：累積 11 張 DMN 抽卡券（`dmnDrawsAvailable`）抽掉後次數沒下降、一直回到 11，懷疑「資料庫沒記住我抽掉的券」。

根因是**實作偏離既有 spec**。`neurons-dmn-fate-cards` 的「DMN daily counters SHALL merge」requirement（[spec.md:102-104](openspec/specs/neurons-dmn-fate-cards/spec.md:102)）早已明定 `dmnDrawsAvailable` **SHALL NOT** 用 plain LWW/MAX、而應走 `dmnGrantsTotal − dmnConsumesTotal`（兩個 monotonic-MAX 計數器）的衍生投影。但實作 [dmn-daily.ts:90-101](apps/neurons-tw/src/lib/sync/backfill/dmn-daily.ts:90) 卻直接對 raw `dmnDrawsAvailable` 做 `Math.max(local, incoming)`——這正是 spec 禁止的做法。因為 `dmnDrawsAvailable` 是**雙向**計數器（grant +、consume −），對它取 MAX 等於讓「消耗」這個方向永遠無法向下傳播：一次抽卡（11→0）只要遇到一次 pull 讀到雲端仍是舊高值（`MAX(0,11)=11`）就被還原，push 又寫本機真值（[engine-r2.ts:99](apps/neurons-tw/src/lib/sync/r2/engine-r2.ts:99) 不做 merge）把 11 寫回雲端 → 永久卡住。單裝置只要「抽卡後、debounce push 前」遇到一次 startup/focus pull 就中招。

## What Changes

- **實作改為 spec 既定的衍生投影**：`dmnDrawsAvailable` 變成**衍生顯示值** = `clamp(dmnGrantsTotal − dmnConsumesTotal, ≥0)`，不再參與跨裝置 MAX 合併。
  - `dmnConsumesTotal` 沿用既有 `dmnLifetimeDrawsConsumed`（兩個 consume 點 [dmn-fate-card.ts:205](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:205) / [:241](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:241) 已各 +1）。
  - 新增 `dmnGrantsTotal`，兩個 grant 點各 +N（[dmn-trigger.ts:133](apps/neurons-tw/src/lib/services/dmn-trigger.ts:133) 行為軸、[:181](apps/neurons-tw/src/lib/services/dmn-trigger.ts:181) 出征里程碑）。
- **`dmnLifetimeDrawsConsumed` 納入 MAX-merge**：目前它只在 `SYNCED_META_KEYS` 白名單、實際走 first-write-wins（[tables.ts:427](apps/neurons-tw/src/lib/sync/tables.ts:427)），跨裝置不收斂。投影正確性要求兩個計數器都 monotonic-MAX。
- **reader-tolerance seeding（最高風險點）**：pull/merge 到「舊 bundle 無 `dmnGrantsTotal` 欄位」時，grants 必須以 `available + lifetimeConsumed` 反推、**不可當 0**（否則衍生負值被 clamp 成 0、清掉玩家的券）。本機側與 incoming 側都套同一條 seed 規則。
- **既有玩家一次性遷移**：`dmnConsumesTotal = 現有 dmnLifetimeDrawsConsumed`、`dmnGrantsTotal = 現有 dmnDrawsAvailable + dmnLifetimeDrawsConsumed`（衍生 `available` 不跳動，玩家無感）。
- **R2 `SCHEMA_VERSION` 22 → 23**（[bundles.ts:175](apps/neurons-tw/src/lib/sync/r2/bundles.ts:175)）+ reader-tolerance：舊 client 丟未知 `dmnGrantsTotal` 後不得反過來把新計數器 strip 回 push。
- **bug-report / debug 輸出加入 `dmnGrantsTotal`**（新 source-of-truth）。
- **採 scalar MAX 投影、非 per-client PN-counter**：明確接受並文件化「跨裝置同時各抽一張會 MAX 退一張券」的限制——偏向玩家、永不透支，與 spec 既有接受語意（[spec.md:123](openspec/specs/neurons-dmn-fate-cards/spec.md:123)）一致。次要獨立路徑「全 pool 收集滿時 `drawDmnCard` return null 不扣券」（[dmn-fate-card.ts:167](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:167)）為既有正確行為、不在本次範圍。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neurons-dmn-fate-cards`: 「DMN daily counters SHALL merge across devices via documented monotonic semantics」requirement —— 把 `dmnGrantsTotal` / `dmnConsumesTotal` 衍生投影由「permitted 簡化實作」**升格為 mandatory canonical 來源**；`dmnDrawsAvailable` 正式定義為衍生顯示值（非獨立合併欄位）；新增 reader-tolerance seeding（舊 bundle 無 grants 欄位以 `available + consumes` 反推）與既有玩家一次性遷移的 normative 條款與 scenario。

## Impact

- **Code（持久化 / sync）**：
  - `apps/neurons-tw/src/lib/sync/backfill/dmn-daily.ts`（`dmnDrawsAvailable` 由 raw MAX 改為 grants/consumes MAX-merge + seed + derive）
  - `apps/neurons-tw/src/lib/sync/tables.ts`（`SYNCED_META_KEYS` 加 `dmnGrantsTotal`）
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts`（`SCHEMA_VERSION` 22→23 + 註解）
  - `apps/neurons-tw/src/lib/services/dmn-trigger.ts`（兩個 grant tx 同時寫 `dmnGrantsTotal` + 衍生 `dmnDrawsAvailable`；`readDmnMeta` 加 grants；一次性遷移 helper）
  - `apps/neurons-tw/src/lib/services/dmn-fate-card.ts`（兩個 consume tx 同時寫衍生 `dmnDrawsAvailable`，`dmnLifetimeDrawsConsumed` 已有）
- **持久化保證**：**不 bump Dexie schema**（純新增一個 meta key-value，沿用既有 `meta` table）→ 無需 Dexie upgrade fixture。R2 bundle 格式 bump（reader-tolerant）。
- **UI**：零改動。`useDmnStatus.ts` / `DmnDrawProgressRing.tsx` / `readDmnMeta` 仍讀 meta 的 `dmnDrawsAvailable`（現在每次 local grant/consume 與 pull-merge 後都寫回衍生值）。
- **Bug-report**：debug context payload 加 `dmnGrantsTotal`。
- **Tests**：`dmn-daily-counters-merge.test.ts` + `dmn-draw-mechanics.test.ts` 更新/新增（seeding / 衍生 / 冪等 / schema 版本 / 收集滿不扣券）。
- **平行 session**：branch `track-neurons`。觸碰 sync backfill / tables / bundles / dmn-trigger / dmn-fate-card —— 動手前經 session-bus 確認與 in-flight homepage UX / PDF 工作零重疊。
