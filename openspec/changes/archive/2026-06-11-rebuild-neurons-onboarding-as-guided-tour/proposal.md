# rebuild-neurons-onboarding-as-guided-tour

## Why

`improve-neurons-onboarding` 換上的非阻斷 coaching strip 解決了「死按鈕」與 jargon 問題，但它只是一條固定在畫面底部的文字條 — 它**講**下一步，卻不**指**下一步。新玩家還是要自己在頁面上找「📖 閱讀此科在哪」「從哪裡答題」「儀表板是哪一塊」。Owner 已拍板：把首次體驗重建成**完整的互動導覽（guided tour）** — 開場歡迎卡講清核心循環，之後逐步用聚光燈（spotlight）直接框住下一個要點的 UI 元素，讓全新玩家照著走就能把整個遊戲玩起來（無阻力閱讀＋解題 → 能量 → 神經元在腦圖前進 → 抽出第一隻 → 答錯進錯題出征）。

同時，首頁版面正在被另一條並行 change 重構 — 導覽的聚光定位**不能**寫死座標或依賴特定版面結構，必須 layout-agnostic：用 `data-tutorial` anchor 在 runtime 量測，anchor 不在就優雅降級，永不蓋空、永不 crash。

## What Changes

- **開場歡迎卡（可跳過、非阻斷）**：首次載入顯示置中歡迎卡，用 ≤3 行白話講核心循環（📖 閱讀／答題 → 能量 → 神經元在腦圖前進 → 走到腦區抽神經元；答錯進錯題出征＝修復連線＋抽 DMN 卡）。背景 dim 不攔截點擊（pointer-events none），按「開始引導」進入逐步聚光、「跳過」直接結束。
- **逐步元素聚光導覽**：依序聚光 📖 閱讀此科按鈕 → 答題（QuizModal 選項區）→ 腦圖 → 每日儀表板 → 等待抽出第一隻神經元（底部待機條）。每步一行繁中指令＋「下一步」＋「跳過引導」。步進由**觀察既有遊戲事件**驅動（`onAnswerCorrect` / `onReadingTimerStateChange` / `connectome.variantSlotUnlocked`），不改 walker / 能量 / gacha 邏輯；`variantSlotUnlocked` 在任何一步觸發都直接跳到終點慶祝（保留 🎉 抽出第一隻神經元）。
- **Layout-agnostic 聚光定位**：anchor 一律 `document.querySelector('[data-tutorial="…"]')`（+ 既有 `[id^="family-card-"]` fallback）→ `getBoundingClientRect()` runtime 量測；`resize` / `scroll`（capture）＋輕量輪詢 re-measure。**anchor 不存在 → 該步降級為置中文字卡**（不蓋空、不 crash）。聚光 dim 層 pointer-events none — 被框住的元素本人保持可點（非阻斷）。
- **出征解鎖聚光升級**：保留首次答錯的 just-in-time 教學與 one-shot / 引導期間延後語意，但改走同一套 spotlight 引擎 — 有 `[data-tutorial="expedition"]` anchor 時真正框住 ⚔️ 鈕，沒有則降級置中卡。
- **狀態不變**：沿用 `neurons:onboarding:guidedComplete` / `expeditionSpotlightSeen` 兩支 device-local meta key（不新增 key、不 bump Dexie、不動 `SYNCED_META_KEYS` / R2）；`maybeAutoCompleteForExistingPlayer` 與帳號重置清除語意原樣保留。HelpMenu「重看新手引導」重播入口保留（重播從歡迎卡開始）。
- 純導覽步進邏輯（step machine + anchor 解析）抽成可單元測試的 pure module。

不在範圍：不改 `OverviewPage.tsx` / `FamilyPicker.tsx` / `styles.css`（並行 layout change 所有）；不改 walker / 能量 / gacha / settle；不加 telemetry。

## Capabilities

### Modified Capabilities
- `neurons-onboarding`：(1) 互動引導由「底部 coaching strip（≤4 步）」重建為「歡迎卡＋逐步元素聚光導覽（≤7 步）」，終點仍為 `connectome.variantSlotUnlocked` 慶祝；(2) 新增 layout-agnostic 聚光定位＋優雅降級 requirement（`data-tutorial` anchor / runtime 量測 / anchor 缺失降級置中卡）；(3) 出征解鎖聚光改走 anchor-based spotlight（有 anchor 框鈕、無 anchor 降級），one-shot / 延後語意不變；(4) skippable / replayable requirement 措辭由 overlay 改為 tour（重播從歡迎卡開始）。

## Impact

- **改檔**：`apps/neurons-tw/src/components/OnboardingHost.tsx`（重建為 tour orchestrator）、`src/lib/services/onboarding.ts`（doc 註解對齊 tour；key 不變）、`src/components/HelpMenu.tsx`（新手引導 section 文案對齊 tour）、`src/components/QuizModal.tsx`（**僅**在答案選項容器加 `data-tutorial="quiz-answer"`，一行 additive）、`src/__tests__/onboarding.test.ts`（擴充 tour step machine / anchor 降級測試）。
- **新檔**：`src/lib/services/onboarding-tour.ts`（pure step machine ＋ anchor 解析，node 環境可測）、`src/components/onboarding/SpotlightOverlay.tsx`（量測＋聚光＋降級引擎）、`src/components/onboarding/GuidedTour.tsx`（步驟內容＋事件訂閱）。
- **anchor 相依（消費、不生產）**：`[data-tutorial="reading"]` / `[data-tutorial="maze"]` / `[data-tutorial="connectome-status"]` / `[data-tutorial="expedition"]`（由並行 layout change 在首頁蓋章）＋ 既有 `[id^="family-card-"]`；全部 defensive — 任一缺失都降級。
- **事件相依（只訂閱、不改）**：`lib/maze/answer-feedback`（onAnswerCorrect / onAnswerWrong）、connectome `events` bus（`connectome.variantSlotUnlocked`）、`lib/services/reading-timer`（`onReadingTimerStateChange` + `getReadingTimerState`）。
- **無 schema 影響**：不 bump Dexie、不動 R2 `SCHEMA_VERSION`、不加 `SYNCED_META_KEYS`、不新增 meta key。
- **約束**：手機 first；所有動畫尊重 `prefers-reduced-motion`（`useRespectsReducedMotion`）；新樣式走 inline `CSSProperties`，不碰 `styles.css`。
