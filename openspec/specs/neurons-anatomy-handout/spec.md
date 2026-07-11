# neurons-anatomy-handout

## Purpose

教學型「考前講義(beta)」——比 cram 小抄與五分鐘速看版更詳盡、第一次唸也看得懂、考前一週唸得完的分科精選。首發解剖學一科（`subjects[]` 預留多科），入口按鈕在 /cram 速看版左側（綠底），開全螢幕可捲動場景 `/cram/handout`（複用 SpeedReviewPage 的 portal + AnimatedRoutes 外接線）。內容依官方 4 章 blueprint 分章、事實 100% 綁題庫、押題誠實；交付比照 cram（committed fragment → build-handout → handout.json → copy-content），零 Dexie/R2/SV/sync 改動。
## Requirements
### Requirement: 考前講義入口按鈕

The `/cram`（考前猜題）page SHALL render a 「考前講義(beta)」entry button in the top action row, positioned to the LEFT of the「五分鐘速看版」button. The button SHALL use a background color visually distinct from the 五分鐘速看版 gold button (an anatomy-green family fill), and SHALL open the handout scene at route `/cram/handout`.

#### Scenario: 按鈕呈現於速看版左側

- **WHEN** 使用者開啟 `/cram` 頁面
- **THEN** 動作排出現「考前講義(beta)」按鈕，位於「五分鐘速看版」按鈕左側，底色為解剖學綠系（非金色）

#### Scenario: 點擊開啟講義場景

- **WHEN** 使用者點擊「考前講義(beta)」按鈕
- **THEN** 導向 `/cram/handout` 並開啟全螢幕講義場景

### Requirement: 全螢幕教學型講義場景

The handout scene SHALL render as a full-screen, vertically scrollable overlay that `createPortal`s to `document.body` (escaping the `AnimatedRoutes` transform, mirroring `SpeedReviewPage`). The scene SHALL provide a close control that returns to `/cram`. The route SHALL be registered as a real route OUTSIDE `AnimatedRoutes` plus a placeholder route (`<span aria-hidden />`) INSIDE `AnimatedRoutes`, so in-app navigation, direct-URL entry, and F5 reload all render correctly.

#### Scenario: 場景全螢幕覆蓋並可捲動

- **WHEN** 講義場景開啟
- **THEN** 內容以 `position:fixed inset:0` 全螢幕呈現、可垂直捲動，且不受 `AnimatedRoutes` transform 限制而塌陷

#### Scenario: 關閉回到考前猜題

- **WHEN** 使用者點擊場景的 `✕` 關閉鍵
- **THEN** 場景關閉並導回 `/cram`

#### Scenario: 直接網址與重新整理

- **WHEN** 使用者直接開啟 `/cram/handout` 或在該路由按 F5
- **THEN** 講義場景正確 render，而非 404 或殘留前一頁

### Requirement: 講義內容契約 handout.json

The handout content SHALL be served from a static `handout.json` under the existing `content/neurons-tw/` asset directory. Its top-level shape SHALL be `{ version, builtAt, subjects: HandoutSubject[] }`, where each `HandoutSubject` carries at least `{ subjectId, title, html }`. The `subjects` array SHALL be extensible to all 11 families and SHALL contain at least the `解剖學`, `組織學`, and `胚胎學` entries. When more than one subject is present, the scene SHALL render a subject picker; with a single subject the picker MAY be omitted. The loader SHALL prefix the fetch path with `import.meta.env.BASE_URL`.

#### Scenario: 內容含解剖學、組織學與胚胎學且可再擴充

- **WHEN** app 載入 `handout.json`
- **THEN** `subjects` 陣列至少含 `subjectId === '解剖學'`、`subjectId === '組織學'` 與 `subjectId === '胚胎學'` 三筆教學內容，且結構允許日後新增其他科而不需破壞性變更

#### Scenario: 多科顯示 subject picker

- **WHEN** `handout.json` 的 `subjects` 多於一科
- **THEN** 講義場景顯示 subject picker 供切換各科；僅一科時 picker 可省略

#### Scenario: 內容以 BASE_URL 前綴取得

- **WHEN** loader 取得 `handout.json`
- **THEN** fetch 路徑帶 `import.meta.env.BASE_URL` 前綴（prod `/neurons/`、dev `/`），避免 prod SPA index.html fallback 造成 JSON 解析失敗

### Requirement: 依官方 blueprint 分章的教學結構

