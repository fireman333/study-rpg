# Design: fix-neurons-account-switch-guard

## Context

neurons-tw 的 sync 架構：`useSync` hook 在 `authStatus === 'authed'` 時建立 `SyncEngine`，mount 即 `pullNow({ force: true })` 把雲端 bundle merge 進本機 Dexie，之後 Dexie hook 觸發 debounced push。merge 規則（[tables.ts](../../apps/neurons-tw/src/lib/sync/tables.ts)）幾乎全是 monotonic（MAX / UNION / first-write-wins / monotonic-OR）— 這是跨裝置收斂的正確設計，但也意味「兩個不同帳號的資料一旦 merge，無法分離」。

現況沒有任何「本機資料屬於誰」的紀錄；`signOut` 保留本機資料（auth spec 既有行為，正確 — 單人裝置登出再登入不該丟進度）。問題只出現在「換一個不同的帳號登入」這條路徑。

對照組：二階（study-rpg-2nd）有 `AccountSwitchPrompt` + `safeAccountSwitch` + localStorage `lastUserId` 偵測。neurons 不照搬完整 modal（含「保留本機合併」選項）— 該選項在 monotonic merge 下等於污染。

Dexie v20 共 21 個表：20 個有 adapter（參與同步）+ `mockExamDrafts`（local-only 模擬考草稿）。`meta` 表混裝 synced keys（`SYNCED_META_KEYS` allowlist）與 device-local keys（onboarding flags、daily 計數器等）。

## Goals / Non-Goals

**Goals:**

- 同裝置換帳號登入時，先清空前帳號本機資料再啟動 sync engine — 杜絕 cross-account merge
- 使用者有知情權（確認對話框），取消可全身而退（自動登出、本機原樣）
- 匿名遊玩 → 首次登入的 upload-merge 路徑行為不變
- 同帳號登出再登入無感（不跳對話框、不清資料）
- `SYNCED_TABLES` push-trigger 監聽清單與 adapter registry 單一來源，永久消除漂移
- 零 Dexie / R2 schema bump、零 Worker 改動

**Non-Goals:**

- 登出時 flush pending push（二階 `signOutWithFlush`）— 獨立缺口，留給後續 change
- 清空前的本機快照備份（localBackup）— 已決策接受遺失（未同步窗口僅數秒，對話框已警告）
- 多分頁同時開啟的競態（分頁 A 舊帳號 engine 還在跑、分頁 B 換帳號清空）— 二階同樣未解；風險低（清空後分頁 A 的 push 會推前帳號殘留，但該分頁 user session 已失效、presign 會 401）
- 「清空帳號資料 / reset」功能 — 下一個 change（`add-neurons-account-reset`）

## Decisions

### D1 — 擁有者標記存 localStorage，不存 Dexie meta

key：`neurons:lastSyncedUserId`，值 = 最後一次通過 gate 的 `user.id`。

- **為什麼不放 meta 表**：meta 會被本 change 的清空 helper 部分清除、且 synced keys 會跨裝置同步 — 擁有者標記必須是純裝置本地、且在清空過程中由 gate 自己控制生命週期。localStorage 同步讀取、零依賴，gate 在 engine mount 前跑不需要 await。
- **Fail-open**：標記遺失（瀏覽器清 storage、Safari ITP）→ gate 視為「無標記」→ 走首登 upload-merge 路徑 = 今天的現狀行為。最壞情況不比現在差。

### D2 — Gate 三分支，插在 `useSync` effect 的 engine mount 之前

```
marker = readLastSyncedUserId()
1. marker 不存在        → writeMarker(user.id) → 正常 mount（首登 / 匿名轉正）
2. marker === user.id   → 正常 mount（回鍋）
3. marker !== user.id   → 暫停 mount，浮出確認對話框
   - 確認 → await clearLocalSyncedData(db) → writeMarker(user.id) → mount engine（force pull）
   - 取消 → signOut()（本機資料與標記原樣保留）
```

