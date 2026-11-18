## Context

動機見 proposal.md。這裡只記會影響做法的現況（2026-10-01、branch `track-neurons` `27897160` 實查）。`app/…` = `apps/neurons-tw/src`，`content/…` = `packages/content-neurons-tw`。

**語料**：`content/dist/handout-cloze.json` = `{version:1, cards:[…]}`，46 張（寄生蟲學 25、胚胎學 21）。卡片欄位 `cardId`（`<leafId>#k<N>`）、`anchorId`（`<subjectId>::<leafId>`，subjectId 是中文科名，例 `寄生蟲學`）、`masks[{exact,prefix,suffix,role:'answer'|'gloss'|'hint'}]`（answer 46、gloss 33、hint 29）、`bulletText`、`citeRanges`、`sentenceHash`（= djb2 of `bulletText` 去掉 `citeRanges`）、`tierAtAdmission` 與選句訊號。`app/../scripts/copy-content.mjs:31` 已把它複製到 `public/content/neurons-tw/`，註解寫「no app consumer yet」（`:27-29`）。型別 `ClozeShippedCard` 在 `content/src/handout/cloze-gate.ts:74-88`；`djb2Hex` 在 `content/src/handout/topic-plain-text.ts:83`，該檔 import `parse5`。

**題目 SRS**：neurons **有**題目 SRS，狀態在 `questionHistory` 列上。`app/lib/services/srs-scheduler.ts` 用 core 的 `reviewCardBinary` / `reviewCardBinaryGuessed` 等（`:26-30`）；`buildDueReviewPool`（`:190-205`）是**單一 family** 的 🔄 錯題池，`.slice(0, SRS_DAILY_CAP)`（core 常數 20）。**沒有** 2nd 的跨科 `allocateDailyCap`、也**沒有** 2nd 的「複習 sheet」：首頁入口是 FamilyPicker 的 🆕/🔄 chip（`routes/OverviewPage.tsx:377-378`）與 ⚔️ 錯題出征（約 `:863`）。

**講義頁**：`app/routes/HandoutPage.tsx`（887 行），路由在 `App.tsx:147`，掛在 AnimatedRoutes **外**（與 `/cram/5min` 同模式，`:141-148`；AnimatedRoutes 內放 placeholder `:203`）。
- 每個 region 的 HTML 以 `<div dangerouslySetInnerHTML={{__html: r.html}} />` 渲染（`:504`），之後由 React 渲染該章的 `hdt-quiz-cta` / signpost（`:506-516`）。**沒有** 2nd 那種每考點 React section 與 memo 陷阱。
- **先例**：「本單元猜題」反向連結是 effect 內 `querySelectorAll('.hdt-topic[data-leaf-ids]')` 後 `topic.appendChild(button)` 直接注入（`:221-258`），點擊用 root 上的委派 listener（`:279-294`）。注入的節點在換科時隨 innerHTML 重設被清掉；同科內以「已存在就跳過」保持冪等。
- 讀本 `localStorage` 只存最後閱讀位置（`:212`、`:310`）。**沒有**任何 write-boundary 測試。
- `neurons-anatomy-handout`〈閱讀進度與章節深連結〉寫「All persistence SHALL be device-local `localStorage` only and SHALL NOT touch Dexie, R2, or the sync engine」。

**hub**：`app/routes/CramPage.tsx`：救急條 `:156-206` → 科目卡格 `:235` → 選中科的猜題 panel `:292` → 五分鐘速看卡 `:420-422` → PDF `:429`。`neurons-exam-prep-hub`〈/cram SHALL compose…〉列舉了這個順序並寫明「no Dexie / SV stays 28 / no SYNCED_META_KEYS diff」。

**Dexie**：`app/lib/db.ts` 最新 `this.version(20)`（`:887`），每版重列完整 store map、加表不寫 upgrade callback（`:882-886` 註解）。fixture 命名 `__tests__/db-vNN-to-vMM-migration.test.ts`，最新 `db-v19-to-v20-migration.test.ts`。`meta` 是 `{key, value: string}`（`:85`）。

