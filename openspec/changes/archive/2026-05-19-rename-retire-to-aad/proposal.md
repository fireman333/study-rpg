## Why

二階 hospital mode 的「退休醫師」按鈕功能正確但風味平淡 — 對醫療系玩家來說 **AAD（Against Advice Discharge，自願離院）** 是日常黑色幽默詞彙（病人不顧醫療人員勸阻自行出院），把它反向套用在「醫師自願離開你的醫院」的場景上有強烈 inside-joke 樂趣，同時跟現有「招募」「進修」等中性術語形成風味對比，加深 dogfood owner（醫學生）對 app 的個人感連結。本 change 是 Phase A — 純 user-facing label rename，零行為變動，5 分鐘 PR。Phase B（低 revenue nudge UI）刻意推遲，等 `add-tier-quiz-multiplier` dogfood 一週後再決定是否需要。

## What Changes

- **Button label**: `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx` 的 retire button 文字由「退休醫師」改為「**AAD**」
- **Hover tooltip 新增**: button 加 `title` attribute，顯示「自願離院（退休）— 退還 {refund} revenue」，讓新玩家 hover 仍能理解語意
- **Confirm modal 文字保留**: 退休確認 modal 的標題與內文 **仍稱「退休」/「自願離院」**，不改成 AAD — 確保新玩家點下去之前最後一道訊息是清晰的全稱
- **Internal names 全部不動**: CSS class `.training-retire-btn`、service function `retireDoctor`、DB table `retirementLog`、HelpMenu entry id `retire`、spec 語意名 "voluntary retirement" 全部維持原樣，只有玩家眼睛看到的 button label + tooltip 變動

## Capabilities

### New Capabilities

無 — 純 UI label 變更，不引入新行為契約。

### Modified Capabilities

- `hospital-finances`: 在既有 "Voluntary doctor retirement SHALL allow payroll relief with 24-hour diversification grace" requirement 下，補一條 UI label requirement — 明文 lock button 文字為「AAD」且 tooltip 帶全稱「自願離院（退休）」，避免日後 contributor 看到 inside-joke 字串以為是 bug 改回去

## Impact

- **改動檔案**:
  - `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx`（button label string + `title` attribute）
  - `openspec/specs/hospital-finances/spec.md`（既有 voluntary retirement requirement 加 UI label sub-requirement + 1 scenario）
- **零 schema 變動**: 無 Dexie migration、無 cloud-sync table 變動、無新 dependency
- **零行為變動**: 退休邏輯、refund 公式、24h grace、P1-anchor exception 全部不動
- **無 breaking**: 一階 `apps/medexam-tw/` 完全不受影響（沒有 retire 機制）
- **驗證面**: `pnpm -r typecheck` 全綠；Chrome MCP live smoke — 開 `/training`、看到 button 顯示「AAD」、hover 出現 tooltip、點下去 confirm modal 仍是「退休」全稱
- **Out of scope（明確留給 Phase B 或之後 changes）**:
  - 低 revenue 偵測 + nudge toast（等 `add-tier-quiz-multiplier` dogfood 1 週後決定）
  - HelpMenu / tutorial 內提到「退休」的描述文字（仍稱退休、不一致 acceptable — 只有 button 走風味化）
  - Retirement refund 公式調整（不同 axis）
  - Bench 醫師過剩的其他 mitigation（軟上限 / ticket cost up / endgame conversion）