解剖學 handout content SHALL be organized by the anatomy content pack's canonical 4-chapter blueprint (`neuroanatomy` 神經解剖學 / `head-and-neck` 頭頸部 / `chest-abdomen-pelvis` 胸腹骨盆 / `upper-lower-extremities` 上下肢). Each chapter SHALL contain, in order: (1) a plain-language 導言 understandable to a first-time reader, (2) a 必背重點 list, (3) a 構造 / 神經支配 / 血供 reference table, and (4) an 易混考點 X-vs-Y discriminator table. Content SHALL be curated to a high-yield subset readable within roughly one week, and SHALL be more detailed and more beginner-friendly than the existing `cram.json` 解剖學 blocks.

#### Scenario: 四章齊備且每章四段

- **WHEN** 讀者開啟解剖學講義
- **THEN** 內容依 4 章 blueprint 分章，且每章依序含導言、必背重點、構造/神經/血供表、易混考點對照

#### Scenario: 比小抄更詳盡好懂

- **WHEN** 比較講義與 `cram.json` 解剖學區塊
- **THEN** 講義提供白話解說與教學脈絡（第一次唸也看得懂），而非僅 discriminator 對照

### Requirement: 事實 grounding 與押題誠實

Every fact in a subject's handout SHALL be traceable to the exam corpus (`questions.json` stems / answers / `optionExplanations` / `explanation` for that subject) or to standard textbook knowledge cross-verified against that corpus; facts SHALL NOT be generated from unverified model memory. Where a fact touches histology / anatomy / other subject science, 考選部 answer keys SHALL be treated as primary and cross-verified against OpenEvidence (genuine error vs textbook-defensible), per the project's neuroscience-fact verification rule. The handout SHALL NOT contain prediction-certainty language (命中率 / 保證會考 / 今年一定考 or equivalents); high-frequency framing SHALL be presented as historical 投報率參考 only.

#### Scenario: 事實可回溯題庫

- **WHEN** 稽核講義任一必背 / 易混條目
- **THEN** 該條目可指回題庫的題目 / 選項詳解，或為對題庫交叉驗證過的標準教科書知識

#### Scenario: 無命中率保證字眼

- **WHEN** 掃描講義文字
- **THEN** 不出現「命中率 / 保證會考 / 今年一定考」等預測保證字眼

### Requirement: CI-safe 靜態內容交付

The handout content pipeline SHALL follow the `cram.json` precedent: a committed source authored under `packages/content-neurons-tw/src/handout/`, a build step emitting `dist/handout.json`, and `copy-content.mjs` copying it into `apps/neurons-tw/public/content/neurons-tw/`. The pipeline SHALL NOT require headless Chromium or any network fetch at build time, and SHALL NOT alter the CF Pages asset-directory allowlist. The change SHALL NOT bump Dexie schema, R2 bundle `SCHEMA_VERSION`, or the sync engine.

#### Scenario: build 不需瀏覽器且落在既有 assetDir

- **WHEN** 執行 content pack build 與 `copy-content`
- **THEN** `handout.json` 產生於 `public/content/neurons-tw/`（既有 `content` assetDir 內），過程不啟動 headless Chromium、不抓網路、不改 CF Pages allowlist

#### Scenario: 零 sync / schema 影響