**同步**（全部在 `app/lib/sync/`）：
- `r2/bundles.ts:259` `SCHEMA_VERSION = 28`；版本史註解 `:6-253`。讀較新版只 log、未知 key 丟棄（`:384-391`）。409 downgrade fence 在 Worker `cloudflare/sync-worker/src/presign.ts:20-27,92-93`，client 端 `r2/client.ts:90-93`，一次性重新整理提示見 `neurons-cloud-sync`。
- adapter 介面 `TableAdapter {name, snapshot, apply}`（`tables.ts:41`），registry `NEURONS_ADAPTERS`（`:1213-1234`，20 個）。逐列 LWW 用列自己時間戳的前例 `questionFlagsAdapter`（`:809-878`）；單調欄位黏著的前例 `questionHistoryAdapter.everWrong`（`:894-965`）。
- `meta` 同步：`SYNCED_META_KEYS`（`:424-490`）＋ registered matcher（`isSyncedMetaKey` `:518`）；`metaAdapter`（`:527-562`）只做 first-write-wins，真正的合併在 pull 後的 backfill post-pass（`backfill/index.ts:19` `runOnPullComplete`）。MAX 合併計數器清單 `MAX_MERGE_KEYS`（`backfill/counters.ts:17`）。
- 帳號切換清除 `clearLocalSyncedData`（`account-guard.ts:90`）從 `NEURONS_ADAPTERS` 推導表清單，所以**新 adapter 自動涵蓋**；`meta` 刪 `SYNCED_META_KEYS` 與兩個前綴。neurons **沒有** 2nd 的 `snapshotLocalToBackup` 本機備份。
- push 觸發表 `SYNCED_TABLES` 由 adapter registry 推導（`useSync.ts:43`）。

**量測前例**：救急 telemetry 存在 **localStorage**（`services/rescue/rescue-store.ts:72` `neurons:rescue:telemetry:v1`，上限 4000），不在 Dexie `meta`。

**bug report**：`NEURONS_BUG_REPORT_CATEGORIES`（`packages/core/src/lib/bug-report-types.ts:43`）**沒有** `handout-content`（那是 2nd 的類別；DB CHECK 已允許）。`submitBugReport`（`app/lib/services/bug-report.ts:185`）把 `question_id` 與 auto-context（含 `game_state`）寫進 Supabase `bug_reports`。

**圖示**：`app/lib/emoji-icons.ts` `ICON_FILES`（`:6`）有 🗂（`:78`），**沒有** 📇。

## Goals / Non-Goals

**Goals:**
- 玩家能從講義考點尾端與 `/cram/cards` 收藏、取消收藏字卡，並在 `/cram/cards` 複習。
- 熟記獎勵（change 3）需要的持久欄位與合併規則在本 change 一次就位，change 3 不再升 Dexie 或 R2 版本。
- 螢光層（change 2）只需呼叫本 change 的 seam 函式，不碰表或同步。
- 玩家閘指標裡不靠螢光層、不靠讀本寫入就能量的部分，從上線第一天就有資料。

**Non-Goals:**
- 讀本螢光、點擊預覽、「顯示重點」開關（change 2）。
- 熟記獎勵的發放（change 3）。
- 把字卡併進首頁 🔄 錯題 chip、出征、今日處方或救急（見 D9）。
- 其他 9 科的字卡 fan-out（屬語料 capability 的後續工作；本 change 對卡數無假設）。

## Decisions

### D1 直接用語料已出貨的 `bulletText`；hash 與 cite 處理共用 content 套件的純函式

neurons 語料本來就出貨 `bulletText` 與 `citeRanges`（2nd 是在 ② 才補 `bulletText`），所以本 change **不改語料契約**。
- 可玩檢查：`cardId` 在語料內、每個 mask 的 `prefix + exact + suffix` 在 `bulletText` 內、`djb2Hex(bulletText 去掉 citeRanges) === sentenceHash`。
- `djb2Hex` 與「去掉 ranges」要和 build 用**同一個**函式。它目前住在 import `parse5` 的 `topic-plain-text.ts`，直接 import 會把 parser 拉進 app bundle。做法：抽到 content 套件新的純模組 `src/handout/cloze-hash.ts`（零 import），`topic-plain-text.ts` 與 `cloze-gate.ts` 改從它 import，`src/index.ts` re-export 它與 `ClozeShippedCard` / `ClozeMask` 型別（type-only）。驗收：`vite build` 後 bundle 不含 parse5 與閘門特有字串。
- 不可玩的卡略過，載入時印 `loaded / skipped / total`（No Silent Errors）。

