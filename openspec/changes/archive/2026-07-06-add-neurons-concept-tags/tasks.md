## 1. Vocabulary — 官方大綱骨架 + 參考書細層

- [x] 1.1 把已抓的官方命題大綱納入 repo（`packages/content-neurons-tw/reference/moex-blueprint.txt`），parse 成每科 coarse（章節）結構（→ `reference/blueprint-coarse.json`：69 章節 / 11 科，corpus subject 全等、chapter id 無重複）
- [x] 1.2 **[owner-approved 改為語料錨定]** 不抓付費教科書 TOC；改由 11 個 subject-miner subagent 從 4600 題各自挖「實際被考」的細概念（教科書標準術語命名），掛在官方大綱章節下 → raw outputs 存 `reference/concept-mining/<subject>.concepts.json`（provenance source-of-record）
- [x] 1.3 建 11 科封閉 concept vocabulary（章節 + 細概念）+ 同義詞 canonical map → `src/concept-vocab/{types,validator,<slug>×11,index}.ts`（generator `scripts/gen-concept-vocab.ts`；**528 leaves**，密度 ≈ 題數÷8–12）
- [x] 1.4 vocabulary validator：closed set、canonical 唯一、未知值 raise（`src/concept-vocab/validator.ts` R1–R9 + `resolveLeaf` raise-on-unknown；`verify:concept-vocab` 綠、typecheck clean）
- [x] 1.5 **Gate：agent-panel 互審 + owner 薄 sign-off** ✅ Codex（needs-rework, 3 blocking）+ Fable（ship-with-minor-fixes, 3 blocking）交叉 review（審查紀錄存 `reference/concept-mining/panel-review/`）→ 我 synthesize：先套 3 個明確修正（wound-healing 抑癌基因同義詞歸位、mite 拆病媒/過敏、candida→opportunistic-yeast rename）→ **owner sign-off（選「拆 A+B 重點桶再進 §2」）** → targeted re-mine 4 科 11 桶（病理 4 失真桶 / 藥理 3 飽和 / 生化 3 / 微生物 1）→ **543 leaves**、validation PASS、飽和 25→22。骨架 + shortlist：`panel-review/SIGN-OFF-1.5.md`

## 2. Tagging — 確定性腳本 + cheap-model 批次（非 Claude fan-out）

- [x] 2.1 deterministic keyword pre-pass（`scripts/build-concept-keyword-prepass.ts`）：per-subject subject-unique token index（canonical+synonyms）比對題幹+**正解**（distractor 另記弱訊號）→ **82.4% ≥1 hit、48.9%（2248 題）unique auto-tag**、33.5% multi-candidate（§2.2 消歧）、17.6% 需模型分類。輸出 `keyword-prepass.json`（regenerable）
- [x] 2.2 bulk 標註 = `scripts/tag-concepts-batch.mjs`（node 呼叫 **agy Gemini flash $0** 批次分類，非 Claude fan-out、非 per-question）：per-subject 批次 30 題、vocab 釘該科、單 pass + keyword fallback、hard call budget 300、resume-safe flush。**155 calls、4485 model-tagged、cap 3、tested-not-mentioned**。UNCOVERED 4 題經 re-pass：1 補標、3 記為 subject-mislabel exception（`concept-tags-exceptions.json`）
- [~] 2.3 （選配）Codex adversarial review — 跳過：pipeline 已由 pilot（100% 覆蓋/0 幻覺）+ §3 三段驗證 + §3.3 跨模型 inter-rater backstop 覆蓋

## 3. Check layer — 三段驗證

