## Why

審視 5 個 DMN fate-card 事件獎勵對照**目前**經濟（`promote-maze-to-home` 後 maze settle 是唯一抽卡路徑、AP 不再解鎖 slot、手動抽卡 + 全域能量幣已退役），發現 2 個事件**已失準**——這是 maze-promotion 的遺留設計債，跟剛上線的 expedition earning 改動正交：

- **family-buff** 加 AP，但 [connectome.ts:150](apps/neurons-tw/src/lib/services/connectome.ts:150) 明載「AP no longer unlocks variant slots」；`familyAccrual.ap` 現在只餵 leaderboard `total_AP` + 角色卡 + 成就門檻 = **純虛榮分**，不推進收集核心 loop。
- **quick-review-batch** 彈「5 題 SRS-due」placeholder toast，但 neurons 沒有 SRS scheduler（一直空轉），且現在跟已上線的 ⚔️ 出征 + `/bookmarks` 錯題 tab 功能重疊。

另外 3 個事件仍對齊核心 loop，**維持原樣**：variant-rate-up（`pullVariant` settle 路徑消費 → roll-twice-take-rarer）、streak-shield（保住 maze 能量 streak 倍率）、hidden-reveal（DMN 圖鑑 meta 提示）。

## What Changes

- **family-buff 改餵 maze 能量（不再碰 AP）**：被 buff 的 family 答對時，post-commit maze 能量 faucet × `FAMILY_BUFF_ENERGY_MULT`（預設 2，dogfood-tunable）、持續 1hr。`getActiveFamilyBuffBonus(familyId)` 由「回傳 AP bonus 0/1」改為「回傳能量倍率 1.0 / 2」，套用點從 in-tx 的 `newAp` 移到 post-commit 的 `accrueMazeEnergy(branch, CORRECT_ENERGY × streakMultiplier × masteryMult × familyBuffMult)`。移除 `+ dmnApBonus`（family-buff 不再灌 AP）。能量路由到該 family 的分支。
- **quick-review-batch 改成可點擊的 5 題出征 mini-batch**：`DmnQuickReviewToast` 從 placeholder 變成 CTA「▶ 5 題快速複習」；點擊開既有 expedition `QuizModal` on 錯題 pool 的 ≤5 題切片（`buildWrongQuestionPool` 取前 5；<5 取現有；0 則 toast 顯示無題可複習）。清除走**同一條** `onExpeditionComplete → creditExpeditionDraws → DMN 抽卡軸` → 形成閉環（DMN 卡 → 迷你出征 → 清錯題 → 更多 DMN 抽卡）。非侵入：事件只 ARM toast，玩家點才開（不自動打斷）。
- **順手修正 spec 文字 drift（行為不變）**：因 MODIFIED 需重寫整個 requirement，趁此把 variant-rate-up（spec 寫「權重 20/30/30/15/5」但 shipped code 實為 `pullVariant` roll-twice-take-rarer）與 streak-shield（spec 寫「1 day of no app open」但 neurons 是 correct-answer streak）兩列**對齊到實際程式碼**——純文件真實性修正，**不改這兩個事件的行為**（不動 variant-gacha.ts / streak.ts）。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neurons-dmn-fate-cards`: 「Five DMN event types SHALL be defined with bounded magnitudes」requirement — family-buff 量值由「+2 AP/正確」改為「被 buff family 的 maze 能量 ×`FAMILY_BUFF_ENERGY_MULT`（預設 2）、1hr、無 AP 效果」；quick-review-batch 由「surface 5 SRS-due questions」改為「arm 一個可點擊的 5 題出征 mini-batch、清除計入 expedition DMN 軸」。variant-rate-up / streak-shield / hidden-reveal 量值不變。

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/services/dmn-event-dispatcher.ts`（`getActiveFamilyBuffBonus` 改回傳能量倍率）
  - `apps/neurons-tw/src/lib/services/connectome.ts`（family-buff 倍率移到 post-commit 能量 faucet；移除 AP bonus）
  - `packages/content-neurons-tw/src/dmn-types.ts` + `index.ts`（新增 `FAMILY_BUFF_ENERGY_MULT = 2`）
  - `apps/neurons-tw/src/components/DmnQuickReviewToast.tsx`（placeholder → 可點擊 CTA）
  - `apps/neurons-tw/src/routes/OverviewPage.tsx`（5 題 capped quick-review expedition entry，重用 QuizModal + onExpeditionComplete）
  - UI 文案：`HelpMenu.tsx`（family-buff / quick-review-batch 說明更新）
- **持久化 / sync**：**零 schema 改動**。family-buff / variant-rate-up 仍走既有 `dmnActiveBuffs` Dexie table（結構不變）；能量 faucet 是既有 per-branch meta。**不 bump Dexie、不 bump R2 SCHEMA_VERSION、不動 SYNCED_META_KEYS**。
- **不影響**：DMN 抽卡如何 earn（剛上線的 expedition 軸）、DMN catalog 20 張卡 / artwork、其餘 3 事件。
- **平行 session**：branch `track-neurons-p4`（接續 08d581b）。觸碰 connectome.ts / dmn-event-dispatcher.ts / dmn-types.ts / DmnQuickReviewToast.tsx / OverviewPage.tsx / HelpMenu.tsx。Feature 1 的 `add-neurons-instance-rename` 鎖 db.ts/bundles.ts/tables.ts/CollectionPage.tsx — 檔案集確定後再經 session-bus 確認零重疊。
- **Tests**: `getActiveFamilyBuffBonus` 能量倍率單元測試 + connectome faucet ratio 測試（buffed = 2× unbuffed branch energy）+ quick-review pool ≤5 cap 測試。
