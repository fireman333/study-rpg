## Context

題庫（`QuestionBankPage` + `QuestionReviewCard`）目前只依科目 + 年份 + 關鍵字文字搜尋，沒有「概念」層。要做可辯護的押題與概念導航，需先為 4600 題建立封閉的概念標註。此地基由 `add-neurons-cram-tab` 依賴，但自帶獨立價值（題庫概念搜尋），故先獨立 ship。

設計經 Fable（押題方法 + 成本）+ Codex（app 架構）consult 收斂，owner 已拍板：3 層可辯護詞彙、先建地基、cheap 變體。官方命題大綱已抓並 parse 全 11 科（`scratchpad/moex-blueprint-full.txt`，將納入 repo）。

**約束**：受眾統計嚴謹敏感 → 詞彙可辯護、標註不幻覺；不動題目 `id`/`answer`/內容；不 bump Dexie/R2/sync。

## Goals / Non-Goals

**Goals**
- 各科封閉、canonical、兩層 concept **tree**（tag 打 leaf、章節 derive），錨定官方大綱 + 官方參考書；每科概念數依 recurrence 密度定（總計 ~400–600）。
- 4600 題 100% 標 **1–3 個 tested leaf concept（cap 3）**，validator 保證 in-vocab。
- concept-recurrence 資料集（per-concept sitting-breadth、cap 23、tier、濾送分）供下游押題。
- 概念進題庫搜尋；題目顯示 concept label，標準視圖點 label = 導題庫 + prefill 搜尋。
- bounded、cost-aware 標註 pipeline（防燒錢）。

**Non-Goals**
- 不標 leaf 以下的細顆粒子概念（v1；延 v2）。
- concept label **不做** filter-toggle 篩選維度（改用 search-shortcut：點 → 導題庫 prefill 搜尋）。
- 不做押題 UI / 考前猜題 tab（那是 `add-neurons-cram-tab`）。
- 不改 cloud sync / Dexie / R2 / questions.json 的 id/answer/內容。

## Decisions

### D1. 三層封閉 vocabulary：官方大綱骨架 + 參考書 TOC 細層 + 語料校準
- **粗層（章節）= 考選部官方命題大綱**（已抓 parse 全 11 科）。理由：出題方自己的分類，比教科書章節更貼近命題、對同儕可辯護。大綱天然兩層（一二三 → (一)(二)…）。
- **細層（概念）= 官方指定參考書 TOC**（大綱點名：Moore/Gray's/Barr's、Ganong/Vander/Guyton、Lehninger/Devlin、Wheater's/Pawlina、Moore/Langman、Murray/Janeway、Katzung、Robbins…）。
- **校準 = 4600 題回貼**：大綱自述「例示不完全以此為限」→ 校準非可選。大綱有列但 0 題 → 標冷區；語料常考但大綱含糊 → 補細概念。
- **封閉 + canonical**：標註只能從該科清單挑，未知值 raise；同義詞（corticospinal tract / 皮質脊髓徑）預先 map 成單一 canonical，避免稀釋 recurrence。granularity = 兩層。
- *Alternatives*: 純教科書章節（不如大綱貼近命題、非出題方依據）；純 bottom-up 分群（不可辯護、命名雜）。

### D2. Bounded cheap-tier 批次分類；嚴謹來自封閉 vocab + validator 而非模型 tier
- classification（挑固定清單）非 generation → 便宜可批。
- **deterministic keyword pre-pass**：概念名+同義詞→concept 詞典，自動標明確關鍵字者（實測 ~30–50% 命中），省 token + 當免費驗證訊號（LLM 與高信心 keyword 不合 → flag）。
- LLM 只標殘差；cheap tier（Haiku/agy）；**per-subject 批次、vocab 釘該科**（~30–40 概念挑 → 成本 + 準確度雙槓桿）；prompt caching vocab prefix。
- **防燒錢硬約束**：禁 per-question 獨立 call；單 pass + 至多一次 flagged re-pass（禁 re-tag 到共識 loop）；預宣告 call budget（~154 calls）+ token 天花板（>2M input abort）；validator 拒 out-of-vocab。
- **每題 1–3 個 tested leaf concept（cap 3）**，gate = 「這題在考的」而非「提到的」（distractor mention 不標）。不設硬 single primary（真跨概念題會 undercount），也不開放無上限 multi-label（邊界爆炸、審查失控）；`isPrimary` 只當軟顯示/tie-break 欄位，不影響計數。細顆粒子概念延 v2。
- **成本**（Fable，一次性）：agy $0 / Haiku $3–4 / Sonnet $10–12；真正成本 ~4–6 hr curation + spot-check。比同批 4600 題已跑過的「簡答 backfill（開放生成）」更輕 → scale 已知可行。