分支 3 期間 engine 不存在 → 不 attach Dexie hooks、不 push、不 pull — 污染視窗為零。

### D3 — 對話框用輕量 React modal，由 `SyncMount` 渲染

`useSync` 回傳 `accountSwitch: { pending: boolean; confirm(): void; cancel(): void }`；`SyncMount` 從「回傳 null 的 headless component」升級為「pending 時渲染 `AccountSwitchConfirmModal`」。

- **為什麼不用 `window.confirm`**：阻塞主執行緒、無法套 app 視覺、Vitest 難測、文案無法排版（需要粗體警告「清除本機資料」）。
- Modal 文案（繁中）明確三件事：偵測到另一帳號資料、確認後清除本機改用你的雲端存檔、取消則登出。

### D4 — 清空範圍：20 個 adapter 表 + `SYNCED_META_KEYS` + `mockExamDrafts`

新檔 `account-guard.ts` 的 `clearLocalSyncedData(db)`：

- 20 個 adapter 表：從 `NEURONS_ADAPTERS.map(a => a.name)` 派生（meta 除外特殊處理）
- `meta` 表只刪 `SYNCED_META_KEYS` 內的 key（device-local keys 如 onboarding flags 保留 — 新使用者不必重看教學，殘留無帳號識別性）
- `mockExamDrafts` 雖 local-only 也清：草稿是前帳號的作答內容，不清的話新帳號會 resume 別人的模擬考（隱私 + 正確性）
- 需要把 `SYNCED_META_KEYS` 從 tables.ts module-private 改為 export

**取捨**：device-local 的 daily 計數 meta（date-keyed、mock roll bookkeeping）不清 — 新帳號當天的 daily cap 可能被前帳號吃掉一部分，影響一天、無資料污染，換取清單簡單。

### D5 — `SYNCED_TABLES` 從 `NEURONS_ADAPTERS` 派生

`useSync.ts`：`const SYNCED_TABLES = new Set(NEURONS_ADAPTERS.map(a => a.name))`。

- 20 個 adapter 的 `name` 已逐一驗證 == Dexie table name；`attachTableHooks` 既有的 `if (!table) continue` 防呆保留
- 新增 Vitest 鎖：(a) 每個 adapter name 在 `db` 上都有對應 table（防 silent skip）；(b) 收藏 / flag / 改名寫入觸發 `schedulePush`（回歸鎖）
- **替代方案（駁回）**：手動補滿 20 個字串 — 下次加 adapter 又會漏，漂移根因不除

### D6 — 標記寫入時機 = gate 通過當下

分支 1 / 3-確認 在 mount engine 前就寫標記。engine mount 後續失敗（如 supabase null）無害 — 標記語意是「本機資料最後歸屬」，gate 通過即歸屬確立。

## Risks / Trade-offs

- [前帳號未 push 變更遺失] → 視窗僅 debounce 3 秒 + 換帳號需經過登出登入流程（期間 push 已跑）；對話框明文警告；已決策接受
- [localStorage 標記被清] → fail-open 至現狀行為（首登 merge），不會更差；不做額外持久化
- [清空到一半失敗（Dexie error）] → `clearLocalSyncedData` 包單一 try；失敗則不寫標記、不 mount engine、對話框顯示錯誤請重試 — 寧可不同步也不污染
- [多分頁競態] → 見 Non-Goals；舊分頁 session 失效後 presign 401，push 不會成功
- [派生清單把 meta 也 hook 了（原本就有）] → meta 高頻寫入（daily 計數）已在現狀清單內，debounce 吸收，無新增負載

## Migration Plan

純 client 邏輯：main merge → CF Pages 自動部署。無 schema、無 Worker、無資料遷移。回滾 = revert commit。既有使用者首次載入新版時標記不存在 → 分支 1 自動補寫，無感。

## Open Questions

（無 — 兩個 UX 決策已由 owner 於 proposal 階段定案：確認對話框後清空、接受未同步變更遺失。）
