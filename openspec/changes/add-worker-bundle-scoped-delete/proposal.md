# Proposal: add-worker-bundle-scoped-delete

> Scope note: generic cross-track change（共用 sync Worker）。affects: backend shared by 二階 (`study-rpg-2nd`) + neurons。

## Why

共用 sync Worker 的 `POST /reset` 與 `POST /delete-account`（`cloudflare/sync-worker/src/delete.ts`）目前一律刪除 `users/<sub>/` prefix 下**所有**物件 — 同帳號的 `m2-snapshot.json.gz`（二階）、`bookmarks.json.gz`、`neurons-snapshot.json.gz` 一起陪葬。實際後果：二階玩家按「重置此帳號進度」會把 neurons 的雲端存檔一起刪掉（2026-06-11 於 `add-neurons-account-reset` 調查中發現；實害低 — neurons 本機是 source of truth 會重建 — 但語意錯誤）。

端點需要「只刪指定 bundle」的能力，舊行為必須完整保留（二階既有 client 不帶參數）。

## What Changes

- `POST /reset` / `POST /delete-account` 接受 **optional** JSON body `{ "bundle": "m2" | "bookmarks" | "neurons" }`：
  - 帶合法 `bundle` → 只刪該 bundle 的單一 R2 key（key 對映複用 `presign.ts` 的 `bundleKey()`）
  - 無 body / 空 body / 無 `bundle` 欄位 → 維持全 prefix 刪除（**向後相容**，二階既有 client 行為不變）
  - `bundle` 值非法 → 400（fail-closed，不退回全刪 — 打錯字不該炸全帳號）
- `bundleKey()` 從 `presign.ts` export 供 `delete.ts` 復用（單一真實來源，不複製字串）
- 回應 JSON 加 `scope` 欄位（`"all"` | `"<bundle>"`）方便 client / 除錯辨識實際刪除範圍

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `cloud-sync`: 既有 requirement「Account deletion removes all cloud data」不動（無 body 行為不變）；新增一條 requirement 描述 bundle-scoped delete 的 opt-in 行為。

## Impact

- `cloudflare/sync-worker/src/delete.ts` — body 解析 + scoped delete 分支
- `cloudflare/sync-worker/src/presign.ts` — `bundleKey` + `Bundle` type 改 export（行為零改動）
- **Client 零改動**（本 change 只給 Worker 能力）；二階 client 帶 `{ bundle: 'm2' }` 是 follow-up（study-rpg-2nd repo，另開）
- 部署：`wrangler deploy`（或 `deploy-worker.yml` 手動觸發）— 與 neurons CF Pages 部署互相獨立
- 風險面：additive、預設路徑 byte-for-byte 同舊行為；Worker typecheck + 部署後 `/health` smoke
