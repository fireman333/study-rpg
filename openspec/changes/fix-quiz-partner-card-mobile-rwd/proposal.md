## Why

手機版（< ~520px）QuizModal 的醫師夥伴卡片（`.quiz-modal__partner`）採用單行 flex row，在窄螢幕上同時放入 sprite、名字 / 簡介、加成 badge（✨ 1.1×）、醫師選單四個元件後空間嚴重不足：名字文字被截斷、加成 badge 與文字重疊、選單下拉溢出框外。考量到主要使用情境為手機練題，此版面問題直接影響核心 quiz loop。

## What Changes

- 新增 `@media (max-width: 520px)` 規則至 `styles.css` 的 `.quiz-modal__partner` 區塊
- 手機版改為兩行 flex layout：
  - **Row 1**：sprite（56px）+ info（名字 / 簡介，`flex: 1` 完整展開）
  - **Row 2**：加成 badge（若有）+ 醫師選單（若有），縮排 66px 對齊 info 左邊
- 用 CSS sibling selector（`.quiz-modal__partner-bonus + .quiz-modal__partner-picker`）處理「只有 picker 無 bonus」時的縮排邊角 case
- **零 JSX / HTML 改動**；不影響桌機（≥ 521px）版面

## Capabilities

### New Capabilities
- `quiz-partner-card-rwd`: QuizModal 醫師夥伴卡片在手機寬度下正確顯示兩行版面，不截斷文字、不重疊元件。

### Modified Capabilities
- `hospital-quiz`: quiz-runner UI 在手機螢幕的版面規格新增 RWD 行為要求（夥伴卡片兩行分拆）。

## Impact

- **修改檔案**：`apps/medexam2-hospital-tw/src/styles.css`（新增 ~15 行 CSS）
- **不影響**：JSX 結構、題目邏輯、SRS 排程、Supabase sync、任何 API
- **桌機版面**：完全不受影響（media query 閾值 520px 以下才觸發）
- **Edge case**：bonus badge 條件渲染（`specialtyMultiplier > 1.0`）+ picker 條件渲染（`doctors.length > 1`）四種組合均需驗證
