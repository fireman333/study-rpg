## MODIFIED Requirements

### Requirement: 講義內容契約 handout.json

The handout content SHALL be served from a static `handout.json` under the existing `content/neurons-tw/` asset directory. Its top-level shape SHALL be `{ version, builtAt, subjects: HandoutSubject[] }`, where each `HandoutSubject` carries at least `{ subjectId, title, html }`. The `subjects` array SHALL cover all 11 一階 families and SHALL contain the `解剖學`, `組織學`, `胚胎學`, `生理學`, `藥理學`, `病理學`, `寄生蟲學`, `微生物學`, `生物化學`, `公共衛生學`, and `免疫學` entries. When more than one subject is present, the scene SHALL render a subject picker; with a single subject the picker MAY be omitted. The loader SHALL prefix the fetch path with `import.meta.env.BASE_URL`.

#### Scenario: 內容含全 11 科

- **WHEN** app 載入 `handout.json`
- **THEN** `subjects` 陣列含全部 11 科（解剖 / 組織 / 胚胎 / 生理 / 藥理 / 病理 / 寄生蟲 / 微生物 / 生化 / 公衛 / 免疫）教學內容，且結構允許日後調整而不需破壞性變更

#### Scenario: 多科顯示 subject picker

- **WHEN** `handout.json` 的 `subjects` 多於一科
- **THEN** 講義場景顯示 subject picker 供切換各科；僅一科時 picker 可省略

#### Scenario: 內容以 BASE_URL 前綴取得

- **WHEN** loader 取得 `handout.json`
- **THEN** fetch 路徑帶 `import.meta.env.BASE_URL` 前綴（prod `/neurons/`、dev `/`），避免 prod SPA index.html fallback 造成 JSON 解析失敗

### Requirement: 區域粒度題目覆蓋（leaf 嚴格分割、題目 union cover、無孤兒）

For a subject that declares a per-subject region config (`<subject>.config.json`: an ordered list of `{ regionId, title, leafIds[], targetDepth }`), the region config SHALL be the single source of truth driving three things: teaching-region boundaries, region→question quiz pools, and per-region length budget. The contract (shared across all region-keyed subjects) SHALL hold:

- **`regionId`** SHALL be `hdt-`-prefixed ASCII kebab-case (no CJK) and SHALL match, verbatim, the `id` of the corresponding `<section class="hdt-region">` in that subject's HTML; **`title`** carries the CJK display name.
- **`leafIds`** SHALL each exist among the subject's canonical concept leaves (`concept-recurrence.json`), and across all regions SHALL form a **strict partition at leaf granularity** — every leaf assigned to exactly one region, none unassigned, none shared.
- **`targetDepth`** SHALL be one of `'full'` | `'brief'` (per-region length-budget signal; region-keyed subjects default `'full'`).
- Each region's quiz pool SHALL be the **union** of its leaves' questions. Because `concept-tags.json` is `qid → leafId[]` (a question MAY be tagged to leaves in different regions), pools MAY overlap — the question-granularity mapping is a **cover, not a partition**; such a question is legitimately testable in every region it touches.
- Each region's quiz pool SHALL be **scoped to the subject's own questions** — a question whose home `subject` differs from the handout's subject SHALL NOT enter the pool, even when it is tagged to a leaf this subject shares with another subject's domain (e.g. 細胞膜運輸 leaves shared between 生理學 and 生物化學). The per-subject build SHALL filter `leafToQids` to own-subject questions before pool assembly, mirroring the content-mining subject filter, so a cross-domain leaf never leaks the other subject's questions into this subject's 測驗本區 pool.
- **No orphan**: a question whose EVERY tagged leaf is unmapped by the config SHALL cause the build to fail loudly (No Silent Errors). A region resolving to zero leaves or zero questions SHALL also fail.
- **No drift (bidirectional)**: the build SHALL fail if any config `regionId` has no matching HTML `.hdt-region` id, OR if any quiz-bearing HTML `.hdt-region` has no config entry (overview / non-quiz regions MAY be explicitly declared exempt).

#### Scenario: leaf 嚴格分割、每題至少一 leaf 覆蓋

- **WHEN** 執行 region-keyed 科目的 handout build
- **THEN** 每個 canonical leaf 恰被一個 region 涵蓋（無重複、無遺漏）；且每一題至少有一個 tagged leaf 落在某區。若某題所有 tagged leaf 都不屬任何 region，build 大聲失敗（非靜默略過）

#### Scenario: 多 leaf 題可跨區重複（cover 語意）

