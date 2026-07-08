## Context

`add-neurons-single-subject-rescue`（已 ship、未 archive）把救急狀態全放 device-local localStorage（`neurons:rescue:v1`，`apps/neurons-tw/src/lib/services/rescue/rescue-store.ts`）：`plan {familyId, examDate, dailyMinutes, createdAt, lastStudiedAt}`、`confidence: Record<questionId, 'sure'|'guess'>`、`overrides: Record<conceptId, {setAt, attemptsAtOverride}>`、`telemetry[]`，外加 blitz 標記 `neurons:rescue:blitzDone`（值 = plan.createdAt）。Owner 現要求 plan + confidence 跨裝置同步（走 R2）；telemetry 維持本機；overrides 由本設計評估。

**現有 sync 架構（code 實查，2026-07-08）**：

- R2 `SCHEMA_VERSION = 26`（`lib/sync/r2/bundles.ts:230`；v26 = prescription tiers 2026-07-07）→ 本 change 取 **27**。
- Dexie 最新 `.version(20)`（`lib/db.ts:887`）。bump 需 v19→v20 upgrade fixture + CI `dexie-fixture-lint`（`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）——本設計**不 bump**。
- 三種 merge 語意 precedent：
  - **per-row LWW**：`questionFlags` adapter（`lib/sync/tables.ts:802-864`；`pinnedAt` explicit-null dequeue + preserve-on-omission at :847-856）、`instanceNicknames`（:1015）、`inventory`（:1062）。
  - **monotonic-OR / UNION**：`questionHistory.everWrong`（:946）、`dmnEventLog`（:603）、`neuronInstances.consumedAt`（:960）、`equipment`（:1109）、`firstPullFamilies` union（`backfill/first-pull.ts`）。
  - **MAX-merge / date-derived**：`familyMastery` counters（:168）、maze per-family counters（`backfill/counters.ts`）、DMN 雙 monotonic counter（`backfill/dmn-daily.ts`，v23）、prescription `plan:{date}` earliest-createdAt MIN-LWW（`backfill/prescription-plan.ts:24-62`）+ date-windowed matcher `isSyncedPrescriptionKey`（`lib/services/prescription.ts:171-186`）。
- meta 路徑：`metaAdapter` snapshot/apply 共用 `isSyncedMetaKey`（`tables.ts:512-518` = 枚舉 allowlist ∪ imprint prefix ∪ prescription matcher）；transport default = first-write-wins（:520-556）；非 first-write-wins 語意由 `backfill/index.ts` 的 onPullComplete post-pass 依序執行（error-isolated steps）。
- Push 觸發：Dexie hooks 由 `NEURONS_ADAPTERS` 派生逐 table 掛（`lib/sync/useSync.ts:36-40, 126）——`meta` 在 registry 內，rescue 改寫 `db.meta` 即自動 schedulePush；**localStorage 寫入不觸發 sync**（現況 rescue 完全繞過引擎的根因）。
- Account guard：`clearLocalSyncedData`（`lib/sync/account-guard.ts:88-104`）wipe adapter tables + `SYNCED_META_KEYS` + `PRESCRIPTION_META_PREFIX` 全 prefix；`honorResetMarker` 復用同一 helper。

## Goals / Non-Goals

**Goals:**
- plan + confidence（+ overrides）跨裝置經 R2 `neurons` bundle 收斂；換裝置續刷不掉計畫殼、不重跑 blitz、信心訊號不歸零。
- 對齊 repo「零 schema 優先」：不 bump Dexie、不加 TableAdapter；騎 `meta` kv + registered matcher + backfill post-pass（prescription tiers 同款、上一個 SV bump 的既定路徑）。
- 清除（abandon / archive / 換科 re-scope）可傳播且**永不復活**（LWW-null + run-scoped keys + window 三道防線；教訓：DMN draw resurrection、pin-queue no-tombstone 設計）。
- telemetry 維持 device-local（明確排除於 synced family）。

