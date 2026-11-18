> 路徑：`app/…` = `apps/neurons-tw/src`，`content/…` = `packages/content-neurons-tw`。新測試一律 node tier（`.test.ts`，`renderToStaticMarkup` / 純函式 / source-text 守衛 / fake-indexeddb）；元件行為以真實瀏覽器驗（§10）。每條新守衛做一次 mutation probe：probe 沒紅就先假設守衛有洞。

## 0. 前置

- [ ] 0.1 確認 `add-neurons-handout-cloze-corpus` 已 archive（`openspec/specs/neurons-handout-cloze-corpus/` 存在）；`git status` 乾淨；worktree 有 `apps/neurons-tw/.env.local`
- [ ] 0.2 `pnpm --filter @study-rpg/core build`、`pnpm run build:neurons-content`；跑 `pnpm -r typecheck`、`pnpm --filter @study-rpg/neurons-tw test`、`openspec validate --all --strict`，記下 baseline 數字
- [ ] 0.3 `grep -c "📇" packages/content-neurons-tw/src/handout/*.html` 全為 0（D13 前提）

## 1. hash 純函式抽離（D1）

- [ ] 1.1 新增 `content/src/handout/cloze-hash.ts`（零 import）：`djb2Hex(str)`、`stripRanges(text, ranges)`；`topic-plain-text.ts` 與 `cloze-gate.ts` 改從它 import，原 export 名稱保留（re-export）
- [ ] 1.2 `content/src/index.ts`：re-export `djb2Hex`、`stripRanges`，以及 type-only `ClozeShippedCard`、`ClozeMask`、`ClozeArtifact`
- [ ] 1.3 重建語料前後比對 `handout-cloze.json`：46 張 `cardId` / `sentenceHash` 逐張相同（腳本比對，存 scratch）
- [ ] 1.4 `vite build` 後 grep bundle：不含 `parse5` 特有字串與閘門 reason 字串（例 `false-option-only`）

## 2. Dexie v21（D2）

- [ ] 2.1 `app/lib/db.ts`：`HandoutClozeStateRow` 型別（欄位依 spec 第一條 requirement）、class 欄位 `handoutClozeState`、`this.version(21).stores({…v20 全表, handoutClozeState: '&cardId, subjectId, nextDueAt'})`，無 upgrade callback，註解「本版只加表」
- [ ] 2.2 新增 `app/__tests__/db-v20-to-v21-migration.test.ts`：先以字面 `.version(20).stores(` 開 v20、寫入 `questionHistory` 兩列、`meta` 的 DMN 計數器與一個 `SYNCED_META_KEYS` key、`questionFlags` 一列；關閉後以完整 chain 重開；斷言 `open()` 不 throw、每列逐欄相同、`handoutClozeState` 存在且為空
- [ ] 2.3 fixture 先斷言自己真的建了 v20（`verno === 20`、種子列讀得回）；mutation probe：跳過 v20 直接開完整 chain → 紅
- [ ] 2.4 `pnpm lint:dexie-fixtures` 綠

## 3. 同步（D3、D4）

