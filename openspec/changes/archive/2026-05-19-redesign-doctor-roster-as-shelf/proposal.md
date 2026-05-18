## Why

把 assigned doctors 以絕對座標 overlay 在 hospital scene PNG 上的渲染方式視覺上會喧賓奪主：醫生 sprite 擋住建築物、跨醫院 tier 的 slot 位置不易維護，且 P1 火焰系 sprite 在外圍底色 PNG 沒有對應 anchor 時會浮在半空中。改成把 roster 抽離 scene，以 sprite shelf 形式置於醫院圖下方，能讓醫院建築維持為視覺主角，同時讓玩家一眼掌握各 room 的招募進度 / 上限。

## What Changes

- **BREAKING**：移除「doctor sprite 以絕對座標 overlay 在 hospital scene PNG 上」的渲染（含 `THEME_PIXEL_HOSPITAL.doctorSlotPositions` 在 React 端的消費；theme pack export 暫時保留以待後續 cleanup）
- 新增「doctor shelf」：置於醫院場景 canvas 下方、以 room type 分組的像素風相框 roster
- Shelf 採 2-rank 佈局：rank 1 = 門診（最大 group 獨佔一列）；rank 2 = 病房 + 開刀房 並排，跨 rank 之 cell 上下對齊、整體相對醫院 canvas 水平置中
- 每 cell 顯示 sprite + 醫師名 + 科別；空 slot 顯示「?」placeholder + 虛線邊框 + 斜紋底，讓 tier 的招募上限視覺化
- 每群 row 各自 `overflow-x: auto`，未來門診 ≥ 8 人時不影響其他列佈局
- Rarity 邊框色（P1 金、P2 紫、P3 藍、P4 綠、P5 木）保留用於 cell 邊框

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `hospital-scene`: 「Doctor sprites SHALL render at assigned-room-bound slot positions」 requirement 改寫為「Doctor sprites SHALL render in a roster shelf grouped by room type beneath the scene canvas」；scene 本身保留 tier 切換與 click → upgrade modal 行為

## Impact

- **Code**：
  - `apps/medexam2-hospital-tw/src/components/HospitalScene.tsx`：移除 `filled` overlay 渲染，新增 `groups` + `SHELF_ROW_LAYOUT` 結構與 shelf JSX
  - `apps/medexam2-hospital-tw/src/styles.css`：新增 `.doctor-shelf*` / `.doctor-shelf__rank` / `.doctor-shelf__group*` 等 class；`.hospital-scene__doctor` 絕對定位 class 移除
- **Spec**：`openspec/specs/hospital-scene/spec.md` 第 3 個 requirement「Doctor sprites SHALL render at assigned-room-bound slot positions」全段重寫
- **Theme pack**：`@study-rpg/theme-pixel-hospital` 的 `doctorSlotPositions` export 不再被 React 端消費；不刪除以避免 v0.2.x 對外 contract 變更
- **Tests / verify**：Chrome MCP 視覺檢查（cell 數正確、cell x 座標跨 rank 對齊、整組相對 canvas center 置中、`overflow-x` 在 ≥ 8 cells 時觸發橫向 scroll）
- **無資料/存檔影響**：純 render 層改動，IndexedDB / sync schema / 既有 doctor row 結構不變
