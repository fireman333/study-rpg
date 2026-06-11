> Presentation-only。零 Dexie/R2/SYNCED_META/economy 改動；chip 篩選邏輯（controlled `visible` set）不動。

## 1. FamilyFilterChips (圖鑑科別 chips)

- [x] 1.1 移除 `X / N 科` count span 與 `countStyle`（open-collection：分母不可見；窄寬不再被佔位）。
- [x] 1.2 Chips 自由多列換行確認：`barStyle` + `chipRowStyle` 均 `flexWrap: wrap`、無列數上限 / 無 `overflow` 裁切 / 無水平捲動。
- [x] 1.3 Label 對多列 chip 區塊 top-align：`barStyle.alignItems` `center` → `flex-start`；`labelStyle` 加 `paddingTop: 0.18rem` + `whiteSpace: nowrap`（mirror `YearFilterBar`）。

## 2. 全 app chip-RWD 稽核

- [x] 2.1 `YearFilterBar`（homepage 年份）：已 free-wrap + label top-align → 不動。
- [x] 2.2 `QuestionBankPage` ChipGroup（科目 / 年份 / 梯次）：已 free-wrap（`chipRowStyle` flexWrap + label `flex-start`）→ 不動。
- [x] 2.3 `LeaderboardPage` filter tabs：tab row `flexWrap: 'wrap'` → 不動（nickname 欄 `nowrap` 是刻意 ellipsis truncation，非 chip cap）。
- [x] 2.4 `BookmarksPage` / `AchievementsPage` chip rows：均 `flexWrap: wrap` → 不動。
- [x] 2.5 頂部 nav（`.neurons-nav`，<768px 水平捲動 + fade mask）：刻意設計（consolidate-neurons-nav-tabs），非缺陷 → 不動。

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` clean。
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw test` 全綠。
- [x] 3.3 Orchestrator Chrome MCP 目視 ✓：`/collection` 在 forced 340px 寬下 chips wrap 成 3 列、`scrollHeight==clientHeight`（無裁切）、`X / N 科` 已移除、`flexWrap:wrap`（JS 量測；窗口 viewport 受限故用 forced-width 驗證）。
