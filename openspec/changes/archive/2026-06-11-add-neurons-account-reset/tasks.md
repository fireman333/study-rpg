# Tasks: add-neurons-account-reset

## 1. Envelope + ack 基礎

- [x] 1.1 `bundles.ts`：`BundleMeta` 加 optional `reset_at?: number`；`SCHEMA_VERSION` 21 → 22（頂部 history 註解補一行）；`validateBundleMeta` 容忍缺席 / 驗證型別（非 number 即忽略不 throw）
- [x] 1.2 `account-guard.ts`：`readAckResetAt(userId)` / `writeAckResetAt(userId, ts)`（localStorage `neurons:lastAckResetAt:<userId>`，fail-open 同 marker 慣例）
- [x] 1.3 `bundles.ts` `buildBundleSnapshot`：carry-forward — ack > 0 時寫進 `meta.reset_at`（需要 userId：確認 build 呼叫端能傳入或從 auth session 取）

## 2. Pull-side 傳播 gate

- [x] 2.1 `engine-r2.ts` `pullBundle`：gunzip 驗證後、`applyBundleSnapshot` 前插入 gate（`reset_at > ack` → `clearLocalSyncedData` → 寫 ack → 才 apply）
- [x] 2.2 確認 gate 拿得到 userId（pullBundle 簽名如無 user 需從 supabase session 取，與 push path 對齊）

## 3. 重置流程 service

- [x] 3.1 新檔 `apps/neurons-tw/src/lib/services/account-reset.ts`：`resetNeuronsAccountData(db)` 依序 (1) leaderboard 刪除 best-effort（`deleteLeaderboardRow` + 清本機 profile row，失敗 warn 繼續）(2) push reset bundle（`data: {}` + `reset_at = now` + SV 22；失敗 throw 中止）(3) `writeAckResetAt` (4) `clearLocalSyncedData`
- [x] 3.2 reset bundle push 走既有 presign PUT path（engine-r2 抽出可重用的 `pushSnapshot(supabase, snapshot)` 或新增 `pushResetBundle`，不複製 presign 邏輯）

## 4. HelpMenu UI

- [x] 4.1 HelpMenu 加「♻ 重置此帳號進度」section：signedIn-gated（未登入顯示需登入說明）；說明文案列清除三項（雲端存檔 / 本機進度 / 排行榜紀錄 + 暱稱釋出）與保留項（裝置偏好、教學紀錄）
- [x] 4.2 確認對話框（沿用 AccountSwitchConfirmModal 視覺語彙）：紅色確認鈕 + 「此操作無法復原」；執行中 disabled；失敗顯示錯誤可重試；成功顯示完成訊息
- [x] 4.3 完成後不強制 reload — 驗證主要頁面（腦圖 / 圖鑑 / 出征）liveQuery 自然歸零
  - 機制與 change 1 帳號切換 confirm-wipe 同一條（`clearLocalSyncedData` → useLiveQuery 重新派生），該路徑已於 2026-06-11 dev smoke 驗過資料歸零；reset 專屬的視覺確認折進 6.2 prod owner-verify 一起看

## 5. 測試

- [x] 5.1 Vitest：ack helpers round-trip + fail-open；`validateBundleMeta` 對 `reset_at` 缺席 / number / 非法型別三態
- [x] 5.2 Vitest：pull gate — `reset_at > ack` 先清後 apply + 寫 ack；`reset_at == ack` 不清；無 `reset_at` 不清；換 userId ack 互不污染
- [x] 5.3 Vitest：carry-forward — ack > 0 時 build 出的 envelope 帶 `reset_at`；ack = 0 不帶
- [x] 5.4 Vitest：reset 流程順序 — push 失敗 → 本機未清、ack 未寫；leaderboard 失敗 → 流程繼續完成
- [x] 5.5 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠；`lint:dexie-fixtures` no-op（零 Dexie bump）

## 6. 驗證

- [x] 6.1 Chrome MCP dev smoke（受 localhost R2 限制只驗 UI 半場）：HelpMenu section 渲染、未登入 gate、確認對話框文案、取消無副作用
- [x] 6.2 OWNER-VERIFY（prod，部署後）：真帳號重置 → 雲端歸零 + 排行榜暱稱消失 + 第二台裝置 pull 後自動清空不復活
  - 2026-06-11 owner 於 prod 實測重置：ack 已寫（=雲端空 bundle push 成功後才會寫）、本機 store 全零（familyMastery 11 列為開機 fresh seed 全零）；排行榜 KV 快照等下個整點 cron 重建後消失（既有設計）；第二裝置驗證留 owner 抽空（單元測試已鎖 pull gate）
- [x] 6.3 Follow-up 記錄：二階 `/reset` 全 prefix 誤刪 neurons bundle（Worker optional bundle 參數 + study-rpg-2nd client，跨 repo 另開 change）— 已開 background-task chip `task_dbe65cb5`（2026-06-11），含兩處修法細節
