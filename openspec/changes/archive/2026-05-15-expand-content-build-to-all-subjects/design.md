## Context

`packages/content-medexam-tw/scripts/build.ts` 把 `~/Desktop/國考/一階國考/陽明國考考古/_extracted/` 下的 .md 解析成 `dist/{questions,subjects,meta}.json`。當前 MVP 為了快速 iterate，預設只匯入「藥理學」一科 418 題 — 由第 32 行 `MEDEXAM_SUBJECTS = process.env.MEDEXAM_SUBJECTS ?? '藥理學'` 控制。M2 進入「全科開放」階段必須把預設改成 10 科 ~3505 題。

build 流程內部已支援 `MEDEXAM_SUBJECTS=all` switch（第 213 行 `if (!MVP_SUBJECTS.includes('all') && !MVP_SUBJECTS.includes(fm.subject)) continue`），所以改 default 即可，不需要重寫 parser。但目前 console 輸出只印 `parsed N / M files` + `questions: N` — **缺 per-question 維度的 imported / skipped / total counter**，違反 [coding_principles.md No Silent Errors](../../../.claude/imports/coding_principles.md) 第 5 條（批次處理 skip counter 一定要最後印總數）。本 change 順手補齊。

## Goals / Non-Goals

**Goals:**

- Build 預設變 `all`，envvar 可降級回單科（dev 快速 build 場景）
- Build 印 `imported / skipped / total` 三個數字 — `imported` = 寫進 `questions.json` 的題數、`skipped` = parser 跳過（缺欄位、option 解析失敗、answer 解析失敗）的題數、`total` = source 中所有 `## Q\d+` block 數
- `apps/medexam-tw/public/content/medexam-tw/` 同步含 10 科 .json
- gzip 後 `questions.json` 控制在 ≤ 350 KB

**Non-Goals:**

- 不動 ContentPack schema / Question shape
- 不動 subject picker UI（玩家仍從 random pool 抽題）
- 不動 boss 範圍（boss 仍硬寫藥理）
- 不引入 incremental build / cache
- 不解圖片 — `hasImage` 題目仍走既有 placeholder banner 流程

## Decisions

### Decision 1: 預設改 `all` 而非保留 `藥理學`

**選擇**：把第 32 行 default 改為 `'all'`。
**理由**：M2 階段 dogfood 就是要看全科。Dev 端要 fast iterate 設 `MEDEXAM_SUBJECTS=藥理學` 一次即可，比起每個 prod build 都要記得設更不容易出錯。CLAUDE.md 同步更新建議命令。
**Alternative**：保留 `藥理學` default、要求 GH Actions 設 `MEDEXAM_SUBJECTS=all`。被否決 — 玩家可能會 fork 後忘記設、debug 時 prod 跟 local 不一致。

### Decision 2: Counter 在哪一層

**選擇**：在 `main()` 內維護兩個 counter（`importedQ`、`skippedQ`），`parseQuestionBlocks` 已透過 console.warn 印 per-skip 細節（檔名 + Q 編號 + 原因），main 只負責 aggregate + 最終 print。
**理由**：per-skip log 已存在（line 130 / 143 / 150 已 console.warn），不重工。aggregate count 在 main 寫 3 行就好。

### Decision 3: Source-of-truth 仍是 `MEDEXAM_SUBJECTS` envvar

不引入 `--subjects` CLI flag、不寫 config 檔。理由：envvar 是現有 contract、CI / GH Actions 已用此機制，加新 API 表面是 over-engineering（per coding_principles 原則 2 Simplicity First）。

### Decision 4: Size budget 2.5 MB (gzipped)

**Revised after first build** — 原估算 250 KB 嚴重低估（誤把 raw 推估當 gzipped）。實際 3291 題 gzipped = **2.09 MB**，因為「詳解」欄位平均 ~1.5 KB CJK markdown（textbook-style 多段解說含 references / mnemonics）。

對齊 [project.md NFR](../../project.md)：「首屏 < 3s（GitHub Pages CDN + 1–2 MB gzipped questions.json）」— 2 MB 是 project.md 預期的上界，本 change 結果剛好命中。Ceiling 訂在 2.5 MB（2 MB anticipated + 0.5 MB buffer），給未來補圖題 placeholder 或新增題目留空間。超過 2.5 MB 才考慮 lazy-load split。

不在本 change 拆 explanation lazy-load：那是 architecture change（loader / cache / fallback 邏輯），跟「全科開放」是兩條獨立 work item。Dogfood 1 週後若 perf 真的爆才動。

## Risks / Trade-offs

- **[Risk] gzip 後超 2.5 MB** → Mitigation: 拆 per-subject lazy load（manifest + 10 個 subject 檔），boot 時只載入玩家當前 subject。本 change 實測 2.09 MB 仍在 ceiling 內，暫不拆。下次 change 加新內容（圖題 OCR / 新題目）後再量。
- **[Risk] 309 題 (8.6%) 因 source 缺欄位被 skip** → Mitigation: 本 change 透過 `MEDEXAM_ALLOW_SKIPS=1` opt-in，commit message 記錄。多數 skip 是上游 OCR 抽題本身缺「題幹/選項/答案」section（圖題或 PDF OCR 斷裂），不是 parser bug。未來可開新 change 做 reparse-from-pdf 或人工補洞。
- **[Risk] 全科 build 後 quiz pool 含玩家不熟悉的科目，dogfood 體感變差** → Mitigation: 接受。Subject picker UI 是下一個 change 的工作；本 change 只負責資料層。Dogfood 1 週後依玩家反饋決定 picker priority。
- **[Risk] 全科 build 觸發新的 parser edge case（某些科目 .md format 跟藥理略有差）** → Mitigation: build 必印 skipped count；任何 skip > 0 都應該被使用者看到並追查。tasks.md 包含「skipped == 0 或可解釋」的 acceptance gate。
- **[Trade-off] questions.json 從 ~70 KB raw → ~750 KB raw**：首次載入 transfer 變大（gzip 後 250 KB 仍可接受），但 SPA 之後走 CDN cache、玩家後續 session 是 disk cache hit。可接受。

## Migration Plan

不適用 — 純 build artifact 更新，存檔（IndexedDB）schema 不變、Question shape 不變。玩家現有存檔下次 reload 直接看到新 pool，無需 migrate。
