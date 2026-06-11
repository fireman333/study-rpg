# Design: add-neurons-account-reset

## Context

neurons 雲端同步是 R2-only 單 bundle（`users/<sub>/neurons-snapshot.json.gz`，envelope `BundleMeta { schema_version, updated_at, client_id, app_version }` + `data` keyed by adapter name）。merge 規則 monotonic 為主 → 清空必須有傳播機制，否則任何留有舊資料的裝置下次 push 就把雲端復活。

二階的對照實作：`safeResetAccountData`（snapshot 備份 → leaderboard 刪除 → R2 cleanup → Supabase RPC → reset marker ack → 清本機）+ `reset-propagation.ts`（cloud-side reset timestamp + cold-start gate）。neurons 沒有 Supabase data path、沒有 localBackup 表 — 對應設計全部走 R2 envelope + localStorage。

既有可複用資產（change 1 `fix-neurons-account-switch-guard`）：`clearLocalSyncedData`（原子清空 20 adapter 表 + synced meta + mockExamDrafts）、`account-guard.ts` 檔案（ack helpers 同居）、`AccountSwitchConfirmModal` 的視覺語彙。

Worker 既有基礎設施：presign PUT/GET + **schema-version guard**（cloud 記錄的 SV 高於 client 申請的 SV → 409 拒絕 push presign；pull 不受限）。`/reset` `/delete-account` 端點存在但是全 prefix 刪除（會誤刪二階）— 本 change 不用、不動。

## Goals / Non-Goals

**Goals:**

- 玩家可在 HelpMenu 一鍵清空 neurons 帳號資料（雲端 + 本機 + 排行榜），保持登入、立即重新開始
- 清空後不被其他裝置復活（reset 傳播 + 舊 client 圍籬）
- 排行榜暱稱釋出（D1 row 刪除，非 opt-out 保留）
- 零 Worker 改動、零 Dexie bump、二階零風險

**Non-Goals:**

- 「刪除帳號」（sign-out + Supabase 帳號移除）— 重置語意是砍掉重練，不是 GDPR 刪號；後者需要動 Supabase Auth，另案
- 二階 `/reset` 全 prefix 誤刪 neurons 的修復 — follow-up（跨 study-rpg-2nd repo + Worker 兩處）
- 本機快照備份（localBackup）— 與 change 1 同決策：重置是使用者顯式破壞性操作，對話框警告即可
- export/import JSON — 獨立 backlog 項

## Decisions

### D1 — 雲端清法 = 空 bundle 覆寫，不是 R2 物件刪除

重置時 push `{ meta: { schema_version: 22, reset_at: now, … }, data: {} }`。

- **為什麼不用 Worker `/reset`**：全 prefix 刪除會炸掉同帳號的二階 `m2-snapshot` + `bookmarks`（owner 已定案只清 neurons）；而且「blob 不存在」對其他裝置只是 `blobMissing` no-op，**沒有傳播語意** — 裝置們會把舊資料推回去，重置形同未發生
- **空 bundle + `reset_at` 一石二鳥**：覆寫即清空（R2 上只剩空殼），envelope 標記即傳播訊號
- `applyBundleSnapshot` 既有行為 `snapshot.data[adapter.name] ?? []` 對 `data: {}` 天然容忍

### D2 — 傳播 gate 放在 pull 套用前（engine-r2）

`pullBundle` 在 `gunzipBundle` 驗證後、`applyBundleSnapshot` 前：

```
if (typeof meta.reset_at === 'number' && meta.reset_at > readAckResetAt(userId)) {
  await clearLocalSyncedData(db)   // 舊資料先死，才不會與空 bundle merge 後復活
  writeAckResetAt(userId, meta.reset_at)
}
```

- ack 存 localStorage `neurons:lastAckResetAt:<userId>`（per-user — 同裝置換帳號不互踩；與 ownership marker 同檔管理）
- 自家裝置重置時先寫 ack 再清本機 → 自己的下一次 pull 看到 `reset_at == ack` 不會重複清
- pull 在 mount（force）+ visibility focus 都會跑 → 其他裝置開 app 第一時間就被 gate 接住，趕在它任何 push 之前