**Non-Goals:**
- 不做多 plan 並行 / per-device 各自 plan（account-level 一次一科是產品語意）。
- 不同步 telemetry、不同步當日佇列（佇列是 runtime 派生，從已同步輸入決定性重建）。
- 不動 Worker / presign / D1 / leaderboard；不動 `questionFlags.pinnedAt` 與日常出征。
- 不做 rescue 專用 conflict UI（LWW 靜默收斂；風險見 Risks）。

## Decisions

### D1. 載體 = `meta` kv + registered key family（不開新 Dexie table）
plan / confidence / overrides 搬進既有 `meta` table，key namespace `rescue:v1:`，經 `isSyncedRescueKey` matcher 加入 `isSyncedMetaKey` 第三 clause（single-source 於 rescue service、`tables.ts` import——鏡射 `isSyncedPrescriptionKey`）。**Alternatives**：(a) 新 Dexie table `rescueState` + 新 TableAdapter → Dexie v21 bump + upgrade fixture + adapter/registry/wipe/hook 全鏈路動——工時與風險最高，且資料形狀（單 plan + 小 key-value 集）本來就是 kv；(b) 留 localStorage、另開專用 R2 blob → 繞過整套引擎（ETag 單飛、push lock、reset 傳播、account gate 全要重做），否決。`meta` 寫入自動吃到 Dexie hook → schedulePush、`clearLocalSyncedData` 的 prefix wipe、reset marker 傳播，全部免費。

### D2. plan merge = envelope 級 LWW on `updatedAt`（latest-action-wins）+ explicit-null 清除
單一 key `rescue:v1:plan`，值 `{ plan: RescuePlan | null, updatedAt }`（`RescuePlan` 增 `blitzDoneAt?: number`，見 D6）。start / replace / touchLastStudied / abandon / archive 每個動作都寫全 envelope + fresh `updatedAt`。abandon / archive = `plan: null` + fresh `updatedAt`（LWW-null、無 tombstone——同 `pinnedAt` dequeue 紀律，`tables.ts:847-856`）。merge 由 post-pass 做 envelope LWW；**tie（同 ms）以 serialized envelope 的字典序做 deterministic total order**，保證任意 pull 順序雙向收斂（semilattice；教訓來自 prescription `pickPlanMinLWW` 的 `(createdAt, seed)` totally-ordered pair）。
- **Alternative A（earliest-createdAt-wins MIN-LWW，同 prescription plan）**：否決——prescription plan 是「per-date 冪等日任務、最早開日者最可能已在進行」；rescue plan 是**可被玩家刻意 replace** 的長生命物件，MIN-LWW 會讓 replace 永遠輸給舊 plan、換科無法傳播。
- **Alternative B（lastStudiedAt 最近者勝）**：否決——abandon 沒有 lastStudiedAt 可比、且 idle 裝置的舊 touch 可能蓋掉新 start；不如統一「最後一個使用者動作勝」。
- **Alternative C（per-device plan、不 reconcile）**：否決——違反 account-level 一次一科的產品語意，且 confidence run-scope 需要單一 authoritative `createdAt`。
- 已知 race（記錄為接受的行為）：A 裝置 abandon（t2）後 B 裝置離線繼續作答 touch（t3>t2）→ 收斂回 active（B 的 study 是較晚的使用者動作，latest-action-wins 語意一致）。

