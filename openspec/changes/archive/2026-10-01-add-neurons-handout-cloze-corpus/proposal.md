## Why

二階（study-rpg-2nd）已上線「講義重點挖空字卡」：卡片是講義原句的逐字挖空，存在講義旁的 sidecar，講義正文不動。neurons 的 11 科考前講義也需要同一份「所有人相同、每張都錨得回講義原文」的字卡語料，之後的收藏複習、讀本螢光重點、熟記獎勵（各自另開 change）才有東西可接。neurons 講義是 **HTML 片段**（`src/handout/<科>.html`，`dangerouslySetInnerHTML` 原樣渲染），不是 2nd 的 markdown，所以 2nd 的讀本純文字轉換不能直接搬，要改寫成 HTML 版，並由 build 閘門機械保證「逐字、唯一、在同一條必背重點內」。

移植依據：`~/coding-scratch/study-rpg-2nd/docs/handout-cloze-playbook.md`（第 7、8 節是 neurons 專用）與 2nd 的 `handout-cloze-corpus` spec。

## What Changes

- 新增字卡**正本**：`packages/content-neurons-tw/src/handout/_cloze/<科>.json`（一科一檔，進版控）。每張卡帶穩定 `cardId`（指派一次、不從文字推導）、`anchorId`（= `<科>::<該考點 data-leaf-ids 的第一個 leaf>`）、`masks[{exact,prefix,suffix,role:'answer'|'gloss'}]` 與選句訊號。
- 新增 build 產物 `dist/handout-cloze.json`（每卡含 `bulletText`、`citeRanges`、`sentenceHash`、`tierAtAdmission`）（由 `copy-content.mjs` 帶進 app `public/content/neurons-tw/`）。`build-handout.ts` 在既有講義閘門通過後驗證正本、補上 `sentenceHash` 與 `bulletText` 才寫出；**閘門全過才寫**，失敗先刪舊檔再 exit 1。
- 新增 node-free 的「讀本純文字」模組（HTML 版）：用符合 HTML 規格的 parser（`parse5`）解析講義片段，逐 `.hdt-topic` 取出 `ul.hdt-must > li` 自身文字（不含巢狀清單），與瀏覽器 `textContent` 同義（含 `<cite>` 年份、含 emoji 文字）。
- 新增白名單閘門，沿用 2nd 的 reason 代碼；neurons 差異：
  - bullet ＝ `ul.hdt-must > li`；`p.hdt-teach`、`table.hdt-tbl`、標題不收；
  - `excluded-source` 改判 li 內含 `hdt-intl`（⚠️ 國際教科書註）或 ⚠️；
  - 遮罩（含前後文）不可碰到 `<cite>` 年份（`cite-overlap`）；`answer-leak` 的可見文字不含 cite，另拒答案等於該 bullet 的 cite 年份 token；
  - 未標 `data-leaf-ids` 的考點不出卡；
  - `maxCards` 封閉表（涵蓋 `tierOf` 全部 5 值）：常青必掃 5／近年新寵 4／穩定考點 4／經典但降溫 4／low-yield 3；多 leaf 考點取最高 tier；卡片記錄收錄時的 tier，build 依它擋上限，之後 ingest 造成的 tier 漂移只進報告；
  - `sentenceHash` 以去掉 `<cite>` 年份的 bullet 文字計算，新梯次加 cite 不會讓卡失效；遮罩連同前後文都不可碰到 `<cite>`。
- 重複與數值矛盾只列成報告，不擋 build；矛盾句在修講義或 owner ack 前不 promote。
- 新增生成器 `packages/content-neurons-tw/scripts/cloze-wip/`（不出貨、build 不讀）：select（規則層選句）→ pick（本次用平行 Sonnet subagent 的 `--emit-prompts`／`--ingest` 模式）→ admit（過閘門、配 cardId、審核表、`--promote`）；評分資料包與檢查腳本。
- 試點：**胚胎學**＋**寄生蟲學**：33 個有標 leaf 的考點（12＋21；寄生蟲學 2 個未標 leaf 的考點不出卡）。兩輪 Opus 評分（第二輪對照考古題）＋講義問題獨立複核（fix／note／keep）。發布門檻 good ≥70%、bad ≤10%、醫學錯誤 0。
- 不做任何 UI、Dexie、同步、獎勵。

## Capabilities

### New Capabilities
- `neurons-handout-cloze-corpus`：neurons 講義字卡語料的資料契約、HTML 讀本純文字的一致性、build 閘門（逐字唯一錨定與形狀白名單）、報告與試點發布門檻。

### Modified Capabilities
（無。既有講義 build 與閘門行為不變；新步驟與產物由新 capability 規範。）

## Impact

- **程式碼**：`packages/content-neurons-tw/scripts/build-handout.ts`（最後新增字卡步驟）；`scripts/build-concept-recurrence.ts` 的 tier 值域與 `tierOf` 抽到純模組 `src/concept-tiers.ts`（行為不變，讓閘門與測試可 import）；新增本機用、不進 CI 的 `scripts/cloze-wip/parity-browser.mjs`（`npx -p playwright -p tsx`，用已快取的 Chromium）；`packages/content-neurons-tw/src/handout/` 新增 `topic-plain-text.ts`、`cloze-gate.ts`；`apps/neurons-tw/scripts/copy-content.mjs` 多帶一個選用檔。
- **依賴**：content 套件 `dependencies` 新增 `parse5`（純 JS、無 `node:` import），lockfile 一併提交（CI `--frozen-lockfile`）。
- **資料**：新增 `src/handout/_cloze/`（正本）、`scripts/cloze-wip/`（生成器與中間產物）。試點若評分抓到講義錯誤，會經獨立複核後修改 `胚胎學.html`／`寄生蟲學.html`（考選部答案優先，差異以 `hdt-intl` 加註）。
- **測試**：`apps/neurons-tw` vitest（node 環境）新增閘門、純文字、接線測試。
- **不影響**：讀本畫面、runtime bundle 行為（app 端尚無消費端）、同步、R2 SCHEMA_VERSION、Dexie。
