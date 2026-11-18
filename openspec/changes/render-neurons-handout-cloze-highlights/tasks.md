> 路徑：`app/…` = `apps/neurons-tw/src`。新測試一律 node tier（JSDOM 當 parser、純函式、source-text 守衛、fake-indexeddb）；不新增 `.test.tsx`。每條守衛做一次 mutation probe。

## 0. 前置

- [ ] 0.1 確認 `add-neurons-handout-cloze-collection-and-review` 已 archive 並上線，且已量 1–2 週對照期；`SCHEMA_VERSION` 目前為 29
- [ ] 0.2 逐字比對本 change `specs/neurons-anatomy-handout/spec.md` 與主 spec〈閱讀進度與章節深連結〉：除本 change 新增的例外句、scenario 文字補充與新 scenario 外完全相同；不同就以主 spec 為底重寫 delta
- [ ] 0.3 確認收藏 change 的接口存在且簽名一致：`playableCardsForConcept`、`useClozeCollected`、`collectClozeCard`、`clozeFaceSegments`；`keypoint-cloze-row-host` 是 topic 最後一個子節點
- [ ] 0.4 baseline：`pnpm -r typecheck`、`pnpm --filter @study-rpg/neurons-tw test`、`openspec validate --all --strict`

## 1. iOS spike（D4）

- [ ] 1.1 iOS Safari 真機（17.2+）：Custom Highlight 下 `caretRangeFromPoint` 的 node/offset 是否落在被畫的 text node；捲動容器上的委派 click 是否派送；片段右緣、跨行片段、緊鄰 emoji 三種邊界。結果寫進 design「spike 紀錄」；caret 不可靠就改純矩形判定並更新決策清單。需 owner 的 iPhone，owner 不在時標 `[~]`，先以桌面 Chromium + Safari 驗

## 2. 對位純函式（D1）

- [ ] 2.1 `app/lib/handout-cloze/anchor.ts`：`resolveClozeRanges(root, cards, {subjectId})`，六步、八個 reason，只讀 DOM、只建 `Range`
- [ ] 2.2 `needsReanchor(drawn, records)` 純函式（D2 的 (a)(b)）
- [ ] 2.3 `handout-cloze-anchor.test.ts`：JSDOM 載入試點兩科出貨講義 HTML，模擬猜題按鈕與字卡列 host（host 內放含某卡 `bulletText` 的 `ul > li`）；卡片由收藏 change 的函式以出貨檔餵入；斷言 skipped = 0、drawn = 出貨卡數（由檔案推導）、每個 Range `toString() === exact`、最近 `li` 的父元素是 `ul.hdt-must`、對位前後 `root.innerHTML` 逐位元相同；合成案例涵蓋每個 reason（`exercised` 集合對 reason 清單做涵蓋斷言）
- [ ] 2.4 `needsReanchor` 測試：換文字、移除節點、新增 topic 觸發；host 內新增 / 移除節點不觸發
- [ ] 2.5 mutation probe：作者 bullet 改用 `.hdt-topic li` → 「card row lists the sentence」案例紅；拿掉 6 的字面複核 → `range-mismatch` 案例紅

## 3. hook 與畫法（D2、D3、D4、D9）

- [ ] 3.1 `app/lib/handout-cloze/use-cloze-highlights.ts`：支援偵測；rAF 首次對位；MutationObserver（`childList`/`subtree`/`characterData`）；註冊前複核；兩個 highlight 名稱依 `useClozeCollected` 分配；換科 / 關閉時刪除並 disconnect；可對位卡數快取；click 委派（略過清單見 D4）；回傳 `{available, resolvableCount, on, setOn, previewCardId, closePreview}`
- [ ] 3.2 CSS：`:root` token `--hl-cloze-bg` / `--hl-cloze-collected-bg`（若有深色主題一併補）；兩條 `::highlight()`；`@media print` 透明；`.hdt-cloze-off` 不需額外樣式（靠取消註冊）
- [ ] 3.3 點擊判定純函式＋測試：合成 caret 點命中；右緣外側被矩形擋下（矩形以注入函式替身）；連結 / 按鈕 / `.keypoint-cloze-row-host` 內點擊略過；有選取時略過
- [ ] 3.4 source-text 守衛：`anchor.ts`、`use-cloze-highlights.ts` 剝註解後不含 DOM 寫入 API（D3 清單）；mutation probe：加一行 `node.splitText(1)` → 紅

## 4. 預覽（D5）

- [ ] 4.1 `app/components/ClozeCardPreview.tsx`：共用 modal 機制；topic 標題；`clozeFaceSegments` 卡面；「點開看答案」只在預覽內；收藏按鈕三態＋失敗訊息；≤600px 底部 sheet
- [ ] 4.2 node 測試（`renderToStaticMarkup`）：未揭示時卡面不含 answer / gloss / hint 文字；已收藏顯示「已收藏」；`undefined` 顯示載入中且 disabled；預覽元件不 import `lib/db`

