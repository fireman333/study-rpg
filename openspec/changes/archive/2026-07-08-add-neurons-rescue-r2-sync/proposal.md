## Why

`add-neurons-single-subject-rescue` 剛 ship 的單科考前救急刻意做成 **device-local（localStorage）零 schema**：救急計畫殼（plan）、pre-reveal 信心紀錄（confidence）、止損覆寫（overrides）、telemetry 全存本機。答題結果本來就走 `recordQuestionResult` → `questionHistory`（已 R2 同步），所以換裝置只損「計畫殼 + 信心 + 覆寫」——但考前衝刺正是最常 iPhone / iPad 交替使用的幾天：在手機上開的救急計畫、累積的信心訊號，到了平板全部歸零，diagnostic blitz 還會重跑一次。Owner 拍板：**讓 plan + confidence 跨裝置同步（走既有 R2 `neurons` bundle）**；telemetry 維持 device-local（純 dogfood flat JSON）。本設計評估後把 overrides 一併納入同步（原本不同步的理由是「不能寫 synced `pinnedAt` 洩漏進日常出征」——救急自有的 R2 key 只在救急 scene 內讀，無此問題；不同步則跨裝置會重複觸發止損、多一次覆寫摩擦）。

## What Changes

- **plan → 同步**：由 localStorage 搬進 Dexie `meta` 單一 key `rescue:v1:plan`，值為 timestamped envelope `{ plan: RescuePlan | null, updatedAt }`。Merge = **envelope 級 LWW on `updatedAt`（latest-action-wins）**，由新的 backfill post-pass 執行（metaAdapter 的 first-write-wins 只是 transport default）；abandon / 考後自動歸檔寫入 **explicit `plan: null` envelope + fresh `updatedAt`**（LWW-null、無 tombstone——類比 pin-queue `pinnedAt: null` dequeue），清除得以跨裝置傳播。「一次一科」gate 從 device-level 升為 **account-level**（在 B 裝置看得到 A 裝置的 active plan，換科仍走既有 confirm-replace）。diagnostic blitz 的「已跑過」標記（原 localStorage `neurons:rescue:blitzDone`）併入 envelope（`blitzDoneAt`），跨裝置不重跑 blitz。
- **confidence → 同步**：per-question 紀錄搬為 **run-scoped** meta keys `rescue:v1:conf:{planCreatedAt}:{questionId}`，值 `{ signal: 'sure' | 'guess', at }`。Merge = **per-key LWW on `at`**（重答重 tap 以最新為準）。Run identity = active plan 的 `createdAt`：開新計畫即自然 re-scope，**不需要任何 delete 寫入**（舊 run 的 key 被 reader 忽略、並隨 sync window 過期淡出）。
- **overrides → 同步**：`rescue:v1:ovr:{planCreatedAt}:{conceptId}`，值 `{ setAt, attemptsAtOverride }`，per-key LWW on `setAt`。到期判定（24h 或 +6 attempts）維持 **read-time derived**（不落 delete），所以被 pull 重灌的過期紀錄天然 inert；attempts 基線是 per-device 的，由 24h 上限兜底。**不寫 `questionFlags.pinnedAt`、不影響日常出征排序**（保留原 spec 的防洩漏承諾）。
- **telemetry 不變**：維持 device-local localStorage flat append-only JSON（明確排除在 synced key family 之外）。
- **新 synced key family**：`isSyncedRescueKey` matcher（rescue service 單一來源、`lib/sync/tables.ts` import——mint 與 filter 永不 drift，鏡射 `isSyncedPrescriptionKey` 模式）加入 `isSyncedMetaKey` 第三 clause。`conf:` / `ovr:` key 以嵌在 key 內的 `planCreatedAt` 做 **trailing 14 天 run-sync window**（+1 天 forward skew 容忍；初值 dogfood-tunable）bound bundle 成長並防 stale-run 復活。
- **新 backfill post-pass** `backfill/rescue.ts`（`backfillRescueLWW`）：plan envelope LWW（含 deterministic tiebreak，pull-order-independent 收斂）＋ conf/ovr per-key LWW；malformed incoming 永不勝出、malformed 已存 plan envelope 直接 drop 讓 reader 重生（鏡射 `backfill/prescription-plan.ts` 的驗證紀律）。註冊進 `backfill/index.ts`。
- **account-switch wipe 加寬**：`rescue:v1:` 全 prefix 為 account-OWNED，加入 `clearLocalSyncedData`（`account-guard.ts`）wipe 範圍（single-source export `RESCUE_META_PREFIX`），in-place reset / reset marker 傳播經同一 helper 自動涵蓋。
- **BREAKING（sync surface）**：R2 bundle `SCHEMA_VERSION` **26 → 27**，reader tolerant（v26 client 讀 v27 bundle 丟棄不認識的 rescue keys、其 omitting push 不會抹掉 v27 狀態——first-write-wins 從不刪 incoming 缺席的 local key；v27 client 讀 v26 bundle 找不到 rescue keys → 保留 local）。
- **不 bump Dexie**：全部騎既有 `meta` kv table（無新 store、無新 index）→ 不觸發 upgrade-fixture 規則（`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。Worker bundle-opaque，零後端變更。
- **一次性遷移**：boot 時把 localStorage `neurons:rescue:v1` 既有 plan / confidence / overrides 種進 meta（保守 timestamp：以 `plan.lastStudiedAt` 為 seed，讓真正較新的雲端動作能贏過遷移的舊殼）；telemetry 留在原 localStorage store。UI 文案「救急計畫與信心紀錄存於本裝置」改為同步語意（telemetry 仍本機）。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-single-subject-rescue`: plan / confidence / override 由 device-local 改為 R2-synced（各自的 merge 語意如上）；「一次一科」升 account-level；blitz once-per-plan 跨裝置成立；新增 rescue synced key family 的 sync-carrier requirement；telemetry 維持 device-local 不變。
- `neurons-cloud-sync`: 「Synced meta set SHALL admit a prefix-matched key family」新增 rescue matcher 為第三個 registered family（contract (b)：post-pass 定義 merge）；「Account-switch wipe covers all synced surfaces」wipe 範圍加入 `rescue:v1:` prefix。

