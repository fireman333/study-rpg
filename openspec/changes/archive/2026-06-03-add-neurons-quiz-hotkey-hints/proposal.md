## Why

neurons-tw 的 QuizModal 早已透過 `useQuizHotkeys` 完整支援鍵盤操作（答題前 `1`–`4` highlight 選項、`Enter` 送出；答題後 `1` 收藏 / `2` 太簡單 / `3` 我亂猜 / `Enter` 下一題、加捲動鍵），且 `aria-label` / `title` 也已標註對應數字。但畫面上**完全沒有視覺提示**——滑鼠使用者無從得知這些快捷鍵存在，公告 banner（`QuizHotkeysAnnouncementBanner`，已 ship 在 OverviewPage）一次看過就忘。

二階（medexam2-hospital-tw）對同一個 hook 已有成熟解法：在每顆按鈕左下角放低調的下標角標（`₁ ₂ ₃ ₄` / `↵`），桌機限定顯示。本變更把這個視覺層補進 neurons，讓既有但隱形的鍵盤能力被看見。

## What Changes

- 在 QuizModal 的選項按鈕與 footer 按鈕左下角加入小字快捷鍵角標（`aria-hidden`，純視覺），鏡像二階 `.quiz-hotkey-badge` 樣式。
- 角標**與 phase 一致**（單一真實來源 = `useQuizHotkeys` dispatcher）：
  - 答題前（asking）：4 顆選項顯示 `₁ ₂ ₃ ₄`（此時 1–4 = highlight 選項）。
  - 答題後（answered）：收藏顯示 `₁`、太簡單 `₂`、我亂猜 `₃`、下一題 `↵`（此時 1/2/3 才是 bookmark/easy/guessed）。
- 桌機限定：透過 `@media (hover: hover) and (pointer: fine)` 顯示；觸控裝置完全隱藏（無實體鍵盤）。
- **不**改鍵盤邏輯、**不**動 schema / Dexie / R2 sync、**不**加新 dependency。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neurons-mode`: QuizModal 既有的鍵盤 hotkey requirement 新增「視覺角標提示」行為（桌機限定、phase-aware、aria-hidden）。

## Impact

- **Affected specs**: `neurons-mode`（ADDED requirement 一條）。
- **Affected code**: `apps/neurons-tw/src/components/QuizModal.tsx`（選項按鈕 / BookmarkButton / FlagButtons / 下一題按鈕加角標 span + host 按鈕補 `position: relative`）、`apps/neurons-tw/src/styles.css`（新增 `.quiz-hotkey-badge` 桌機限定規則）。
- **無**資料 / 同步 / 持久層影響：不碰 Dexie `.version()`、不碰 R2 bundle `SCHEMA_VERSION`、不碰任何 sync adapter。
- **Out of scope**: 公告 banner（已 ship）；鍵盤行為本身（已 ship）；`結束` 按鈕（無對應快捷鍵，不加角標）。
