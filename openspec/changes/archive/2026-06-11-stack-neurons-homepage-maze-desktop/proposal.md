## Why

桌機展開、未選科的「全覽」狀態下，全域迷宮目前以 sticky 側欄掛在 family 卡片格右側（2-col rail），跟手機的單欄堆疊設計語言不一致。Owner：「全域的迷宮在電腦版展開時不用做成在 family 側邊，應該改成在 family 上面 filter chip 下面就好，和手機的設計語言比較一致，各家族 focus 的迷宮維持一樣在各個家族中展開。」

## What Changes

- **Desktop (≥ 768px) overview state**（maze expanded、`selectedFamilyId === null`）：移除 2-col rail（cards 左 / sticky maze 右），改為**堆疊單欄** — 年份 filter chips → **全寬全域迷宮** → family 卡片格，與手機 (< 768px) 的垂直順序一致（DOM 本來就是 detail-first，純 CSS 規則刪改即得）。
- Overview 狀態的 `.maze-stage` 由 1:1 正方（max-width 760px）改為**全寬 viewport-bounded band**（`height: clamp(320px, 48vh, 540px)`、`aspect-ratio: auto`），mirror 手機 band 語言；尺寸變化照舊 SNAP（無 transition — canvas invariant）。
- **不變**：desktop detail mode（C′ DockHeader + 全寬 maze + FamilyChipRail、🔭 全覽 exit）、mobile A2 dock-under-card、collapsed teaser（click-to-expand）、ONE canvas 永不 re-parent/remount（本次是 CSS-only relayout）。
- 附帶（additive、零版面影響）：為並行的新手引導 change 加 4 個穩定 spotlight 錨點 `data-tutorial="connectome-status" / "expedition" / "maze" / "reading"`（attribute-only）。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: 桌機 non-detail（overview）presentation 由「sticky right detail panel」改為「stacked full-width above the card grid」；detail mode / mobile dock / teaser 條文不動。
- `neurons-brain-maze`: 「Maze is the homepage route」的 placement 描述同步改為 stacked-above（≥ 768px 未選科時）。

## Impact

- **Code**: `apps/neurons-tw/src/styles.css`（刪 ≥768px non-detail 的 grid/sticky 規則 → 加 overview stage band 尺寸）、`apps/neurons-tw/src/routes/OverviewPage.tsx` / `components/FamilyPicker.tsx` / `components/ConnectomeStatCard.tsx`（comment 對齊 + `data-tutorial` attributes，無行為改動）。
- **零** Dexie / R2 / `SYNCED_META_KEYS` / economy / game-logic 改動 → `lint:dexie-fixtures` no-op。Presentation-only。
- **Trade-off**：overview 狀態桌機迷宮不再 sticky（捲動卡片格時不再常駐視窗）— 這是 owner 要求的手機一致行為的固有結果。
