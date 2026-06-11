# Tasks: fix-neurons-account-switch-guard

## 1. Account-guard 模組

- [x] 1.1 新檔 `apps/neurons-tw/src/lib/sync/account-guard.ts`：`readLastSyncedUserId()` / `writeLastSyncedUserId(userId)`（localStorage key `neurons:lastSyncedUserId`，try/catch 包 storage 例外 fail-open）
- [x] 1.2 `tables.ts` 把 `SYNCED_META_KEYS` 改為 export（adapter 行為零改動）
- [x] 1.3 `account-guard.ts` 加 `clearLocalSyncedData(db)`：清 `NEURONS_ADAPTERS` 派生的 20 表（meta 除外）+ meta 表內 `SYNCED_META_KEYS` 的 key + `mockExamDrafts`；單一 try、失敗 throw 不吞

## 2. Gate 接線 useSync

- [x] 2.1 `useSync.ts`：`SYNCED_TABLES` 改為 `new Set(NEURONS_ADAPTERS.map(a => a.name))` 派生，刪手寫 7 表字串
- [x] 2.2 `useSync.ts` effect 內 engine mount 前插入 gate 三分支（無標記→寫標記直通；同 user→直通；異 user→set pending state、不 mount）
- [x] 2.3 `useSync` 回傳擴充 `accountSwitch: { pending, confirm, cancel }`；confirm = await 清空 → 寫標記 → re-trigger mount（state tick）；cancel = `signOut()`；清空 throw 時保留 pending + 錯誤訊息

## 3. 確認對話框 UI

- [x] 3.1 新檔 `apps/neurons-tw/src/components/AccountSwitchConfirmModal.tsx`：繁中文案（偵測另一帳號資料 / 確認將**清除本機資料**改用你的雲端存檔 / 取消則登出），錯誤訊息顯示 + 重試
- [x] 3.2 `SyncMount.tsx` 從 return null 升級為 pending 時渲染 modal（App 樹位置不動）

## 4. 測試

- [x] 4.1 Vitest：gate 三分支（無標記 / 同 user / 異 user confirm / 異 user cancel）+ 清空失敗不寫標記不 mount
- [x] 4.2 Vitest：`clearLocalSyncedData` 全 20 表 + mockExamDrafts 清空、synced meta keys 刪除、device-local meta key 保留
- [x] 4.3 Vitest 鎖：(a) `NEURONS_ADAPTERS` 每個 name 在 db 上有對應 table；(b) hook 覆蓋集合 == adapter registry 派生集合
- [x] 4.4 Vitest 回歸：`questionBookmarks` / `questionFlags` / `instanceNicknames` 單獨寫入會觸發 schedulePush（mock engine spy）
- [x] 4.5 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠

## 5. 驗證

- [x] 5.1 Chrome MCP dev smoke：登入帳號 A 玩出資料 → DevTools 改 localStorage 標記模擬異帳號 → reload → 對話框出現；取消＝登出資料原樣；確認＝本機清空 + force pull
  - ✅ 匿名半場（localhost:5175）：boot 無 console error、匿名不寫 marker、無 modal、engine 不掛載
  - ✅ 登入半場（owner 協助 OAuth 點擊，2026-06-11）：登入後 marker 自動寫入 user.id + engine 掛載 + 本機 99 筆資料未動（branch 1）；改 marker 為異值 reload → modal 浮現 + engine 不掛載 + 資料未動（branch 3）；點「繼續」→ 20 synced 表 + mockExamDrafts 歸零、synced meta 清除、device-local meta 9 keys 保留、marker 換真實 user.id、engine 重掛（dev `Failed to fetch` = 已知 localhost R2 presign 限制，非本 change）；點「取消」→ 登出（token 清除）、engine 未掛、marker 未動。測畢已清除假 marker 還原 dev 環境
- [x] 5.2 確認零 Dexie schema bump（`lint:dexie-fixtures` no-op）、零 R2 SCHEMA_VERSION 改動、零 Worker 改動
