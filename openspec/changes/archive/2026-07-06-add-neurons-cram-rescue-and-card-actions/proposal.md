## Why

三個 owner-directed 調整讓今日處方箋卡更順手、更能把考生溫柔地拉進「考前救援」（高頻考點），同時拿掉會製造考前焦慮的「第 10 天完全體」倒數框架。設計經 Codex (gpt-5.5) 會診：核心是**不破壞「兩件小事就夠」的哲學** —— 高頻考點做成完成後的「加碼 bonus」而非必修第 3 行。

## What Changes

- **(1) 動作列雙鈕**：把「開始今日處方」CTA 與「考前？看高頻考點 →」link 合併成同一列兩個並排按鈕 —— 左「高頻考點」（→ /cram）、右「今日處方」（→ 開始/續做；dayComplete 時顯示完成態）。文字精簡。
- **(2) 考前救援 bonus（非必修，不動 dayComplete）**：兩行處方完成**後**才浮現的可選加碼「考前救援」。完成判定 = 今日從高頻考點入口**練過 N 題（不論對錯，N=1）**。純 meta key-value（`prescription:v1:cramRescue:<date>:<qid>` write-once，LOCAL-ONLY，account-reset 隨既有 prefix 一起清），零 Dexie/R2/sync。undone 時是溫柔邀請、done 時是柔性肯定（額外養分 +1 為 flavor，不真的改 NG-0717 stat）。
- **(3) NG-0717 去焦慮改寫**：拿掉「（第 10 天完全體）」倒數；hint 改開放式「每一次完成都算數」，成熟無期限、不退化；stage 不顯示 1/3/6/10 或「還差 X 天」；keepsake 文案改為「一路修補過的痕跡，不是截止日」。
- 整合：dayComplete 區把完成態、考前救援 bonus、既有「今晚收束」calm view 收攏成一致的收束體驗。

## Capabilities

### New Capabilities
<!-- 無新 capability：全部落在既有 neurons-daily-prescription。 -->

### Modified Capabilities
- `neurons-daily-prescription`: MODIFY 卡片動作區（雙鈕）+ NG-0717 maturation 文案（去倒數）；ADDED 考前救援 post-完成 bonus requirement（完成判定、非必修、誠實/anti-anxiety 約束、cram 入口 crediting）。

## Impact

- **程式碼**：
  - `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx` —— 雙鈕動作列 + 考前救援 bonus + NG-0717 文案 + 整合 calm view。
  - `apps/neurons-tw/src/lib/services/prescription.ts` —— cramRescue keys + `recordCramRescueAnswer` + `cramRescueDone` 併入 `PrescriptionStatus`（`CRAM_RESCUE_TARGET = 1`）。
  - `apps/neurons-tw/src/components/QuizModal.tsx` —— 新 `creditCramRescue` prop：cram-practice 答題時寫 cramRescue key。
  - `apps/neurons-tw/src/routes/CramPage.tsx` —— 對其 QuizModal 傳 `creditCramRescue`。
  - `apps/neurons-tw/src/lib/calm-copy.ts` —— 新增 bonus / NG-0717 / keep-going 逐字文案常數（供 copy-guard 測試）。
  - tests：cramRescue target/keys、deriveStatus cramRescueDone、copy-guard。
- **Spec**：`openspec/specs/neurons-daily-prescription/spec.md`（MODIFIED 2 + ADDED 1）。
- **零風險面**：無 Dexie schema bump、無 R2 SCHEMA_VERSION、無 sync allowlist 變更。cramRescue 是 LOCAL-ONLY daily meta（如既有 wrong/breadth 鍵）。
- **設計來源**：Codex 會診（本 session）。
