# Proposal: add-neurons-account-reset

## Why

neurons-tw 沒有「清空帳號資料」功能 — 二階有完整的「♻ 重置此帳號進度」（HelpMenu 入口 + 雲端/本機/排行榜三面清除 + 跨裝置 reset 傳播），neurons 一項都沒有。玩家想砍掉重練、或要求移除雲端資料時，目前無路可走（排行榜的 `deleteLeaderboardRow` service 函數存在但沒接任何 UI）。

neurons 的 merge 規則幾乎全 monotonic（MAX / UNION），**沒有傳播機制的清空會被任何一台留有舊資料的裝置在下次 push 時整個復活** — 所以本 change 必須同時解決「清什麼」與「清了之後不被復活」兩件事。

Owner 已定案（2026-06-11）：清除範圍**只清 neurons**（同帳號的二階存檔不動）；實作路線走**空 bundle 覆寫 + `reset_at` 標記**（零 Worker 改動，零二階風險）；順帶發現的既有隱患「二階按重置會連 neurons 雲端存檔一起刪（Worker `/reset` 全 prefix 刪）」記入 follow-up 不在本 change 修。

## What Changes

- **HelpMenu「♻ 重置此帳號進度」**：signedIn-gated section + 繁中確認對話框（明列會清除的範圍：雲端存檔 / 本機進度 / 排行榜紀錄與暱稱釋出；裝置偏好與教學紀錄保留）。
- **重置流程**（standalone service，不需 engine 協調）：
  1. 排行榜 D1 row 刪除（接上既有 `deleteLeaderboardRow`，best-effort — Worker 掛了不阻斷重置）
  2. 推送 reset bundle：`data: {}` + envelope `meta.reset_at = now`（走既有 presign PUT；**失敗即中止**，此時本機未動可安全重試）
  3. 寫本機 ack（localStorage `neurons:lastAckResetAt:<userId>`）
  4. 清空本機（**複用** change 1 的 `clearLocalSyncedData` — 20 adapter 表 + synced meta + mockExamDrafts；device-local meta 保留）
  5. 保持登入（ownership marker 不動）
- **跨裝置 reset 傳播**（二階 reset-propagation 的 R2 版）：pull 套用前檢查 `meta.reset_at > 本機 ack` → 先 `clearLocalSyncedData` + 寫 ack → 再 apply bundle。
- **標記 carry-forward**：之後每次正常 push 的 envelope 都帶上本機 ack 的 `reset_at`，標記不會被後續 push 洗掉。
- **R2 `SCHEMA_VERSION` 21 → 22**：`reset_at` 為 optional envelope 欄位（舊 reader 容忍、照常 pull）；SV bump 借既有 Worker schema-version guard（409 拒絕 SV 降級 push）圍籬舊版 client — 重置後未更新的舊 client **推不上去**，無法復活資料也無法洗掉標記，reload 拿到新版即恢復。
- **零 Dexie bump、零 Worker 改動、零 SYNCED_META_KEYS 改動**。

## Capabilities

### New Capabilities

（無 — 需求全部落在 change 1 建立的 `neurons-cloud-sync` capability。）

### Modified Capabilities

- `neurons-cloud-sync`: 新增三條 requirement（in-place account reset / cross-device reset propagation via bundle marker / reset-marker carry-forward + schema-version fence）。注意：本 capability 由尚未 archive 的 `fix-neurons-account-switch-guard` 建立，本 change 的 delta 同樣以 ADDED requirements 寫入；**archive 順序：change 1 先、本 change 後**（或 bulk-archive 一起收）。

## Impact

- `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — `BundleMeta.reset_at?`、`SCHEMA_VERSION = 22`、build 時 carry-forward
- `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts` — pull 套用前的 reset gate
- `apps/neurons-tw/src/lib/sync/account-guard.ts` — 新增 ack 讀寫 helpers（與 ownership marker 同檔）
- 新檔 `apps/neurons-tw/src/lib/services/account-reset.ts` — 重置流程 orchestration
- `apps/neurons-tw/src/components/HelpMenu.tsx` — 重置 section + 確認對話框
- `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` — 不改；`deleteLeaderboardRow` 首次接上 UI
- 測試：reset gate / carry-forward / 流程失敗中止順序 / SV 22 容忍性
- **Follow-up（不在本 change）**：二階「重置此帳號進度」全 prefix 刪除誤刪 neurons bundle — 修法 = Worker `/reset` 加 optional bundle 參數 + study-rpg-2nd client 帶參數，跨兩 repo 另開 change
- **Dev 限制**：localhost R2 push 失敗（既有），重置流程無法在 dev 端到端驗證 — 單元測試 + prod smoke（mirror leaderboard 前例）
