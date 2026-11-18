## Context

動機見 proposal.md。行號為 2026-10-01、`track-neurons` `27897160` 實查；`app/…` = `apps/neurons-tw/src`。本 change 以 `add-neurons-handout-cloze-collection-and-review`（下稱「收藏 change」）的定案接口為前提。

**講義怎麼變成 DOM**（`app/routes/HandoutPage.tsx`，887 行）：
- 一科一個場景、一個內部捲動容器 `scrollRef`；科目以 `?subject=` 或 subject picker 切換。每個 region 是 `<div dangerouslySetInnerHTML={{__html: r.html}} />`（`:504`），後面接 React 渲染的章節測驗 CTA（`:506-516`）。
- React 只在 `__html` 字串改變時重設 innerHTML；同科內其他 state 變動**不會**換掉作者 text node。換科時 regions 換掉、整批作者節點被替換。這與 2nd 不同：2nd 的 markdown 讀本在 sidecar 到達時會整章 remount 一到兩次。
- 作者 bullet 的結構是 `.hdt-topic[data-leaf-ids] … ul.hdt-must > li`；語料契約（`neurons-handout-cloze-corpus`）規定 bullet 文字 = 該 `li` 的 DOM `textContent`（不含巢狀清單），並有瀏覽器 parity 檢查保證它逐字等於卡片的 `bulletText`。`<cite>` 年份、emoji 字元都是 DOM 文字。
- topic 內還有 app 注入的節點：「本單元猜題」按鈕（`:221-258`，`appendChild` 到 topic）與收藏 change 的字卡列 host（`div.keypoint-cloze-row-host`，topic 最後一個子節點）。兩者都**不在** `ul.hdt-must` 內。
- header `header.hdt-header`（`:396-434`）每科都有：標題、beta、科目 chip、（回救急）、☰ 章節、⬇ 下載PDF、✕。
- 列印走 `window.print()`（`:428`）。

**收藏 change 提供的接口**：`playableCardsForConcept(conceptId)` → `{card, maskSpans:[{start,end,role}]}[]`（`start/end` 是 `bulletText` 內位置）；`useClozeCollected(cardIds)`（`undefined` = 未載入）；`collectClozeCard(cardId, 'highlight-preview')`；卡面純函式 `clozeFaceSegments`。讀本唯讀例外授權給「收藏／取消收藏」這個**動作**，所以預覽收藏不需要再改那條 requirement。

**meta 同步**：`SYNCED_META_KEYS`（`lib/sync/tables.ts:424-490`）；`metaAdapter` 只做 first-write-wins，可變值必須有 pull 後的 backfill post-pass 定義合併（`tables.ts:492-506` 註解、`neurons-cloud-sync`〈Synced meta set…〉）。post-pass 在 `lib/sync/backfill/index.ts` `runOnPullComplete`，前例 `backfill/rescue.ts`（envelope LWW、平手以序列化值定全序）。帳號切換 wipe 會刪所有 `SYNCED_META_KEYS`（`account-guard.ts:96`）。

**測試能力**：node tier 可用 JSDOM 當 HTML parser；JSDOM 有 `Range`、`toString()`、`isPointInRange`，**沒有** `CSS.highlights`、`caretRangeFromPoint`、版面幾何。

## Goals / Non-Goals

**Goals:**
- 講義正文上把每張可對位卡的 answer 畫成淡色螢光，已收藏換色。
- 正文 DOM 零改動；leaf 深連結落點、猜題按鈕、字卡列、閱讀進度、列印內容都不受影響。
- 對不上的卡**不畫**並有原因計數；不存在「畫錯位置」的路徑。
- 點螢光 → 預覽 → 收藏（委派給收藏 change）。
- 開關預設開、可關、跨裝置記得；不支援的瀏覽器安靜缺席。

**Non-Goals:**
- 收藏表、複習、熟記獎勵。
- gloss / hint 的螢光（只在預覽內挖空）。
- 鍵盤操作螢光（螢光不產生可聚焦元素；鍵盤使用者走字卡列）。
- 修改語料契約。

## Decisions

### D1 執行期對位：以 `bulletText` 逐字相等選 bullet

