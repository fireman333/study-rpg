## Why

考前講義的科目選擇器目前依 `handout.json` 的 `subjects[]` 原序呈現，源頭是 build script `build-handout.ts` 手寫的 `SUBJECT_META.order`，導致醫學一 / 醫學二**交錯**（解剖0 / 組織1 / 胚胎2 / 生理3 / 藥理4 / 病理5 / 寄生6 / 微生7 / 生化8 / 公衛9 / 免疫10）。這既不符合國考的 paper 分組直覺，也與 app 內其他科目選擇器（`FamilyPicker`、`CollectionPage`）**不一致**——後兩者已 runtime 依 `EXAM_PAPER_ORDER`（single source of truth）排序。

## What Changes

- 考前講義科目選擇器改為 runtime 依 `EXAM_PAPER_ORDER`（`@study-rpg/content-neurons-tw` 既有 export）排序，先醫學一、再醫學二：
  - 醫學一：解剖學 → 胚胎學 → 組織學 → 生理學 → 生物化學
  - 醫學二：微生物學 → 免疫學 → 寄生蟲學 → 公共衛生學 → 藥理學 → 病理學
- 實作對齊既有 sibling（`FamilyPicker` / `CollectionPage`）的 runtime-sort 慣例：import `EXAM_PAPER_ORDER`，以 `[...醫學一, ...醫學二]` flatten 後的 `indexOf(subjectId)` 排序 `subjects[]`；`indexOf === -1`（未列於 `EXAM_PAPER_ORDER`）的 subject 綴到尾端（防未來新科漏排 → dead subject）。**只 import `EXAM_PAPER_ORDER`**（flat `indexOf` 不需 `FAMILY_EXAM_PAPER`；多帶會觸發 `noUnusedLocals` typecheck error）。
- **不**改 build script `SUBJECT_META`——讓 `EXAM_PAPER_ORDER` 成為全 app 唯一被 runtime 消費的排序來源，避免 build / runtime 兩處 drift。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-anatomy-handout`：新增一條 requirement 規範多科講義選擇器 SHALL 依 `EXAM_PAPER_ORDER` 排序（醫學一先於醫學二），未列科目以 extras fallback 綴後，不遺漏。

## Impact

- **改動檔（1 檔，runtime）**：`apps/neurons-tw/src/routes/HandoutPage.tsx`——`subjects` derivation（`:67`）改為依 `EXAM_PAPER_ORDER` + `FAMILY_EXAM_PAPER` 排序（`useMemo`），picker（`:274`）與 `active` fallback（`:69`）沿用排序後陣列。
- **無** schema / build / wire-format 改動；`handout.json` 內容與 build script 不動；R2 SV / Dexie / `SYNCED_META_KEYS` 皆不觸及。
- **與 `add-neurons-handout-rescue-deeplink` 的耦合（實際上近乎零）**：`EXAM_PAPER_ORDER.醫學一[0] === 解剖學`，而現況 `SUBJECT_META` 的 `subjects[0]` 也是解剖學——**排序前後預設科不變**（只動醫學一內 組織↔胚胎 的第 2–3 位 + 醫學二整塊順序）。加上 deeplink change 的 `?subject=` 同步 initializer 使 deep-link 以顯式 subjectId 決定 `active`、不依賴陣列序，兩 change 功能上零耦合。**建議 apply 順序 deeplink 先、本 change 後**（純慣例，非硬相依）。兩者同批 merge = 同次部署（owner 紅線 gate）。
- **部署 = user-visible**：科目選擇器順序改變 → 走 merge=部署 owner 確認。
