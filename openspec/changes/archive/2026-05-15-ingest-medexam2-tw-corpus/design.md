## Context

`add-hospital-mode-scaffold` 已 ship — `packages/content-medexam2-tw/` 結構在位但 `dist/` 空、`getContentPack()` 走 EMPTY fallback。本 change 把 `~/Desktop/國考/二階國考/二階國考_拆分/` 的 corpus parse 成符合 `content-pack-contract` 的 build artifact，並 lock 該 content pack 的 license（per Decision 7 of scaffold change）。

源資料盤點（2026-05-15 quick scan）：

- 558 個 .md 檔案：
  - 291 個是 question 檔（`<year>_第N次.md`，依 `醫學三/四/五/六 × 14 科` 組織）
  - 267 個是 LLM-generated explanation side-car（`<year>_第N次.explanations.md`）
  - 詳解覆蓋率 ~91.8%
- 14 科 layout：
  - 醫學三：內科、家醫科
  - 醫學四：小兒科、皮膚科、神經內科、精神科
  - 醫學五：外科、泌尿科、骨科
  - 醫學六：婦產科、復健科、眼科、耳鼻喉科、麻醉科
- 系統資料夾（不 parse）：`_analysis/`、`_cache/`、`_explainer_cache/`、`_explainer_pilot/`、`_pdf/`、`_scripts/`

題目格式（質性很高）：
- YAML frontmatter：`year/sitting/paper/subject/question_count/source_pdf/parsed_date`
- Body：H1 + `## Qxx [子類 / topic tag]` + 題幹 + 4 options + `**答案**：X` + `**Topic**：...`
- 答案明確（不像 一階有些 OCR 缺漏）、有 subspecialty tagging

詳解格式（**遠比 一階詳解 rich**）：
- YAML frontmatter：`source_md / generated_date / model / validation: openevidence_full / question_count / explanation_count / conflict_count / oe_hit_rate / gemini_fallback_count`
- 每題 confidence 標籤（P1 夯 / P2 頂級 / P3 人上人 — 已套 owner 自己的 priority levels system）
- Multi-source 驗證：官方答案 vs Haiku vs ✓/✗ 一致性標記
- 每 option 詳解（包含 OE evidence + citations）

## Goals / Non-Goals

**Goals:**

- 把 291 個 question .md 全部 parse 成 `Question[]`、符合 `content-pack-contract`（id 格式、選項 keys、answer in options 等不變式）
- 對 267 個 `.explanations.md` 做側車 merge，把每題的 `### 選項詳解` block 當 `explanation` 內容
- 14 科 `Subject[]` 含 totalQuestions（per-科 統計），group 標 `醫學三/四/五/六`
- 生成 `dist/stats.json`：per-subject 題數 + 詳解覆蓋率（給 `wire-recruitment-gacha` 用）
- 印 `imported / skipped / total` 三數字（per coding_principles No Silent Errors）
- Lock content pack license = CC-BY 4.0（per Decision 7 deferral）

**Non-Goals:**

- 不解 OE citation 連結（`### OE evidence` block 整段當 explanation prose 一部分塞進 `Question.explanation`、不單獨抽 citations 結構）
- 不做 lazy-load split（本 change 單檔 `questions.json` 即可；超過 NFR 由後續 change 拆）
- 不重生未生成的 24 個 paper 詳解（~9% 缺；對應 question 仍 import 但 `explanation` 標 placeholder + `meta.explanationStatus: "pending"`）
- 不做 UI render explanation（這個 change 是 build-time data 工，UI 是 `wire-quiz-runner-medexam2` 的事）
- 不做 image OCR（`hasImage` 仍只是 flag，placeholder UI 跟 一階 `handle-image-placeholder` 同處理）
- 不把詳解的 OE evidence 抽成獨立結構欄位（保留 prose form）

## Decisions

### Decision 1: 新 capability `medexam2-corpus-ingestion`（不 modify 既有 build-tooling）

**選擇**：`openspec/specs/medexam2-corpus-ingestion/spec.md` 是 NEW capability。
**理由**：一階的 `build-tooling` capability 描述 `content-medexam-tw/scripts/build.ts` 的特定 invariants；二階 source 格式（subspecialty tag、explanations side-car、不同 frontmatter 欄位）跟一階差很大。在同一 capability 內塞兩種 build 規則會稀釋 contract、未來 fork 不知道是哪一個。
**Alternative**：擴 `build-tooling` 成 generic content-build contract。被否決 — 過早抽象，等第三個 content pack 出現再 generalize。

### Decision 2: 詳解 merge 策略 = 整 block 當 explanation prose