純函式 `resolveClozeRanges(root, cards, {subjectId})`（`app/lib/handout-cloze/anchor.ts`），只讀 DOM、只建 `Range`：
0. **取卡**：對本科每個 `.hdt-topic[data-leaf-ids]`，以 `<subjectId>::<第一個 leaf token>` 呼叫 `playableCardsForConcept`。不自建第二個 loader。
1. **找 topic**：`anchorId` 的 subjectId 必須等於目前科目，否則 `wrong-subject`；在 `root` 內找第一個 `data-leaf-ids` token 等於 leafId 的 `.hdt-topic`：0 個 → `no-topic`，>1 個 → `ambiguous-topic`（leaf-anchor gate 已在 build 擋重複，這是防線）。
2. **作者 bullet**：該 topic 內 `ul.hdt-must > li`。app 注入的節點（猜題按鈕、字卡列 host、其內任何清單）都不在 `ul.hdt-must` 下，天然排除，不需要 2nd 的「祖先鏈無 class」規則。
3. **抽 bullet 自身文字並建索引表**：深度優先走 `li` 子孫，跳過 `UL` / `OL` 子樹，收集 Text node；同時建「字串第 i 個字元 → (Text node, offset)」對照表。不做任何正規化（語料契約就是 `textContent`）。
4. **選 bullet**：自身文字**逐字等於** `card.bulletText` 者恰好 1 條才繼續；0 條 → `text-miss`，>1 條 → `text-ambiguous`。（2nd 用 hash 比對，因為它的讀本純文字要經 markdown → DOM 正規化；neurons 語料直接定義為 DOM 文字，逐字比較更強且不需碰撞論證。）
5. **定位**：取 answer 的 `maskSpans` 起訖，複核 `prefix + exact + suffix` 在該 bullet 恰好一次（否則 `unresolved` / `ambiguous`），兩者指同一位置才繼續；經對照表換成 `(node, offset)` 建 `Range`。
6. **字面複核**：`range.toString() === exact`，否則 `range-mismatch` 丟棄。

每步失敗都是「該卡不畫」。回傳 `{drawn:[{cardId, range, topicEl}], skipped:[{cardId, reason}]}`；每科一行 `console.info('[cloze-highlight] <subject> drawn N / skipped M {reason: n…}')`；DEV 掛 `globalThis.__clozeHighlight`。skipped 不向玩家顯示（該卡在字卡列仍可收藏）。

### D2 重算時機

- 首次對位：講義 HTML commit 後排一個 `requestAnimationFrame`。
- `MutationObserver`（`childList`、`subtree`、`characterData`）掛在捲動容器；回呼只做便宜檢查，命中才排 rAF 整科重算：(a) 某已註冊 Range 的文字已不等於 `exact`（涵蓋 collapsed 與就地改寫；2nd 實測過 live Range 在節點被移除時會 collapse 到仍 connected 的父節點）；(b) 本次 mutation 新增了含 `.hdt-topic` 的節點（換科）。純函式 `needsReanchor(drawn, records)`。
- 猜題按鈕與字卡列 host 的注入、字卡列的展開收合都只動 `ul.hdt-must` 以外的節點，(a)(b) 都不會命中，不觸發重算。
- 語料狀態、科目、收藏狀態變動時：收藏狀態只重新分配兩個 highlight 名稱，不重新對位。
- 註冊前逐一複核 `range.toString() === exact`，不符者不畫並排重算，所以重算前也不會畫錯字。
- 換科或關閉講義時 `CSS.highlights.delete()` 兩個名稱並 disconnect observer。
- 已知限制：背景分頁的 rAF 不跑，要等分頁可見才畫（不影響可觀察行為）。

### D3 畫法：兩個具名 highlight，正文零寫入

- `CSS.highlights.set('neurons-cloze', …)`、`'neurons-cloze-collected'`；CSS `::highlight(neurons-cloze) { background-color: var(--hl-cloze-bg) }`、collected 同理；token 定在 `:root`，若 app 有深色主題就在同一處補深色值（實作時查 `neurons-clinical-aesthetic` 的 token 檔）。
- `@media print { ::highlight(neurons-cloze), ::highlight(neurons-cloze-collected) { background-color: transparent } }`：PDF 下載不印螢光（2nd 沒有這條，因為它列印走不同路徑）。
- 重點層模組不得呼叫任何 DOM 寫入 API（`appendChild`、`insertBefore`、`replaceWith`、`splitText`、`normalize`、`innerHTML` / `textContent` 指派、`surroundContents`、`setAttribute` 於作者節點）；只在捲動容器上加 / 去一個 class（`hdt-cloze-off`）與掛 listener。

### D4 點擊判定

