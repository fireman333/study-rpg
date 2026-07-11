## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 胚胎學 region-keyed 教學結構

胚胎學 handout content SHALL be organized into teaching regions declared by `胚胎學.config.json` (**4 regions** partitioning the subject's 12 canonical concept leaves along developmental logic: `hdt-early-dev` 早期發育與三胚層 / `hdt-pharyngeal-cardio` 咽弓與心血管發育 / `hdt-neural-bodywall-msk` 神經・體壁・骨骼肌肉發育 / `hdt-viscera-senses` 內臟與感官系統發育; final region count is the config's single source of truth). All 12 胚胎學 concept leaves SHALL be written (no high-yield filtering — 12 leaves is well under the proven 解剖 87-leaf one-week ceiling; all regions `targetDepth: 'full'`, no depth-tiering). Each region SHALL contain, in order: (1) a plain-language 導言 understandable to a first-time reader, (2) a 必背重點 list, and (3) at least one teaching table appropriate to embryology (發育時序 / 構造演變 / 臨床畸形 or 易混 X-vs-Y discriminator). Content SHALL be more detailed and more beginner-friendly than the existing `cram.json` 胚胎學 blocks, and SHALL follow the `解剖學.html` / `組織學.html` fragment structure (`.hdt-region` / `.hdt-intro` / `.hdt-topic` / `.hdt-must` / `.hdt-tbl`).

#### Scenario: 依發育邏輯分區且每區含教學三段

- **WHEN** 讀者開啟胚胎學講義
- **THEN** 內容依發育邏輯分為 4 區（早期發育與三胚層 / 咽弓與心血管 / 神經・體壁・骨骼肌肉 / 內臟與感官），且每區依序含導言、必背重點、以及至少一張教學表格（發育時序 / 構造演變 / 臨床畸形 / 易混對照）

#### Scenario: 12 leaves 全寫且比小抄更詳盡

- **WHEN** 比較胚胎學講義與 `cram.json` 胚胎學區塊
- **THEN** 12 個 leaf 主題全數寫入且提供白話教學脈絡（第一次唸也看得懂），而非僅 discriminator 對照

#### Scenario: 每區末尾一顆測驗本區

- **WHEN** 使用者讀到胚胎學任一內容區末尾
- **THEN** 該區末尾出現一顆「測驗本區」測驗鈕，題池為該區 leaves 的題目 union；不顯示任何 signpost（每區恰對一個 `memberRegionIds` 長度為 1 的 quiz entry）