- **WHEN** 一題被 tag 到分屬不同 region 的多個 leaves
- **THEN** 該題同時進入所屬各 region 的「測驗本區」題池，屬允許重疊的 cover，而非要求互斥的 partition

#### Scenario: 跨科重疊 leaf 不洩漏他科題目

- **WHEN** 某 leaf 同時被本科與他科的題目 tag（例：細胞膜運輸 leaf 橫跨生理學與生物化學）
- **THEN** 本科講義該區的「測驗本區」題池只含本科（home `subject` 相符）的題目，他科題目不進入本科題池；build 對每科先把 `leafToQids` scope 成本科題目再組池

#### Scenario: config 與 HTML region id 雙向一致

- **WHEN** region config 的某 `regionId` 在 HTML 找不到對應 `.hdt-region`，或某個帶測驗的 HTML region 未在 config 宣告
- **THEN** build 失敗並指出該不一致，避免建出看不見的 CTA 或缺測驗入口的內容區

#### Scenario: 空區大聲失敗

- **WHEN** region config 的某一區解析出 0 leaves 或 0 題目
- **THEN** build 失敗並指出該區，避免出貨空題池的「測驗本區」

#### Scenario: 區域邊界以 config 為單一真實來源

- **WHEN** 審視內容生成、region→題目對映、長度預算三者的來源
- **THEN** 三者皆由同一份 `<subject>.config.json` 驅動，而非散落於 HTML、build script 常數或多份清單

## ADDED Requirements

### Requirement: 生理學 region-keyed 教學結構

生理學 handout content SHALL be organized into teaching regions declared by `生理學.config.json` (**12 regions** partitioning the subject's 71 canonical concept leaves along system-physiology logic: 細胞生理與膜運輸 / 神經傳導與中樞整合 / 感覺系統 / 肌肉生理 / 血液生理 / 心血管生理 / 呼吸生理 / 腎臟與體液生理 / 消化生理 / 內分泌 I / 內分泌 II / 生殖生理; final region count is the config's single source of truth). All 71 生理學 concept leaves SHALL be written; **3 regions carry `targetDepth: 'brief'`** (感覺系統 / 血液 / 生殖) so the whole subject stays 考前一週唸得完 while high-yield systems get `'full'` depth. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to physiology (機制 / 曲線 / 定量 or 易混 X-vs-Y discriminator). Where a 考選部 answer key diverges from international textbooks, the handout SHALL present the 考選部 answer as primary and MAY append a brief ⚠️國際教科書 divergence note. Content SHALL be more detailed and more beginner-friendly than the existing `cram.json` 生理學 blocks, and SHALL follow the `解剖學.html` fragment structure (`.hdt-region` / `.hdt-intro` / `.hdt-topic` / `.hdt-must` / `.hdt-tbl`).

#### Scenario: 依系統生理分區且每區含教學三段

- **WHEN** 讀者開啟生理學講義
- **THEN** 內容依系統生理分為 12 區，每區依序含導言、必背重點、以及至少一張教學表格；`brief` 區（感覺 / 血液 / 生殖）較精簡但仍具三段結構

#### Scenario: 每區末尾一顆測驗本區（本科題池）

- **WHEN** 使用者讀到生理學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的**生理學**題目 union（跨科重疊 leaf 不含生物化學題）；不顯示 signpost

### Requirement: 藥理學 region-keyed 教學結構