- 委派的 `click` listener 掛在講義捲動容器（它已有猜題按鈕的委派 click，`:279-294`，本 change 另掛一個，互不干擾）。
- 略過：`event.target.closest('a, button, summary, input, textarea, label, [role="button"], .keypoint-cloze-row-host')`；`getSelection()` 非 collapsed；開關為關。
- 取點：有 `caretPositionFromPoint` 用它，否則 `caretRangeFromPoint`；兩者都沒有 → 只用矩形。
- 比對：只在點擊所在 topic 的已註冊 Range 內找 `isPointInRange` 為真者，再以 `getClientRects()` 是否含 `(clientX, clientY)` 二次確認。命中才開預覽。
- 第一個 task 是 iOS Safari 真機 spike（caret 在 highlight 下是否可靠、委派 click 是否派送、片段右緣 / 跨行 / 緊鄰 emoji 三種邊界）；若 caret 不可靠，退回純矩形判定。

### D5 預覽

- `app/components/ClozeCardPreview.tsx`，走 app 共用 modal 機制（與 QuizModal / RescueScene 同一套圖層與 focus 管理）；標題為 topic 標題；卡面用收藏 change 的 `clozeFaceSegments`，與複習 modal 同一套挖空。
- 下方「點開看答案」只在預覽內揭示、不寫任何狀態（**已決定保留**，owner 2026-10-01）。
- 收藏按鈕：`useClozeCollected([cardId])` 為 `undefined` 時顯示載入中不可按；未收藏 →「收藏」→ `collectClozeCard(cardId, 'highlight-preview')`；reject → 「收藏失敗，請再試一次」並 `console.error`；已收藏 →「已收藏」。不提供取消收藏。
- ≤600px 底部 sheet，較寬置中小卡；不做錨定在文字旁的 popover。

### D6 顯示開關：header 工具、出現條件與畫出與否脫鉤、跨裝置同步

- **位置**：`header.hdt-header` 內、⬇ 下載PDF 之前，class `hdt-cloze-toggle`，`aria-pressed`；文字「顯示重點」，前綴既有 ✨ sprite（`ICON_FILES` 已有則沿用，task 內確認）。header 每科都有，不依附任何只有部分科才有的控制。
- **出現條件**：瀏覽器支援 **且** 本科「可對位卡數」≥ 1。可對位卡數是 D1 `drawn.length` 的快取，與開關狀態無關：開關關閉時對位照常執行（只讀 DOM），只是不註冊。所以關掉後開關仍在、呈未按下；再打開，同一批 Range 重新註冊。
- **預設**：開（該列不存在或格式不合 = 開）。
- **儲存與同步**：`meta` key `handoutPrefs:v1:showHighlights`，value `JSON.stringify({on, updatedAt})`。加進 `SYNCED_META_KEYS`（單一 key，不開 prefix matcher）。新 post-pass `backfill/handout-prefs.ts` 在 `runOnPullComplete` 內跑顯式 LWW：`updatedAt` 大者勝；相等時比 canonical payload 字串（固定 key 順序）字典序，大者勝——全序，任何 pull 順序都收斂。格式不合的 incoming 輸給好的本機；本機壞列視為不存在。
- **R2 `SCHEMA_VERSION` 29 → 30**：`SYNCED_META_KEYS` 多一個 key，舊 client 的 meta snapshot 會剝掉它；沿用既有 409 fence。
- **wipe**：帳號切換刪全部 `SYNCED_META_KEYS`，自動涵蓋；加一條測試鎖。
- **寫入歸屬**：只有 `app/lib/handout-prefs.ts` 的 `setShowHighlights(on)` 寫這一列，只在玩家按開關時寫；讀用 `useLiveQuery`，另一台裝置的變更 pull 進來後即時套用。寫入失敗 `console.warn`，當次 session 仍依點選運作。
- **唯讀例外**：這是一筆由講義控制項觸發的 `meta` 寫入，以 MODIFIED 在〈閱讀進度與章節深連結〉（收藏 change 的版本）加「顯示重點偏好」例外。
- 效果：捲動容器加 / 去 `hdt-cloze-off` class；關閉時刪兩個 highlight 名稱、click 委派直接 return。

### D7 守衛（node tier）

