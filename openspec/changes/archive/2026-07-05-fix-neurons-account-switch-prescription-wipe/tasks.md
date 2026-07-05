## 1. Single-source prefix (prescription.ts)

- [x] 1.1 export `PRESCRIPTION_META_PREFIX = ${NS}:`（= `'prescription:v1:'`）+ doc comment：整個 namespace 為 account-owned、換帳號 / 重置要整批清、imprint 子前綴被 subsume、device-local prefs 在此前綴外

## 2. Widen account-switch wipe (account-guard.ts)

- [x] 2.1 import：由 `./tables` 的 `IMPRINT_SYNC_PREFIX` swap 成 `../services/prescription` 的 `PRESCRIPTION_META_PREFIX`
- [x] 2.2 wipe 的 `meta` 分支：`startsWith(IMPRINT_SYNC_PREFIX)` → `startsWith(PRESCRIPTION_META_PREFIX)`（subsumes imprint-only delete；`anyOf(SYNCED_META_KEYS)` 保留；同一 rw transaction）+ 更新註解說明整個 prescription namespace 為 account-owned

## 3. Test (Vitest)

- [x] 3.1 新增 `account-switch-prescription-wipe.test.ts`：seed 完整 `prescription:v1:*`（plan/wrong/breadth/completed/reward/lightsOut/localSeed/imprint）+ synced key（totalStudyMinutes）+ device-local（`prescription:homeCollapsed` / `guidedComplete`）→ `clearLocalSyncedData` → 斷言所有 `prescription:v1:*` 清空、synced 清空、device-local 留

## 4. Verify + ship

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + 全套 test 綠（825/825；含既有 imprint-keepsake / account-guard / account-reset 不 regress）
- [x] 4.2 `openspec validate fix-neurons-account-switch-prescription-wipe --strict`（valid）
- [ ] 4.3 `/opsx:archive`（sync neurons-cloud-sync delta）→ commit → merge track-neurons→main → push（owner 確認後）
