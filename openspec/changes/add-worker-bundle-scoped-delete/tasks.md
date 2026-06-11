# Tasks: add-worker-bundle-scoped-delete

## 1. 實作

- [x] 1.1 `presign.ts`：`Bundle` type、`BUNDLES` 常數、`bundleKey()` 改 export（行為零改動）
- [x] 1.2 `delete.ts`：解析 optional JSON body — 合法 `bundle` → 單 key delete；無 body / 無欄位 → 全 prefix（舊行為）；非法值 → 400 fail-closed；回應加 `scope` 欄位

## 2. 驗證

- [x] 2.1 `pnpm --dir cloudflare/sync-worker typecheck` 乾淨
- [ ] 2.2 部署後 smoke：`/health` 200；（二階無 body 路徑行為不變 — 由型別 + code review 保證，無 staging 環境）

## 3. Follow-up（不在本 change）

- [ ] 3.1 二階 client 帶 `{ bundle: 'm2' }`（+ 決定 bookmarks 是否一併）— study-rpg-2nd repo，Worker 部署後另開 chip/session
