# Design: add-neurons-sync-status-chip

## Context

`useSync` 已內建 1s status poll（`setSnapshot(engine.getStatus())`）與 `accountSwitch` 狀態，但唯一掛載點 `SyncMount` 只用 `accountSwitch`、丟掉 status。AuthGate（header pill）與 sync 狀態之間沒有資料通道。HelpMenu FAB 是 `position:fixed` 右上，header pill 是 in-flow `marginLeft:auto` — 兩者不同層，加 emoji 不會碰撞，但窄屏 header 寬度敏感（owner 點名 RWD）。

## Goals / Non-Goals

**Goals:** push 失敗玩家立刻可見；一鍵手動同步；單 emoji 寬度的 RWD 衝擊；零 sync 語意改動。

**Non-Goals:** 同步錯誤 toast / 連續失敗升級通知（二階有，neurons 留 backlog）；HelpMenu 教學 section（owner 選了選項 1 非選項 3）；offline 偵測。

## Decisions

### D1 — Context provider 取代 headless SyncMount

`SyncProvider`（`lib/sync/SyncProvider.tsx`）呼叫 `useSync()` 一次，`createContext` 提供 `{ status, accountSwitch, syncNow }`，children 全樹可讀；帳號切換 modal 由 provider 一併渲染（語意不變）。`SyncMount` 刪除。**替代（駁回）**：module-level pub/sub — 多一套訂閱機制，React 樹內 context 就夠。

### D2 — 燈號做在 AuthGate pill 內，不開第二顆 pill

authed chip 結構變成 `[🟢][已登入 <name>][登出]`。三態映射（純函數 `mapSyncLight(status)`，可單測）：

- engine 缺席（unauthed / disabled / account-switch pending）→ **不渲染**
- `state === 'pushing' || 'pulling'` → 🟡（`title=「同步中…」`）
- `state === 'error'` 或 `lastError != null` → 🔴（`title=「同步失敗：<lastError>（點擊重試）」`）
- 其餘（idle 無錯誤）→ 🟢（`title=「已同步｜上次上傳 HH:MM」`；從未 push 過顯示「尚未同步」）

### D3 — `syncNow` 串 pull→push、busy-guard

`useSync` 加 `syncNow(): Promise<void>` = `engine.pullNow({force:true})` → `engine.pushNow()`（pull 先行 — 撿遠端新資料再推，與 mount 順序一致）。進行中（🟡）點擊 no-op。

### D4 — RWD：emoji button 無 padding、固定行高

按鈕 `background:none; border:none; padding:0; font-size:0.9rem; line-height:1`，淨增 ~20px。375px probe：header 不換行爆版（既有 pill 在窄屏的換行行為不變壞）。不動既有「已登入」文字（縮短它屬另一個 RWD change，不混進來）。

## Risks / Trade-offs

- [1s poll 已存在] → 零新增負載，只是終於有人讀它
- [🔴 後自動恢復] → 下一次成功 push/pull 會清 lastError → 燈自動轉🟢（engine 既有行為）
- [點擊同步在 dev localhost 必失敗] → 既有 R2 限制，prod 驗證；dev 反而可順手驗 🔴 路徑

## Migration Plan

純 client UI；CF Pages 部署，回滾 = revert。

## Open Questions

（無 — 擺位 + RWD 注意已由 owner 定案。）
