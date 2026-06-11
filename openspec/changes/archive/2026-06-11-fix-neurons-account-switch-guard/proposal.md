# Proposal: fix-neurons-account-switch-guard

## Why

neurons-tw 的登出只呼叫 `supabase.auth.signOut()`，本機 Dexie 資料原封不動且沒有任何擁有者標記。同一台裝置換另一個 Google 帳號登入後，sync engine 直接以新帳號啟動：initial force-pull 把新帳號的雲端資料 merge 進前一個帳號的本機資料，下一次 push 就把兩個帳號的進度永久混在一起 — neurons 的 merge 規則幾乎全是 monotonic（MAX / UNION / first-write-wins），污染寫入雲端後**不可逆**。app 已公開給同學使用，多人共用裝置（圖書館電腦、借同學手機）是真實場景。

順手修一個同模組的既有漂移：`useSync.ts` 的 `SYNCED_TABLES`（Dexie hook 監聽清單）只涵蓋 7 個表，但 adapter registry 已成長到 20 個表。純寫入未監聽表的操作（題庫頁收藏、神經元改名、「太簡單／我亂猜」flag）不會觸發 debounced push，只能搭其他操作的便車或靠 beforeunload 的 fire-and-forget（幾乎來不及完成）。

## What Changes

- **本機資料擁有者標記**：localStorage 記錄 `lastSyncedUserId`（最後一次啟動 sync engine 的 user.id）。匿名遊玩不寫標記（首次登入的 upload-merge 仍是合法場景，行為不變）。
- **帳號切換 gate**：登入後、sync engine 啟動前，比對 `user.id` 與標記。不符 → 跳確認對話框（繁中）：「本機有另一個帳號的遊戲資料，繼續將**清除本機資料**並改用你的雲端存檔」。確認 → 清空本機 20 個 synced tables（+ synced meta keys）→ 寫新標記 → 啟動 engine（force pull）。取消 → 自動登出，本機資料保持原樣。
- **接受未同步變更遺失**：清空前不做本機快照備份（前帳號未 push 的變更時間窗僅數秒，已在對話框警告；維持零 Dexie schema bump）。
- **登出行為不變**：登出仍保留本機資料（既有 auth spec 行為），標記也保留 — 同帳號重新登入無感。
- **push-trigger 監聽清單從 adapter registry 派生**：`SYNCED_TABLES` 改為 `NEURONS_ADAPTERS.map(a => a.name)` 派生（單一來源），20 個表的寫入全部觸發 `schedulePush`，清單不再漂移。

## Capabilities

### New Capabilities

- `neurons-cloud-sync`: neurons-tw sync engine 的帳號完整性與觸發涵蓋 — 本機資料擁有者標記、帳號切換偵測與清空流程、push-trigger 監聽清單與 adapter registry 的單一來源約束。（為後續 `add-neurons-account-reset` 的 reset-propagation / 清空帳號需求預留同一個 capability 作為家。）

### Modified Capabilities

（無 — 收藏 / flag / 改名的跨裝置同步需求已存在於 `neurons-mode` spec，本 change 修的是實作未達 spec 的漂移，不改需求文字。）

## Impact

- `apps/neurons-tw/src/lib/sync/useSync.ts` — gate 邏輯插入 engine mount 前；SYNCED_TABLES 派生改寫
- `apps/neurons-tw/src/lib/sync/tables.ts` — 不動 adapter；僅作為派生來源 import
- 新檔 `apps/neurons-tw/src/lib/sync/account-guard.ts`（標記讀寫 + 清空 helper `clearLocalSyncedData`）
- 確認對話框 UI（輕量 modal 或 `window.confirm` 起步，design 階段定）
- **零 Dexie schema bump、零 R2 SCHEMA_VERSION bump、零 Worker 改動、零 SYNCED_META_KEYS 改動** — 純 client 邏輯 + localStorage
- 測試：Vitest 覆蓋 gate 三分支（無標記 / 同 user / 異 user）+ 清空 helper 涵蓋全部 20 表 + 派生清單 == adapter registry 的鎖定測試
