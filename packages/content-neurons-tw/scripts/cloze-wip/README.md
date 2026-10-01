# `scripts/cloze-wip/` — 講義挖空字卡生成器（不出貨）

change `add-neurons-handout-cloze-corpus` D5／D6。從 study-rpg-2nd `docs/handouts/_cloze-wip/` 移植（流程與坑見 2nd `docs/handout-cloze-playbook.md`）。

**build 與 app 都不讀這個資料夾。** build 只讀 `src/handout/_cloze/<科>.json`（owner 審過的正本），只把報告寫進這裡的 `_report.md`／`_report.json`。

生成器用 build 自己的模組，不另寫一份：
- 讀本純文字：`src/handout/topic-plain-text.ts`（`extractTopics`）；先跑 `src/handout/leaf-anchor-gate.ts` `injectLeafAnchors`，與 `scripts/build-handout.ts` 完全相同（`lib.mjs` `loadSubject`）
- 閘門：`src/handout/cloze-gate.ts`（`validateClozeCorpus`、`isNegatedStem`、`isExcludedSource` …）
- tier：`dist/concept-recurrence.json`，以 `(subjectId, leafId)` 查

所以腳本一律用 content 套件的 tsx 跑（能直接 import `.ts`）。先確定 `dist/` 是新的：`pnpm --filter @study-rpg/content-neurons-tw build`。

## 重跑方式（從 repo 根目錄）

```bash
TSX=packages/content-neurons-tw/node_modules/.bin/tsx
W=packages/content-neurons-tw/scripts/cloze-wip

$TSX $W/select.mjs                         # 1. 規則層選句 → candidates.json（每考點候選數、0 候選考點清單）
# 2a. agy 模式：
$TSX $W/pick.mjs                           #    → drafts/<科>__<leaf>.json（可續跑；FAILED>0 時 exit 1）
# 2b. 平行 agent 模式（試點用這個）：
$TSX $W/pick.mjs --emit-prompts=$W/agent-pick        # 只寫缺的或失敗的考點 → agent-pick/<科>__<leaf>.prompt.txt
#    切 batch list（每行一個 <科>__<leaf>），每個 list 派一隻 subagent：讀 .prompt.txt、寫同名 .reply.txt（只含 JSON 陣列）
node $W/agent-pick-check.mjs <batch.list> $W/agent-pick   # 每句都有答、span 在句中恰好一次
$TSX $W/pick.mjs --ingest=$W/agent-pick --model="claude-sonnet-5-5 (subagent)"
$TSX $W/admit.mjs                          # 3. 過閘門、擋上限、配 cardId → admitted.json、admit-log.json、pilot-review.md
$TSX $W/audit.mjs --emit=$W/audit-rN    # 3b. 洩題審查 packet；另派 agent 依 grade/prompt-leak-audit.txt 寫 audit-NN.reply.json
$TSX $W/audit.mjs --apply=$W/audit-rN   #     判決寫回 drafts/（補 hide 或改 skip），然後再跑一次 admit.mjs
#     ⚠️ 洩題審查請用 Opus（與評分者同級）：試點用 Sonnet 審，7 張它判 ok 的卡被 Opus 評分者判洩題
python3 $W/grade/build-packets.py r1       # 4. 第一輪評分 packet（每科）；grader 指示 grade/prompt-r1.txt
python3 $W/grade/check.py r1-胚胎學-1       #    每個 grades-<group>.json 都要 0 problem(s)
python3 $W/grade/build-packets.py r2       # 5. 第二輪（附 ≤3 題連結考題）；grade/prompt-r2.txt
python3 $W/grade/check.py r2-01
#    講義問題：彙整 handoutIssues → grade/issues-<k>.json → 另派 agent 依 grade/prompt-issue-review.txt 複核
python3 $W/grade/merge-grades.py "$W/grade/grades-r1-*.json" "$W/grade/grades-r2-*.json"   # → pilot-grades.json（agent-pregrade）
# owner 決定採用後，手動把 pilot-grades.json 的 "grader" 改成 "owner" 並加 "adoptedFrom": "agent-pregrade"，才可以：
$TSX $W/admit.mjs --promote                # → src/handout/_cloze/<科>.json（合併，不靜默刪卡）
pnpm --filter @study-rpg/content-neurons-tw build   # 驗證正本並寫 dist/handout-cloze.json
```

所有腳本吃 `--subjects=胚胎學,寄生蟲學`（預設就是試點兩科，見 `lib.mjs` `PILOT_SUBJECTS`）。`select.mjs` 另吃 `--widen=<json 陣列檔>`（列出的 anchorId 放寬到全部 bullet，給 0 卡考點重挑）；`pick.mjs` 另吃 `--force`、`--model=`、`--only=<anchorId json 陣列檔>`（只處理列出的考點，其他 draft 不動；評分後只重挑被點名的考點用）；`build-packets.py` 另吃 `--size=N`、`--ids=<json>`（只重評變動卡）。

⚠️ **admit／promote 一律單一程序、依序跑。** `admitted.json`、`slugs.json` 是整份讀、整份寫、沒有鎖；兩個 admit 同時跑會互蓋、cardId 撞號。平行只用在 pick（每考點一個檔）與評分（每 packet 一個檔）。