**選擇**：對每 `Qxx`，從 `.explanations.md` 抽該題的 `### 選項詳解` 整段（含 4 個 option 詳解 + OE evidence + ✓/✗ 標記）當 `Question.explanation` 字串。
**理由**：`content-pack-contract` 規定 `explanation: string` 是 markdown — 整段 prose markdown 完全符合。OE citations 在 prose 內 inline 表現（如 `[Cochrane 2016]`），UI render 時保留原樣即可。抽成獨立結構（如 `explanation: { content, citations: [...], confidence }`）需改 contract、影響 一階；不值。
**Alternative**：抽 structured fields（`citations[]`、`confidence`、`per_option_correctness`）。被否決 — 改 content-pack-contract 是 breaking change。

### Decision 3: 缺詳解的 placeholder = 非空 string + meta flag

**選擇**：`explanation = "詳解生成中（pending LLM generation）。原始題目 / 答案完整可用。"` + `meta.explanationStatus: "pending"`。
**理由**：`content-pack-contract` 規定 explanation 非空 — placeholder 是合法字串。`meta.explanationStatus` 讓 UI 可 filter / 顯示 badge / opt-out 邏輯（per `wire-quiz-runner-medexam2` 階段）。覆蓋率 ~91.8%、~9% 缺、不阻塞 ingest。
**Alternative**：跳過缺詳解的題目。被否決 — 損失 1000+ 題、且後續可補生成。

### Decision 4: id 格式 = `<year>-<sitting>-<paper>-<subject>-Q<n>`

**選擇**：例：`108-1-醫學三-內科-Q1`（year 用阿拉伯民國數字、sitting 數字 1/2、paper 醫學三/四/五/六、subject 中文、Q 編號）。
**理由**：跟 一階 `<year>-<session>-<book>-<subject>-Q<n>` 格式 1:1 對應（鎖在 content-pack-contract），方便兩 app 用 同樣 SRS save schema。CJK characters 在 ID 一階已驗證沒問題。
**Alternative**：用 hash / UUID。被否決 — debug 時看不到題目來源、且跨年度題目重新 import 後 ID 會變（壞 SRS save）。

### Decision 5: License = CC-BY 4.0（unified for content pack）

**選擇**：`packages/content-medexam2-tw/LICENSE.md` lock 成 CC-BY 4.0 完整條文 + 兩段 source attribution。
**理由**：
- 題目本文來自中華民國考選部（公資源，本身無 copyright 限制、但 attribution 是學術倫理）
- 詳解是 LLM-generated（Claude Haiku 4.5）supervised by 康瑋麟，validated via OpenEvidence — 屬於 owner 創作 + 第三方 model + 多源 reference 混合產出
- CC-BY 4.0 平衡：允許下游 fork / 商用、要求 attribution、無 share-alike 強制（比 CC-BY-SA 更寬鬆 / 比 CC-BY-NC 更開放）
- 跟 一階 CC-BY-NC（陽明小組強制非商用）區別清楚 — 一階是第三方擁有、二階是 owner 自家

`meta.credits` 列兩 entry：
```
[
  { name: "中華民國考選部歷屆考題", url: "https://wwwq.moex.gov.tw/...", license: "公資源" },
  { name: "LLM-generated explanations © 康瑋麟 (WLK)", license: "CC-BY-4.0" }
]
```

**Alternative**：CC0（被否決 — 失 attribution）、CC-BY-NC（被否決 — 跟 一階 confused、過度限制）、Proprietary（被否決 — 違背 study-rpg 開源精神）。

### Decision 6: Statistics output → `dist/stats.json`

**選擇**：除了 `{questions, subjects, meta}.json` 三個 main artifact，新增 `dist/stats.json`：
```typescript
{
  perSubject: Record<SubjectId, {
    totalQuestions: number
    explainedQuestions: number  // explanationStatus !== "pending"
    coveragePercent: number
    perYearCounts: Record<string, number>  // "108-1" -> count
  }>
  totalQuestions: number
  totalSubjects: 14
  builtAt: string
}
```
**理由**：`wire-recruitment-gacha` 要算 affinity threshold（per-subject 5% baseline）必須知道各科題數；UI 也可能要顯示「該科已答 X / Y 題」進度條。把 stats 從 meta.json 拆出避免 meta 肥大、且 stats 是 derived data（rebuild 時可重算、不影響 ContentPack.meta 契約）。
**Alternative**：塞進 meta.json `examMeta.stats`。被否決 — 結構化 stats 跟 meta 邊界混淆。

### Decision 7: 環境變數三層控制

**選擇**：
- `MEDEXAM2_SOURCE_DIR`（預設 `~/Desktop/國考/二階國考/二階國考_拆分`）
- `MEDEXAM2_SUBJECTS`（預設 `all`、可 `內科,外科` 限縮 dev iteration）
- `MEDEXAM2_ALLOW_SKIPS`（預設 0；遇 parse 失敗 fail-fast；設 1 才放行）

