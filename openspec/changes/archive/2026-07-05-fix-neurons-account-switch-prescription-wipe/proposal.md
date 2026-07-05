## Why

`add-neurons-imprint-keepsake-sync`（2026-07-05 ship，main `5e1dba3`）在 Fable-5 sync health-check 留下一條 P4 follow-up：帳號切換 / 原地重置的 wipe helper `clearLocalSyncedData` 只清 (a) `NEURONS_ADAPTERS` tables、(b) `SYNCED_META_KEYS` + imprint prefix `prescription:v1:ng0717:imprint:`、(c) `mockExamDrafts`——但**其餘整個 `prescription:v1:` daily-quest 命名空間是 local-only 且沒被清**：`completed:<date>`（驅動 NG-0717 rolling-day 成熟階段 1/3/6/10 + keepsake）、`plan:<date>` / `wrong:<date>:*` / `breadth:<date>:*` / `reward:<date>` / `lightsOut:<date>` / `localSeed`。

結果：切到新帳號時，新帳號**繼承**前一帳號的 NG-0717 成熟階段 / 今日處方箋進度，而同步的 imprint 芽卻已被正確清除 → 一隻「混血 NG-0717」（階段前進但沒有芽，或新帳號長的芽掛在舊帳號的階段下）。同一漏洞也存在於原地帳號重置——local-only 階段 state 撐過重置。

daily-prescription state 是**帳號所有**（account-owned）而非 device-local：completion 天數驅動該帳號的 NG-0717 階段、imprint 是它的 keepsake。因此換帳號 / 重置時必須連同整個 `prescription:v1:` 前綴一起清。

## What Changes

- **Wipe 擴為整個 `prescription:v1:` 命名空間**：`clearLocalSyncedData` 於同一 rw transaction 內，把原本的 `startsWith(IMPRINT_SYNC_PREFIX).delete()`（只清 imprint 子前綴）**擴為** `startsWith('prescription:v1:').delete()`——涵蓋所有 local-only daily-quest keys（plan / wrong / breadth / completed / reward / lightsOut / localSeed）AND imprint keepsake 子前綴。因 imprint 前綴是 `prescription:v1:` 的子集，此舉**subsumes**（吸收）原 imprint-only delete。
- **單一來源 prefix**：從 prescription service export `PRESCRIPTION_META_PREFIX = 'prescription:v1:'`（= 既有私有 `NS` + `:`），account-guard import 之，前綴不會漂移（mirror 既有 `IMPRINT_PREFIX` 單一來源模式）。
- **Device-local key 保留**：`prescription:v1:` 之外的 device-local meta（`prescription:homeCollapsed`、onboarding flags 如 `guidedComplete`）不受影響。`localSeed`（`prescription:v1:localSeed`）雖 device-local 但 account-agnostic，被清後下次自動重生一個新 tie-break seed（無害），落在此前綴內一併清除是可接受的。
- **零 schema / sync / UI 改動**：不 bump Dexie、不動 R2 `SCHEMA_VERSION`、不動 `SYNCED_META_KEYS`、不動同步 filter（**哪些 key 同步**不變——只擴大「切帳號時清哪些 local key」）。

## Capabilities

### New Capabilities
<!-- 無新 capability。 -->

### Modified Capabilities
- `neurons-cloud-sync`: MODIFIED「Account-switch wipe covers all synced surfaces plus local drafts」——clause (b) 由「`SYNCED_META_KEYS` 加 imprint prefix 命中的 keys」擴為「`SYNCED_META_KEYS` 加整個 `prescription:v1:` 前綴命中的 keys（涵蓋 local-only daily-quest state + imprint keepsake 子前綴，因其為 account-owned 且驅動 NG-0717 階段）」；device-local key（`prescription:v1:` 之外）仍保留。既有 imprint-keepsake wipe scenario 併入更廣的 prescription-state scenario。

## Impact

- **Code**：`apps/neurons-tw/src/lib/services/prescription.ts`（export `PRESCRIPTION_META_PREFIX`）、`apps/neurons-tw/src/lib/sync/account-guard.ts`（import swap + wipe 前綴由 imprint-only 擴為整個 prescription namespace）。UI / prescription 邏輯 / 同步 filter 不變。
- **Data / schema**：無 Dexie bump、無 R2 `SCHEMA_VERSION` 改動、無 `SYNCED_META_KEYS` 改動。只是切帳號 / 重置 wipe 範圍變廣（多清 local-only daily state）。
- **Tests**：新增 `account-switch-prescription-wipe.test.ts`——seed 完整 `prescription:v1:*` daily state（含 completed / plan / reward / imprint / localSeed）+ synced key + device-local key（homeCollapsed / guidedComplete）→ `clearLocalSyncedData` 後所有 `prescription:v1:*` 清空、device-local 留存。既有 `imprint-keepsake-sync.test.ts` / `account-guard.test.ts` / `account-reset.test.ts` 不受影響（無測試 seed local-only `prescription:v1:*` 並期待存活）。
- **相容 / 風險**：純擴大本地 wipe 範圍、無 cloud-side effect（no push / no delete request）。唯一行為改變 = 切帳號 / 重置後新帳號不再繼承前帳號 NG-0717 階段——即修掉的 bug 本身。零 resurrection 風險（wipe 只刪 local；同步走既有 first-write-wins UNION 不變）。
