## Why

`add-hospital-mode-scaffold` 已 ship — `packages/content-medexam2-tw/` 空骨架在位，`getContentPack()` 走 `EMPTY_CONTENT_PACK` fallback（0 Q / 0 subjects）。二階 RPG 任何後續 game logic（recruitment-gacha 的 14 科 banner、affinity threshold 數值、tycoon engine 的科別篩選）都需要實際題庫資料 + 各科題數統計才能起步。

本 change 把 `~/Desktop/國考/二階國考/二階國考_拆分/` 下的 ~291 個 question .md + ~267 個 LLM-generated `.explanations.md` parser 成 `dist/{questions,subjects,meta}.json`，符合 `content-pack-contract`，並 lock 二階 content pack 的 license（per Decision 7 of `add-hospital-mode-scaffold` design.md）。同時輸出**各科題數 + 詳解覆蓋率**統計報告，作為 `wire-recruitment-gacha` 的 affinity threshold 預設值計算基礎。

## What Changes

- 新增 `packages/content-medexam2-tw/scripts/build.ts` — ingestion 主腳本：
  - 讀 `~/Desktop/國考/二階國考/二階國考_拆分/醫學{三,四,五,六}/<科別>/*.md`（過濾掉 `*.explanations.md`、`_analysis/`、`_cache/` 等系統資料夾）
  - 解析 YAML frontmatter（year / sitting / paper / subject / question_count / source_pdf / parsed_date）
  - 解析 Markdown 區塊：`## Qxx [科目子類 / topic tag]` + 題幹 + `- A. ... - B. ... - C. ... - D. ...` + `**答案**：D` + `**Topic**：...`
  - 解析對應 `.explanations.md` side-car（如有）：對每 `Qxx` 抽 `### 選項詳解` block 當 `explanation` 內容（含 OE citations + P1–P5 confidence 標籤）
  - Normalize 成 `Question[]` 符合 `content-pack-contract`（id 格式 `<year>-<sitting>-<paper>-<subject>-Q<n>`）
  - 生成 `Subject[]`（14 科 metadata：id / displayName / group=「醫學三/四/五/六」/ color / totalQuestions）
  - 寫 `dist/{questions,subjects,meta}.json`
- 環境變數：`MEDEXAM2_SOURCE_DIR`（預設 `~/Desktop/國考/二階國考/二階國考_拆分`）+ `MEDEXAM2_SUBJECTS`（預設 `all`、可指定 `內科,外科` debug）+ `MEDEXAM2_ALLOW_SKIPS`（同 一階 No Silent Errors 模式）
- Print `imported / skipped / total` 三個數字 + per-subject 統計（依 [coding_principles 5: No Silent Errors](../../../.claude/imports/coding_principles.md)）
- 生成 `dist/stats.json`（各科題數 + 詳解覆蓋率），給 `wire-recruitment-gacha` 用
- 把 `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,subjects,meta}.json` copy 過去（match 一階 deploy pattern）
- **Lock content-medexam2-tw license = CC-BY 4.0**（per Decision 7 of scaffold change）：
  - `packages/content-medexam2-tw/LICENSE.md` 從 `TBD-after-ingest` 改成完整 CC-BY 4.0 條文
  - `package.json` `license` 欄位從 `SEE LICENSE.md` 改成 `CC-BY-4.0`
  - `meta.json` credits 列：(a) 中華民國考選部歷屆考題（公資源）;（b) LLM 詳解 © 康瑋麟（WLK），Claude Haiku 4.5 生成、OpenEvidence 驗證
- 更新 `packages/content-medexam2-tw/package.json` build script 從 placeholder 改成實際 `tsx scripts/build.ts`

**Out of scope**（明確留給後續 changes）：

- Recruitment banner UI / 抽卡 weight / 親密度 threshold 數值 → `wire-recruitment-gacha`
- 詳解 render UI（含 OE citation 點擊 / P1–P5 confidence 視覺化）→ `wire-quiz-runner-medexam2`
- 補齊未生成詳解的 ~24 個 paper（~9% 缺）→ 不 block 本 change，可後續開新 change `complete-medexam2-explanations`
- 圖題處理（部分題目有 `hasImage` flag）→ 跟 一階 `handle-image-placeholder` 同模式處理，本 change 標 `hasImage: true` 但 UI 未做
- Per-question subspecialty tagging（題目 H2 有 `[內分泌新陳代謝科 / topic]` 子類）→ 存進 `Question.meta.subspecialty` 但不在 14 科 banner 暴露
- Boss case 設計（疑難雜症 case）→ 已 out-of-scope 整個 hospital-management-mode capability

## Capabilities

### New Capabilities

- `medexam2-corpus-ingestion`: 二階國考 .md → questions.json ingestion contract（source 路徑 / parser 規則 / output 格式 / 詳解 merge 策略 / license / 統計輸出）

### Modified Capabilities

（無 — 本 change 透過新 capability 隔離；既有 `content-pack-contract` / `build-tooling` 不動）

## Impact

- **Files**:
  - `packages/content-medexam2-tw/scripts/build.ts`（新，~400–600 行 — 包含 YAML parser、Markdown question parser、explanation merger、stats reporter）
  - `packages/content-medexam2-tw/package.json`（修：build script + license 欄位）
  - `packages/content-medexam2-tw/LICENSE.md`（修：TBD → CC-BY 4.0 條文）
  - `packages/content-medexam2-tw/dist/{questions,subjects,meta,stats}.json`（新 build artifact）
  - `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,subjects,meta}.json`（新 — copied 過去）
  - `apps/medexam2-hospital-tw/src/App.tsx`（修：更新 status text 顯示 ingest 後的真實題數，仍是 scaffold UI）
  - `openspec/specs/medexam2-corpus-ingestion/spec.md`（新 — archive 後生成）
- **APIs**: 無破壞性變更；`getContentPack('/content/medexam2-tw')` 從回 EMPTY 變成回真實 ContentPack
- **Dependencies**: 加 `js-yaml` 或重用 一階 已有的 `yaml` package（首選後者，避免 dupe dep）
- **Tests / verify**:
  - `pnpm --filter @study-rpg/content-medexam2-tw build` — 印 `imported: X, skipped: Y, total: Z` 三數字
  - imported 數量 sanity check（預期 ~10,000–13,000 — 取決於 parser 嚴格度 + 部分檔案 OCR 缺欄位）
  - 14 科 subjects.json 都有 totalQuestions > 0
  - stats.json 各科詳解覆蓋率 ≥ 80%（除少數 paper 漏生成）
  - `dist/questions.json` gzip 後 < 5 MB（NFR check；二階詳解更長，預估 3–5 MB gzipped）
  - `pnpm -r typecheck` 全綠
  - `pnpm --filter @study-rpg/medexam2-hospital-tw dev` boot 後 App.tsx 顯示「台灣二階醫師國考 — N Q, 14 subjects」（N > 0）
- **Risk**:
  - 中 — parser 複雜度比 一階 高（題目 H2 含子類 + topic tag + explanations.md side-car merge）
  - License 風險：CC-BY 4.0 是 owner 自決，但問題本文是公資源（考選部）+ 詳解是 LLM-supervised owner 創作。`LICENSE.md` 註記兩段 source 分開
  - 大檔案：`questions.json` 可能 3–5 MB gzipped — 接近 `project.md` NFR 上限「1–2 MB anticipated, 2.5 MB ceiling」。可能要 lazy-load per-subject split（但留給後續 change，本 change 只 build 單檔）