1. **對位正確且完整**（`handout-cloze-anchor.test.ts`）：以 JSDOM 載入試點兩科的出貨講義 HTML（`handout.json` 的 region html），模擬猜題按鈕與字卡列 host 注入（host 內放一個 `ul > li`，內容是某卡的 `bulletText`），卡片與 `maskSpans` 由收藏 change 的函式以出貨檔餵入，跑 `resolveClozeRanges`：skipped = 0、drawn = 出貨卡數（由檔案推導，不寫死 46）；每個 Range `toString() === exact` 且最近的 `li` 的父元素是 `ul.hdt-must`；對位前後 `root.innerHTML` 逐位元相同。合成案例：改 `bulletText` 一字 → `text-miss`；bullet 內重複片段 → `ambiguous`；未知 leaf → `no-topic`；他科卡 → `wrong-subject`；每個 reason 至少一例，涵蓋斷言對 reason 清單。
2. **不寫 DOM**：`anchor.ts`、`use-cloze-highlights.ts` 剝註解後不含 D3 列出的寫入 API。
3. **重算判定**：`needsReanchor` 以 JSDOM 真 Range 測換文字、移除節點、新增 topic、以及「字卡列 host 內活動不觸發」。
4. **點擊判定**：合成 caret 點命中、右緣外側被矩形擋下（矩形以注入函式替身）、連結 / 按鈕 / 字卡列內點擊略過。
5. **開關同步**：`handoutPrefs:v1:showHighlights` 在 `SYNCED_META_KEYS`；post-pass 合併收斂（同 `updatedAt` 不同 `on`，A→B 與 B→A 兩種順序結果相同；較新恆勝；壞列輸給本機）；wipe 刪除它；`SCHEMA_VERSION === 30`；v29 bundle（無 key）讀為開。
6. **開關出現與恢復**：純函式 `toggleState({supported, resolvableCount, on})` ＋ hook 以替身 `CSS.highlights` 驗：開 → 關 開關仍在、註冊表空；關 → 開 恢復同一批 cardId；`resolvableCount === 0` 不出現。
7. **讀本頁不碰 storage**：收藏 change 建的 write-boundary 守衛不需修改即成立（開關寫入在 `handout-prefs.ts`）。

每條守衛各做一次 mutation probe。

### D8 量測

- 收藏來源：預覽收藏帶 `source: 'highlight-preview'`，記在卡片列 `collectedFrom` 與 device-local telemetry；本 change 上線日之前的收藏率 = 無重點層基準。
- 「關掉重點層的玩家 ≤ 1/3」：分母 = R2 快照中有 ≥1 張已收藏卡的玩家；分子 = 其中 `handoutPrefs:v1:showHighlights` 為 `on:false` 者。分母只含收藏者，所以**低估**真實關閉率；不新增曝光訊號。收藏 change 的 `cloze-player-metrics.mjs` 加這一欄。

### D9 不支援的瀏覽器

偵測 `typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'`。不支援 → hook 回 `{available:false}`：不對位、不註冊、不掛 click、不顯示開關、不出錯。字卡列不受影響。

## 與 2nd 的差異

| # | 2nd 的做法 | neurons 的做法 | 理由 |
|---|---|---|---|
| 1 | 考點 = `keypoints[ordinal].leafId` → `headingIds[ordinal]` → `section` | 考點 = 第一個 `data-leaf-ids` token 等於 leafId 的 `.hdt-topic` | neurons 講義沒有 ordinal / heading id 綁定，leaf 直接標在 topic 上 |
| 2 | 作者 bullet = 祖先鏈只經過**無 class** 的 ul/ol/li/blockquote | 作者 bullet = `ul.hdt-must > li` | 語料契約就是這個選擇器；app 注入節點天然不在其下 |
| 3 | 以 `djb2Hex(正規化文字) === sentenceHash` 選 bullet，需正規化換行 | 以自身文字**逐字等於** `bulletText` 選 bullet，不正規化 | neurons 的 `bulletText` 就是 DOM `textContent`；`sentenceHash` 去掉了 cite，不適合當 DOM 比對 |
| 4 | reason 含 `no-keypoint` / `no-section` / `hash-miss` / `hash-ambiguous` | `wrong-subject` / `no-topic` / `ambiguous-topic` / `text-miss` / `text-ambiguous` / `unresolved` / `ambiguous` / `range-mismatch` | 對應上面兩項 |
| 5 | 重算主要為了 sidecar 到達時整章 remount | 重算主要為了換科；同科內 innerHTML 不會被重設 | neurons 只在 `__html` 改變時重設 |
| 6 | 開關放讀本頁首工具列 `.handout-reader__tools`，有 layout tier 校準 | 放 `header.hdt-header`，無 layout tier | 結構不同；neurons 沒有 layout calibration |
| 7 | 偏好用新前綴 adapter（`HANDOUT_PREFS_META`）＋三處前綴清除＋備份 | 單一 key 進 `SYNCED_META_KEYS`＋ backfill LWW post-pass；wipe 自動涵蓋；無備份 | neurons meta 同步走 allowlist + post-pass |
| 8 | bundle `schema_version` 6 → 7 | 29 → 30 | 版本線不同 |
| 9 | 預覽挖空 answer / gloss | 也挖 hint；cite 顯示為年份標籤 | neurons 語料有 hint 與 cite |
| 10 | 列印不受影響（未特別處理） | `@media print` 把螢光設為透明 | neurons 的 PDF 下載就是列印講義頁 |
| 11 | 預覽 class 要落在講義範圍守衛的前綴內 | neurons 無該範圍守衛；class 前綴 `hdt-cloze-*` 與講義一致 | 守衛不存在 |