- [x] 3.1 確定性 validator（`scripts/verify-concept-tags.ts`，hard gate）：每 tag ∈ 該科 tree、cardinality 1–3、**100% 覆蓋（4597 tagged + 3 documented exception）**、cold-leaf report（**0 冷概念**）、無 phantom/dup；tags 為 sidecar 故 id/answer/stem/options byte-identical。**hard gate 綠**
- [x] 3.2 cross-signal flag（同上腳本）：keyword≠model(380) / 標滿3(77) / kw-fallback(4) = **461 flags** → `tag-review-flags.json`（覆核集）
- [x] 3.3 **獨立第二意見**：Sonnet（跨模型 vs agy-Gemini）重標 stratified sample（5% + 全 384 keyword≠model = 606 題）→ **overlap agreement 92.6%**（各科 ≥80%，無科低於門檻→不需重跑）；exact-set 69%（差異多在多標/粒度邊界非核心概念）。surfaced 高頻覆蓋缺口 → 補 微生物 `togaviridae-rubella` + `mycoplasma-ureaplasma` 2 leaves、re-tag、rebuild（**545 leaves**）；其餘低頻 closest-fit 記為 v1 妥協（細顆粒延 v2）
- [x] 3.4 owner 抽看 + **二輪 agent panel 審考點**（Codex+Fable，both fix-first）→ 修 blocking：(1) tier 邏輯改 recency-gap（「近3=0 硬切窗」統計無 power → `經典但降溫` 改 breadth≥8 & lastGap≥6、`常青必掃` 改 breadth≥13 & 近期活躍、`近年新寵` 改真新出現）→ **經典但降溫 50→11、近年新寵 20→0（誠實）、S.aureus 等 staple 移出降溫**；(2) 修 5 個 over-tag/誤標（trim hub inflation）。audit：`panel-review/*-kaodian.json`。tier 門檻為 owner 可調 game-design 值

## 4. Recurrence 資料集

- [x] 4.1 concept-recurrence（`scripts/build-concept-recurrence.ts`）：per-concept **sitting-breadth**（相異 sitting、sitting 內去重、cap 23）、multi-label 各 tested concept 各計、recency 加權（近3×1.5/4–6×1.2）tiebreak。**實際 breadth 頂端 17–19/23（無 23/23 平台）**
- [x] 4.2 questionCount = 次要 intensity 欄位；押題門檻 breadth ≥ 5/23，<5 標 low-yield 不排名（50 個）
- [x] 4.3 tier（常青必掃45 / 穩定考點379 / 近年新寵19 / 經典但降溫50）；coarse 章節 breadth = leaves tested sittings union
- [x] 4.4 送分/答案更正過濾：**修正 task 誤指的檔** — 送分訊號實際在 `questions.json` 的 `disputed`(52) + `acceptedAnswers.length>1`(86)，非 `base-corrections.json`（那是 PDF 頁碼校正）。**138 題 disputed 從 breadth 排除**、per-concept `disputedExcluded` 記錄
- [x] 4.5 build 產出 `dist/concept-recurrence.json` + `dist/concept-tags.json`（供搜尋 + 下游押題）

## 5. 題庫概念搜尋 + label + 標籤回報

- [x] 5.1 題庫搜尋索引加 concept-tag 維度（`lib/concept-tags.ts` 載 `concept-tags.json` + `CONCEPT_VOCAB` → zh；QuestionBankPage `searchRows` haystack 併入概念名，composes with chip filters）— smoke 驗：搜「機率與抽樣分布」→ 9 題、「皮質脊髓徑」→ 28 題
- [x] 5.2 QuestionReviewCard 顯示 tested concept label（chip row）；題庫/收藏點 label → 導 `/bank?concept=` + prefill（`useSearchParams`，F5/直連 survive）；embedded 下鑽省略 `onConceptClick` = 非互動（cram-tab 用）— smoke 驗：chip 顯示、點擊 prefill + filter、reload 保留
- [x] 5.3 neurons bug-report 擴充：`QUIZ_BUG_TARGETS` 加 `concept-tag`（label「概念標籤錯誤」）→ `concept-tag-error` category（migration `0019_neurons_concept_tag_category.sql` + guard test 重指 0019）；復用既有 sheet，無新 UI

## 6. Verify

- [x] 6.1 typecheck clean（core/content/app）+ **826 app tests 全綠**（含 bug-report-canonical guard）+ `verify:concept-vocab` / `verify:concept-tags` hard-gate 綠（validator / 100% 覆蓋 / 送分濾除 / multi-label 不膨脹皆由 verify 腳本斷言）
- [x] 6.2 dev-server smoke（preview tools）：概念名搜尋撈出該概念題（9 / 28 題）、考點 label chip 顯示、點 label 導 `/bank` prefill + filter、直連/F5 URL param survive、🐞 sheet 開啟（登入 gate；概念選項在 authed 分支，由 guard test + typecheck 驗）；0 console error
- [x] 6.3 coverage + inter-rater 人眼過：二輪 agent panel（Codex+Fable）審考點 + 修 tier 邏輯 + 修誤標；owner 過 §3.4 checkpoint 數據（tier 分佈、經典但降溫 11 條、cooling 誤判修正）
