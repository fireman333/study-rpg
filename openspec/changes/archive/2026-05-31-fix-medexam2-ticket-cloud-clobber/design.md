## Context

二階（`apps/medexam2-hospital-tw`）cloud sync 把 `gameCounters / gachaStats / tickets / rooms / affinity` 五張 Dexie 表 collapse 成單一 `hospital_state` cloud blob（R2 m2 bundle 的一個 entry）。招募券存在 `tickets` row（`{ available, lastRefreshDay }`）。

兩個交互缺陷造成招募券歸零（詳見 proposal.md）：

1. **Cold-start force-pull 用 cloud 無條件覆蓋本地**：`engine.start()` cold-start 一律 `pullAllNow({force:true})`；`force` 同時 (a) 取消 incremental cursor 過濾（抓全部 row，這是 `fix-account-switch-data-loss` 要的）+ (b) 讓 `applyToLocal` 跳過 LWW 直接覆蓋本地。App boot 早一步在本地發的每日券（尚未 push）被覆蓋退回。
2. **多表 blob 的 LWW 比較不對稱**：push 端用 `max(所有 row updated_at)`，apply 端只比 `gameCounters._updatedAt`。tickets-only 寫入（每日券、banner 首解鎖券）不 bump `gameCounters`，故被舊 cloud blob 退回。

約束：
- 純 client-side（IndexedDB 為 source of truth；cloud 為 additive mirror）。
- 單人 dogfood 為主（owner 多半單裝置），但 owner 會同帳號跨裝置/多分頁。
- 不得回歸 cold-start 既有 incident（spec `Cold-start force-pull bypasses incremental cursor` rationale 記錄多次 phantom data-loss）。
- 不動 Dexie schema version、不動 R2 bundle schema_version、不動 Supabase/D1。

## Goals / Non-Goals

**Goals:**
- 每日招募券在登入時（cold-start force-pull 後）不得淨損 — 顯示後不再歸零。
- 只動 tickets 的發券（每日券 + banner 首解鎖券）在普通 visibility pull 後不被舊 cloud blob 退回。
- 修法對齊推送端與套用端的 LWW 時間戳語意（兩端都用 max）。
- 不回歸 account-switch / migration / conflict-chooser 既有行為。

**Non-Goals:**
- 不改 `force:true` 覆蓋語意（account-switch 先 wipe 本地後仍需 cloud 權威覆蓋）。
- 不把 collapse blob 拆成 per-table 獨立同步（大改寫，超出 hotfix 範圍）。
- 不改 banner-unlock 的 local-only 不同步設計（跨裝置輕微 over-grant 為既有可接受取捨）。
- 不改一階（medexam-tw）— 無每日券、獨立程式碼路徑。

## Decisions

### D1 — Bug 1：在 `onPullComplete` 重跑 `refreshDailyTickets()`（而非搬移 boot 呼叫時機）

cold-start force-pull 完成後，於 sync 引擎 `onPullComplete` callback 重跑一次 `refreshDailyTickets()`。

- `refreshDailyTickets` 已以 `lastRefreshDay` 做 idempotent：`delta = today − lastRefreshDay`，`delta <= 0` 時 no-op。force-pull 把 `lastRefreshDay` 退回 cloud 權威值後重跑，會以正確基準補發（或已發過則 no-op）。
- `onPullComplete` 在 `pullNow` 的 `applyingFromCloud = false` 之後才觸發，故重發的本地 `tickets.put` 會被 Dexie hook 正常追蹤 → 標 dirty → 既有 debounce push 推回 cloud。下一次登入 cloud 的 `lastRefreshDay` 已是今日 → 不再重複發。
- App boot 的首次 `refreshDailyTickets()` **保留**：匿名/未登入玩家沒有 pull、需靠它發券；登入玩家則提供即時 UX（先顯示、被 force-pull 短暫退回、再由 post-pull 補回）。雙呼叫因 idempotent 而安全。

**Alternatives considered:**
- *把 boot 呼叫延後到第一次 pull 之後*：對匿名玩家無 pull 可等，需額外分支判斷 authed 與否；且耦合 boot 流程與 sync 生命週期，較脆弱。否決。
- *讓 force-pull 的 `writeHospitalStateBlob` 特例保留剛發的每日券*：在 force 路徑塞 ticket 合併邏輯，破壞 force 的「cloud 權威」單純語意、易再生 bug。否決。

### D2 — Bug 2：`HOSPITAL_STATE.applyToLocal` 非-force LWW 改用本地五表 `_updatedAt` 的 max