- [ ] 3.1 `app/lib/sync/tables.ts` 新增 `handoutClozeStateAdapter`：snapshot 全表；apply 非 force 時 incoming `updatedAt` 較新才整列取代；不論勝負 `maturedAt` 取兩邊有限值中較早者，本機勝時把較早的 incoming `maturedAt` 寫回本機列（`updatedAt` 不動）；壞列（缺 `cardId`、`updatedAt` 非有限數）跳過並計數 `console.warn`；force（帳號切換用雲端）逐字取代；上方寫 accepted-loss 註解
- [ ] 3.2 加進 `NEURONS_ADAPTERS`；確認 `SYNCED_TABLES`（`useSync.ts:43`）與 `clearLocalSyncedData` 自動涵蓋
- [ ] 3.3 `SYNCED_META_KEYS` 加 `clozeMaturityDrawsCredited`；`backfill/counters.ts` `MAX_MERGE_KEYS` 加同一 key（註解：change 3 的帳本，本 change 不讀不寫）
- [ ] 3.4 `r2/bundles.ts` `SCHEMA_VERSION` 28 → 29，版本史註解補 v29 段落（新 adapter key + 新 meta key、為何要 fence）
- [ ] 3.5 新增 `app/__tests__/handout-cloze-sync.test.ts`（fake-indexeddb）：incoming 較新 → 取代；較舊 → 不動；incoming 較新但無 `maturedAt`、本機有 → 保留；本機較新、incoming 帶較早 `maturedAt` → 本機補上且之後 snapshot 含它；兩邊都有 → 取較早；兩裝置衝突（A 10:00 有把握、B 10:05 答錯）→ 雙方都等於 B 整列；壞列不套用；force 逐字；v28 bundle 無 key → 不 throw、本機不變
- [ ] 3.6 `clozeMaturityDrawsCredited`：本機 3、incoming 2 → backfill 後仍 3；本機無、incoming 2 → 2
- [ ] 3.7 帳號切換鎖：寫三列 + `clozeMaturityDrawsCredited` → `clearLocalSyncedData` 後表空、key 刪除、localStorage 的 telemetry 與推播日誌仍在；並鎖「每個 adapter 都對應一張被清的表」（既有鎖若已涵蓋就只加案例）
- [ ] 3.8 downgrade fence：沿用既有 409 測試形狀加一案例（v28 client 對 v29 cloud → 拒絕、出一次性提示）
- [ ] 3.9 mutation probe：拿掉 3.1 的 `maturedAt` 合併（兩方向各一次）→ 3.5 對應案例各自紅；從 `MAX_MERGE_KEYS` 拿掉 key → 3.6 紅

## 4. 語料 loader、可玩索引、收藏與 SRS 純邏輯（`app/lib/handout-cloze/`）

- [ ] 4.1 `corpus.ts`：memoize-unless-failed fetch（`import.meta.env.BASE_URL` 前綴）；建 `byCardId`、`byConcept`；逐卡算 `maskSpans`（`prefix+exact+suffix` 在 `bulletText` 內定位，記 role）並驗 `djb2Hex(stripRanges(bulletText, citeRanges)) === sentenceHash`；印 `loaded / skipped / total`
- [ ] 4.2 `collection.ts`：`collectClozeCard(cardId, source)`、`collectAllForConcept(conceptId, source)`、`uncollectClozeCard(cardId)`、`isClozeCardCollected`、`useClozeCollected(cardIds)`、`playableCardsForConcept(conceptId)`；source 型別三值、未知值 throw 且不寫
- [ ] 4.3 `review.ts`：`rateDueClozeCard(cardId, rating, now)`（非到期 throw；D5 對應表；熟記判定與 `maturedAt` 寫入；回傳 `{row, matured}` 供 change 3 使用）、`practiceClozeCard(cardId, rating)`（不寫卡片列，只記 telemetry）
- [ ] 4.4 `queue.ts`：`HANDOUT_CLOZE_DAILY_PUSH = 30`（唯一定義處）、本地泛型 round-robin、`pushedSet(now, accountKey)`、`remainingDue`、`practiceable`、`firstDueFor()` 攤開、`markPushedShown(cardId, accountKey)`（localStorage 讀-改-寫、跨日重置、冪等、失敗 warn）
- [ ] 4.5 `status.ts`：「來源已更新」「已下架」純函式；`countMaturedRows(rows)`（`maturedAt` 為有限數才算，供 change 3）
- [ ] 4.6 `face.ts`：`clozeFaceSegments(bulletText, maskSpans, citeRanges)`；answer →「［　　］」、gloss / hint →「（…）」、cite → 年份標籤片段
- [ ] 4.7 `telemetry.ts`：localStorage `neurons:handoutCloze:telemetry:v1`、上限 500、四種事件、`installHandoutClozeDevHandle()`（`import.meta.env.DEV` gate，`__cloze.getStats/export`）；寫入失敗吞掉並 warn 一次
- [ ] 4.8 node 測試 `handout-cloze-lib.test.ts`：三鍵結果等於直接呼叫 core 函式；18 → 45 寫 `maturedAt`、之後答錯不變；未揭示不能評分（狀態機純函式）；推播 50 張兩科 → 30 張 round-robin、`remainingDue` 20；做完 30 張同日重算為空、跨日恢復；只打開推播面不消耗；顯示 5 評 3 → 2 + 至多 25；`markPushedShown` 冪等（重複、重開、第一次寫入失敗後重試）；帳號 A 用完、B 仍 30；提前複習連按 4 次有把握 → 卡片列 put 次數 0；攤開 70 → 30/30/10；重新收藏排程不變；逾期算今天；取消收藏 / 下架 / 不可玩不進佇列；來源已更新評分一次後消失；卡面片段接回 = `bulletText`；試點真實語料 46 張全可玩（數字由出貨檔推導）
- [ ] 4.9 經濟界線測試：快照除 `handoutClozeState` 外的所有 Dexie 表（含 `meta` 全部 key）→ 收藏 3、推播複習 10（含 `markPushedShown`）、提前複習 2 → 逐位元組相同
- [ ] 4.10 source-text 守衛 `handout-cloze-write-boundary.test.ts`：以 `handoutClozeState` 出現的 production 檔案推導母體，寫入方法（`.put/.update/.bulkPut/.add/.delete/.clear/.modify`）只出現在 `lib/handout-cloze/collection.ts`、`lib/handout-cloze/review.ts`、`lib/sync/tables.ts`、`lib/sync/account-guard.ts`；`lib/handout-cloze/**` 不 import `accrueMazeEnergy`、`dmn-trigger`、`dmn-entitlement`、`srs-scheduler`、`expedition`、prescription 模組
- [ ] 4.11 mutation probe：在任一元件加一行 `db.handoutClozeState.put(...)` → 4.10 紅；在 `review.ts` 呼叫 `accrueMazeEnergy` → 4.9 與 4.10 紅

