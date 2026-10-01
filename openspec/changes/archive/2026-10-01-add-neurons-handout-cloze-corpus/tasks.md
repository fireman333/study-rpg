## 1. 讀本純文字（HTML 版）

- [x] 1.1 content 套件 `dependencies` 加 `parse5`，提交 lockfile；新模組不從 `src/index.ts` export；確認無 `node:` import
- [x] 1.2 新增 `src/handout/topic-plain-text.ts`：`extractTopics(html)` → topic `{ordinal, leafIds, anchorId, text, bullets[{start,end,text,raw,hasIntlNote,hasWarning,leadingBold,citeRanges}]}`＋`djb2Hex`
- [x] 1.3 vitest（apps/neurons-tw，node）：合成 HTML 案例（巢狀 ul 排除、cite 範圍、hdt-intl、`&lt;` 實體解碼、inline 元素間空白、未標 leaf topic）
- [x] 1.4 vitest：對試點兩科出貨 html，region 切分＋重新 parse 後 bullet 文字不變（只證序列化穩定）
- [x] 1.5 `scripts/cloze-wip/parity-browser.mjs`：headless Playwright／Chromium DOMParser 逐 bullet 與 D2 輸出比對，試點兩科 100% 相等

## 2. 閘門

- [x] 2.0 抽出 `src/concept-tiers.ts`（tier 清單＋`tierOf`，純函式），`build-concept-recurrence.ts` 改 import；重建後 `concept-recurrence.json` 與改前 byte 相同（`builtAt` 除外）
- [x] 2.1 新增 `src/handout/cloze-gate.ts`：型別、`CLOZE_MAX_CARDS_BY_TIER`（5 tier 封閉表，測試鎖鍵集合＝`tierOf` 值域）、topic tier 以 `(subjectId, leafId)` 取最高、`tierAtAdmission` 擋上限＋漂移報告
- [x] 2.2 錨定與結構：`schema`、`unknown-anchor`、`unresolved`、`ambiguous`、`cross-bullet`、`not-in-bullet`、`duplicate-id`、`over-cap`、`unmapped-tier`
- [x] 2.3 形狀：`length`、`polarity-only`、`sub-heading`、`answer-leak`、`cite-overlap`、`partial-range`、`gloss-leak`、`example-value`、`excluded-source`、`false-option-only`（含 `isNegatedStem`）
- [x] 2.4 報告：跨 topic 重複、同科數值矛盾（讀 `<b>`）、tier 漂移，標明啟發式
- [x] 2.5 vitest：每個 reason 一個拒絕案例＋接受案例，`exercised` 涵蓋斷言；另測 spec scenarios：檔案形狀 `schema`、tier 下降不擋 build、加 cite 不改 `sentenceHash`、改 bullet 外文字不改 hash、`&lt;` 可錨、數值矛盾報告

## 3. build 接線

- [x] 3.1 `build-handout.ts` 最後加字卡步驟：讀 `_cloze/*.json` → 閘門 → 印計數 → 全過才寫 `dist/handout-cloze.json`（含 `bulletText`、`citeRanges`、`sentenceHash`，寫前自檢 hash 與 mask 皆在 bulletText）；失敗刪舊檔 exit 1；`_cloze/` 空則寫 0 張
- [x] 3.2 `copy-content.mjs` 選用清單加 `handout-cloze.json`
- [x] 3.3 接線測試：讀 build 腳本原始碼，斷言閘門在寫出前、失敗路徑刪檔
- [x] 3.4 實跑一次故意失敗的正本，確認 rc=1 且 `handout-cloze.json` 不存在

## 4. 生成器 `scripts/cloze-wip/`

- [x] 4.1 `lib.mjs`：loadSubject、questions、concept-tags、recurrence loaders
- [x] 4.2 `select.mjs`：規則層選句 → `candidates.json`
- [x] 4.3 `pick.mjs`（agy 預設＋`--emit-prompts`／`--ingest`）＋`agent-pick-check.mjs`
- [x] 4.4 `admit.mjs`＋`admit-lib.mjs`：過閘門、依現在 tier 擋上限並寫 `tierAtAdmission`、`assignCardIds`、審核表、`--promote`（合併、不靜默刪卡、擋未 ack 矛盾句）；vitest 覆蓋 cardId 指派、矛盾擋收、tier 漂移後重跑 admit 既有卡保留原 `tierAtAdmission`
- [x] 4.5 `grade/`：`build-packets.py`（r1、r2）、`check.py`
- [x] 4.6 README：重跑指令、參數位置、`parity-browser.mjs` 的 npx 指令（本機用、不進 CI）

## 5. 試點（胚胎學＋寄生蟲學）

