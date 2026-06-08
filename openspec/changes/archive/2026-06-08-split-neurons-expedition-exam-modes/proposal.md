## Why

neurons gameplay 的 connectome（突觸連線）目前唯一由「錯題出征共同修復」驅動，但首頁的 ⚔️出征 把兩個本質不同的入口塞進同一個 chooser、兩選項長得一模一樣：**錯題出征**（修復錯題＝長腦/建立連線）和**年份回數遠征**（純測驗、不長連線）。玩家分不出哪個會長 connectome、哪個只是測驗，wire 機制完全沒被凸顯。同時年份回數遠征一份綁「醫學一＋醫學二」共 200 題，顆粒太粗，不符合玩家想「一份考卷各別練（一次 100 題）」的需求。

## What Changes

- **移除 co-equal chooser**：⚔️出征 不再開「選擇遠征」中間層。
- **錯題出征升為主 CTA**：accent 色 + 突觸/連線視覺語彙 + 「修復錯題＝建立連線」副標 + 錯題數 badge。每日核心動作，視覺最重。
- **模考降為次要入口**：中性 / exam-room 視覺（📋 考卷圖示）+ 「純測驗，不產生連線」標示；點下去直達選卷。
- **模考改成 per-book 100 題**：選**醫學一或醫學二其中一冊**，一份 100 題（原 `(year, 次別)` 全卷 200 題 → `(year, 次別, 醫學一|醫學二)` 單冊 100 題）。coverage 顯示 `已答 X / 100`。
- **文案分清兩模式本質**：錯題出征 → 修復＝建立突觸連線＋突觸傳導＋DMN；模考 → 純測驗＋DMN，**不產生連線**。
- **不改** gameplay 邏輯 / connectome credit 規則 / DMN 獎勵鏈（兩者仍餵同一條 DMN expedition 軸、共用每日上限）。零 schema、零 sync。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-study-squad`: 「All-subject wrong-question expedition」requirement — 出征 action 不再開 **co-equal** 遠征選單；改為「錯題出征 = 主要 connectome-building CTA」與「模考 = 獨立次要 exam-only 入口」的**差異化**呈現（視覺 + 文案分清楚會不會長連線）。DMN 獎勵鏈與兩者共用每日上限不變。
- `neurons-exam-set-expedition`: paper 粒度從 `(year, 次別)` 全卷 200 題改為 `(year, 次別, 醫學一|醫學二)` 單冊 100 題；picker / coverage / pool 全部 per-book，coverage 改 `已答 X / 100`；對外框架改稱「模考」。Resumable / 跨模式覆蓋 / 零 schema / DMN 共用軸獎勵等既有語意保留。
- `neurons-homepage`: CTA toolbar 從「🎲 + 單一 ⚔️出征」改為「🎲 + ⚔️錯題出征（主）+ 📋模考（次）」；出征 CTA 相關 scenario 對齊新的主/次兩入口。

## Impact

- **Code**:
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` — CTA toolbar 改主/次兩入口、移除 `expeditionMenu='choose'` 中間層、模考選卷加 `book` 維度、新增差異化 styles + 文案。
  - `apps/neurons-tw/src/lib/services/expedition.ts` — `buildExamSetExpeditionPool` / `examSetCoverage` / `listExamPapersWithCoverage` / `ExamPaperCoverage` 全部加 `book` 維度（過濾 `meta.book`，每份 100 題）。
- **Tests**: `apps/neurons-tw/src/__tests__/expedition.test.ts`（per-book pool / coverage / 選卷列表）。
- **零** Dexie `.version()` bump、**零** R2 bundle `SCHEMA_VERSION` bump、**零** Worker / D1 改動。connectome credit 規則（`creditConnectomeFromExpedition`）與 DMN expedition 軸獎勵（`onExpeditionComplete` → `creditExpeditionDraws`）完全不動。
- **純前端 UI/IA + content-pool 粒度**：無後端、無 owner dashboard 動作；部署 = push main → CF Pages。