## 5. 講義考點尾端字卡列（D7；MODIFIED `neurons-anatomy-handout`）

- [ ] 5.1 `app/components/KeypointClozeRow.tsx`：只收 `conceptId`；根元素 class `keypoint-cloze-row`（source-text 守衛釘字面值）；收合一行「📇 字卡 k / N」＋「收藏本考點 N 張」（全收後「已全部收藏」）；展開列卡面與切換；語料載入中 / 失敗 / 零可玩卡不渲染
- [ ] 5.2 `app/lib/handout-cloze/use-cloze-row-hosts.ts`：講義 HTML 進 DOM 後對有可玩卡的 `.hdt-topic[data-leaf-ids]` 確保尾端 `div.keypoint-cloze-row-host`（冪等；換科重建）；回傳 `{host, conceptId}[]`
- [ ] 5.3 `HandoutPage.tsx`：以 `createPortal` 渲染每個 host；「本單元猜題」注入改成「有 host 就 `insertBefore(host)`，否則 append」；不新增任何 Dexie / storage 呼叫
- [ ] 5.4 列印 / PDF CSS：`.keypoint-cloze-row-host { display:none }`
- [ ] 5.5 新增 `handout-reader-write-boundary.test.ts`：`HandoutPage.tsx` 不 import `lib/db`、不含 `db.`、`handoutClozeState`；`localStorage` 呼叫只用釘住的 last-read key
- [ ] 5.6 node 測試（JSDOM 當 parser）：把試點講義 HTML 放進容器，跑 host hook（語料用出貨檔）＋模擬猜題注入（兩種先後順序）→ 每個有卡 topic 的子節點順序為「作者 HTML → 猜題按鈕 → host」；每個 `ul.hdt-must` 的 `outerHTML` 前後逐位元相同；無卡 / 無 `data-leaf-ids` 的 topic 沒有 host
- [ ] 5.7 mutation probe：host 改用 `prepend` → 5.6 紅；在 `HandoutPage.tsx` 加 `db.meta.put` → 5.5 紅

## 6. 我的字卡頁與 hub 區塊（D8；MODIFIED `neurons-exam-prep-hub`）

