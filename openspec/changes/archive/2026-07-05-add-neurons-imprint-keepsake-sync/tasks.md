## 1. Prefix-based meta sync (tables.ts)

- [x] 1.1 加常數 `IMPRINT_SYNC_PREFIX = 'prescription:v1:ng0717:imprint:'` + helper `isSyncedMetaKey(key) = SYNCED_META_KEYS.has(key) || key.startsWith(IMPRINT_SYNC_PREFIX)`（export 供測試 + account-guard 複用）
- [x] 1.2 `metaAdapter.snapshot` filter 由 `SYNCED_META_KEYS.has(r.key)` 改 `isSyncedMetaKey(r.key)`
- [x] 1.3 `metaAdapter.apply` 的接受判斷由 `SYNCED_META_KEYS.has(key)` 改 `isSyncedMetaKey(key)`（其餘 first-write-wins 邏輯不變）

## 2. Schema bump + reader tolerance (bundles.ts)

- [x] 2.1 `SCHEMA_VERSION` 23 → 24 + history 條目（v24 — add-neurons-imprint-keepsake-sync：imprint prefix 進 synced meta，first-write-wins UNION，additive/reader-tolerant，無 Dexie bump）

## 3. Account-switch wipe (account-guard.ts)

- [x] 3.1 `clearLocalSyncedData` 於同一 rw transaction 內加 `db.meta.where('key').startsWith(IMPRINT_SYNC_PREFIX).delete()`（import helper/const from tables.ts）

## 4. Tests (Vitest)

- [x] 4.1 metaAdapter snapshot 含 imprint keys（seed imprint + allowlist key → snapshot 兩者都在；非同步的 `prescription:v1:completed:*` 不在）
- [x] 4.2 metaAdapter apply first-write-wins UNION：local 缺 imprint key → 寫入；local 已有 → 留（value 恆 '1' 無衝突）；non-synced key → skip
- [x] 4.3 prefix 精確性：`isSyncedMetaKey` 對 `...imprint:藥理學:2026-07-05` = true；對 `prescription:v1:completed:2026-07-05` / `prescription:v1:localSeed` = false
- [x] 4.4 snapshot/apply membership 對稱（同一 helper；斷言一個 imprint key 兩向都被收）
- [x] 4.5 reader tolerance：模擬「incoming 無 imprint keys」→ apply 不刪本地 imprint（first-write-wins 保留）
- [x] 4.6 account-guard：seed imprint + synced + device-local keys → `clearLocalSyncedData` 後 imprint + synced 清除、device-local 留

## 5. Fable-5 sync health-check（owner 指定）

- [x] 5.1 派 Fable-5 agent adversarial review sync 改動（tables.ts / bundles.ts / account-guard.ts diff），聚焦：UNION vs LWW 正確性、snapshot/apply 對稱、prefix 誤收、reader-tolerance 雙向、reset fence 互動、cross-account 殘留
- [x] 5.2 Fable-5 判定 SHIP-WITH-FIXES（7 property 全 CONFIRMED）；已修 2 個 P3：(a) prescription.ts 3 處過期「local-only/ZERO sync」註解、(b) prefix 常數收斂為單一來源（prescription 擁有 `IMPRINT_PREFIX`，tables re-export，imprintKey 派生，+ literal-pin 測試）。Follow-up（不擋本 change）：P4 帳號切換把整個 `prescription:v1:` namespace 納入 wipe（避免 stage/keepsake「混血」）、P5 遠古 presign 路徑（pre-existing）

## 6. Verify + ship

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + 全套 test 綠
- [x] 6.2 grep 確認無 Dexie `.version()` bump、無新 adapter、無 UI 改動；`SCHEMA_VERSION` = 24
- [ ] 6.3 `/opsx:verify` → `/opsx:archive`（sync 2 spec deltas）→ commit → merge track-neurons→main → push → prod bundle 驗證（`SCHEMA_VERSION`/imprint 同步；owner 已授權 ship）