## 5. 顯示開關與同步（D6）

- [ ] 5.1 `app/lib/handout-prefs.ts`：`HANDOUT_PREFS_SHOW_HIGHLIGHTS_KEY`、`useShowHighlights()`（`useLiveQuery`，缺席 / 壞列 = 開）、`setShowHighlights(on)`（只在使用者切換時寫、失敗 warn）
- [ ] 5.2 `SYNCED_META_KEYS` 加該 key；`lib/sync/backfill/handout-prefs.ts` LWW post-pass（`updatedAt` 大者勝、平手比 canonical payload、壞列規則），接進 `runOnPullComplete`（自己的 try/catch，排在既有步驟之後）
- [ ] 5.3 `r2/bundles.ts` `SCHEMA_VERSION` 29 → 30，版本史註解補 v30
- [ ] 5.4 `HandoutPage.tsx`：呼叫 hook；在 `header.hdt-header` 下載PDF 之前渲染 `hdt-cloze-toggle`（`aria-pressed`、✨ sprite、「顯示重點」），出現條件 `toggleState({supported, resolvableCount, on})`；渲染 `ClozeCardPreview`；不新增任何 Dexie / storage 呼叫（收藏 change 的 write-boundary 守衛不改即綠）
- [ ] 5.5 測試：合併收斂（同 `updatedAt` 不同 `on`，A→B / B→A 兩種順序結果相同；較新恆勝；壞列輸給本機；本機壞列被覆寫）；wipe 刪除該 key；`SCHEMA_VERSION === 30`；v29 bundle 讀為開；`toggleState` 純函式；hook 以替身 `CSS.highlights` 驗 開→關 開關仍在且註冊表空、關→開 恢復同一批 cardId、`resolvableCount === 0` 不出現
- [ ] 5.6 mutation probe：post-pass 平手改成「incoming 恆勝」→ 收斂案例紅；從 `SYNCED_META_KEYS` 拿掉 key → wipe 與 snapshot 案例紅

## 6. 說明與量測

- [ ] 6.1 HelpMenu 講義字卡段加一句：螢光、點擊收藏、header「顯示重點」可關；source-text 守衛從 `HandoutPage.tsx` 取開關標籤與 HelpMenu 比對
- [ ] 6.2 `scripts/cloze-player-metrics.mjs` 加「有收藏者中關閉重點層的比例」一欄並註明低估方向；更新其 node 測試

## 7. 真實瀏覽器驗證（內建 Browser 對 localhost dev；先驗 `innerWidth > 0`）

- [ ] 7.1 開 寄生蟲學：螢光覆蓋每張卡 answer；console 有 `[cloze-highlight] 寄生蟲學 drawn N / skipped 0`；`__clozeHighlight` 可讀
- [ ] 7.2 DOM 不變：對位前後捲動容器 `innerHTML` 相同；`?leaf=` 深連結仍落在正確 topic；猜題按鈕與字卡列仍可用
- [ ] 7.3 點擊：點螢光開預覽、收藏 → IndexedDB 該列 `collectedFrom: 'highlight-preview'`、螢光換色；點連結 / 拖曳選字不開預覽
- [ ] 7.4 開關：關 → 螢光消失、開關仍在；reload 仍關；開 → 同一批恢復；換科到 胚胎學 再換回，螢光正確、無殘留
- [ ] 7.5 列印預覽（`window.print()` 或 Playwright PDF）不見螢光
- [ ] 7.6 RWD 375 / 768 / 1280：header 開關不造成橫向捲動；預覽 ≤600px 為底部 sheet
- [ ] 7.7 以停用 `CSS.highlights` 的方式（`delete CSS.highlights` 後 reload，或舊版 Safari）確認整層缺席、無 console error、字卡列正常

## 8. 收尾與 prod 驗證

- [ ] 8.1 `/simplify`；`/opsx:verify`（clause-level）；`pnpm -r typecheck`、`pnpm --filter @study-rpg/neurons-tw test`、`openspec validate --all --strict` 與 baseline 對照
- [ ] 8.2 `/verify` 與 `/cdx review`
- [ ] 8.3 commit 等 owner 確認；deploy 屬對外發布，owner 批准才跑；push 後確認 Deploy Cloudflare Pages 綠
- [ ] 8.4 prod（`https://med-study-rpg.com/neurons/cram/handout?subject=寄生蟲學`）：螢光出現、點擊預覽、開關；F5 不 404
- [ ] 8.5 prod 同步（需 owner 已登入瀏覽器，Chrome MCP）：一台關開關 → push（Performance API 確認 PUT）→ 另一台 pull 後開關為關；舊分頁出現一次性重新整理提示。owner 不在時標 `[~]` 並寫明未驗
- [ ] 8.6 decision 檔記錄 SV 30、spike 結果、未驗項目