⚠️ **絕對不要重跑 `scripts/handout-pipeline/assemble.mjs`。** 舊 fragments 沒有 `data-leaf-ids`、與已提交的 html 不同，重跑會覆蓋講義修正與 `hdt-intl` 註記。講義一律直接改 `src/handout/<科>.html`；不可動 `<cite>`（verify-handout Layer 3）與 `data-leaf-ids`。

## 瀏覽器一致性（task 1.5／6.2；本機用、不進 CI、不加依賴）

```bash
npx -y -p playwright@1.58.0 -p tsx tsx packages/content-neurons-tw/scripts/cloze-wip/parity-browser.mjs --subjects=胚胎學,寄生蟲學
```

真實 Chromium 的 `DOMParser` 依 `deriveRegions` 切 region（outerHTML 重新 parse），逐條 `.hdt-topic ul.hdt-must > li` 取 `textContent`（去掉巢狀清單），與 `extractTopics` 全部 bullet、以及 `dist/handout-cloze.json` 每張卡的 `bulletText` 逐字比對；有任何不符 exit 1。Playwright 版本釘在 1.58.0，因為它對應的 chromium-1208 已在 `~/Library/Caches/ms-playwright`，不會下載瀏覽器（輸出第一行會印出實際的 chromium 路徑）。換版本前先確認對應 revision 已快取。fan-out 每批都重跑。

## 參數在哪裡改

| 參數 | 檔案 | 說明 |
|---|---|---|
| 每考點卡數上限 `maxCards` | `src/handout/cloze-gate.ts` `CLOZE_MAX_CARDS_BY_TIER` | 上限不是目標；**build 閘門也用它** |
| 上限漂移 | `admit-lib.mjs` `capAndAssign` | 現在的 tier 只擋**新卡**；`_cloze/` 已有的卡保留原 `tierAtAdmission`、不被上限剔除，且佔住名額 |
| 候選句數＝倍數 × 上限 | `select.mjs` `CANDIDATE_FACTOR` | 設計定為 2 |
| 候選句最低分／fallback 分 | `select.mjs` `MIN_SENTENCE_SCORE`、`FALLBACK_SENTENCE_SCORE` | 低於此分不送 LLM |
| 計分與排除規則、單位表 | `select.mjs` `ruleSpans`／`selectForTopic`／`NUM_RE` | 改規則要把 `SIGNAL_VERSION` 往上加 |
| 連結考題 | `lib.mjs` `loadSubject`（考點 leaf ∩ 同科）＋ `select.mjs` `linkedForBullet`（再縮到該 bullet `<cite>` 的梯次） | |
| 否定題干判斷 | `cloze-gate.ts` `NEGATED_STEM`／`isNegatedStem` | 規則層、閘門、評分共用 |
| prompt | `pick.mjs` `buildPrompt` | 改 prompt 要把 `PROMPT_VERSION` 往上加，舊 draft 會重做 |
| 模型、併發、逾時 | `pick.mjs` `DEFAULT_MODEL`（`Gemini 3.8 Flash (Medium)`）或 `--model=`；`CONCURRENCY`、`CALL_TIMEOUT_MS` | agy 路徑 `$HOME/.local/bin/agy`，**不加** `--dangerously-skip-permissions` |
| 生成器過濾 | `admit.mjs` `NEGATED_OBJECT_BEFORE`、`DUPLICATE_SIMILARITY`、`NUMBER_FILLER` | 不是閘門；被擋的記在 `admit-log.json` |
| cardId 的 slug | `slugs.json` | 以（考點, bullet 文字 hash, 答案）為鍵，指派一次；**cardId 不從文字推導**；同 leafId 跨科共用編號空間 |
| 矛盾 ack | `contradiction-acks.json`（需要時自建） | `[{subject, sentenceHashes, reason}]`；主詞相同且涵蓋該筆全部 bullet hash 才算，bullet 改寫就重新擋下 |

## 純數字卡政策（owner 2026-09-29，沿用 2nd）

「減少純數字背誦，除非那個數字真的很重要」：
- prompt 要求優先挖概念；流行病學比例、發生率、盛行率不挖。
- `admit.mjs` 過濾：答案若是**純數字**（數字＋單位／比較詞，沒有概念字；`isPureNumber`），只在兩種情況保留——連結考題的題幹或選項出現同一組數字（`numberTestedByExam`），或它是定義門檻（同一子句有「定義／診斷標準／稱為／才算」等，`isDefinitionalThreshold`）。

## 產物

| 檔 | 內容 |
|---|---|
| `candidates.json` | 每考點的候選句（＝bullet 純文字，含 cite 年份）、規則片段與分數、連結考題與其**為真**選項 |
| `agent-pick/*.prompt.txt`／`*.reply.txt` | agent 模式的輸入與回覆 |
| `drafts/*.json` | 每考點一次呼叫的原始回覆與解析結果；`status: failed` 下次重試，**失敗不當成 skip** |
| `admitted.json` | 通過閘門、promote 前的全部卡（評分分母） |
| `admit-log.json` | 每個沒進 `admitted.json` 的片段與原因：`draft`、`pick`、`filter`、`gate:<reason>`、`cap` |
| `pilot-review.md` | owner 審核表（每科一節） |
| `pilot-grades.json` | 評分；`grader: "agent-pregrade"` 不能 promote，**`--promote` 只接受 `grader: "owner"`** |
| `grade/` | `build-packets.py`（r1／r2）、`check.py`、`merge-grades.py`、評分與複核 prompt |
| `_report.md`／`_report.json` | build 寫的報告（數值矛盾、跨考點重複、tier 漂移） |
