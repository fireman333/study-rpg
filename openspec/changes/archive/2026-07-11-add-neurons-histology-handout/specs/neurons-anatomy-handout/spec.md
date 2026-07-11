## MODIFIED Requirements

### Requirement: 講義內容契約 handout.json

The handout content SHALL be served from a static `handout.json` under the existing `content/neurons-tw/` asset directory. Its top-level shape SHALL be `{ version, builtAt, subjects: HandoutSubject[] }`, where each `HandoutSubject` carries at least `{ subjectId, title, html }`. The `subjects` array SHALL be extensible to all 11 families and SHALL contain at least the `解剖學` and `組織學` entries. When more than one subject is present, the scene SHALL render a subject picker; with a single subject the picker MAY be omitted. The loader SHALL prefix the fetch path with `import.meta.env.BASE_URL`.

#### Scenario: 內容含解剖學與組織學且可再擴充

- **WHEN** app 載入 `handout.json`
- **THEN** `subjects` 陣列至少含 `subjectId === '解剖學'` 與 `subjectId === '組織學'` 兩筆教學內容，且結構允許日後新增其他科而不需破壞性變更

#### Scenario: 多科顯示 subject picker

- **WHEN** `handout.json` 的 `subjects` 多於一科
- **THEN** 講義場景顯示 subject picker 供切換各科；僅一科時 picker 可省略

#### Scenario: 內容以 BASE_URL 前綴取得

- **WHEN** loader 取得 `handout.json`
- **THEN** fetch 路徑帶 `import.meta.env.BASE_URL` 前綴（prod `/neurons/`、dev `/`），避免 prod SPA index.html fallback 造成 JSON 解析失敗

### Requirement: 事實 grounding 與押題誠實

Every fact in a subject's handout SHALL be traceable to the exam corpus (`questions.json` stems / answers / `optionExplanations` / `explanation` for that subject) or to standard textbook knowledge cross-verified against that corpus; facts SHALL NOT be generated from unverified model memory. Where a fact touches histology / anatomy / other subject science, 考選部 answer keys SHALL be treated as primary and cross-verified against OpenEvidence (genuine error vs textbook-defensible), per the project's neuroscience-fact verification rule. The handout SHALL NOT contain prediction-certainty language (命中率 / 保證會考 / 今年一定考 or equivalents); high-frequency framing SHALL be presented as historical 投報率參考 only.

#### Scenario: 事實可回溯題庫

- **WHEN** 稽核講義任一必背 / 易混條目
- **THEN** 該條目可指回題庫的題目 / 選項詳解，或為對題庫交叉驗證過的標準教科書知識

#### Scenario: 無命中率保證字眼

- **WHEN** 掃描講義文字
- **THEN** 不出現「命中率 / 保證會考 / 今年一定考」等預測保證字眼

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

## ADDED Requirements

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