### D3. run identity = `planCreatedAt` 嵌 key；conf / ovr run-scoped + trailing window
confidence / override key 內嵌所屬 plan 的 `createdAt`（epoch ms）：`rescue:v1:conf:{planCreatedAt}:{questionId}`、`rescue:v1:ovr:{planCreatedAt}:{conceptId}`。reader 一律以 active plan envelope 的 `createdAt` scope 讀取。效果：**「per-run 清空」零 delete 寫入**——開新 plan（新 createdAt）即自然 re-scope，舊 run keys 被忽略；而 first-write-wins 永不刪 key 的復活問題（若沿用 unscoped key + 清空語意，每次 start 要對舊 key 逐一寫 LWW-null，O(N) 且易漏）整組消失。**跨裝置「同一個 run」的界定 = 同一 `planCreatedAt`**（ms epoch，跨裝置同 ms 碰撞機率可忽略，且即便碰撞也由 D2 envelope LWW 先收斂 plan）。
Window：`isSyncedRescueKey` 只讓 `planCreatedAt ∈ [now − 14d, now + 1d]` 的 conf/ovr key 進 snapshot / apply（+1d 容忍 forward clock skew；同 prescription today±1 的 skew 紀律）。plan 生命週期上限 ≈ 8 天（D≤7 + examDate+1 歸檔），14 天綽綽有餘、bound bundle 成長、並讓 stale bundle 裡的舊 run key **無法**經任何路徑復活（`prescription-plan.ts:30` 同款「out-of-window 永不復活」不變量）。本機 GC 只准刪 **out-of-window** key（in-window 的本機刪除會被下次 pull 重灌）。

### D4. confidence merge = per-key LWW on `at`
值 `{ signal: 'sure' | 'guess', at: epochMs }`。同 run 內重答重 tap（止損 re-test、隔日回收）以**最新 tap 為準**——priority 公式要的是「最近一次 pre-reveal 信心」。metaAdapter first-write-wins 為 transport default，post-pass `backfillRescueLWW` 逐 key 以 `at` 收斂（tie → serialized 字典序，deterministic）。**Alternative（write-once first-tap-wins，純 first-write-wins 免 post-pass）**：否決——高信心答錯被糾正後再答（低信心）是 hypercorrection 流程的核心路徑，first-tap-wins 會把已修正的題永遠釘在 ×1.5。

### D5. overrides 同步（run-scoped，per-key LWW on `setAt`；到期 read-time derived）
`{ setAt, attemptsAtOverride }` per-key LWW on `setAt`。**採同步**的理由：(1) 原 spec 不同步的唯一動機是「不能寫 synced `pinnedAt` 洩漏進日常出征」——rescue 自有 key 只在救急 scene 讀，無洩漏面；(2) 不同步則 iPad 會對 iPhone 已覆寫的 concept 重新止損，考前多一次摩擦。**到期（24h OR +6 attempts）維持 read-time derived**（`isOverrideExpired` 純函式，現行即如此）：本機刪除過期紀錄後被 pull 重灌也 inert（reader 每次都重評），re-override（新 `setAt`）經 LWW 勝出。已知折衷：`attemptsAtOverride` 基線是 per-device 的（attempts 計數本地派生），跨裝置 attempts 規則失準——由 24h 硬上限兜底，接受。**Alternative（維持 device-local）**：保留為 owner 可拍板的退路（Open Questions #3），退路下本設計其餘部分不變。

### D6. blitz 標記併入 plan envelope（跨裝置不重跑 blitz）
`blitzDoneAt?: number` 進 `RescuePlan`，取代 localStorage `neurons:rescue:blitzDone`。B 裝置 pull 到已 blitz 的 plan → 直接從已同步的 `questionHistory` + confidence 決定性重建佇列，不重跑診斷（考前時間最貴；也對齊原 spec D9「同一 plan 診斷只跑一次」的精神）。replace plan（新 createdAt、`blitzDoneAt` 缺席）天然 re-arm blitz——與現行 createdAt-keyed 行為等價。**Alternative（標記留 device-local，每台各跑一次 blitz）**：否決——重複診斷浪費 10-25 題的考前時間，且兩台的戰情圖基於同一份 synced history，第二次 blitz 資訊增量趨近零。

### D7. telemetry 維持 device-local
留在 localStorage 原 store（append-only + cap 4000 + 一鍵 export）。`isSyncedRescueKey` 對任何非 `plan` / `conf:` / `ovr:` 的 `rescue:v1:*` key 一律 false（防未來手滑把 telemetry 塞進 meta 就自動 synced）。

