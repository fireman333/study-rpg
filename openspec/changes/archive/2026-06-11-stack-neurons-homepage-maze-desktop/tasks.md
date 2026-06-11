> Presentation-only。ONE `MazeGrid` canvas — CSS 規則刪改，不 re-parent/remount。零 Dexie/R2/
> SYNCED_META/economy 改動。Detail mode (C′) / mobile dock (A2) / teaser 完全不動。

## 1. Desktop overview stacking (CSS)

- [x] 1.1 `styles.css`：刪除 `@media (min-width:768px)` 內 `.neurons-md.is-expanded:not(.is-detail)` 的 2-col grid（`grid-template-columns: minmax(0,1fr) minmax(320px,420px)`）+ detail 的 `grid-column:2 / position:sticky / max-height / overflow-y` + master 的 `grid-column:1` 規則 → overview 回到 base block flow（DOM detail-first ⇒ maze 自然堆在卡片格上方、YearFilterBar 下方，與 <768px 同序）。
- [x] 1.2 `styles.css`：overview 狀態 stage 改全寬 band — `.neurons-md.is-expanded:not(.is-detail) .neurons-md__detail .maze-stage { max-width:none; aspect-ratio:auto; height:clamp(320px,48vh,540px); }`（SNAP、無 transition；mirror 手機 40svh band 與 detail-mode 62vh band 的語言）。
- [x] 1.3 Detail-mode（`is-detail`）與 `@media (max-width:767px)` 區塊**零改動**確認；collapsed teaser（無 `is-expanded`）本來就 block flow，不受影響。
- [x] 1.4 Comment 對齊：`styles.css` master-detail 總註解、`FamilyPicker.tsx`（props doc + render 註解）、不再描述「2-col rail / sticky right」。

## 2. data-tutorial spotlight anchors (additive, for the concurrent onboarding change)

- [x] 2.1 `ConnectomeStatCard.tsx`：root `<section aria-label="今日學習儀表板">` 加 `data-tutorial="connectome-status"`；⚔️ 錯題出征 CTA `<button>` 加 `data-tutorial="expedition"`（註明 one-way reveal ⇒ never-wrong 新玩家時不在 DOM）。
- [x] 2.2 `OverviewPage.tsx`：expanded `.neurons-md__maze` div + collapsed `.neurons-maze-teaser` button 都加 `data-tutorial="maze"`（兩者互斥 mount ⇒ selector 永遠剛好命中 1 個）。
- [x] 2.3 `FamilyPicker.tsx`：FamilyCard 與 DockHeader 的 📖 閱讀此科 button 都加 `data-tutorial="reading"`。

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` clean（本 change 所及檔案）。
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw test` 全綠。
- [x] 3.3 Orchestrator Chrome MCP 桌機目視 ✓：overview = chips → 全寬迷宮 band → 卡片格（screenshot 確認）。C′ detail / 🔭 全覽 / `@media (max-width:767px)` 區塊 byte-untouched。手機 viewport 在此環境無法模擬（`resize_window` 不改 `innerWidth`）→ 改 code-audit；真機待 owner。