### D3 — 標記 carry-forward：每次 push 都帶 ack 的 `reset_at`

`buildBundleSnapshot` 把 `readAckResetAt(userId)`（>0 時）寫進 envelope。沒有這條，重置後第一次正常 push 就把標記從雲端洗掉，慢一步的裝置永遠收不到訊號。

- **替代方案（駁回）**：標記存獨立 R2 物件（`users/<sub>/neurons-reset.json`）— 需要 Worker presign 支援第二把 key = 動共用 Worker，違反零 Worker 目標

### D4 — `SCHEMA_VERSION` 21 → 22 當舊 client 圍籬

`reset_at` 是 optional 欄位，舊 reader 照常 pull（既有 forward-tolerance）。但**舊 writer** build envelope 時不帶 `reset_at` → 會洗掉標記、且推回舊資料。SV bump 借既有 Worker schema-version guard：任何 SV 22 push 落地後，SV 21 client 的 push presign 拿 409 → 推不上去 → 無法復活也無法洗標記；SPA reload 即拿到新版恢復正常。

- 這是 mock-variants（20→21）同款 rollout 成本，已有前例
- bundles.ts 頂部 SCHEMA_VERSION history 註解照慣例補一行

### D5 — 重置流程不需要 engine 協調（無 pause/remount）

順序：**(1)** leaderboard `deleteLeaderboardRow` + 清本機 profile row（best-effort，失敗 console.warn 繼續 — mirror 二階 D5 紀律）→ **(2)** push reset bundle（**失敗即 throw 中止**，本機未動可重試）→ **(3)** 寫 ack → **(4)** `clearLocalSyncedData`。

- engine 全程照跑也安全：wipe 觸發 Dexie hooks → debounced push → build 出「空資料 + carry-forward `reset_at`」= 與 reset bundle 等價，無害；racing pull 看到 `reset_at == ack` no-op
- 不需要 SyncContext/provider 重構 — `account-reset.ts` 是 standalone service，HelpMenu 直接呼叫（auth token 走 `getSupabase().auth.getSession()`，與 leaderboard service 同模式）

### D6 — UI：HelpMenu section + 確認對話框，沿用 change 1 modal 視覺

signedIn-gated section（未登入顯示「需登入」說明，mirror 二階 HelpMenu 寫法）。確認對話框列三件會消失的東西（雲端存檔 / 本機進度 / 排行榜紀錄與暱稱）+ 一件保留的（裝置偏好與教學紀錄）+ 「此操作無法復原」。完成後 toast / inline 訊息 + 頁面資料自然歸零（liveQuery 重新派生），不強制 reload。

## Risks / Trade-offs

- [舊版 client（未 reload 的開著的分頁）在重置後立刻 push] → SV guard 409 擋下；窗口僅「重置落地前」的 race（秒級），與二階既有暴露面相當
- [leaderboard Worker 掛掉] → best-effort 繼續；殘留 D1 row 下次 cron 快照仍顯示舊暱稱 — 對話框不承諾「立即」消失；使用者可重跑重置補刪
- [reset push 後、ack 寫入前 crash] → 本機還有資料 + 雲端已空：下次 pull 的 gate 看到 `reset_at > ack` → 清本機 + ack → 收斂正確
- [localStorage ack 被清] → gate 重新觸發一次本機清空（資料已空 = no-op）；無資料損失
- [SV 22 圍籬誤傷沒重置過的舊 client] → 是 — 任何 SV 22 push 之後舊分頁 push 都 409（不限重置場景）；這是 SV bump 的既有 rollout 性質，reload 自癒，前例同
- [使用者誤觸] → 確認對話框 + 紅色按鈕 + 明文「無法復原」；不做 type-to-confirm（玩家基數小、語氣對齊二階）

## Migration Plan

純 client + envelope 欄位：main merge → CF Pages 部署。SV 22 首推後舊 client push 409（pull 正常），reload 自癒。回滾 = revert commit（SV 回 21 的 client 對已存在的 SV 22 cloud blob 推不動 — 回滾需同時接受既有 reset 使用者的 cloud blob 手動處理；預期不需回滾，風險面窄）。

## Open Questions

（無 — 範圍 / 路線 / 二階隱患處置已由 owner 三題定案。）
