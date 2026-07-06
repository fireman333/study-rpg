# Tasks — add-neurons-concept-labels-in-quiz

> 純前端加法（讀既有 `concept-tags.json` sidecar）；不 bump Dexie/R2/sync。多 session：只碰下列檔，apply 時 explicit per-file `git add`。

## 1. 共用元件

- [x] 1.1 新增 `apps/neurons-tw/src/components/ConceptLabelRow.tsx`：props `{ labels: ConceptLabel[]; hrefFor?: (zh)=>string; onConceptClick?: (zh)=>void }`；優先序 `hrefFor` → `<a target="_blank" rel="noopener">`（互動流程新分頁）、否則 `onConceptClick` → `<button>`（review card in-app）、都無 → 靜態 chip；搬既有 chip styles（`flex-wrap`，手機不橫向捲）。`labels` 空 → render null。也在 `lib/concept-tags.ts` 加共用 `conceptBankHref(zh)` helper。
- [x] 1.2 重構 `QuestionReviewCard.tsx` 改用 `ConceptLabelRow`（行為不變：題庫/收藏維持 in-app `onConceptClick`；考前猜題 embedded 維持非互動），移除自帶重複 chip render。

## 2. 互動答題 surface（皆 post-reveal）

- [x] 2.1 `QuizModal.tsx`：`useConceptTags()` + `conceptLabelsFor(q, tags)`；**答案揭曉後**（`revealed`）於詳解區前 render `ConceptLabelRow hrefFor={conceptBankHref}`（原生 `<a target="_blank">` 新分頁）；未揭曉不 render。**⚠️ 涵蓋 出征**：expedition 答題就是走 QuizModal（`OverviewPage` expedition = QuizModal entry），故此改動同時覆蓋首頁單題 + 出征。
- [x] 2.2 ~~`MazeExpedition.tsx`~~ — **無需改**：apply 時查證 `MazeExpedition.tsx` 是迷宮視覺 band、不 render 題幹/選項；出征實際答題經 `QuizModal`（見 2.1）。spec 的「Expedition shows labels only after each question reveals」行為由 2.1 滿足。
- [x] 2.3 `MockExamRunner.tsx`：`useConceptTags()`；**只在 `state.submitted`（交卷後 review）** render `ConceptLabelRow hrefFor={conceptBankHref}`；整回作答中不顯示。

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck`（tsc --noEmit clean）+ `vitest run`（826 tests / 107 files 全綠，既有題庫/收藏 label 回歸不破）。
- [x] 3.2 preview end-to-end（dev, localhost:5175）：**QuizModal**（出征入口）答題前無 `考點` → 揭曉後出現 2 個 label ✓；**MockExamRunner** 作答中 scoped 無 `考點`（`conceptInMockDuringAnswer=false`）→ 交卷 review 出現 label ✓。
- [x] 3.3 新分頁 anchor 實測：互動流程 label render 為 `<a target="_blank" rel="noopener" href="/bank?concept=…">`（QuizModal + MockExamRunner review 皆驗；/bank card 仍為 in-app `<button>`）；直開 `/bank?concept=顏面神經分支與副交感成分` → search box prefill + 結果收斂 ✓。
- [x] 3.4 SPA（localhost）：直接 URL `/bank?concept=` render ✓；F5 reload 後仍在 `/bank?concept=`、非 404、search 仍 prefill ✓（本 change 不新增 route）。
- [x] 3.5 手機 RWD 390px：`scrollWidth==clientWidth==390`（無橫向捲）✓；concept row `flex-wrap: wrap` ✓。
- [ ] 3.6 **prod real-browser render check**（deploy 後）：於 prod base `/neurons/` 實測三 surface label render + 點擊開新分頁——dev base `/` 過 ≠ prod 過（BASE_URL 坑，見 memory `neurons-content-fetch-base-url`）。**未做：需先 merge→deploy。**