- [ ] 6.1 `app/routes/ClozeCardsPage.tsx`（portal 到 body 的全螢幕 scene）：已收藏（依科→考點、下次到期、來源已更新、已下架區、取消收藏）／可收藏（科→考點，逐張與逐考點收藏，source `cards-page`）；「開始複習（N）」「繼續複習（M）」「提前複習」；停用說明；載入中 / 「字卡載入失敗」/ 沒收藏三種狀態
- [ ] 6.2 `App.tsx`：外層 `<Routes>` 加 `/cram/cards`；AnimatedRoutes 內加 `<span aria-hidden />` placeholder（同 5min / handout 模式）
- [ ] 6.3 `CramPage.tsx`：選中科猜題 panel 之後、五分鐘速看卡之前加「我的字卡」連結區塊；顯示已收藏數與今日推播數，載入中不顯示數字
- [ ] 6.4 node 測試：頁面分組 / 狀態 / 停用說明純函式；`CramPage.tsx` source-text 守衛釘區塊順序（猜題 panel → 我的字卡 → 五分鐘速看 → PDF）

## 6b. 首頁到期提示（D9；ADDED `neurons-homepage`）

- [ ] 6b.1 `app/components/ClozeDueReminder.tsx`：FamilyPicker header、考前救急入口旁；今日推播數 ≥1 才渲染「📇 今日字卡 N 張」，點擊 `navigate('/cram/cards')`；載入中 / 失敗 / 0 不渲染；語料在 `useLiveQuery` querier 外載入、以參數傳入
- [ ] 6b.2 node 測試：推播數 12 → 顯示 12；0 → 不渲染；載入中不渲染；元件不 import `lib/db` 寫入、`markPushedShown`、`srs-scheduler`、`expedition`、DMN / maze / prescription 模組（source-text 守衛）
- [ ] 6b.3 經濟界線：4.9 的快照測試加入「打開首頁並點提示」步驟，所有 store 與推播日誌不變、各 family 🔄 計數不變
- [ ] 6b.4 mutation probe：提示元件內呼叫 `markPushedShown` → 6b.3 紅

## 7. 複習 modal 與回報（D10）

- [ ] 7.1 `app/components/ClozeReviewModal.tsx`：模式 `push` / `due` / `practice`；`push` 模式在每張卡第一次顯示時呼叫 `markPushedShown`；卡面用 `clozeFaceSegments`；「顯示答案」後才出三鍵；Space/Enter、1/2/3；「來源已更新」旗標；頁尾出處＋「📖 回去看這段」（`/cram/handout?subject=&leaf=`）＋ 🐞；結束畫面顯示張數與三鍵分布
- [ ] 7.2 `ClozeBugReportSheet`：走 `submitBugReport`，category `corpus`、`question_id: null`；`NeuronsBugReportInput` 加選用 `handout_cloze_report`，寫進 `game_state.handout_cloze_report`（不受 `game_state` opt-out 影響）；node 測試斷言送出 row 的形狀
- [ ] 7.3 考點名解析：依 `anchorId` 從 `handout.json` 找 topic 標題的純函式＋測試（找不到時顯示科名，不 throw）

## 8. 說明與 sprite（D13）

- [ ] 8.1 codex `gpt-image-2` 生成 📇 像素 sprite（`codex_image_gen.md` 配方；檢查檔案大小與 raw log 排除假圖）→ `apps/neurons-tw/public/icons/emoji/1f4c7.png`（路徑依既有 sprite 目錄確認）
- [ ] 8.2 `emoji-icons.ts` `ICON_FILES` 加 `['📇','1f4c7.png']`
- [ ] 8.3 `HelpMenu.tsx`：在「題目與複習」category 加 `handout-cloze` 段（📇）；summary 說收藏與複習位置；詳細說三鍵、推播量（從 `HANDOUT_CLOZE_DAILY_PUSH` 渲染）、提前複習是純練習、來源更新保留進度、字卡不發任何遊戲獎勵
- [ ] 8.4 source-text 守衛：本 change 新增的元件與 HelpMenu 段落的 UI 圖示都經 `EmojiIcon`；HelpMenu 段落不含 `30` 字面值

## 9. 量測

