## 1. 來源解析與缺陷偵測

- [x] 1.1 確認 `~/Desktop/國考/一階國考/一階國考107-115/` 已有 115090 的 試題 ×2、ANS ×2、MOD ×2
- [x] 1.2 用 `-layout` parser 解析兩本試題，確認各 100 題、每題 4 選項
- [x] 1.3 跑既有缺陷偵測（Cyrillic 圈號、重複選項、選項合併、題幹以 ASCII 結尾、超長選項）→ 全部 0 命中
- [x] 1.4 新增 `reconcile/parse_moex_spans.py`：span 幾何重建視覺行 + `merge_spacing()` + `detached_superscript_fields()`
- [x] 1.5 偵測出 8 題 / 23 欄位的上標脫落（醫一 Q52/63/86/87/97/98、醫二 Q43/64），逐欄位對照考選部 render 確認修正
- [x] 1.6 確認 115-2 兩本皆無附圖（`hasImage` 全 false）

## 2. 答案與科目

- [x] 2.1 ANS 序列讀取 × 空間 grid 交叉驗證（95/95 一致，兩本皆是）
- [x] 2.2 MOD 逐格比對：只把調整格換成 ＃，未更動任何答案字母（腳本硬性 assert）
- [x] 2.3 備註解碼 → 醫一 Q63 `acceptedAnswers:['B','D']`、Q66 `disputed`；醫二 Q14/25/55/68/98 `disputed`、Q95 `acceptedAnswers:['A','D']`
- [x] 2.4 科目分段逐題幹核對，與 113-1…115-1 完全一致
- [x] 2.5 微免 `microImmune` 手動 bake（Q1–17 微生物學 / Q18–28 免疫學）

## 3. AI 詳解

- [x] 3.1 新增 `reconcile/generate_115_2.py`（agy 取代已退場的 gemini CLI，模型 fallback 三段）
- [x] 3.2 產生 200 題詳解，模型獨立作答後與考選部答案交叉檢核 → 199/200 一致
- [x] 3.3 人工修正唯一不符者（醫二 公衛 Q46，模型把「級」讀成「段」）並在 entry 標記 hand-corrected
- [x] 3.4 QC：200/200 開頭正解字母正確、四選項理由皆非空、AI 免責標註齊全

## 4. 併入題庫

- [x] 4.1 新增 `reconcile/finalize_115_2.py`（單行 JSON 尾端 splice，不重寫既有 byte）
- [x] 4.2 `--apply` 併入 → 4600 → 4800；`subjects.json` 各科總數與 `meta.json` stats 由題庫重新推導
- [x] 4.3 逐 id 驗證：4600 題既有題目 0 變動、新增 200 題全為 `115-2-` 前綴

## 5. 概念標籤與 5.x 衍生資料

- [x] 5.1 `build.ts` 重建（4800 imported / 0 skipped）
- [x] 5.2 keyword prepass 重建
- [x] 5.3 `tag-concepts-batch.mjs` 補標（model 名稱改為 `AGY_MODEL` 可覆寫；agy roster 已無 Gemini 3.5 Flash）
- [x] 5.4 `verify:concept-tags` 綠：100% 覆蓋、0 OOV、0 cold leaf
- [x] 5.5 `SITTINGS_TOTAL` 改為由題庫推導（23 → 24 自動）
- [x] 5.6 `build-cram.ts` 的 `statUpTo` 改為讀 recurrence 最後一個梯次，`CramData` 新增 `sittingsTotal`

## 6. 逐選項簡答

- [x] 6.1 新增 `scripts/option-explanations/gen-jianda-agy.mjs`（寫出 `merge-jianda-batch.ts` 既有 workdir 格式）
- [x] 6.2 產生 200 題簡答，`merge-jianda-batch.ts` 併入（provenance 字串改為 env 可覆寫）
- [x] 6.3 `verify:option-explanations` 4800 ok / 0 failed

## 7. 考前講義與出題頻率

- [x] 7.1 對映 200 題 → primary leaf → handout topic，確認 0 個無主概念
- [x] 7.2 11 科共 194 處編修，每題一條教學重點（或補強既有那條），標 `<cite>115-2</cite>`
- [x] 7.3 `verify-handout.ts` 新增 Layer 3：最新梯次逐題教學覆蓋 gate
- [x] 7.4 Layer 3 首跑抓出 5 題未覆蓋（生理 Q56/57/59/62/70）→ 補上帶 115-2 鑑別點的條目
- [x] 7.5 `verify:handout` 綠：latest sitting 115-2，200 checked / 0 uncovered / 0 unmapped
- [x] 7.6 `CramPage.tsx` 版本戳記與方法論文案改為讀 `cram.statUpTo` / `cram.sittingsTotal`

## 8. 驗收

- [x] 8.1 八個 content-pack verify gate 全綠
- [x] 8.2 `pnpm -r typecheck` 乾淨
- [x] 8.3 `pnpm --filter @study-rpg/neurons-tw test` → 1175/1175
- [x] 8.4 dev smoke：`/cram` 顯示「統計至 115-2」「24 次考試」；`/cram/handout` 渲染 115-2 條目
- [x] 8.5 確認未動 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS`、sync engine

## 9. 出貨

- [x] 9.1 commit（題庫、衍生資料、講義、derived 常數同一個 commit）
- [x] 9.2 merge `track-neurons` → `main` 並 push
- [ ] 9.3 CF Pages deploy 綠、prod 驗收（`/cram` 讀 24 次考試、115-2 題目顯示 AI 標註與簡答、講義出現 115-2 引用）
- [ ] 9.4 archive 本 change（保留給 owner —— archive 會改寫 `openspec/specs/` 語意）
