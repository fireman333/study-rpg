## Why

`/collection`（圖鑑 → 神經元圖鑑）的科別 filter chip bar 在窄 viewport 上顯得擁擠：bar 右端的「X / 11 科」可見科數標籤佔走一截寬度、又長得像收藏分母（本頁 open-collection 原則是把總數藏起來，`X / N` 視覺上違和），且 label 垂直置中在多列 chip 區塊旁很突兀。Owner：「X/11科 在 RWD 一樣可去掉」「filter chip 的排列不要最多兩列為限」— chips 應自由換行成任意多列、窄螢幕不得擠壓 / 截斷。

## What Changes

- **移除 `X / N 科` 可見科數標籤**（`FamilyFilterChips` 的 count span）— 保留 🧬 科別 label + 全部 chip + 11 科 chips。
- **Chips 自由多列換行**：明確化 chip bar 不設列數上限、不水平捲動、不裁切 — bar 與 chip row 均 `flexWrap: wrap`；label 改 top-align（`alignItems: flex-start` + label `paddingTop`，mirror `YearFilterBar`），多列時不再浮在垂直中央。
- 附帶 RWD 稽核（neurons app 其他 chip 排列）：`YearFilterBar`（homepage）、`QuestionBankPage` ChipGroup（科目/年份/梯次）、`LeaderboardPage` filter tabs、`BookmarksPage` / `AchievementsPage` chip rows 均已 free-wrap，無人為列數上限 → 不動。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-variant-collection-view`: chip-bar 條文加「不渲染可見科數 `X / N 科`」；responsive 條文強化為「chips 自由換行成任意多列（無列數上限、無水平 overflow / 裁切），label 對多列 chip 區塊 top-align」。

## Impact

- **Code**: `apps/neurons-tw/src/components/FamilyFilterChips.tsx`（移除 count span + `countStyle`；`barStyle.alignItems` → `flex-start`；label `paddingTop` + `whiteSpace: nowrap`）。
- **零** Dexie / R2 / `SYNCED_META_KEYS` / economy / 行為邏輯改動（chip 篩選語意不變）。Presentation-only。
