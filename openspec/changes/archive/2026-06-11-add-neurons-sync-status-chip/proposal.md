# Proposal: add-neurons-sync-status-chip

## Why

neurons 的 sync engine 有完整的狀態機（idle / pushing / pulling / error + lastError + lastPushAt），但 `useSync` 回傳的狀態快照被 `SyncMount` 直接丟掉 — **push 失敗對玩家完全不可見**（只進 console），也沒有任何手動觸發同步的入口。玩家關 tab 前無從確認進度已上雲。2026-06-11 同步功能稽核（owner 點名）列為 P3 缺口，owner 拍板「順手做」：右上角狀態 chip + 點擊即同步，**注意 RWD 排版**。

## What Changes

- **SyncProvider context**：`useSync` 從 `SyncMount`（headless、丟棄回傳值）提升為 React context provider — `SyncMount` 退役，App 樹改掛 `SyncProvider`（帳號切換 modal 一併搬入 provider 渲染）。對外暴露 `{ status, accountSwitch, syncNow }`。
- **狀態燈整合進既有「已登入」pill**（不加第二顆 pill — RWD 約束）：AuthGate 的 authed chip 前端加一顆 emoji 按鈕 — 🟢 已同步 / 🟡 同步中 / 🔴 同步失敗（`title` 顯示錯誤訊息 + 上次成功 push 時間）。未登入 / 帳號切換 pending 時不顯示。
- **點擊 = 立即同步**：`syncNow()` = `pullNow()` + `pushNow()`，進行中 disabled（防連點）。
- **RWD**：只新增單一 emoji 寬度（~20px）；以 375px 窄屏 probe 驗證 header 不爆版、不與 HelpMenu FAB 重疊。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `neurons-cloud-sync`: ADDED 一條 requirement — sync 狀態可見性 + 手動同步（三態燈號、錯誤 hover、點擊觸發、未登入隱藏）。

## Impact

- 新檔 `apps/neurons-tw/src/lib/sync/SyncProvider.tsx`（context + modal 渲染）；`SyncMount.tsx` 刪除
- `apps/neurons-tw/src/App.tsx` — `<SyncMount />` → `<SyncProvider>` 包裹
- `apps/neurons-tw/src/components/AuthGate.tsx` — authed chip 加狀態燈按鈕
- `useSync.ts` — 回傳值不變（已含 status/accountSwitch），加 `syncNow`
- 零 schema / 零 Worker / 零 sync 語意改動 — 純 UI 可見性
- 測試：狀態映射純函數 Vitest + 375px RWD probe（dev smoke）