- [ ] 9.1 `scripts/cloze-player-metrics.mjs`：輸入本機 neurons 快照目錄（`*.json.gz`），輸出 D12 的三個數字，只印彙總；以合成快照寫 node 測試
- [ ] 9.2 `docs/` 加一段「字卡量測怎麼跑」：快照從哪拉、指令、哪一項是下界 / 量不到

## 10. 建置與真實瀏覽器驗證（內建 Browser 對 localhost dev；先驗 `innerWidth > 0`）

- [ ] 10.1 講義：開 寄生蟲學、胚胎學，每個有卡 topic 尾端出現字卡列、位於「本單元猜題」之後；開啟與捲動整份講義後 `handoutClozeState` 為空、`meta` 無新 key
- [ ] 10.2 收藏：「收藏本考點 N 張」→ IndexedDB 出現 N 列（`collected:true`、source `keypoint-tail`、`nextDueAt` 依攤開）；換科再換回，字卡列仍在、狀態正確
- [ ] 10.3 `/cram/cards`：in-app 導覽、直接 URL、`location.reload()` 三件套都能渲染；兩分頁、取消收藏、來源已更新（手改一列 `seenSentenceHash` 後 reload）、已下架（塞一列不存在的 cardId）
- [ ] 10.4 複習：推播做完後 localStorage 推播日誌 cardId 數等於推播數、hub 今日數字歸 0；「繼續複習」推進排程；「提前複習」四次有把握後該列逐欄不變；Space/1/2/3 快捷鍵；「回去看這段」落到正確 topic
- [ ] 10.5 推播冪等：開始複習看到第一張就關、再開 → 日誌只多 1 個；只打開首頁、hub 與 `/cram/cards` → 日誌不存在或不變
- [ ] 10.5a 首頁提示：有推播時出現、點了進 `/cram/cards`；複習 5 張後回首頁（不 reload）數字減 5；推播用完後提示消失；🔄 chip 數字前後相同
- [ ] 10.6 經濟：複習前後 `questionHistory`、`meta`（AP / `maze:*` / `dmn*`）逐 key 相同
- [ ] 10.7 RWD：`resize_window` 375 / 768 / 1280，字卡列、`/cram/cards`、modal 無頁面橫向捲動；所有圖示是 sprite
- [ ] 10.8 升級路徑：以 v20 存檔 reload 進新版 → v21，舊資料逐列不變
- [ ] 10.9 rollback 實測：v21 DB 以宣告到 v20 的 Dexie 開啟一次，記錄行為寫回 design Migration Plan
- [ ] 10.10 `pnpm run deploy:cf` 前的 build：`curl` 檢查 prod bundle 含 Supabase ref（env baked，`.env.local` 在 deploy worktree）；確認 `icons/` 在 CF asset dir allowlist

## 11. 收尾與 prod 驗證

- [ ] 11.1 `/simplify`；`/opsx:verify` 做到 clause-level（每個 SHALL 子句找得到實作或守衛）
- [ ] 11.2 `pnpm -r typecheck`、`pnpm --filter @study-rpg/neurons-tw test`、`pnpm lint:dexie-fixtures`、`openspec validate --all --strict`，與 0.2 baseline 對照記錄
- [ ] 11.3 `/verify`（vibe-coding 收尾）與 `/cdx review`（feature 收尾互審）
- [ ] 11.4 commit 等 owner 確認；deploy 屬對外發布，owner 批准才跑；push 後 `gh run list --branch main --limit 5` 確認 Deploy Cloudflare Pages 綠
- [ ] 11.5 prod 驗證（`https://med-study-rpg.com/neurons/`）：`/cram/cards` 直接 URL 與 F5 不 404；講義字卡列出現；`handout-cloze.json` 以 BASE_URL 路徑回 JSON（不是 SPA fallback HTML）
- [ ] 11.6 prod 同步（需 owner 已登入瀏覽器，走 Chrome MCP）：收藏後 push → Performance API 確認 R2 PUT；另一台裝置 pull 後看到同樣收藏；舊分頁出現一次性重新整理提示。owner 不在時標 `[~]` 並寫明未驗
- [ ] 11.7 寫 decision 檔 `openspec/decisions/<date>-…md`：SV 29、rollback 實測結果、未驗項目