## Impact

- **Schema / sync**：R2 `SCHEMA_VERSION` 26 → 27 + history comment（`apps/neurons-tw/src/lib/sync/r2/bundles.ts`）；`isSyncedMetaKey` 第三 clause（`apps/neurons-tw/src/lib/sync/tables.ts`）；新 `apps/neurons-tw/src/lib/sync/backfill/rescue.ts` + 註冊（`backfill/index.ts`）；**無** Dexie `.version()` bump、無 upgrade fixture、無 Worker 變更。
- **Services**：`apps/neurons-tw/src/lib/services/rescue/rescue-store.ts` 載體換軌（plan / confidence / overrides → `db.meta` 寫穿 + 同步 in-memory mirror + Dexie `liveQuery`；telemetry / export 留 localStorage）＋ 匯出 `RESCUE_META_PREFIX` / `isSyncedRescueKey` / key mint helpers + 一次性 `migrateRescueLocalState()`。meta 寫入自動觸發 push（`useSync.ts` 的 Dexie hooks 由 `NEURONS_ADAPTERS` 派生，`meta` 已在 registry）。
- **Account guard**：`apps/neurons-tw/src/lib/sync/account-guard.ts` `clearLocalSyncedData` 加 `rescue:v1:` prefix delete。
- **UI**：`apps/neurons-tw/src/components/RescueScene.tsx` 兩處文案（383 / 485）改同步語意；一次一科 confirm 文案含跨裝置情境。
- **Tests**：Vitest — plan envelope LWW（雙向收斂 + explicit-null 傳播 + tiebreak）、conf/ovr per-key LWW、window matcher（in/out-window、telemetry 永不入 bundle）、reader tolerance（v26↔v27）、account wipe 涵蓋 rescue prefix、migration 冪等。
- **依賴順序**：本 change 的 `neurons-single-subject-rescue` delta 以 `add-neurons-single-subject-rescue` 的 ADDED requirements 為基底——**必須先 archive 該 change** 再 archive 本 change。
- **medexam-tw / 二階不受影響**（bundle 獨立、Worker 不動）。