- **WHEN** 審視本變更的 diff
- **THEN** 未觸及 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS` 或 sync engine

### Requirement: 章節側邊導覽與 scroll-spy

The handout scene SHALL provide chapter navigation as a vertical list of chapter labels (one per `.hdt-region` anchor) rather than a horizontally scrolling chip bar. The navigation SHALL adapt responsively across three breakpoints: at `≥1024px` a persistent left sidebar; at `768–1023px` a drawer opened from a「章節」control in the header; at `<768px` a drawer opened from a floating「章節」control. Selecting a chapter label SHALL scroll that region to the top of the internal scroll container. The currently-read chapter SHALL be reflected as the active navigation item (`aria-current="true"`) driven by an `IntersectionObserver` whose `root` is the internal scroll container (NOT the window). Navigation labels SHALL strip a leading emoji from each chapter heading while the in-content chapter headings SHALL retain their emoji.

#### Scenario: 桌機常駐左側導覽

- **WHEN** 使用者在 `≥1024px` 視窗開啟講義場景
- **THEN** 章節導覽以常駐左側 sidebar 呈現（非頂部水平捲動 chip bar），列出每個 region 章節

#### Scenario: 平板與手機以抽屜呈現

- **WHEN** 使用者在 `768–1023px` 或 `<768px` 視窗開啟講義場景
- **THEN** 導覽收合為抽屜，透過「章節」控制開啟；不保留頂部水平 chip bar 作為主要導覽

#### Scenario: 點擊章節捲到對應段落

- **WHEN** 使用者點擊某章節導覽項目
- **THEN** 內部捲動容器將該 region 捲到頂部（尊重 `.hdt-region` 的 `scroll-margin-top`）

#### Scenario: 目前章節高亮追隨捲動

- **WHEN** 使用者捲動講義內容使某 region 進入視窗
- **THEN** 對應導覽項目標記為 active（`aria-current="true"`），且該追蹤由 root 為內部捲動容器的 `IntersectionObserver` 驅動

#### Scenario: 導覽標籤去除開頭 emoji

- **WHEN** 由章節標題衍生導覽標籤
- **THEN** 導覽標籤去除開頭的 emoji 圖示，而內文的章節標題仍保留其 emoji

### Requirement: 每章測驗入口

The handout scene SHALL render a per-quiz-entry testing control at the end of each content grouping that maps to exam questions. Quiz routing SHALL be carried by typed data on the content contract (`HandoutSubject.chapterQuizzes`, an array of `{ regionId, label, memberRegionIds[], leafIds[], sourceQuestionIds? }`) and SHALL NOT be embedded in the authored teaching HTML. Each quiz entry maps to one or more content regions via `memberRegionIds`:

- When an entry maps to **exactly one** region (region-keyed subjects, e.g. 組織學, whose per-subject region config emits one entry per content region), the control SHALL be labelled 「測驗本區」, SHALL anchor to that region, and SHALL NOT render any signpost.
- When an entry groups **multiple** regions (legacy chapter-keyed subjects, e.g. 解剖學, whose regions share a blueprint chapter), the control SHALL be labelled with the chapter's name (e.g. 「測驗本章」), SHALL anchor to the group's LAST region (`regionId`), and each earlier member region SHALL render a lightweight signpost (labelled with the entry's `label`) that scrolls to that control, so no two regions launch an identical question pool.

Activating the control SHALL launch the existing `QuizModal` in practice mode over that entry's question pool (mirroring the /cram「答1題看看」on-ramp: no progression side effects beyond the existing practice-mode wrong→錯題本→出征 flow), or, when a usable in-scene pool cannot be built, SHALL fall back to the existing `/bank` deep-link. Regions mapped to no quiz entry (e.g. the overview 攻略地圖) SHALL render neither a testing control nor a signpost.

#### Scenario: 每個對映題目的內容區/章節末尾出現測驗鈕

- **WHEN** 使用者讀到某個對映到題目的 quiz 分組的最後一個 region 末尾
- **THEN** 該處出現測驗控制項（單區組別標「測驗本區」、多區組別標該章名如「測驗本章」）

#### Scenario: 區域粒度科目每區一顆測驗本區且無 signpost

- **WHEN** 使用者閱讀一科以 region 粒度出題的講義（每個內容區恰對一個 quiz entry，`memberRegionIds` 長度為 1）
- **THEN** 每個內容區末尾各出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的題目 union；不顯示任何 signpost（單區 entry 無前段區）。一題若被 tag 到分屬不同區的 leaves，會同時出現在數區題池——這是 cover 語意（可重疊），非互斥 partition

#### Scenario: 點擊開啟該組 practice quiz

- **WHEN** 使用者點擊某測驗控制項
- **THEN** 以既有 `QuizModal`（practice 模式）開啟該組題庫池，或在無法建立場景內題池時導向既有 `/bank`

#### Scenario: 共用章節的前段 region 顯示指路 signpost（legacy chapter-keyed）

- **WHEN** 某 region 與其他 region 共用同一 quiz 分組（`memberRegionIds` 長度大於 1），且該組測驗鈕位於較後的 region
- **THEN** 該前段 region 末尾顯示帶章節 label 的指路 signpost，點擊捲動至測驗鈕所在 region，而非另開一份相同題池

#### Scenario: 概覽章節不顯示測驗鈕

- **WHEN** 章節未對映任何 quiz entry（例如攻略地圖概覽章）
- **THEN** 該章節末尾既不顯示測驗控制項，也不顯示指路 signpost

#### Scenario: quiz 路由不進入授權 HTML

- **WHEN** 審視章節測驗路由的資料來源
- **THEN** 路由資料位於 typed `chapterQuizzes`（型別化資料），而非嵌入授權教學 HTML

### Requirement: 一鍵下載 PDF

The handout scene SHALL provide a print/PDF control that invokes the browser's native print flow (`window.print()`), accompanied by dedicated `@media print` styles. The print styles SHALL restore the fixed, internally-scrolling scene into normal document flow (`position:static`, `overflow:visible`), hide interactive chrome (header, sidebar/drawer, print control, 測驗本章 controls, close control), restore tables from on-screen `display:block` overflow to `display:table` with `thead` repeated per page (`table-header-group`), and set an A4 page with sane margins. The change SHALL NOT introduce a headless Chromium build step or a committed PDF blob.

#### Scenario: 一鍵開啟瀏覽器列印

- **WHEN** 使用者點擊「一鍵下載PDF」控制項
- **THEN** 觸發瀏覽器原生列印流程（可另存 PDF），不需伺服器或 headless 產檔

#### Scenario: 列印輸出隱藏場景 chrome

- **WHEN** 講義進入列印
- **THEN** header、側邊 / 抽屜導覽、列印鈕、測驗鈕、關閉鈕皆隱藏，內容還原為正常文件流

#### Scenario: 列印時表格正確分頁

- **WHEN** 含表格的章節被列印
- **THEN** 表格由螢幕的 `display:block` 覆寫回 `display:table`、`thead` 每頁重複，並依 A4 版面分頁

#### Scenario: 不引入瀏覽器產檔依賴

- **WHEN** 審視本變更的 build pipeline
- **THEN** 未新增 headless Chromium 步驟，亦未新增 committed PDF 二進位檔

### Requirement: 閱讀進度與章節深連結

The handout scene SHALL surface reading progress derived from the internal scroll container's position, and SHALL persist the last read scroll position per subject in `localStorage` so that reopening the same subject restores the prior position. The scene SHALL support entering a specific chapter via a deep-link (`#<region-id>` hash or `?section=<region-id>` query), scrolling to that region on load. All persistence SHALL be device-local `localStorage` only and SHALL NOT touch Dexie, R2, or the sync engine.