藥理學 handout content SHALL be organized into teaching regions declared by `藥理學.config.json` (**17 regions** partitioning the subject's 67 canonical concept leaves along drug-class logic: 藥理總論 / 自主神經藥物 / 利尿與抗高血壓 / 心臟藥物 / 止血與抗栓 / 血脂造血免疫 / 生殖腎上腺荷爾蒙 / 代謝內分泌 / 胃腸呼吸道 / 自泌素抗發炎 / CNS-GABA / 麻醉鴉片 / 精神神經退化 / 抗生素 I / 抗生素 II 抗結核黴菌病毒 / 抗腫瘤 / 毒理解毒劑; final region count is the config's single source of truth). All 67 藥理學 concept leaves SHALL be written; **3 regions carry `targetDepth: 'brief'`** (精神神經退化 / 抗生素 I / 抗生素 II) so the subject stays 考前一週唸得完. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to pharmacology (機轉 / 副作用 / 交互作用 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging. Content SHALL be more detailed and more beginner-friendly than `cram.json` 藥理學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 依藥物分類分區且每區含教學三段

- **WHEN** 讀者開啟藥理學講義
- **THEN** 內容依藥物分類分為 17 區，每區依序含導言、必背重點、以及至少一張教學表格（機轉 / 副作用 / 交互作用 / 易混對照）

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到藥理學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的藥理學題目 union；不顯示 signpost

### Requirement: 病理學 region-keyed 教學結構

病理學 handout content SHALL be organized into teaching regions declared by `病理學.config.json` (**14 regions** partitioning the subject's 65 canonical concept leaves along general-then-systemic pathology logic: 細胞傷害發炎修復 / 血液動力學障礙 / 免疫感染遺傳 / 腫瘤學總論 / 心臟 / 造血淋巴 / 呼吸 / 肝膽胰 / 消化道 / 腎臟泌尿內分泌 / 女性生殖乳房 / 男性生殖 / 神經 / 骨骼肌肉眼皮膚; final region count is the config's single source of truth). All 65 病理學 concept leaves SHALL be written; **5 regions carry `targetDepth: 'brief'`** (心臟 / 造血淋巴 / 呼吸 / 神經 / 骨骼肌肉眼皮膚) so the subject stays 考前一週唸得完. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to pathology (病理特徵 / 診斷準則 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging. Content SHALL be more detailed and more beginner-friendly than `cram.json` 病理學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 依總論到系統病理分區且每區含教學三段

- **WHEN** 讀者開啟病理學講義
- **THEN** 內容依總論（傷害發炎 / 血液動力學 / 免疫感染遺傳 / 腫瘤總論）到系統病理分為 14 區，每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到病理學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的病理學題目 union；不顯示 signpost

### Requirement: 寄生蟲學 region-keyed 教學結構

寄生蟲學 handout content SHALL be organized into teaching regions declared by `寄生蟲學.config.json` (**6 regions** partitioning the subject's 21 canonical concept leaves along taxonomy: 線蟲 / 吸蟲 / 絛蟲 / 原蟲（一）腸道腔道自由生活 / 原蟲（二）血液組織 / 病媒節肢動物; final region count is the config's single source of truth). All 21 寄生蟲學 concept leaves SHALL be written (all regions `targetDepth: 'full'`, no depth-tiering — 21 leaves ≪ the proven 87-leaf one-week ceiling). Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to parasitology (生活史 / 中間宿主 / 診斷 or 易混 X-vs-Y discriminator). Where a 考選部 answer key diverges from international textbooks (e.g. 中間宿主=水生植物, 弓蟲非水媒, 廣節裂頭絛蟲→惡性貧血), the handout SHALL present the 考選部 answer as primary and MAY append a brief ⚠️國際教科書 divergence note. Content SHALL be more detailed and more beginner-friendly than `cram.json` 寄生蟲學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 依分類學分區且每區含教學三段

- **WHEN** 讀者開啟寄生蟲學講義
- **THEN** 內容依分類學分為 6 區（線蟲 / 吸蟲 / 絛蟲 / 腸道腔道原蟲 / 血液組織原蟲 / 病媒節肢動物），每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 考選部答案為主、國際教科書分歧加註

- **WHEN** 某寄生蟲學事實的考選部答案與國際教科書分歧（如肝吸蟲／薑片蟲中間宿主=水生植物、弓蟲非經飲用水、廣節裂頭絛蟲→惡性貧血）
- **THEN** 講義以考選部答案為主，並可附一則 ⚠️國際教科書 分歧小註；不因國際教科書而改動考選部答案

### Requirement: 微生物學 region-keyed 教學結構

微生物學 handout content SHALL be organized into teaching regions declared by `微生物學.config.json` (**10 regions** subdividing the subject's coarse blueprint chapters into 51 canonical concept leaves: 細菌學通論 / 革蘭氏陽性球菌 / 革蘭氏陽性桿菌與梭菌 / 革蘭氏陰性桿菌 / 分枝桿菌與非典型菌 / 病毒學通論與高頻病毒 / 高頻 RNA 病毒 / RNA 病毒長尾 / DNA 病毒與普里昂 / 真菌學; final region count is the config's single source of truth). All 51 微生物學 concept leaves SHALL be written; **3 regions carry `targetDepth: 'brief'`** (革蘭氏陰性桿菌 / RNA 病毒長尾 / DNA 病毒與普里昂) so the subject stays 考前一週唸得完. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to microbiology (鑑別特徵 / 毒素 / 抗藥性 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging. Content SHALL be more detailed and more beginner-friendly than `cram.json` 微生物學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 粗略章節細分為 10 區且每區含教學三段

- **WHEN** 讀者開啟微生物學講義
- **THEN** 內容把官方粗略的少數 blueprint 章節細分為 10 個可一次坐下唸完的區，每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到微生物學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的微生物學題目 union；不顯示 signpost

### Requirement: 生物化學 region-keyed 教學結構

生物化學 handout content SHALL be organized into teaching regions declared by `生物化學.config.json` (**13 regions** subdividing the subject's coarse blueprint chapters into 74 canonical concept leaves: 胺基酸與蛋白質 / 酵素維生素輔酶 / 醣類脂質生物膜 / 醣類代謝 / 丙酮酸 TCA 氧化磷酸化 / 脂質代謝 / 含氮化合物代謝 / 核酸結構複製修復 / 轉錄調控 / 轉譯與蛋白質命運 / 分子生物技術 / 訊息傳遞 I GPCR / 訊息傳遞 II 激酶細胞週期凋亡; final region count is the config's single source of truth). All 74 生物化學 concept leaves SHALL be written; **4 regions carry `targetDepth: 'brief'`** (醣類脂質生物膜 / 脂質代謝 / 分子生物技術 / 訊息傳遞 II) so the subject stays 考前一週唸得完. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to biochemistry (代謝路徑 / 酵素調控 / 定量 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging (e.g. EC 七大類 / Hox 時序 / Tamoxifen 子宮內膜). Content SHALL be more detailed and more beginner-friendly than `cram.json` 生物化學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 粗略章節細分為 13 區且每區含教學三段

- **WHEN** 讀者開啟生物化學講義
- **THEN** 內容把官方粗略的少數 blueprint 章節細分為 13 個可一次坐下唸完的區，每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 每區末尾一顆測驗本區（本科題池）

- **WHEN** 使用者讀到生物化學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的**生物化學**題目 union（跨科重疊 leaf 不含生理學題）；不顯示 signpost

### Requirement: 公共衛生學 region-keyed 教學結構

公共衛生學 handout content SHALL be organized into teaching regions declared by `公共衛生學.config.json` (**8 regions** partitioning the subject's 42 canonical concept leaves: 生物統計 / 流行病學研究設計 / 疾病測量偏差篩檢監測 / 環境衛生 / 職業醫學 / 衛生行政醫療體系健保 / 醫事法規倫理 / 健康促進行為科學預防醫學; final region count is the config's single source of truth). All 42 公共衛生學 concept leaves SHALL be written; **2 regions carry `targetDepth: 'brief'`** (職業醫學 / 醫事法規倫理) so the subject stays 考前一週唸得完. Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to public health (定義 / 指標公式 / 研究設計 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging. Content SHALL be more detailed and more beginner-friendly than `cram.json` 公共衛生學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 依公衛主題分區且每區含教學三段

- **WHEN** 讀者開啟公共衛生學講義
- **THEN** 內容依公衛主題分為 8 區（生統 / 流病設計 / 疾病測量 / 環境 / 職醫 / 衛政健保 / 法規倫理 / 健康促進），每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到公共衛生學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的公共衛生學題目 union；不顯示 signpost

### Requirement: 免疫學 region-keyed 教學結構

免疫學 handout content SHALL be organized into teaching regions declared by `免疫學.config.json` (**7 regions** merging the subject's many tiny blueprint chapters into 30 canonical concept leaves: 先天免疫與免疫系統組成 / 抗原辨認與淋巴球發育 / 適應性免疫效應 T 與 B 細胞 / 免疫耐受過敏自體免疫 / 宿主防禦與免疫缺損 / 移植免疫與免疫抑制 / 腫瘤免疫疫苗與免疫治療; final region count is the config's single source of truth). All 30 免疫學 concept leaves SHALL be written; **1 region carries `targetDepth: 'brief'`** (移植免疫與免疫抑制). Each region SHALL contain, in order: (1) a plain-language 導言, (2) a 必背重點 list, and (3) at least one teaching table appropriate to immunology (細胞／分子角色 / 機制 or 易混 X-vs-Y discriminator). 考選部 answer primary; ⚠️國際教科書 note where diverging. Content SHALL be more detailed and more beginner-friendly than `cram.json` 免疫學 blocks, and SHALL follow the `解剖學.html` fragment structure.

#### Scenario: 眾多小章合併為 7 區且每區含教學三段

- **WHEN** 讀者開啟免疫學講義
- **THEN** 內容把官方眾多小 blueprint 章節合併為 7 個可一次坐下唸完的區，每區依序含導言、必背重點、以及至少一張教學表格

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到免疫學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的免疫學題目 union；不顯示 signpost
