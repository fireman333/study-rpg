## Why

`add-neurons-ng0717-lineage-imprints` 剛上線:完成當日「開發新連結」科目就在 NG-0717 長一顆該科的芽。但選科演算法只看 coverage-weighted score，不看「哪些科已經長過芽」——高分科目可能被反覆選中，芽集中在少數科，削弱「按部就班巡完全 11 科」的踏實感。Codex 後續 review 把「溫和分支輪替」列為考前 cost/value 最佳的擴充：讓選科**偏壓還沒長芽 / 最久沒長芽的科**，把覆蓋自然鋪滿整個衝刺期——但**完全不明說**（無地圖、無「因為你還沒碰 X」文案），否則就把隱性分母/缺口壓力帶回來。

## What Changes

- **選科偏壓（分層，疊在既有 score 上）**：`selectBlindSpotFamily` 在既有 eligible（scope 內有未做題、排除 ✨easy）基礎上，先偏好**還沒長芽的科**（never-imprinted），其中用既有 coverage score 排；當所有 eligible 都已長過芽時，改選 **`lastTouchedDate` 最舊**的科（輪替），再看 score。既有「連續 2 天同科則跳過」guard 與 deterministic tie-break 不變。
- **資料來源**：plan 生成時（`getOrCreateTodayPlan`）讀既有 imprint keys（`getImprints`），把 per-科 `lastTouchedDate`（never-imprinted = 缺席）傳入 `buildPlan → selectBlindSpotFamily`。今日 imprint 於「當日完成後」才寫，所以今晨選科反映的是**先前幾天**的覆蓋狀態 → 今天自然巡到還沒碰的科。
- **完全 invisible**：**無任何 UI / 文案改動**。開發新連結那行照舊只顯示所選科 + persona，不出現「輪替 / 因為你還沒碰 / 覆蓋率 / 還剩幾科」等字樣。
- **Out of scope（本 change 不做）**：任何覆蓋地圖 / 完成度 / 分母 UI、accent 美術、R2 sync、把偏壓明示給玩家。

無 Dexie 版本 bump、無 R2 `SCHEMA_VERSION`、無 `SYNCED_META_KEYS` 改動；新增讀取僅來自既有 `prescription:v1:ng0717:imprint:*` local-only keys。

## Capabilities

### New Capabilities
<!-- 無新 capability；本 change 是既有選科能力的行為擴充。 -->

### Modified Capabilities
- `neurons-daily-prescription`: MODIFIED「System SHALL select one blind-spot family by a coverage-weighted score」——在既有 coverage score 之上疊加一層 invisible 的 imprint-coverage 偏壓（never-imprinted 優先，全長過則選最久沒長芽者輪替），純 local-only 讀取、零 schema、零 UI/文案改動。既有 eligibility / 連續 2 天跳過 / deterministic tie-break / fresh-mode 導向不變。

## Impact

- **Code**：`apps/neurons-tw/src/lib/services/prescription.ts`（`selectBlindSpotFamily` 加 optional `imprintLastTouchedByFamily` 參數 + 分層排序；`buildPlan` opts 傳遞；`getOrCreateTodayPlan` 讀 `getImprints` 建 map）。無 UI 檔改動。
- **Data / schema**：無變更。讀既有 `prescription:v1:ng0717:imprint:*`（write-once local-only）。零 Dexie/R2/`SYNCED_META_KEYS`。
- **Tests**：Vitest 覆蓋 never-imprinted 優先、全長過時 least-recently-imprinted 輪替、與既有 repeated-2-days guard 疊加、無 imprint map 時退回純 score（向後相容）、deterministic。
- **相容**：`selectBlindSpotFamily` 新參數 optional（預設空 map）→ 既有純 score 行為與現有測試不變。
