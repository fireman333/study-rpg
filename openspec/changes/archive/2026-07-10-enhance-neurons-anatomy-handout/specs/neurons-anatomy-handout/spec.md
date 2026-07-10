## ADDED Requirements

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

The handout scene SHALL render a「測驗本章」control at the end of each blueprint chapter that maps to exam questions. Chapter-to-question routing SHALL be carried by typed data on the content contract (`HandoutSubject.chapterQuizzes`, an array of `{ regionId, label, memberRegionIds[], leafIds[], sourceQuestionIds? }`) and SHALL NOT be embedded in the authored teaching HTML. Because exam questions are tagged at blueprint-chapter granularity, several authored regions MAY share one chapter; in that case the「測驗本章」control SHALL anchor to the chapter's LAST region (`regionId`) and each earlier member region SHALL render a lightweight signpost (labelled with the chapter's `label`) that scrolls to that control, so no two regions launch an identical question pool. Activating the control SHALL launch the existing `QuizModal` in practice mode over that chapter's question pool (mirroring the /cram「答1題看看」on-ramp: no progression side effects beyond the existing practice-mode wrong→錯題本→出征 flow), or, when a usable in-scene pool cannot be built, SHALL fall back to the existing `/bank` deep-link. Regions mapped to no blueprint chapter (e.g. the overview 攻略地圖) SHALL render neither a測驗 control nor a signpost.

#### Scenario: 每個 blueprint 章節末尾出現測驗鈕

- **WHEN** 使用者讀到某個對映到題目的 blueprint 章節的最後一個 region 末尾
- **THEN** 該處出現「測驗本章」控制項

#### Scenario: 點擊開啟該章 practice quiz

- **WHEN** 使用者點擊某章的「測驗本章」
- **THEN** 以既有 `QuizModal`（practice 模式）開啟該章題庫池，或在無法建立場景內題池時導向既有 `/bank`

#### Scenario: 共用章節的前段 region 顯示指路 signpost

- **WHEN** 某 region 與其他 region 共用同一 blueprint chapter，且該章測驗鈕位於較後的 region
- **THEN** 該前段 region 末尾顯示帶章節 label 的指路 signpost，點擊捲動至測驗鈕所在 region，而非另開一份相同題池

#### Scenario: 概覽章節不顯示測驗鈕

- **WHEN** 章節未對映任何 blueprint chapter（例如攻略地圖概覽章）
- **THEN** 該章節末尾既不顯示「測驗本章」控制項，也不顯示指路 signpost

#### Scenario: quiz 路由不進入授權 HTML

- **WHEN** 審視章節測驗路由的資料來源
- **THEN** 路由資料位於 typed `chapterQuizzes`（型別化資料），而非嵌入 140 KB 授權教學 HTML

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