#### Scenario: 呈現閱讀進度

- **WHEN** 使用者捲動講義內容
- **THEN** 場景依內部捲動位置呈現閱讀進度指示

#### Scenario: 回到上次閱讀位置

- **WHEN** 使用者重新開啟先前讀過的同一科講義
- **THEN** 內部捲動位置還原到該科上次離開的位置（來源為 per-subject `localStorage`）

#### Scenario: 章節深連結

- **WHEN** 使用者以 `#<region-id>` 或 `?section=<region-id>` 開啟講義
- **THEN** 載入後自動捲動到該 region 章節

#### Scenario: 進度持久化不進雲端

- **WHEN** 審視進度 / 位置持久化的儲存路徑
- **THEN** 僅寫入 device-local `localStorage`，未觸及 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS` 或 sync engine

### Requirement: 講義場景無障礙

The handout scene (which already declares `role="dialog"` / `aria-modal="true"`) SHALL manage keyboard focus: on open it SHALL move focus into the scene (close control or main heading) and SHALL restore focus to the invoking element on close; it SHALL close on `Esc`; the chapter navigation SHALL be a semantic `nav` with an accessible label; and while a navigation drawer is open it SHALL trap focus and close on `Esc` or backdrop activation.

#### Scenario: 開啟時移入焦點、關閉時歸還

- **WHEN** 講義場景開啟後再關閉
- **THEN** 開啟時焦點移入場景（關閉鍵或主標題），關閉時焦點歸還觸發元素

#### Scenario: Esc 關閉場景

- **WHEN** 使用者在講義場景按下 `Esc`
- **THEN** 場景關閉並導回 `/cram`

#### Scenario: 導覽為具名 nav

- **WHEN** 輔助技術檢視章節導覽
- **THEN** 導覽為帶 accessible label 的語義 `nav` 元素，active 項目標記 `aria-current="true"`

#### Scenario: 抽屜開啟時 focus-trap

- **WHEN** 導覽抽屜於平板 / 手機開啟
- **THEN** 焦點被限制在抽屜內，且可用 `Esc` 或點擊背景關閉

### Requirement: 區域粒度題目覆蓋（leaf 嚴格分割、題目 union cover、無孤兒）

For a subject that declares a per-subject region config (`<subject>.config.json`: an ordered list of `{ regionId, title, leafIds[], targetDepth }`), the region config SHALL be the single source of truth driving three things: teaching-region boundaries, region→question quiz pools, and per-region length budget. The contract (shared across all region-keyed subjects) SHALL hold:

- **`regionId`** SHALL be `hdt-`-prefixed ASCII kebab-case (no CJK) and SHALL match, verbatim, the `id` of the corresponding `<section class="hdt-region">` in that subject's HTML; **`title`** carries the CJK display name.
- **`leafIds`** SHALL each exist among the subject's canonical concept leaves (`concept-recurrence.json`), and across all regions SHALL form a **strict partition at leaf granularity** — every leaf assigned to exactly one region, none unassigned, none shared.
- **`targetDepth`** SHALL be one of `'full'` | `'brief'` (per-region length-budget signal; region-keyed subjects default `'full'`).
- Each region's quiz pool SHALL be the **union** of its leaves' questions. Because `concept-tags.json` is `qid → leafId[]` (a question MAY be tagged to leaves in different regions), pools MAY overlap — the question-granularity mapping is a **cover, not a partition**; such a question is legitimately testable in every region it touches.
- **No orphan**: a question whose EVERY tagged leaf is unmapped by the config SHALL cause the build to fail loudly (No Silent Errors). A region resolving to zero leaves or zero questions SHALL also fail.
- **No drift (bidirectional)**: the build SHALL fail if any config `regionId` has no matching HTML `.hdt-region` id, OR if any quiz-bearing HTML `.hdt-region` has no config entry (overview / non-quiz regions MAY be explicitly declared exempt).

#### Scenario: leaf 嚴格分割、每題至少一 leaf 覆蓋

- **WHEN** 執行 region-keyed 科目的 handout build
- **THEN** 每個 canonical leaf 恰被一個 region 涵蓋（無重複、無遺漏）；且每一題至少有一個 tagged leaf 落在某區。若某題所有 tagged leaf 都不屬任何 region，build 大聲失敗（非靜默略過）

#### Scenario: 多 leaf 題可跨區重複（cover 語意）

- **WHEN** 一題被 tag 到分屬不同 region 的多個 leaves
- **THEN** 該題同時進入所屬各 region 的「測驗本區」題池，屬允許重疊的 cover，而非要求互斥的 partition

#### Scenario: config 與 HTML region id 雙向一致

- **WHEN** region config 的某 `regionId` 在 HTML 找不到對應 `.hdt-region`，或某個帶測驗的 HTML region 未在 config 宣告
- **THEN** build 失敗並指出該不一致，避免建出看不見的 CTA 或缺測驗入口的內容區

#### Scenario: 空區大聲失敗

- **WHEN** region config 的某一區解析出 0 leaves 或 0 題目
- **THEN** build 失敗並指出該區，避免出貨空題池的「測驗本區」

#### Scenario: 區域邊界以 config 為單一真實來源

- **WHEN** 審視內容生成、region→題目對映、長度預算三者的來源
- **THEN** 三者皆由同一份 `<subject>.config.json` 驅動，而非散落於 HTML、build script 常數或多份清單

### Requirement: 組織學 region-keyed 教學結構

組織學 handout content SHALL be organized into teaching regions declared by `組織學.config.json` (**7 regions** derived from the 6 pedagogical buckets — 器官系統 sub-split into 消化 / 泌尿·生殖·內分泌·感官 / 循環·呼吸·皮膚·淋巴 and 肌肉+神經 merged, so each region reads within roughly one sitting; final region count is the config's single source of truth). All 25 組織學 concept leaves SHALL be written (no high-yield filtering — 25 leaves is well under the proven 解剖 87-leaf one-week ceiling). Each region SHALL contain, in order: (1) a plain-language 導言 understandable to a first-time reader, (2) a 必背重點 list, and (3) at least one teaching table (組織構造 / 染色特徵 / 易混 X-vs-Y discriminator) appropriate to histology. Content SHALL be more detailed and more beginner-friendly than the existing `cram.json` 組織學 blocks, and SHALL follow the `解剖學.html` fragment structure (`.hdt-region` / `.hdt-intro` / `.hdt-topic` / `.hdt-must` / `.hdt-tbl`).

#### Scenario: 依組織結構分區且每區含教學三段

- **WHEN** 讀者開啟組織學講義
- **THEN** 內容依組織學結構分區（細胞 / 四大基本組織 / 器官系統組織學），且每區依序含導言、必背重點、以及至少一張教學表格（組織構造 / 染色 / 易混對照）

#### Scenario: 25 leaves 全寫且比小抄更詳盡

- **WHEN** 比較組織學講義與 `cram.json` 組織學區塊
- **THEN** 25 個 leaf 主題全數寫入且提供白話教學脈絡（第一次唸也看得懂），而非僅 discriminator 對照

### Requirement: 胚胎學 region-keyed 教學結構

胚胎學 handout content SHALL be organized into teaching regions declared by `胚胎學.config.json` (**4 regions** partitioning the subject's 12 canonical concept leaves along developmental logic: `hdt-early-dev` 早期發育與三胚層 / `hdt-pharyngeal-cardio` 咽弓與心血管發育 / `hdt-neural-bodywall-msk` 神經・體壁・骨骼肌肉發育 / `hdt-viscera-senses` 內臟與感官系統發育; final region count is the config's single source of truth). All 12 胚胎學 concept leaves SHALL be written (no high-yield filtering — 12 leaves is well under the proven 解剖 87-leaf one-week ceiling; all regions `targetDepth: 'full'`, no depth-tiering). Each region SHALL contain, in order: (1) a plain-language 導言 understandable to a first-time reader, (2) a 必背重點 list, and (3) at least one teaching table appropriate to embryology (發育時序 / 構造演變 / 臨床畸形 or 易混 X-vs-Y discriminator). Where a 考選部 answer key diverges from international textbooks (e.g. Langman / Moore), the handout SHALL present the 考選部 answer as primary and MAY append a brief ⚠️國際教科書 divergence note. Content SHALL be more detailed and more beginner-friendly than the existing `cram.json` 胚胎學 blocks, and SHALL follow the `解剖學.html` / `組織學.html` fragment structure (`.hdt-region` / `.hdt-intro` / `.hdt-topic` / `.hdt-must` / `.hdt-tbl`).

#### Scenario: 依發育邏輯分區且每區含教學三段

- **WHEN** 讀者開啟胚胎學講義
- **THEN** 內容依發育邏輯分為 4 區（早期發育與三胚層 / 咽弓與心血管 / 神經・體壁・骨骼肌肉 / 內臟與感官），且每區依序含導言、必背重點、以及至少一張教學表格（發育時序 / 構造演變 / 臨床畸形 / 易混對照）

#### Scenario: 12 leaves 全寫且比小抄更詳盡

- **WHEN** 比較胚胎學講義與 `cram.json` 胚胎學區塊
- **THEN** 12 個 leaf 主題全數寫入且提供白話教學脈絡（第一次唸也看得懂），而非僅 discriminator 對照

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到胚胎學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的題目 union；不顯示任何 signpost（每區恰對一個 `memberRegionIds` 長度為 1 的 quiz entry）

#### Scenario: 考選部答案與國際教科書分歧時以考選部為主

- **WHEN** 某胚胎學事實的考選部答案與國際教科書（Langman / Moore）分歧
- **THEN** 講義呈現考選部答案為主（考試給分依據），並得於該處附一句 ⚠️國際教科書 分歧小註，不以國際教科書覆蓋考選部答案

### Requirement: 題庫分頁的考前講義入口

The 題庫 top-nav tab's sub-tab bar SHALL include a 「考前講義」sub-tab as its third entry, after 題庫 (`/bank`) and 考前猜題 (`/cram`), navigating to `/cram/handout`. Activating it SHALL open the existing full-screen handout scene. While the route is `/cram/handout`, the 題庫 top-nav tab SHALL remain the active top-nav tab. This is an additional entry point; the existing 考前講義(beta) button on the `/cram` page is unchanged.

#### Scenario: 題庫分頁列出考前講義為第三個 sub-tab

- **WHEN** 使用者位於題庫分頁列（`/bank` 或 `/cram`）
- **THEN** 分頁列依序顯示 題庫 / 考前猜題 / 考前講義 三個 pill，第三個「考前講義」指向 `/cram/handout`

#### Scenario: 點擊考前講義開啟講義場景且題庫 tab 維持選中

- **WHEN** 使用者點擊「考前講義」sub-tab
- **THEN** 導向 `/cram/handout` 並開啟全螢幕講義場景，且題庫 top-nav tab 仍為選中狀態（透過既有 `/cram/` 前綴比對）