- [x] 5.1 select → pick（平行 Sonnet subagent）→ admit
- [x] 5.2 第一輪 Opus 評分
- [x] 5.3 第二輪 Opus 對照考古題評分
- [x] 5.4 講義問題獨立複核（fix／note／keep）→ 套用修正 → 同錯全庫掃描 → 守衛全綠
- [x] 5.5 只重評變動卡（最多三輪）（2026-09-30：修講義 24 處＋pick-v2 反洩題規則，重挑 22 考點，重評 59 張變動卡；第二輪另回報 5 條新講義問題，未複核）
- [x] 5.6 （2026-09-30 最終：owner 判定試點通過並採用 agent 評分（`adoptedFrom: agent-pregrade`）；53 張 good 69.8%／ordinary 17.0%／bad 13.2%／ME 0，promote 46 張（胚胎學 21、寄生蟲學 25），build 46/0/46）（2026-09-30 三輪後仍未過門檻，依『最多三輪』停下交 owner。R2：110 張 good 55%／bad 9%／ME 1。R3（select-v2 考題佐證＋pick-v3 規則 14，另修講義 7 處）：69 張 good 48%／ordinary 20%／bad 32%／ME 2；tested 60/69（R2 為 46/110），但 bad 18/22 是『句子自己把答案說出來』（並非X 對照、同義詞、後文重述、消去法）。講義句子是為解釋考題答案而寫，天生自帶答案。另 2 條新講義問題未複核）計算 good／bad／醫學錯誤、topic 覆蓋率（分母 33）；過門檻則 owner 決定是否採用 agent 評分 → `--promote` → build

## 6. 收尾

- [x] 6.1 `pnpm --filter @study-rpg/content-neurons-tw build`、`verify:handout`、`pnpm -r typecheck`、neurons vitest 全綠
- [x] 6.2 （parity-browser 290/290 bullet、46/46 卡；內建 Browser `/cram/handout` 實頁 46/46 相符、無 console error）跑 `parity-browser.mjs` 全綠；內建 Browser 在 `/cram/handout` 實頁抽查試點卡 `bulletText` 與 li 文字相等
- [x] 6.3 `openspec validate add-neurons-handout-cloze-corpus --strict`

## 7. `hint` 遮罩（試點三輪後新增）

- [x] 7.1 閘門：`ClozeMaskRole` 加 `hint`；schema（>3 段、>20 字）、純極性 hint → `polarity-only`、獨立的 `mask-overlap`（形狀檢查前跑）、`over-masked`（`CLOZE_MAX_MASK_RATIO = 0.4`）；vitest 覆蓋全部 hint scenario＋`exercised` 更新
- [x] 7.2 pick-v4：prompt 加 `hide` 欄位規則（五種洩題才列、緊接答案的英文括號不列、每段逐字 ≤20 字、最多 3 段、遮完讀不懂就 skip）＋ skip 規則（消去法／算術／標題含答案）；`parseReply`、`agent-pick-check.mjs` 驗 `hide` 每段在句中恰好一次、不與 span 重疊
- [x] 7.3 admit：hide → `hint` mask（配前後文）；落在自動 gloss 範圍內的 hide 片段丟掉該段；其他 hide 解不唯一整卡丟並記原因；packet 另列 `hint`；vitest
- [x] 7.4 評分 prompt r1／r2：說明 hint 【…】，評遮完是否仍洩題與可讀性，新增 `leak` 欄位；`check.py` 驗 `leak` 值域；`build-packets.py` 卡面渲染 hint
- [x] 7.5 （2026-09-30 R4：65 張 good 57%／ordinary 15%／bad 28%／ME 0，仍未過 70%；hint 卡 20 張 good 11；bad 18 張 = 漏遮 9（restatement 4、synonym 3、contrast 2）＋消去法 4＋答案不唯一 5；有 good 卡的考點 22/33；講義另回報 3 條未複核）第四輪試點：複核 3 條未審講義問題 → select → pick-v4 → admit → Opus 評分 → 計算門檻
- [x] 7.6 （2026-09-30：審查 65 張 → ok 45／hide 7／drop 13；重 admit 53 張、只重評變動 8 張 → good 37（69.8%）／ordinary 9（17.0%）／bad 7（13.2%）／ME 0；考點覆蓋 27/33。差門檻：good 差 0.2 個百分點、bad 超 3.2 個百分點；剩下 7 張 bad 審查者都判 ok 而評分者判 bad：消去法 3、同義詞 2、答案不唯一 2）洩題審查：`audit.mjs`（emit／apply）＋`prompt-leak-audit.txt`；審查 R4 卡 → apply → 重跑 admit → 只重評變動卡 → 計算門檻