**理由**：對齊 一階 `MEDEXAM_*` 系列（per `expand-content-build-to-all-subjects` 設計），方便 owner 心智一致。fail-fast 是 [coding_principles 5](../../../.claude/imports/coding_principles.md) No Silent Errors 的具體實踐。

### Decision 9: 國考 disputed-question marker (`#` / `＃`) — discovered during implementation

**選擇**：當 `**答案**：#`（ASCII）或 `**答案**：＃`（fullwidth）出現，question SHALL be imported（不 skip）；canonical answer 設成 first option key（typically `"A"`），`meta.disputed: true` 標記在 Question.meta 上。
**理由**：build-time 發現 185/6080 (~3%) questions 用 `#` / `＃` 標記 國考 officially-disputed questions（送分題 = all answers accepted by 考選部）。三個 alternatives 都有 cost：
- **Skip 整題**（原 parser default）→ 損失 3% 資料（185 題），其中部分高品質詳解（有完整 OE citations + multi-source 驗證）會被丟掉
- **Import `answer = "#"`** → breaks `content-pack-contract`（answer must ∈ options keys）
- **Import 多 answer 陣列** → breaks contract（answer SHALL be single key）

**選 first-option-as-canonical + meta.disputed flag** 是 best balance：preserves data + honors contract + UI 可顯示 disputed badge + explanation 通常已解釋 dispute background。Discovered 是因為 first build run 報 199 skipped，inspect 後發現都是 `#` marker。
**Alternative rejected**：手動修源 `.md` 把 `#` 改成具體 letter — 違反 source 真實性，且修了 `.md` 之後再 regenerate explanations 會跑掉。

### Decision 8: Question.meta 結構

**選擇**：每題的 `meta` 欄位塞：
```typescript
{
  year: 108,                    // 民國年
  sitting: 1,                   // 第N次
  paper: "醫學三",
  subspecialty: "內分泌新陳代謝科",  // 題目 H2 子類
  topic: "empty sella pituitary evaluation",  // **Topic**: 標籤
  hasExplanation: true,
  explanationStatus: "ok",      // "ok" | "pending"
  explanationModel?: "claude-haiku-4-5-20251001",
  oeHitRate?: 0.781,
  explanationConfidence?: "P2", // P1-P5 from owner's priority system
  sourceFile: "醫學三/內科/108_第一次.md"
}
```
**理由**：保留所有 source metadata 不漏；下游 UI 可選擇性顯示；不打進 top-level Question fields 避免污染 contract。`disputed: true` 由 Decision 9 觸發；當題目是 國考 送分題時加進 meta。

## Risks / Trade-offs

- **[Risk] questions.json 超 NFR 上限（2.5 MB gzipped）** → 預估 3–5 MB（二階詳解平均 ~3–4 KB CJK markdown，3 倍於 一階）→ Mitigation: lazy-load per-subject split 留給下一個 change（如 `lazy-load-medexam2-by-subject`）；本 change 不解。若 first build 真的爆，commit message 紀錄實測值，下一個 change 立刻動工。
- **[Risk] parser fail on edge case formats**（部分 .md 可能有 OCR 怪字 / 缺欄位 / 異常 H2 結構）→ Mitigation: fail-fast 不放行 + per-skip console.warn（檔名 + Qxx + reason）；`MEDEXAM2_ALLOW_SKIPS=1` opt-in 用於 known-bad files。
- **[Risk] explanations.md side-car merge 漏比對**（檔名 mapping 不同步）→ Mitigation: 對每個 question .md 嘗試找 `<basename>.explanations.md`；找不到視為 pending；找到但部分 Q 沒詳解的，per-Q fallback。
- **[Risk] License 選擇後 user 後悔** → CC-BY 4.0 不限制商用，user 之後想再嚴格（CC-BY-NC）需要 retract — 不可逆。Mitigation: build 前 user 在 PR review 階段 confirm。
- **[Trade-off] OE citation 不抽 structure**：UI 不能 click 進個別 citation 看細節，但 ingest 簡化、contract 不變、保留 prose 完整性。下游 UI 可用 regex 抽 `[Source XYZ]` 做被動 highlight。
- **[Trade-off] subspecialty 不暴露在 14 科 banner**：保 14 科 banner 簡潔（per design Decision 3 of scaffold change），代價是同科內細分（如「內分泌」vs「腎臟」）粒度丟失。下游若想 subspecialty banner 拆細是 future work。

## Migration Plan

不適用 — 純資料層加值、無 schema 變動、無 player 存檔影響。`apps/medexam2-hospital-tw` 從 EMPTY_CONTENT_PACK 變成有實際題庫，但 UI 仍是 scaffold（顯示 N Q 數量字串）— 沒有 player save 可 break。
