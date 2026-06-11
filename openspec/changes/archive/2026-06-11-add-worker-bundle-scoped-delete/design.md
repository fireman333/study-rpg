# Design: add-worker-bundle-scoped-delete

## Context

`delete.ts` 的 `handleDeleteOrReset` 共用於 `/reset` 與 `/delete-account`（語意差異在 client 側：reset 保留 session、delete 登出）。現行實作 JWT 驗證後直接 `deleteAllUserObjects(bucket, userSub)` 全 prefix 列舉刪除。呼叫端現況：二階 `requestR2Cleanup`（不帶 body）；neurons 不經此端點（`add-neurons-account-reset` 走空 bundle 覆寫）。

## Goals / Non-Goals

**Goals:** optional `{ bundle }` scoped delete；無參數行為 byte-for-byte 不變；非法值 fail-closed。

**Non-Goals:** 二階 client 換用新參數（follow-up，study-rpg-2nd repo）；neurons client 接這個端點（用不到）；backup.ts 的 prefix walk（照舊）。

## Decisions

### D1 — body 解析容錯但值驗證嚴格

無 body / 非 JSON / 無 `bundle` 欄位 → 全 prefix 刪（相容舊 client）。`bundle` 存在但不在 `['m2','bookmarks','neurons']` → **400**，絕不退回全刪 — 打錯字炸全帳號是最糟的失敗模式。

### D2 — key 對映復用 `presign.ts` 的 `bundleKey()`

`bundleKey` + `Bundle` type + `BUNDLES` 常數改 export。單一真實來源 — 未來加第四個 bundle 時 presign / delete 自動對齊。

### D3 — 回應加 `scope` 欄位

`{ r2: "ok", deleted: n, user, scope: "all" | "<bundle>" }`。舊 client 不讀新欄位（additive JSON），新 client / 除錯可確認實際範圍。

## Risks / Trade-offs

- [舊 client 偶然送了 body？] → 二階 `requestR2Cleanup` 現況不送 body；就算送了空 JSON `{}` 也走全刪分支（無 `bundle` 欄位），相容
- [scoped delete 刪錯 key] → key 來自 presign 同一函數，與 push/pull 的 key 定義必然一致
- [部署窗口] → Worker deploy 原子切換；新舊版本對「無 body」請求行為相同，無相容窗口問題

## Migration Plan

`wrangler deploy`（cloudflare/sync-worker）→ `/health` smoke + 二階 prod 不受影響（無 body 路徑未變）。回滾 = redeploy 前版。

## Open Questions

（無）
