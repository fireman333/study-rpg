## Why

neurons-tw 題庫有 4600 題歷屆考題（民國 104–115），但沒有一層「概念」抽象——每題只知道科目，不知道它考的是哪個概念。這讓兩件事做不成：(1) 依「概念跨考試次的實際重現度」做**可辯護的押題排序**（而非憑感覺喊重點）；(2) 依概念**搜尋/導航**題庫（「把所有皮質脊髓徑的考古一次做完」）。

本 change 建立這層概念標註地基：為每科定義封閉的 canonical 概念詞彙，替 4600 題各標一個 primary concept，並算出概念重現度資料集。這是 `add-neurons-cram-tab`（考前猜題）的前置依賴，但它本身就有獨立且可上線的使用者價值——**題庫概念搜尋**——所以先獨立成一個 change、先 ship。

概念詞彙必須可辯護（受眾是統計嚴謹敏感的醫學生同儕）：骨架取自考選部官方命題大綱、細層取自官方指定參考書 TOC、再拿語料 bottom-up 校準；封閉詞彙 + validator 保證標註不外溢、不幻覺。

## What Changes

- **建立各科封閉 concept vocabulary**（兩層：大綱章節 + 細概念），含同義詞 canonical map。
- **標註 4600 題**各 1 個 primary concept（v1 不做 secondary / 細顆粒子概念），deterministic keyword pre-pass + cheap-tier 批次分類 + validator（未知值 raise）。
- **算 concept-recurrence 資料集**：以 23 次考試為分母的 breadth 主排序、recency 加權、tier 標籤（常青必掃 / 穩定考點 / 近年新寵 / 經典但降溫）、用既有送分/答案更正資料濾雜訊。
- **概念進題庫搜尋**：concept tag 進 `neurons-question-bank-search` 索引；題目卡以**非可點** label 顯示概念。
- **不動題目 `id` / `answer` / `stem` / `options`**；標註為純 additive metadata；不 bump Dexie / R2 / sync。

## Capabilities

### New Capabilities
- `neurons-concept-tags`: 各科封閉 concept vocabulary（兩層）、4600 題 primary-concept 標註、concept-recurrence 統計資料集（23 sittings、recency、tier、濾送分）、bounded 標註 pipeline 與 validators。

### Modified Capabilities
- `neurons-question-bank-search`: 搜尋索引新增 concept-tag 維度（搜概念名撈該概念題，composes with 既有 chip filters）；題目卡顯示 concept label，標準視圖點 label = 導題庫 + prefill 搜尋。
- `neurons-bug-report`: 既有 QuizModal 🐞 回報 sheet 的 target picker 加「概念標籤錯誤」選項 + `bug_reports` category enum 加一值（把使用者變成標註糾錯訊號；不做獨立新 UI）。

## Impact

- **Code**: `packages/content-neurons-tw/`（新 `concept-vocab/<subject>.ts` + 同義詞 map + tagging/keyword-prepass/recurrence 腳本 + validators + build 產出 concept-tags/recurrence 資料）；`apps/neurons-tw/`（`QuestionBankPage` / `QuestionReviewCard` 概念搜尋 + 非可點 label）。
- **Data（一次性）**: 4600 題 primary-concept 標註（cheap tier / agy 批次分類，compute ≈ $0–12；封閉 vocab + validator 保嚴謹）。真正成本 = ~4–6 hr taxonomy curation + 抽樣審查（agent 主做、owner review vocabulary 骨架的 gate）。
- **無 schema/sync 改動**；不動既有 questions.json 的 `id`/`answer`/內容。
- **下游**: `add-neurons-cram-tab` 依賴本 change 的 concept-recurrence（押題排序）與 concept-tags（來源連結分組）。
- **範圍**: 首發 11 科全標；v1 只 primary concept，secondary 與細顆粒延 v2。
