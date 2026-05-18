## Context

二階 hospital home 頁面從 M_2nd MVP 起就採用「醫院 PNG + assigned doctor sprite 以絕對座標 overlay 在 building 上方」的渲染。一階 dogfood 期間發現三個視覺問題：

1. 醫院建築 本身是視覺主角（多層立體 pixel art），doctor sprite overlay 橫排在前景把建築物擋住
2. P1 火焰系 sprite 帶外圍光環，沒有 building anchor 對齊時看起來「浮在半空」
3. `theme.doctorSlotPositions[tier]` 是手動 hard-code 的 `{x, y}` 座標，每升一階就要重調，且因 sprite 寬度 96 px 在不同 tier 場景下很難一致

當前 `HospitalScene.tsx` 計算 `filled` 陣列（doctor → slot 對應），React 把它 map 成 `<img class="hospital-scene__doctor">` absolute-positioned 在 `.hospital-scene__canvas` 內。CSS `.hospital-scene__doctor` 用 `left: ${pct}%; top: ${pct}%; transform: translate(-50%, -50%)`.

## Goals / Non-Goals

**Goals:**
- 醫院 PNG canvas 保持純粹，建築物完整可見、無 sprite 遮擋
- Doctor roster 以結構化 grid 呈現：room type 分群、每群 cell 上下對齊、整組相對醫院 canvas 水平置中
- 顯式表達各 tier 的招募上限：empty slot 以 dashed 邊框 + 「?」placeholder 呈現
- 各群獨立可橫向 scroll，未來門診 ≥ 8 人時不影響其他列
- Rarity 邊框色（P1 金 / P2 紫 / P3 藍 / P4 綠 / P5 木）保留

**Non-Goals:**
- 不動 doctor row schema、不動 assignedRoom 邏輯、不動 throughput 公式
- 不刪除 `theme.doctorSlotPositions` export（保留以避免 v0.2.x 對外 contract 破壞；待後續 sweep 處理）
- 不引入 drag-and-drop reassign room（後續 change）
- 不引入 cell click → 跳醫師名冊（後續 change）
- 不動醫院 PNG asset 本身

## Decisions

### D1: Sprite overlay → shelf cards under canvas

**選擇**：把 sprite 從 absolute positioned overlay 抽離 scene，改成 `.hospital-scene` 內 sibling element `.doctor-shelf`，flex column 排在 canvas 下方。

**替代方案**：
- (A) 保留 overlay，只 fine-tune slot 座標 — 不解決「sprite 蓋建築」根本問題
- (B) 把 doctor 縮小（48 px）擠進建築窗戶 — 視覺辨識度差，rarity 邊框難放
- (C) 用 isometric 視角讓 sprite 在大樓前排走動 — 範圍超出 spec.md 的 GBA pixel 約束、且 animation 成本大

選 shelf 是因為 (1) 醫院 PNG 設計初衷就是「建築物為主角」，sprite 抽出去最忠於原 asset；(2) shelf 是 layout 級結構，沒有座標 hard-code，新增 tier 不用調 slot；(3) 視覺上玩家一眼看到「我在 ward/outpatient/surgery 各群的進度」。

### D2: 2-rank 佈局而非 3-rank

**選擇**：rank 1 = 門診（7 slot），rank 2 = 病房（3 slot）+ 開刀房（4 slot）並排，兩列各 7 cells。

**替代方案**：
- (A) 3 個垂直 group rows — 每群一列。但各 row cell 數差距大（門診 7 vs 病房 3）視覺不平衡
- (B) flat horizontal shelf 不分群 — 失去 room type 語意，玩家要 cell 一個個讀 chip 才知道分配

選 2-rank 是因為門診 group 的 slot 數（7）剛好等於 病房 + 開刀房（3+4=7），兩列等寬視覺平衡。`SHELF_ROW_LAYOUT` 常數明確定義此 layout，未來 tier 4 slot 數有變化可調。

### D3: Cell pixel-grid 對齊靠 gap 數學

**選擇**：`.doctor-shelf__rank` 的 `gap: 8px` 跟 `.doctor-shelf__row` 內 cell gap `8px` 一致，所以 rank 2 病房 group 末 cell 跟 開刀房 group 首 cell 之間的距離等於 rank 1 內任 2 cell 之間的距離 → cells 自然 column 對齊。