### D8. schema 影響：R2 SV 26 → 27；不 bump Dexie；wipe 加寬
- **R2 `SCHEMA_VERSION` 26 → 27**（`bundles.ts` + history comment）。Additive + reader-tolerant：v26 client 讀 v27 bundle → 不認識的 rescue keys 被 `isSyncedMetaKey` 拒收（其後 omitting push 也抹不掉 v27 local state——first-write-wins 從不刪 incoming 缺席的 key）；v27 client 讀 v26 bundle → 無 rescue keys → local 保留。Worker schema-version guard 沿用（v22 起的 409 fence 行為不變）。
- **Dexie 不 bump**：`meta` table 自 v1 存在、rescue keys 無 index 需求 → 不觸發 upgrade-fixture 規則。
- **`SYNCED_META_KEYS` 不加枚舉項**：走 matcher clause（同 imprint / prescription）。
- **account-guard**：`RESCUE_META_PREFIX = 'rescue:v1:'`（rescue service 單一來源 export）加入 `clearLocalSyncedData` 的 meta prefix wipe——rescue 狀態是 account-OWNED（換帳不得混血別人的考前計畫）；in-place reset / cross-device reset marker 經同一 helper 自動涵蓋。
- **backfill**：新 `backfill/rescue.ts`（`backfillRescueLWW`）註冊為 `backfill/index.ts` 新 step（error-isolated，位置在 prescription-plan 之後即可，無跨 step 依賴）。

### D9. 遷移：localStorage → meta 一次性種入（保守 timestamp）
boot（rescue 模組初始化）時：若 meta **尚無** `rescue:v1:plan` envelope 且 localStorage `neurons:rescue:v1` 有 plan → (1) 寫 envelope，`updatedAt = plan.lastStudiedAt`（**保守**：雲端任何真正較新的動作都能贏過遷移殼；用 `Date.now()` 會讓每台遷移中的舊裝置輪流蓋掉雲端，否決）；(2) confidence 逐 qid 種 `conf:{createdAt}:{qid}`，`at = plan.lastStudiedAt`（原 store 無 per-record timestamp——本 change 起新寫入才帶真 `at`）；(3) overrides 種 `ovr:{createdAt}:{conceptId}`（`setAt` 原本就有，直接沿用為 LWW timestamp）；(4) `blitzDone` localStorage 標記命中 `createdAt` → envelope `blitzDoneAt = plan.lastStudiedAt`。完成後從 localStorage blob 剝除 plan / confidence / overrides 欄位（telemetry 保留原地）——欄位缺席即遷移完成標記，冪等。若 meta **已有** envelope（先 pull 到雲端 plan）→ 跳過遷移、丟棄本機殼（答題結果從未依賴殼）。

### D10. store 實作換軌（sketch，非 spec 面）
`rescue-store.ts` 保留同步 read facade（`useSyncExternalStore`）：in-memory mirror 於 rescue 入口 hydrate 自 `db.meta`，寫入走 write-through（mirror + `db.meta.put`，put 觸發 Dexie hook → schedulePush），跨 tab / pull 更新經 Dexie `liveQuery` 訂閱回灌 mirror + notify listeners。telemetry / export 函式不動。

## Merge 語意總表

| 狀態 | 載體（meta key） | Merge | 清除語意 | Precedent |
|---|---|---|---|---|
| plan（含 `blitzDoneAt`） | `rescue:v1:plan`，envelope `{plan\|null, updatedAt}` | envelope LWW on `updatedAt`（post-pass；tie = serialized 字典序） | explicit `plan: null` + fresh `updatedAt`（LWW-null，無 tombstone） | `activeSquad` envelope LWW（`tables.ts:452`、`backfill/active-squad.ts`）；`pinnedAt` LWW-null（`tables.ts:847-856`） |
| confidence | `rescue:v1:conf:{planCreatedAt}:{qid}`，`{signal, at}` | per-key LWW on `at`（post-pass） | 免清除——run-scoped，換 run 即 re-scope；window 淡出 | prescription per-qid date-windowed keys（`prescription.ts:171`）；representatives LWW post-pass |
| overrides | `rescue:v1:ovr:{planCreatedAt}:{conceptId}`，`{setAt, attemptsAtOverride}` | per-key LWW on `setAt`（post-pass）；到期 read-time derived | 免清除——同上；過期紀錄 inert | 同上 + `isOverrideExpired` 純函式（`rescue-stoploss.ts`） |
| telemetry | localStorage（不變） | 無（device-local） | — | — |
| 當日佇列 / 戰情圖 | runtime 派生（不落地） | 無——從 synced 輸入決定性重建 | — | 原 change D7 |

