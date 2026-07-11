# Decision — 神經元「考前講義」跨科通用化（組織學 → 胚胎學 → 病理學 → 藥理學）

**2026-07-10 · planning session（Fable 諮詢）· 尚未 propose，下 session 起做**

**完整交接文件（必讀）**：`~/.claude/scratch/2026-07-10-neurons-subject-handouts-handoff.md`

## Context
解剖學考前講義已上線（4 blueprint chapter → 8 region → 每 chapter 一顆測驗 + signpost）。要一致化推廣到其餘四科，一 session 一科，從組織學開始。各科 blueprint chapter 數差很大（組織 1 / 胚胎 1 / 病理 10 / 藥理 10 / 解剖 4），解剖的 chapter-keyed 測驗模型無法直接套。全 11 科 cram/concept-tags 已建，只缺 handout；內容生成 pipeline 腳本已遺失（要重建）。

## Decisions（Fable-advised，待 owner 下 session 拍板細節）
1. **測驗錨定改 region-keyed**（region → concept-leaf 群組 → 測驗），取代 blueprint-chapter 錨定。region-keyed 是 chapter-keyed 超集（1 region=1 chapter 時等價、拆多 region 時 locality 更好），signpost 變 dead code 可移除，label 改「測驗本區」。前置：region→questionID 映射進 runtime（現有 `leafToQids` 反轉 + runtime 已吃 qid pool，migration 小）+ 每題有 primary leaf（驗 orphan 覆蓋）。
2. **Content-gen pipeline 參數化**：只自動化機械部分（mine/packet/dispatch/assemble/Codex/OE）；region 邊界留 `<subject>.config.json`（`{title, leafIds[], targetDepth}`）當單一真實來源，同時驅動內容生成 + region→qid + 長度預算。1 region 1 agent。draft 用中階 model、Codex+OE 當品質關卡（燒錢 gate A 報價）。
3. **長度以閱讀時間預算為準**（非 leaf 數）：解剖 87 leaves = proven ceiling，其餘四科都更低 → 預設全寫；只有病理/藥理（機制敘事偏長）可能要 depth-tiering（breadth 為主排序 + per-chapter floor 覆蓋護欄）。
4. **組織學（第一科）**：1 chapter 切 ~5-6 組織結構 region（細胞/上皮/結締/肌肉/神經/器官系統），25 leaves 全寫，每區一顆 region-keyed 測驗。當 forcing function：engine migration + config-pipeline 在這第一 session 一起做掉，後三科便宜 config-drive。

## Next
下 session：`/spec resume` → 讀 handoff → `/opsx:propose add-neurons-histology-handout`。開頭先 confirm handoff §8 的 5 個 open decisions。