**替代方案**：
- (A) CSS Grid 顯式 7-column template — 過度約束（rank 2 跨群 cell 數要寫死），未來 tier 變化要改 grid template
- (B) 不對齊（接受 16 px 跨群 gap）— 視覺凌亂

選 flex + 同 gap 是因為 (1) 不犧牲 group 語意（仍是 2 個獨立 `.doctor-shelf__group`），(2) cell 寬度 84 px 固定下，math 自然成立，(3) 未來 tier 變化只要更新 `SHELF_ROW_LAYOUT` 內 room 排列。

### D4: 整組相對 canvas 水平置中

**選擇**：`.doctor-shelf__rank` 加 `justify-content: center`，讓 group(s) 在 700 px max-width rank 中置中。

**替代方案**：
- (A) 不置中（left-aligned） — 視覺上 shelf 跟 canvas 左邊對齊但右邊空 64 px，不平衡
- (B) shelf 改成 `max-width: cell content width` — math fragile，cell 數變化要重算

選 center 是因為 canvas 中線跟 cell row 中線都在 960 px（驗證過），視覺重心一致。

### D5: Empty slot 用 dashed border + diagonal hatch + "?" placeholder

**選擇**：`.doctor-shelf__cell--empty` 帶 `opacity: 0.55`、`border-style: dashed`、內部 `.doctor-shelf__sprite-frame--empty` 是 `repeating-linear-gradient(45deg, ...)` 斜紋底 + 28 px Press Start 2P "?"。

**替代方案**：
- (A) 不顯示 empty slot（只 render filled） — 失去「招募上限」訊息
- (B) Empty slot 純空白方框 — 視覺上像 loading state，玩家可能誤判
- (C) Empty slot 文字標 "招募中" — 太冗長、像系統訊息

選現方案是因為 (1) "?" pixel font + dashed border 在 GBA 美術圈是「unknown/slot」標準視覺語言，(2) hatch pattern 讓 empty 跟 filled cell 視覺差異明確、又不至於太醒目搶 filled cell 注意力。

## Risks / Trade-offs

- **垂直空間從 ~140 px 增到 ~280 px** → home 頁 banner / counters 往下推 ~140 px。Mitigation: 醫學中心 tier 招募階段本來就是「招募為視覺重點」的時期，shelf 變第二視覺重點是合理 framing；mobile (< 768 px) cell 縮成 72 px、shelf 高度降到 ~240 px。

- **`doctorSlotPositions` theme export 變 dead code** → 後續 fork 的 theme pack 作者會 confused。Mitigation: 不刪 export（保留 v0.2.x contract），在後續 cleanup change 加 deprecation comment + 文件，並在 `core-npm-package` 下一 minor version（0.3.x）標 deprecated。

- **`?scene=off` 緊急 fallback path** → 原本走 `renderState = null` 完全不 render shelf。現在 fallback 後 doctor 列表不可見，使用者體驗稍降。Mitigation: 保留現行 fallback 行為（fallback 時整個 `<HospitalScene>` 不 render），如果 PNG asset broken 連 shelf 也 hide，避免半殘狀態。後續若需要 PNG-free fallback 再做。

- **未來 tier 4 國家級教學醫院 room slot 數變化** → 若 ward / outpatient / surgery 配比改變（例如 ward 10、outpatient 12、surgery 6 → 各群差距大），2-rank 佈局不再平衡。Mitigation: `SHELF_ROW_LAYOUT` 是 module-level 常數，可改寫成 `Record<HospitalTier, RoomType[][]>` 讓 tier 4 用 3-rank 佈局；本 change 暫不引入此複雜度，等 tier 4 真正規劃時再 follow-up change。

- **Chrome MCP visual QA 是當前唯一 layout 驗證手段** → 沒有自動 regression test。Mitigation: 在 tasks.md 寫明「Chrome MCP smoke test：跨 rank cell x 座標一致 + shelf center === canvas center」作為手動驗證 checklist；未來引入 visual regression tool 再補。