## Risks / Trade-offs

- [執行期 DOM 與語料文字有漏網差異（新講義語法、emoji 渲染方式改變）] → 逐字不等即不畫，是「缺席」不是「畫錯」；console 計數讓 fan-out 批次一眼看出 `text-miss` 比例；語料的瀏覽器 parity 檢查是第一道防線。
- [iOS 點擊判定不可靠] → task 1.1 spike；退路純矩形判定。
- [螢光太密干擾閱讀] → 可關；密度由語料每考點上限（3–5）控制；淡色 token。
- [鍵盤無法操作螢光] → 字卡列涵蓋，Non-Goal。
- [多一個 synced meta key，舊 client 會剝掉] → SV 30 fence。
- [關閉率低估真實值] → 分母只含收藏者，D8 明寫偏差方向。
- [收藏 change archive 前又改了〈閱讀進度…〉文字] → 本 change 的 MODIFIED 以收藏 change 的版本為底；tasks §0 動工前逐字比對。

## Migration Plan

無 Dexie 升版；R2 `SCHEMA_VERSION` 29 → 30。上線順序：收藏 change archive 並上線、量一段對照期（1–2 週）後才 deploy 本 change。rollback：拿掉講義頁對 hook 的呼叫即可隱藏整層；`SYNCED_META_KEYS` 的 key 可留著（只同步一列偏好），`SCHEMA_VERSION` 不回退。

## Open Questions

（無。「點開看答案」已由 owner 2026-10-01 決定保留；開關跨裝置同步、SV 30 亦已確認。）

## 決策清單

| 決策 | 理由 | 影響範圍 | 依賴的假設 | 想改怎麼改 |
|---|---|---|---|---|
| 以 `bulletText` 逐字相等選 bullet（D1） | 語料契約即 DOM textContent，逐字比較最強 | `anchor.ts` | parity 檢查成立 | 改成比 `djb2(text − cite) === sentenceHash`（需在 DOM 上找 cite 範圍） |
| 作者 bullet = `ul.hdt-must > li` | 與語料同一選擇器；注入節點天然排除 | 同上 | 講義不在 `ul.hdt-must` 內放 app 節點 | 若日後注入進清單，改成排除已知 class |
| 對不上一律不畫、記原因 | 畫錯位置比缺席嚴重 | 玩家看到較少螢光 | 無 | 無（核心保證） |
| **已決定（owner）**：開關同步、單一 key 進 `SYNCED_META_KEYS` + LWW post-pass、SV 30 | 2nd owner 決定跟著人走；neurons meta 同步機制 | `handout-prefs.ts`、backfill、bundles | 偏好列小、LWW 足夠 | 改 device-local localStorage：刪 key 與 post-pass，SV 不回退（或本 change 根本不升 SV） |
| 平手以 canonical payload 字典序定全序 | 避免依 pull 順序決定勝負 | post-pass | key 順序固定 | 加裝置 id 欄位 |
| 開關出現 = 支援且可對位 ≥1，與開關狀態脫鉤 | 否則關掉後開關消失、跨裝置鎖死 | hook、header | 關閉時對位成本可忽略 | 改為「本科有卡就出現」 |
| 列印不印螢光 | PDF 下載走列印講義頁 | CSS | 無 | 刪 `@media print` 規則 |
| click 委派掛捲動容器 | 同頁已有委派先例；iOS 派送條件 | hook | iOS 對容器委派可派送（待 spike） | 改掛 document 或加 `cursor:pointer` |
| **已決定（owner）**：預覽保留「點開看答案」 | 可當即時自測 | 預覽元件 | 不壓低收藏率（未量測） | 刪該按鈕 |
| gloss / hint 不畫螢光 | 正文只標答案，減少密度 | anchor、CSS | 無 | 加第三個 highlight 名稱 |