### D3. 押題用 concept-recurrence：per-concept sitting-breadth（cap 23）主鍵、multi-label 不灌水
- 分母 23 次考試（104–114×2 + 115×1）。主鍵 = per-concept **sitting-breadth**（該 concept 被 tested 的相異 sitting 數，sitting 內去重、**上限鎖 23**）；tiebreak recency-weighted（近3×1.5/4–6×1.2/更早×1.0）。
- **multi-label 不膨脹 breadth**：跨概念題 `{A,B}` 讓 A、B 在該 sitting 各記一次 sitting-presence（正確——兩者都被考）；breadth 的 23-cap + 「只算 tested」擋住灌水。**question-count（Σ 題數，multi-label 下會 > 實際總題數）不當排序鍵**，只當次要「強度」欄位並明標可超總量。
- **押題門檻 ≥ ~5/23**；1–4/23 長尾標 low-yield/可搜尋但不排名（n=23 小，3/23 不當預測賣）。
- coarse 章節 breadth = 其下 leaves 的 tested sittings 之 union（兩層 + multi-label 天然可組合）。
- tier ∈ {常青必掃(≥15/23且近3有)、穩定考點(8–14)、近年新寵(近3爆量all-time低)、經典但降溫(高但近3為0，明標)}；用 `provenance/base-corrections.json` 濾/標 送分。

### D4. 概念進題庫搜尋；label = search shortcut（可點 → 導題庫 + prefill 搜尋）
- concept tag 進 `neurons-question-bank-search` 索引，composes with chip filters；搜概念名撈出所有標該概念的題（含跨概念題）。
- 題目卡顯示 tested concept label。**標準題庫/收藏視圖：點 label → 導到 `/bank` 並 prefill 該概念進搜尋框**（復用概念搜尋，非另做 filter 維度）。**考前猜題下鑽的 in-place review 內：label 可設非互動**（避免複習中途跳走）。
- *Rationale*: owner 第三方案——比純不可點多 discoverability + 一鍵「叫出這概念全部題」；比 filter-chip 少一整套 UI。

## Risks / Trade-offs

- **標籤可見 → 標錯被看見**（不像藏在排名裡被平均）→ 封閉 vocab + validator + confidence-stratified 抽樣審（全審低信心 + keyword/LLM 不合 ~5–10%）+ **agent-panel 互審 + owner 薄 sign-off gate**（§1.5）+ 使用者「概念標籤錯誤」回報。
- **大綱「例示不限」** → bottom-up 語料校準列必需。
- **taxonomy 顆粒度是人腦判斷**（真正成本線）→ agent 主做、owner review；過細膨脹人工/雜訊、過粗押題不夠銳 → 依配分定每科概念數上下限。
- **燒錢** → D2 硬 caps（批次、單 pass、budget、token 天花板）。

## Migration Plan

一次性、純新增：
1. 建 vocabulary（大綱 parse + 參考書 TOC + canonical map）。**Gate：agent-panel（Codex 結構 + Fable 粒度/pedagogy）互審 + owner 薄 sign-off（只過「需人眼判斷」shortlist + 骨架，~15–30 min）**。
2. keyword pre-pass → LLM 批次分類殘差 → validator（100% 覆蓋、in-vocab、coverage report）。
3. 抽樣審查。
4. 算 recurrence 資料集。
5. 概念進題庫搜尋 + 非可點 label。
6. verify（validator 單元測試 + Chrome MCP 搜尋 smoke）。

**Rollback**：純新增 metadata + 搜尋維度；移除即回原狀，無 sync/schema 回滾。

## Open Questions

- concept label 在題目卡的顯示位置/密度（stem 下 chip？題庫/收藏/cram 一致）——實作時定，不影響 spec。
- 同義詞 map 的維護：v1 手建；未來若加新考年，标注 pipeline 需可增量重跑（本 change 設計成可重入，但增量標註 UX 延後）。