## Migration Plan

- 純 additive sync-surface change：R2 SV 26→27（reader tolerant）、無 Dexie 遷移、無 Worker / D1 / 後端變更。部署走既有 CF Pages pipeline。
- 舊 client（v26）共存：讀 v27 bundle 丟 rescue keys；push 後 Worker schema-version fence 行為與 v25→v26 過渡一致（SPA reload 自癒）。
- 既有使用者：D9 一次性遷移；rollback = 移除 matcher clause + post-pass 註冊（meta 內殘留 `rescue:v1:*` keys 無害——不再入 bundle、reader 走回 localStorage 路徑前需一版 revert build，殘留 key 由 account wipe 或後續清理帶走）。
- 驗證：Vitest（envelope LWW 雙向收斂 + null 傳播 + tiebreak、conf/ovr LWW、window matcher in/out、reader tolerance v26↔v27、wipe 涵蓋、migration 冪等）+ Chrome MCP 雙裝置模擬（兩個 profile / storage partition：A start → B 收斂 → B confirm-replace → A 收斂 → abandon 傳播 → blitz 不重跑）。dev 環境 R2 push 需在 prod 驗（`neurons-dev-r2-push-fails-localhost`）。

## Risks / Trade-offs

- **plan「touch 復活 abandon」race（D2）** → 接受並文件化：latest-action-wins 下離線繼續作答視同「還在用」，語意自洽；發生窗僅剩離線期。
- **clock skew 歪斜 LWW** → 同帳號自有裝置、skew 通常秒級；tie/近 tie 由 deterministic tiebreak 保收斂（不保「正確」，但保不擺盪）；prescription/representatives 同風險等級，實跑無事故。
- **conf keys 造成 bundle 膨脹** → run-scoped + 14d window；單 run 上限 ≈ 數百 key × ~60 bytes ≈ 數十 KB gzip 前，可接受；window 可收緊（Open Q #1）。
- **overrides attempts 基線 per-device** → 24h 上限兜底；telemetry 照記，dogfood 觀察是否需把 attempts 累計也搬 synced（v2）。
- **migration timestamp 保守（lastStudiedAt）輸給雲端舊 plan** → 極端情境：雲端有較新 updatedAt 的 stale plan（另一台已遷移）→ 收斂到它——正確行為（那台的動作確實較新）；反向（遷移殼蓋掉雲端新動作）被保守 timestamp 排除。
- **post-pass 漏 error isolation** → 照 `backfill/index.ts` 既有 try/catch step 模式，單 step 失敗不斷鏈。

## Open Questions

1. **run-sync window 14 天**初值是否收緊到 7 天（bundle 更瘦 vs 極端長 plan + 補考重開的邊角）？dogfood-tunable，owner 拍板。
2. **blitzDoneAt 同步（D6）**：owner 是否反而想讓第二台跑「縮短版 re-diagnostic」暖機？若是，改回 device-local 標記即可（envelope 欄位保留、reader 忽略）。
3. **overrides 同步（D5）採納與否**：本設計採同步；若 owner 認為覆寫屬「當下這台的手感」，退回 device-local 只需移除 `ovr:` family，其餘不動。
4. **plan 衝突 latest-action-wins（D2）**：「兩台離線各開不同科」收斂到較晚者——owner 是否接受（vs 彈 conflict UI 讓玩家選）？
5. **舊 localStorage 殼遷移後即剝除**：是否要多留一版（read-only fallback）再剝，換 rollback 保險？（成本：雙讀路徑一版。）
