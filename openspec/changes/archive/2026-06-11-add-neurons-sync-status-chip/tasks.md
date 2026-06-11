# Tasks: add-neurons-sync-status-chip

## 1. Context + syncNow

- [x] 1.1 `useSync.ts` 加 `syncNow()`（pullNow force → pushNow；engine 缺席 no-op）
- [x] 1.2 新檔 `lib/sync/SyncProvider.tsx`：context `{ status, accountSwitch, syncNow }` + 渲染 AccountSwitchConfirmModal；export `useSyncContext()`
- [x] 1.3 `App.tsx`：`<SyncMount />` 移除、`<SyncProvider>` 包住 BrowserRouter 內容；刪 `SyncMount.tsx`

## 2. 狀態燈 UI

- [x] 2.1 純函數 `mapSyncLight(status, engineMounted)` → `{ glyph, title, busy } | null`（D2 三態 + 隱藏條件）
- [x] 2.2 AuthGate authed pill 前端加燈號按鈕（無 padding、line-height 1、busy 時 no-op；aria-label）

## 3. 測試 + 驗證

- [x] 3.1 Vitest：`mapSyncLight` 三態 + 隱藏 + 尚未同步 tooltip + busy flag
- [x] 3.2 typecheck + 全 vitest 綠
- [x] 3.3 Chrome MCP dev smoke：未登入無燈；375px probe header 不爆版；（dev 點燈會 🔴 = localhost R2 限制，順手驗 error 路徑）
  - smoke 紀錄：未登入 0 顆燈 + 375px probe 無橫向 overflow（header 換行高 107px，既有行為）；登入態燈號視覺與點擊同步留 prod 驗（owner 下次登入即見；dev 點燈必 🔴 = localhost R2 限制）
