## Why

二階玩家回報：每日招募券（招募券）在登入時會短暫顯示，接著突然歸零；其他功能（quiz、fate card、banner 首解鎖）拿到的券也會偶發歸零。這是 **P1 夯 data-loss** — 直接擋住核心招募 loop，且每次登入重演。

根因是 `hospital_state` cloud blob 同步的兩個交互缺陷（blob 把 `gameCounters / gachaStats / tickets / rooms / affinity` 五張表 collapse 成單一物件同步）：

- **Bug 1（cold-start force-pull 蓋掉當次發的每日券）**：`engine.start()` 在 cold-start 一律 `pullAllNow({force:true})`（[engine.ts:591](../../../apps/medexam2-hospital-tw/src/lib/sync/engine.ts)）。`force` 會讓 `HOSPITAL_STATE.applyToLocal` **跳過 LWW 比較**、直接 `writeHospitalStateBlob` 用 cloud 快照無條件覆蓋本地 tickets row（[tables.ts:188-204](../../../apps/medexam2-hospital-tw/src/lib/sync/tables.ts)）。但 App boot 早一步已先跑 `refreshDailyTickets()` 在本地發券（[App.tsx:92](../../../apps/medexam2-hospital-tw/src/App.tsx)），且尚未經 3 秒 debounce push 上雲。force-pull 落地時把剛發的券退回 cloud 舊值（通常 `available=0`、`lastRefreshDay` 仍停在昨天），於是「顯示後突然歸零」，且 `lastRefreshDay` 被退回導致每次登入重演。

- **Bug 2（多表 blob 的 LWW 時間戳不對稱）**：推送端以 `updated_at = max(所有 row 的 updated_at)` 寫 blob（[bundles.ts:88](../../../apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts)），但 `applyToLocal` 的非-force LWW 只拿 cloud `updated_at` 比 **本地 `gameCounters._updatedAt` 單一欄位**（[tables.ts:195-199](../../../apps/medexam2-hospital-tw/src/lib/sync/tables.ts)）。只動 `tickets`、不順手寫 `gameCounters` 的發券路徑（**每日券** `refreshDailyTickets` + **banner 首解鎖券** `grantBannerUnlockBonus`）拿到的券，其 `gameCounters._updatedAt` 仍是舊值，因此任何「比上次 `gameCounters` 寫入新」的 cloud blob（push 時間天生領先本地寫入時間）在普通 visibility pull 時就會把本地剛拿到的券退掉。相對地 quiz / fate card 的發券同 txn 也寫了 `gameCounters`（reputation/revenue），`_updatedAt` 被一起 bump，所以較不受影響 — 這解釋了為何有些券會掉、有些不會。

## What Changes

- **Bug 1 fix**：cold-start force-pull 結束後，於 sync 引擎 `onPullComplete` callback 內**重跑一次 `refreshDailyTickets()`**。此函式本身以 `lastRefreshDay` 做 idempotent，post-pull 重發會以 cloud 權威的 `lastRefreshDay` 為基準正確補發（或在已發過時 no-op），補發的本地寫入再經既有 dirty-push 推回 cloud。App boot 的首次呼叫保留（匿名/未登入玩家與即時 UX 仰賴它）。
- **Bug 2 fix**：`HOSPITAL_STATE.applyToLocal` 的非-force LWW 比較，從「只比 `gameCounters._updatedAt`」改為「比**本地五張 collapse 表 `_updatedAt` 的 max**」（`gameCounters / gachaStats / tickets / rooms / affinity`），對齊推送端的 `max(rows.updated_at)` 語意。如此只動 tickets 的發券會讓 blob 本地邏輯時間戳前進，不再被舊 cloud blob 退掉。`force:true` 路徑（account-switch 先 wipe 本地後的權威覆蓋）行為不變。
- 不改 `force` 覆蓋語意、不改 cold-start 一律 force-pull 的既有 requirement、不動 banner-unlock 的 local-only 設計。
- Vitest 單元測試覆蓋：(a) blob LWW max 比較（tickets-only 新寫不被舊 cloud 退）、(b) `refreshDailyTickets` 在 `lastRefreshDay` 被退回後重跑會正確補發、已發當日重跑 no-op。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `recruitment-gacha`: 每日招募券發放 requirement 新增 cloud-sync 存活保證 — 登入時的每日 +1 在 cold-start force-pull 後不得淨損（post-pull 重新評估 `lastRefreshDay` 補發）。
- `cloud-sync`: `hospital_state` 多表 collapse blob 的 LWW apply requirement 修正 — 非-force 比較基準改為本地所有 contributing 表 `_updatedAt` 的 max，使 passenger-only 寫入（tickets/gachaStats/rooms/affinity）不被舊 cloud blob 退回。

## Impact

- **Code**（二階 only，track-m2）：
  - `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — `HOSPITAL_STATE.applyToLocal` LWW 比較改 max；新增 local-max-`_updatedAt` helper。
  - `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — `onPullComplete` 內新增 `refreshDailyTickets()` 呼叫。
  - 既有 `App.tsx` boot 呼叫、`refreshDailyTickets`（schema.ts）、`grantBannerUnlockBonus` 不需改。
- **Tests**：`apps/medexam2-hospital-tw/src/__tests__/` 新增 / 擴充 sync LWW + daily-ticket idempotency 測試。
- **無 schema migration**（不動 Dexie version）、**無 R2 bundle schema_version bump**（純 apply 端 LWW 邏輯修正，blob 格式不變）、**無 Supabase / D1 migration**。
- **一階（medexam-tw）不受影響**（無每日券機制；其 `hospital_state` 等價 blob 為獨立程式碼路徑，本次不改，但同類不對稱可列後續觀察）。