### D2 表：`handoutClozeState`，Dexie v21，主鍵 `&cardId`，索引 `subjectId, nextDueAt`

- `this.version(21).stores({...v20 全表, handoutClozeState: '&cardId, subjectId, nextDueAt'})`，無 upgrade callback、不動任何既有主鍵（Dexie 4 不能改 pk，見 `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。
- 只在「收藏過」時建列；取消收藏是 `collected: false` 軟狀態、不刪列。理由：(1) R2 bundle 是整包快照，本機刪列刪不掉雲端那列；(2) 重新收藏要接回原排程；(3) `maturedAt` 不能因取消收藏消失。上界是語料卡數。
- `subjectId` 存中文科名（`anchorId` 的前段），`leafId` 一併存，給「回去看這段」與分組用。
- 收藏時 `interval = 0`、`easeFactor = 2.5`；首次 `nextDueAt` 走 D6 攤開。取消後再收藏，排程保留。

### D3 同步：新 adapter 進 `'neurons'` bundle，逐列 LWW 比列自己的 `updatedAt`；`maturedAt` 黏著；`SCHEMA_VERSION` 28 → 29

- 新 `handoutClozeStateAdapter` 加進 `NEURONS_ADAPTERS`。合併比照 `questionFlagsAdapter` 的「列自己的時間戳」寫法：incoming `updatedAt` 較新才整列取代。
- 列勝負決定後，`maturedAt` 另取兩邊**有限數值**中較早者（與 `everWrong` monotonic-OR 同精神）。兩個方向都做：incoming 勝時保留本機較早的 `maturedAt`；本機勝但 incoming 帶較早或唯一的 `maturedAt` 時寫回本機列（`updatedAt` 不動；這次 put 經 push hook 標髒，下一次 push 帶上去）。
- 併發複習的損失**明確接受**（同 2nd 主 session 裁決）：留下的永遠是某一台完整合法的 SRS 狀態；替代方案「複習事件 log + 重放」成本遠大於極少發生的衝突。
- 壞列（缺 `cardId` 或 `updatedAt` 非有限數）不套用並計數。
- **R2 `SCHEMA_VERSION` 28 → 29**：bundle 多一個 top-level adapter key、`SYNCED_META_KEYS` 多一個 key（D4）。不升版的話舊 client 的整包 push 會剝掉兩者；升版後由既有 409 fence 擋下，stale 分頁看到既有的一次性「有新版本，請重新整理」提示。版本史註解補一段 v29。
- 帳號切換清除：`clearLocalSyncedData` 從 adapter registry 推導表清單，新表**自動涵蓋**；加一條 Vitest 鎖它。`neurons-cloud-sync`〈Account-switch wipe…〉的 scenario 寫死「21 Dexie tables / 20 adapter-registered tables」，以 MODIFIED 改成 22 / 21（其餘逐字保留）。
- neurons 沒有本機備份機制，所以 2nd 的「備份要含新表」在此不適用。

### D4 熟記 latch：每卡 `maturedAt` ＋ synced meta key `clozeMaturityDrawsCredited`（MAX 合併）

- 以 cardId 為鍵的 latch = 列上的 `maturedAt`：首次到期複習把 interval 推到 ≥ 21 天時寫入，永不清除，合併取較早值。
- 帳本 = `meta` key `clozeMaturityDrawsCredited`（字串化整數），本 change 加進 `SYNCED_META_KEYS` 與 `backfill/counters.ts` 的 `MAX_MERGE_KEYS`，不讀不寫。放在本 change 的理由：加 synced meta key 需要升 R2 版本（舊 client 的 meta snapshot 會剝掉未知 key），與 D3 共用 v29，change 3 就不用再升。
- 與 2nd 不同：2nd 的帳本是 `monotonicCounters` singleton 的欄位，該 singleton 是整列 LWW、要列進 `MONOTONIC_MAX_MERGE_FIELDS`；neurons 的 `meta` 是逐 key 同步、MAX 合併走 backfill，形狀更簡單。

### D5 三鍵對應 core 函式；提前複習是純練習

| 鍵 | 函式 | 理由 |
|---|---|---|
| 有把握 | `reviewCardBinary({correct:true})` | 標準間隔。**不用** `Easy`（interval × 3），否則兩三次就跨過 21 天，熟記的時間閘門形同虛設 |
| 沒把握 | `reviewCardBinaryGuessed` | 與題目 🤔「我亂猜的」同語意：明天再來、ease 不動 |
| 答錯 | `reviewCardBinary({correct:false})` | 與題目答錯同一條路 |

- 以預設 ease 2.5 每次按時答對：0→3→7→18→45，熟記最早在首次複習後第 28 天。core 函式不看實際經過天數，所以**提前複習不呼叫 SRS、不寫卡片列**，只記 telemetry；否則一分鐘內連按四次就能刷出永久的 `maturedAt`，change 3 會把它計入獎勵。
- 必須先「顯示答案」才能評分。熟記門檻 `HANDOUT_CLOZE_MATURE_INTERVAL_DAYS = 21` 做成常數。
- 只呼叫 core 既有 export，**不改 `packages/core`**（engine API 契約不變）。

### D6 每日推播量 `HANDOUT_CLOZE_DAILY_PUSH = 30`；推播日誌存 localStorage、依帳號分開

沿用 2nd 對 owner 原話「不設置上限，但是把控 SRS 每天推播的卡片數量」的解讀：系統主動推播有上限、推完就停；玩家主動複習不設上限。
- 常數只定義在 `app/lib/handout-cloze/queue.ts`。
- 推播集合 = 「今天已消耗、仍到期」∪「未消耗的到期卡，依 `nextDueAt` 排序後跨科 round-robin，取到 `30 − 已消耗數`」。neurons 沒有 `allocateDailyCap`，在 `queue.ts` 寫一個本地的泛型 round-robin 純函式（不改 core、不改題目 SRS）。
- **推播日誌存 localStorage**（與 2nd 不同，2nd 存 Dexie `meta`）：key `neurons:handoutCloze:push:v1:<accountKey>`，值 `{localDay, consumedCardIds}`；`accountKey` = 已登入的 user id，未登入為 `local`。理由：neurons 的 device-local 前例（救急 telemetry）就是 localStorage；放 `meta` 的話要另外證明它不被任何 registered matcher 吃到、且不進 wipe。localStorage 的讀-改-寫在同一個 tick 內是原子的，足以保證同分頁內 `markPushedShown` 冪等。
- 消耗時機：從推播面開始的複習中，某張卡**第一次被顯示**時。打開 hub、打開 `/cram/cards`、建推播集合都不寫。寫入失敗 `console.warn` 並照常顯示卡片。
- 首次到期攤開：收藏時首次 `nextDueAt` = 今天或之後、當天到期已收藏卡還不到 30 張的第一天開始時間；逾期卡算今天。重新收藏已有排程的卡不重排。
- 已知限制（同 2nd）：多裝置各自計算、未登入→登入同日可拿第二份額度；推播只是提示不是獎勵，可接受。
- 30 張的理由：一張自評約 10–15 秒，約 5–8 分鐘，與題目 🔄 的 20 題量相近。DOGFOOD-TUNABLE。

### D7 講義考點尾端的字卡列：portal 掛進 topic 尾端的 app 自有容器

neurons 講義是 `dangerouslySetInnerHTML` 的 HTML 片段，沒有每考點 React section 可以塞元件。做法沿用同頁「本單元猜題」的注入先例，但用 React portal 渲染內容：
- 新 hook `useClozeRowHosts(scrollRef, subjectId)`：講義 HTML 進 DOM 後，對每個 `.hdt-topic[data-leaf-ids]` 確保尾端有一個 `div.keypoint-cloze-row-host`（已存在就跳過；換科時隨 innerHTML 重設被清掉、重建）。只在該 topic 有可玩卡時才建立。
- `HandoutPage` 以 `createPortal(<KeypointClozeRow conceptId=… />, host)` 渲染每個 host。`KeypointClozeRow` 根元素帶固定 class `keypoint-cloze-row`；只收 concept id（`<subjectId>::<firstLeafId>`），自己讀語料與收藏狀態（`useLiveQuery`），寫入呼叫 `lib/handout-cloze/collection.ts`。
- **順序**：host 永遠是 topic 的最後一個子節點。「本單元猜題」注入 effect 改成：若 topic 內已有 host，按鈕 `insertBefore(host)`；否則照舊 append，之後 host 建立時再 append 到最後。兩個 effect 不論誰先跑，結果都是「作者 HTML → 猜題按鈕 → 字卡列」。
- 不碰作者節點：host 只 append 到 `.hdt-topic` 本身，不進 `ul.hdt-must`、不改任何既有節點；change 2 找作者 bullet 用 `ul.hdt-must > li`，天然排除 host 內的清單。
- 收合預設：一行「📇 字卡 k / N ・收藏本考點 N 張」，展開才列卡面。列印 / PDF CSS `display:none`。語料載入中或失敗時不渲染（缺席優於禁用；錯誤畫面交給 `/cram/cards`）。
- 守衛（node tier source-text）：`HandoutPage.tsx` 不 import `lib/db`、不含 `db.`、`handoutClozeState`、`useLiveQuery` 寫入呼叫；`localStorage` 只允許既有的 last-read key（以釘住的 key 清單斷言）。

### D8 `/cram/cards` 路由與 hub 區塊

- `/cram/cards` 比照 `/cram/5min` / `/cram/handout`：掛在 AnimatedRoutes **外**的 `<Routes>`（`App.tsx:145-148`），AnimatedRoutes 內放 `<span aria-hidden />` placeholder；scene 自己 portal 到 `<body>`（memory：full-screen scene = portal→body + 分開的 Routes）。react-router v6 靜態段優先，與 `/cram/:x` 不衝突。
- 兩個分頁：已收藏 / 可收藏。「開始複習」「繼續複習」「提前複習」開同一個 `ClozeReviewModal`，差別只在佇列與模式。
- hub 區塊放在選中科猜題 panel 之後、五分鐘速看卡（`CramPage.tsx:420`）之前，是導覽連結；顯示已收藏數與今日推播數，載入中不顯示數字。

### D9 首頁加純導覽的到期提示；不碰 🔄 chip、出征、今日處方（owner 2026-10-01 決定）

2nd 把字卡併進「複習 sheet」第四個來源並改首頁停用條件。neurons 沒有那個 sheet；最接近的是 FamilyPicker 的 🔄 錯題 chip 與 ⚔️ 錯題出征，但兩者都綁 `questionHistory` 與出征經濟（DMN 出征軸、maze 能量、今日處方 credit），把字卡塞進去會讓字卡複習間接發獎勵、或讓出征的 `pool / cleared` 計數失真。
- **已決定**：首頁 FamilyPicker header、考前救急入口旁，加一個「📇 今日字卡 N 張」提示（今日推播數 ≥1 才出現），點了進 `/cram/cards`。它是第三個推播面，數字用推播集合。
- 純導覽：不自動開始複習、不消耗推播日誌、不讀寫 🔄 chip 計數 / 出征池 / 處方 / 救急、不寫任何 Dexie / meta / localStorage、不發任何獎勵。新增 `neurons-homepage` ADDED requirement。
- 推播數的計算：語料在 `useLiveQuery` querier **外**載入、當參數傳入（2nd memory `live-query-nested-async-loses-tracking`：在 querier 內 fetch 會斷掉追蹤，複習後數字不更新）。
- 載入中 / 語料失敗 / 推播數 0 時不渲染（缺席優於顯示 0）。

### D10 複習 modal 與卡面

- 走既有 modal 外殼（與 QuizModal 同一套 modal layer；若無共用 shell，比照 `RescueScene` 的 portal + focus 管理）。class 前綴 `handout-cloze-review*`。
- 卡面純函式 `clozeFaceSegments(bulletText, maskSpans, citeRanges)`：answer →「［　　］」、gloss 與 **hint** →「（…）」（hint 是 neurons 語料特有的角色，2nd 沒有），cite 區段渲染成年份小標籤。斷言：片段接回去（placeholder 換回原文、標籤換回文字）等於 `bulletText`。
- 揭示後顯示全部 mask 原文；只有 answer 是題目，hint / gloss 不評分。
- 快捷鍵 Space / Enter 顯示答案，1 / 2 / 3 評分。modal 內無文字輸入框。
- 頁尾：出處「講義〈科〉‧考點名」＋「📖 回去看這段」＝ `navigate('/cram/handout?subject=<科>&leaf=<leafId>')`，交給 `neurons-unit-correspondence` 既有 resolver 落點（含 unavailable 降級）。考點名由 `handout.json` 依 leaf 解析，不存在列上。
- 🐞（**已決定**，owner 2026-10-01）：新的小型 `ClozeBugReportSheet`，走 `submitBugReport`，category 用既有的 `corpus`（不新增 neurons 類別、不需 DB migration），`question_id` 為 null，卡片 context `{cardId, anchorId, sentenceHash, subjectId, leafId, topicTitle}` 寫進 `game_state.handout_cloze_report`（`NeuronsBugReportInput` 加一個選用欄位）。卡片 context 不受 `game_state` opt-out 影響（它是回報對象本身，不是診斷快照）。

### D11 經濟界線

字卡的收藏、複習、練習**不發任何東西**：不發 AP、不呼叫 `accrueMazeEnergy`、不動任何 DMN key、不寫 `questionHistory` / family mastery / `totalStudyMinutes` / streak / 出征 / 今日處方 / 救急 / 錯題本。對應 neurons 既有原則（`neurons-cram-tab`「grants no game progression」、`neurons-dmn-fate-cards`「reading minutes SHALL NOT grant DMN draws」）。唯一的例外留給 change 3。

### D12 量測

- device-local telemetry：localStorage key `neurons:handoutCloze:telemetry:v1`，上限 500 筆，事件 `collect{cardId, source}`、`uncollect{cardId}`、`rate{cardId, rating, intervalAfter, sourceUpdated}`、`practice{cardId, rating}`；DEV handle `globalThis.__cloze`（`getStats` / `export`），prod build 驗 strip。
- 同步列欄位（`collectedFrom`、`firstCollectedAt`、`firstReviewedAt`、`lastReviewedAt`）足以從 R2 快照算出：≥5 張收藏的玩家數、7 天內第二次複習的下界、收藏來源分布。彙總腳本 `scripts/cloze-player-metrics.mjs` 只讀本機快照、只印彙總數字。
- 分母「打開過試點考點的玩家」量不到（讀本零寫入），不為量測破讀本邊界。

### D13 像素 sprite 📇

以 codex `gpt-image-2` 生成（crisp pixel-art 路徑），加進 `ICON_FILES`（`1f4c7.png`）。先 grep 講義 HTML 確認沒有 📇（有的話 parity 會受影響）。

## 與 2nd 的差異

| # | 2nd 的做法 | neurons 的做法 | 理由 |
|---|---|---|---|
| 1 | ② 在語料補 `bulletText`，MODIFIED `handout-cloze-corpus` | 不改語料；`bulletText`、`citeRanges`、`hint` 已在出貨檔 | neurons 語料 change 已一次出貨這些欄位 |
| 2 | `sentenceHash = djb2(bulletText)` | `djb2(bulletText 去掉 citeRanges)`；hash 函式抽到零 import 的 `cloze-hash.ts` 供 app 用 | neurons 語料契約不同；原函式所在檔 import parse5 |
| 3 | 挖空只有 answer / gloss | hint 也挖成「（…）」；cite 年份渲染成標籤 | neurons 有 hint mask；bullet 尾端帶 cite 年份 |
| 4 | Dexie v33 → v34 | v20 → v21，fixture 命名照 neurons 慣例 | 版本線不同 |
| 5 | m2 bundle、`SCHEMA_VERSION` 5 → 6 | 固定 `'neurons'` bundle，28 → 29 | 同步架構不同 |
| 6 | 帳本是 `monotonicCounters` 欄位 + `MONOTONIC_MAX_MERGE_FIELDS` | `meta` key + `SYNCED_META_KEYS` + `MAX_MERGE_KEYS` backfill | neurons meta 逐 key 同步、合併靠 post-pass |
| 7 | 三處清除 / 備份要手補 | 清除由 adapter registry 自動涵蓋（加鎖）；neurons 無本機備份 | `clearLocalSyncedData` 推導表清單 |
| 8 | 推播日誌、telemetry 存 Dexie `meta` | 存 localStorage | neurons device-local 前例（救急 telemetry）在 localStorage；避開 matcher 與 wipe 的額外證明 |
| 9 | 跨科分配用 `allocateDailyCap`（改泛型） | `queue.ts` 本地 round-robin | neurons 沒有該函式，題目 🔄 是單 family |
| 10 | 併進「複習 sheet」第四來源、改首頁停用條件 | 首頁加純導覽的到期提示（→ `/cram/cards`），不接 🔄 / 出征；推播面 = 首頁提示、hub、`/cram/cards` | neurons 無 sheet；🔄 / 出征綁經濟（D9） |
| 11 | 考點尾端列由 `HandoutMarkdown` 的 section 渲染，靠 props / memo 守衛 | portal 進 topic 尾端的 host 容器，沿用「本單元猜題」注入先例 | neurons 講義是 innerHTML 片段，無 memo 陷阱，但要守「不碰作者節點」 |
| 12 | 「回去看這段」用 `?kp=` + keypoint-leaf sidecar | `/cram/handout?subject=&leaf=` + 既有 unit-correspondence resolver | neurons 已有 leaf 深連結 |
| 13 | 🐞 走 handout-content 類別 + `HandoutClozeReportContext` | 走既有 `corpus` 類別 + `game_state.handout_cloze_report` | neurons 類別集無 handout-content；不想動 `neurons-bug-report` 與 DB |
| 14 | 讀本 write-boundary 守衛已存在、擴充 | 新建守衛；MODIFIED〈閱讀進度…〉把「全部持久化只用 localStorage」收窄並列出收藏例外 | neurons 原條文範圍過寬，且沒有守衛 |
| 15 | 不發營收 / 聲望 / 招募券 / affinity | 不發 AP / maze 能量 / DMN / 出征 / 處方 | 經濟不同 |

## Risks / Trade-offs

- [SV 29 讓舊分頁在重新整理前無法 push] → 既有 fence 設計，歷次升版同樣處境；deploy 後以 Performance API 確認新版 PUT 成功。
- [併發複習丟一次評分] → 明確接受（D3），兩裝置衝突測試釘住語意。
- [portal host 與猜題按鈕注入的順序競爭] → D7 的 `insertBefore(host)` 規則＋靜態渲染測試釘順序。
- [講義換科時 host 被 innerHTML 重設清掉，portal 目標失效] → host 清單是 state，換科 effect 重建；React 對已脫離文件的 portal 目標會照常 unmount，測試覆蓋換科。
- [首頁提示讀語料與卡片表，可能拖慢首頁] → 語料是單例 memoize、表上界 = 語料卡數；載入中不渲染，不擋首頁其他內容。
- [localStorage 推播日誌在 private mode 可能拋錯] → try/catch，失敗時當作「今天尚未消耗」，代價是多推幾張，不擋複習。
- [所有數值（30 張、21 天、攤開規則）未量測] → DOGFOOD-TUNABLE。

## Migration Plan

1. Dexie v21 只新增一張表，附 v20 → v21 fixture；`pnpm lint:dexie-fixtures` 綠。
2. R2 `SCHEMA_VERSION` 29；Worker 的 downgrade 檢查是單調接受較高版本，不需先部署 Worker。
3. 部署：app 與語料同一個 CF Pages deploy（`pnpm run deploy:cf` 或 main push workflow）。新 public 檔案只有既有的 `content/neurons-tw/handout-cloze.json` 與一張 sprite（`icons/` 已在 asset 目錄 allowlist；task 內再確認）。
4. Rollback：CF Pages 退回前一版。已升 v21 的裝置以 v20 程式開啟時 Dexie 的行為在 task 內實測並記錄；雲端 v29 bundle 會擋退版 client 的 push，直到重新載入新版。在實測前一律假設 rollback 要做成往前的 hotfix。

## Open Questions

- 可收藏分頁要不要預設只顯示有卡的科？試點只有兩科，實作時依畫面密度決定，不影響 spec。

## 決策清單

| 決策 | 理由 | 影響範圍 | 依賴的假設 | 想改怎麼改 |
|---|---|---|---|---|
| 用語料既有 `bulletText`，hash 函式抽到零 import 模組 | 不改語料契約；避免 parse5 進 bundle | content 套件新檔 `cloze-hash.ts`＋兩處 import；app bundle | 抽出不改 hash 結果（測試比對 46 張） | 改成 app 自寫 djb2（需 parity 測試釘住） |
| 取消收藏 = `collected:false` 不刪列 | 整包快照刪不掉雲端列；保留排程與 latch | 列數只增 | 上界 = 語料卡數 | 刪列 + tombstone 表（多一個 adapter） |
| SV 28 → 29（表＋meta key 同一次） | 防舊 client 剝 key；change 3 免再升 | 舊分頁暫時不能 push | fence 正常運作 | 不升：接受剝 key 風險 |
| 帳本放 synced meta key、MAX 合併 | neurons meta 逐 key、計數器 MAX 走 backfill | `SYNCED_META_KEYS`、`MAX_MERGE_KEYS` | change 3 用 `floor(matured/N) − credited` | 改成 per-card map（需新 merge） |
| 有把握 → `reviewCardBinary(correct)`，不用 Easy | Easy 讓熟記不需時間 | 熟記需 4 次按時複習 | ease 2.5 | 改 D5 表一行 |
| 提前複習純練習、不寫列 | core 不看經過天數，會刷出熟記 | review 模組分兩條路 | change 3 以 `maturedAt` 計獎 | 改成以實際經過天數計新 interval |
| 推播量 30、推完就停、依帳號、存 localStorage | owner 原話（2nd）；neurons device-local 前例 | `queue.ts`、localStorage 一個 key / 帳號 | 推播只是提示 | 改常數；或改存 meta |
| **已決定（owner）**：首頁加純導覽到期提示，不碰 🔄 / 出征 / 處方 | 那些綁經濟；但到期卡需要首頁可見 | FamilyPicker header、新 ADDED requirement | 提示不發獎勵即不影響經濟 | 拿掉提示元件與 `neurons-homepage` delta |
| 字卡列用 portal 進 topic 尾端 host | 講義是 innerHTML，沿用猜題按鈕注入先例 | `HandoutPage.tsx`、新 hook、猜題注入改 `insertBefore` | host 不進 `ul.hdt-must` | 改成 region 尾端集中一列（失去考點對應） |
| **已決定（owner）**：🐞 用既有 `corpus` 類別 | 不動 neurons 類別集與 DB | `bug-report.ts` 加選用欄位 | owner 用 `game_state` 區分字卡回報 | 加 `handout-content` 進 neurons 類別集（MODIFIED `neurons-bug-report`） |
| MODIFIED〈閱讀進度…〉收窄持久化條文 | 原文對整個講義場景下「只用 localStorage」 | 一條 requirement | 例外授權給動作而非入口 | 改成在本 capability 內宣告例外、不改讀本 spec（會留下條文衝突） |
| MODIFIED〈Account-switch wipe…〉表數 21/20 → 22/21 | scenario 寫死表數 | 一條 requirement | 只改數字 | 無 |
| rollback 預設往前 hotfix | 未實測 Dexie 4 降版開啟 | 部署策略 | 最壞 VersionError | 實測後改寫 Migration Plan |