新增 helper `readHospitalStateLocalMaxUpdatedAt(db)`：讀 `gameCounters / gachaStats / tickets`（singleton）+ `rooms / affinity`（array，取 row 最大）的 `_updatedAt`，回傳 max（皆無則 `undefined`）。`applyToLocal` 非-force 分支改為 `cloudIsNewer(cloudRow.updated_at, localMax)`。

- 對齊 push 端 `buildBundleSnapshot` 的 `max(rows.updated_at)`：兩端同基準，blob 整體 LWW 才正確。
- 只動 tickets 時 `tickets._updatedAt = now` 會抬高 localMax → 舊 cloud blob 正確被 skip → 本地新券不被退回。
- 空本地（account-switch wipe 後）localMax = `undefined` → `cloudIsNewer(cloud, undefined) === true` → cloud 正常 apply，account-switch 行為不變。

**Trade-off（單物件 LWW 固有）：** blob 是單一 cloud 物件、單一時間戳，無法 sub-field 合併。改 max 後，只要本地任一 sub-row 比 cloud 新，整個 blob 本地勝、cloud 對其他 sub-row 的變更會被丟。這是 collapse 設計的既有限制；對單裝置 dogfood 而言，max 嚴格優於「只比 gameCounters」（後者會自我覆蓋）。真正的跨裝置 sub-row 合併需拆表，列為 Non-Goal。

**Alternatives considered:**
- *只比 `tickets._updatedAt`*：只救 tickets，gachaStats/rooms/affinity 的 passenger-only 寫入仍裸露。max 一次覆蓋全部 passenger。否決。

### D3 — 不改 cold-start 的 force 語意（記錄已考慮的更根本修法）

更根本的修法（**1B，本次 deferred**）是：cold-start 改為「抓全部 row 但走 LWW apply」而非 force-overwrite — 這其實**符合 spec `Cold-start force-pull bypasses incremental cursor` 既有 Scenario「local Dexie state SHALL be reconciled with the pulled rows via the standard LWW apply path」的字面**，目前實作的 `force` LWW-bypass 反而超出該 scenario。account-switch 已有顯式 `clearLocalSyncTables` 先 wipe 本地（[account-switch.ts](../../../apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts)），故 1B 在語意上安全。

**為何 deferred**：cold-start 是 spec rationale 明載踩過多次 data-loss incident 的高風險區；把 force→LWW 牽動 account-switch / migration / conflict / reset-propagation 多條路徑，超出單一 P1 hotfix 應冒的風險。D1+D2 已涵蓋回報症狀（每日券 + 只動 tickets 的發券）。1B 留作後續獨立 change 評估。

## Risks / Trade-offs

- **[殘餘] 已賺取的券在 push 完成前關閉分頁、再 cold-start**：force-pull 仍會覆蓋未上雲的該券（D1 只補每日券，banner-unlock 因 `bannerUnlockBonusLog` idempotent 不會重發）。→ Mitigation：屬 <3s 競態邊角；徹底解需 1B（已記 D3 deferred）。回報症狀（每日券歸零、visibility pull 退券）已由 D1+D2 解決。
- **[D2 跨裝置] sub-row 變更被整體 blob LWW 丟棄**：collapse 設計固有，max 不新增此風險（只比 gameCounters 同樣有），且修正自我覆蓋。→ Mitigation：單裝置 dogfood 不觸發；跨裝置 sub-row 合併列 Non-Goal。
- **[迴歸] onPullComplete 重跑 refreshDailyTickets 觸發額外 push**：每次 pull 後最多一次 idempotent 檢查 + 至多一筆 tickets 寫入（僅當當日未發）。→ Mitigation：idempotent，已發當日 no-op、不寫不 push。
- **[驗證] cold-start force-pull 仍 bypass LWW**：D2 只改非-force 路徑，故 cold-start 的每日券救援完全靠 D1（post-pull 重發）；需以 Chrome MCP 實測 cold-start 後券回復且持久。

## Migration Plan

- 純 apply 端邏輯 + 一個 post-pull callback；無 Dexie / R2 / Supabase / D1 migration。
- 部署：track-m2 archive → merge main → GH Pages + CF Pages 雙部署（依 CLAUDE.md deploy asymmetry：push 後跑 `gh run list` 確認兩個 workflow 皆綠）。
- Rollback：兩處改動可獨立 revert（`tables.ts` LWW、`useSync.ts` onPullComplete）。無持久化格式變更，revert 後無資料相容問題。

## Open Questions

- 一階 `hospital_state` 等價 blob 是否有相同不對稱？（本次不改、列後續觀察 — 一階無每日券，症狀不顯。）
