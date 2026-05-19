## Context

`apps/medexam2-hospital-tw` 的 `QuizModal.tsx` 頂部有一個醫師夥伴卡片（`.quiz-modal__partner`），以單行 `display: flex; align-items: center` 排列四個元件：

```
[ sprite 56px ] [ info flex:1 ] [ bonus badge? ] [ picker select? ]
```

桌機（~600px modal 寬）正常。手機（~375px viewport，modal 寬約 340px）時：
- info 被壓縮到 ~40px，名字文字換行 + 截斷
- bonus badge 與文字重疊
- picker select 寬度過大，整個 row 溢出

bonus 和 picker 皆為條件渲染，存在四種組合（無/無、有/無、無/有、有/有）。

## Goals / Non-Goals

**Goals:**
- 手機寬度（≤ 520px）夥伴卡片版面正確：名字完整顯示、badge 不重疊、picker 可點選
- 四種 bonus/picker 組合均正常排版
- 純 CSS 修改，不動 JSX 結構

**Non-Goals:**
- 桌機版面調整
- picker 改為 popover / bottom sheet 等互動模式變更
- 其他 modal 區塊的 RWD 修正（subject-row、options 等）

## Decisions

### D1：Flexbox wrap + order，不改 HTML 結構

**選擇**：在 `@media (max-width: 520px)` 加 `flex-wrap: wrap`，給 bonus 和 picker 設 `order: 1`（sprite 和 info 保持 `order: 0` 預設），使其自動掉落第二行。

**vs. CSS Grid**：Grid 需要在 JSX 包一個 `<div>` 把 bonus + picker 合併成同一 grid cell，才能讓兩者在第二列並排。增加 HTML 改動，複雜度不對等。

**vs. position absolute badge**：badge 絕對定位會影響 info 的文字流，反而更難對齊；且 picker select 仍需解決寬度問題。

### D2：縮排用 `margin-left: 66px`，sibling selector 處理 picker-only case

Row 2 需要對齊 info 左邊（sprite 56px + gap 10px = 66px）。

- `bonus` 出現時：`margin-left: 66px` 加在 bonus 上，picker 緊接其右（`margin-left: 0`）
- 只有 `picker`（無 bonus）：picker 自己加 `margin-left: 66px`

CSS sibling selector `.quiz-modal__partner-bonus + .quiz-modal__partner-picker { margin-left: 0 }` 覆蓋 picker 預設的 66px，正確處理兩種情況，不需 JavaScript。

### D3：斷點選 520px

Modal 卡片在手機上佔全寬（padding 扣掉約 340px）。`520px` 給平板留一點緩衝，讓 row-1 layout 在 iPad mini（768px）以上繼續正常運作。

### D4：Info `flex-basis: calc(100% - 66px)` 強制 Row 1/Row 2 切分

Apply 階段 Chrome MCP 驗證時發現：單靠 `order: 1` 不足以讓 bonus + picker 一起落到 Row 2。Flex 的 wrap 是 **per-item**，不是 **per-order-group** — items 依序 pack（sprite → info → bonus → picker），只有「下一個塞不下」的 item 才換行。在 partner 內寬 ~308px、info 收縮成 ~86px 的狀況下，sprite + info + bonus 三者勉強塞得進 Row 1，只有 picker 被擠到 Row 2。結果是 spec scenario (d) 不符（bonus 與 picker 應一起 Row 2），且 info 被 bonus 擠成過窄。

**解法**：在 `@media (max-width: 520px)` 內加：

```css
.quiz-modal__partner-info {
  flex-basis: calc(100% - 66px);
  min-width: 0;
}
```

`flex-basis` 讓 info 主張 Row 1 扣掉 sprite (56) + gap (10) = 66px 後的剩餘空間（即 row 1 滿版）。bonus + picker 因此一定塞不進 Row 1 → 一起 wrap 到 Row 2，達成 spec scenario (d) 的「Row 2 = bonus + picker together」。`min-width: 0` 確保 info 可以被內部長字壓回去（避免 long doctor name 反向把 sprite 推走）。

**vs. CSS Grid / JSX wrapper**：仍然不需要動 JSX（D1 原則保留）。本 decision 在不引入 grid 或包裝 div 的前提下，用一條 flex-basis 規則達成 row-break 效果。

**Trade-off**：在桌機（≥ 521px）media query 不適用，info 回到 `flex: 1` 預設（`flex-basis: 0`）行為，與修改前一致。已 live 驗證 1280 / 768 / 500 / forced-308 四個寬度。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 未來新增第五個元素到 partner card 後 row 2 過寬 | 同樣套 `order: 1`；多元素時再視情況加 `flex-wrap` 在 row 2 |
| 部分 Android WebView 對 `order` + `flex-wrap` 支援有差異 | flexbox order 是 CSS 2.1 標準，支援率 > 98%（caniuse），風險極低 |
| `margin-left: 66px` 若 sprite 尺寸改變需同步更新 | sprite 尺寸（56px）已為 theme constant，改動需搜尋全 CSS；此 magic number 加入 comment 說明來源 |

## Migration Plan

1. 新增 CSS media query block → `pnpm dev` 本機驗證四種 bonus/picker 組合
2. Chrome MCP mobile viewport (375px) smoke test
3. 桌機寬度回歸確認不受影響
4. Commit → push → GitHub Actions 自動 deploy
5. Rollback：還原 CSS 的 media query block 即可，無 DB / API 變動
