## 1. Selection bias (prescription.ts)

- [x] 1.1 `selectBlindSpotFamily` 加 optional 參數 `imprintLastTouchedByFamily: ReadonlyMap<string, string> = new Map()`（key=已長芽科 → `lastTouchedDate`；缺席＝never-imprinted）
- [x] 1.2 在既有 eligibility + 連續 2 天 guard 後、score 排序前，加分層偏壓：never-imprinted 優先（層內 score 排）；全 imprinted 時選最舊 `lastTouchedDate`（再 score、再既有 hash tie-break）。無 map/空 map → 退回純 score（向後相容）
- [x] 1.3 `buildPlan` opts 加 `imprintLastTouchedByFamily`，傳入 `selectBlindSpotFamily`
- [x] 1.4 `getOrCreateTodayPlan` 讀 `getImprints()`（併入既有 `Promise.all`），建 `familyId → lastTouchedDate` map 傳入 `buildPlan`

## 2. Tests (Vitest)

- [x] 2.1 never-imprinted 科優先於高分 imprinted 科
- [x] 2.2 never-imprinted 層內仍用最高 score（偏壓不打亂同層排序）
- [x] 2.3 全 eligible 已 imprinted → 選最舊 `lastTouchedDate`（tie 用 score→hash）
- [x] 2.4 無 imprint map → 退回純 score（既有 selectBlindSpotFamily 測試全綠）
- [x] 2.5 與連續 2 天 guard 疊加：guard 先排除、偏壓在剩餘中選；deterministic
- [x] 2.6 `getOrCreateTodayPlan` 整合：seed 幾科 imprint → 今日 plan breadthFamilyId 偏向未長芽科

## 3. Verify + ship

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + 全套 test 綠
- [x] 3.2 grep 確認無新增 Dexie `.version()`／R2 `SCHEMA_VERSION`／`SYNCED_META_KEYS`、無 UI/文案改動
- [x] 3.3 `/opsx:verify` → `/opsx:archive`（sync MODIFIED requirement）→ commit → merge track-neurons→main → push → prod bundle 驗證（owner 已授權 ship）
