## Context

動機見 proposal.md。移植來源是 study-rpg-2nd 的 change ①（`openspec/changes/archive/2026-09-29-add-handout-cloze-corpus/`）與 `docs/handout-cloze-playbook.md`。這裡只記 neurons 端影響做法的現況。

- **講義**：`packages/content-neurons-tw/src/handout/<科>.html`，11 科。結構 `section.hdt-region > div.hdt-topic[data-leaf-ids] > (h3, p.hdt-teach, ul.hdt-must > li…)`，外加 `table.hdt-tbl`。li 尾端 `<cite>112</cite>`；部分 li 內 `<span class="hdt-intl">（⚠️ 國際教科書：…）</span>`。
- **build**：`scripts/build-handout.ts` 讀片段 → honesty lint → `injectLeafAnchors`（驗 `data-leaf-ids`、注入 topic id）→ region 測驗 → 寫 `dist/handout.json`。`dist/` 與 app `public/content/neurons-tw/` 都被 gitignore；`copy-content.mjs` 在 `predev`／`prebuild` 複製。
- **讀本**：`HandoutPage` 用 `DOMParser` 把 html 切成 region，再 `dangerouslySetInnerHTML`。emoji 是文字（沒有 sprite 替換）。事後在 topic 尾端注入 `.hdt-cram-link` 按鈕（不在 li 內）。
- **題庫**：`dist/questions.json`（4,800 題，`answer`、`options`、`acceptedAnswers`）；`dist/concept-tags.json` 是 `{qid: leafId[]}`；`dist/concept-recurrence.json` `concepts[].tier` 的值域是 `build-concept-recurrence.ts` `tierOf` 的 5 值 {常青必掃, 近年新寵, 穩定考點, 經典但降溫, low-yield}（目前資料沒有 近年新寵，但 ingest 後可能出現）；leafId 跨科不唯一（例 `membrane-transport-mechanisms` 在生理與生化都有），查表以 `(subjectId, leafId)` 為鍵。tier 由 breadth／lastGap 算出，每次新梯次 ingest 都可能變。
- **測試**：`apps/neurons-tw` vitest，環境 `node`。content 套件沒有自己的測試。
- **HTML parser**：lockfile 裡沒有任何 HTML parser。

## Goals / Non-Goals

**Goals**：HTML 版讀本純文字（build 與未來 app 共用、node-free）；字卡正本與出貨格式；白名單閘門；試點兩科產出評分過的卡。

**Non-Goals**：app 端消費（收藏複習、螢光、獎勵各自另開 change）；其他 9 科 fan-out；醫學正確性自動檢查。

## Decisions

### D1 正本一科一檔，放在講義旁
`src/handout/_cloze/<科>.json`：`{version:1, cards:[…]}`。欄位同 2nd：`cardId`（`<leafId>#k<N>`）、`anchorId`、`masks`、`marks`、`linkedQuestionIds`、`kind`、`signalScore`、`signalVersion`，另加 `tierAtAdmission`。build 只驗證、補 `bulletText`／`citeRanges`／`sentenceHash`，組成 `dist/handout-cloze.json` `{version, cards}`。
- 放 `src/handout/` 旁而不是 `docs/`：neurons 的講義 source 就在這裡；build 讀 `FRAG_DIR` 時只收 `*.html`，`_cloze/` 目錄天然不會被當成科目。
- 出貨檔不進版控（`dist/` gitignore），與 `handout.json` 一致，不需要 2nd 的「失敗時 git status 顯示刪除」提醒。

### D2 讀本純文字：parse5 + DOM textContent 語意
新增 `src/handout/topic-plain-text.ts`（node-free，不 import `node:`）。
- **parser**：`parse5`（HTML 規格實作、瀏覽器同一套 tree construction 規則、純 JS、零依賴）。否決 `node-html-parser`（非規格，容錯行為與瀏覽器不同）、`jsdom`（太重、帶 `node:`）。
- **輸入**：`injectLeafAnchors` 之後、實際出貨的 html（與讀本拿到的同一份字串）。
- **單位是 bullet，不是 topic**：讀本在 topic 尾端事後注入 `.hdt-cram-link` 按鈕，所以 live DOM 的 topic `textContent` 與 build 的 topic `text` 不同；bullet（li）不受影響。錨定與未來的螢光對位一律以 bullet 為單位。
- **輸出**：每個 `.hdt-topic` → `{ordinal, leafIds, anchorId|null, text, bullets[]}`。`text` 是 topic 內所有文字節點串接（同 `textContent`）；每條 bullet 帶 `{start, end}`（該 li 自身文字在 `text` 內的範圍，不含巢狀清單）、`text`、`raw`（li 的原始 HTML 片段）、`hasIntlNote`、`hasWarning`、`leadingBold`（開頭 `<b>` 文字與其後是否只接冒號）、`citeRanges`（`<cite>` 文字在 bullet 內的範圍）。
- **不移除 emoji**：neurons 讀本不做 sprite 替換，emoji 就是文字（2nd 待確認 #2 的答案）。
- **djb2**：同 2nd `djb2Hex`，同一模組。`sentenceHash = djb2(bulletText 去掉 citeRanges)`：`verify-handout` Layer 3 每次 ingest 都會在 li 尾端加新梯次 cite，若 hash 含 cite，每次 ingest 會讓大量卡在 app 端顯示「來源已更新」。`bulletText` 仍含 cite（顯示用），`citeRanges` 一併出貨供 app 重算。
- **依賴**：`parse5` 放 content 套件 `dependencies`（`src/` 模組會被 app import）；lockfile 一併提交。新模組**暫不**從 `src/index.ts` export（app 端尚無消費者，避免 bundle 增大）；app change 需要時再 export 並量 bundle。

**一致性證明**：
1. vitest（node）只證明「序列化穩定」：parse5 解析出貨 html → region `outerHTML` 重新 parse 後 bullet 文字不變。它**不**證明與瀏覽器一致（兩邊都是 parse5）。另含合成案例：`&lt;` 實體（寄生蟲學有 3 處）、`<cite>`、`hdt-intl`、inline 元素之間的空白。
2. 瀏覽器一致性：`scripts/cloze-wip/parity-browser.mjs`（headless Playwright，**本機用、不進 CI、不加依賴**；指令 `npx -y -p playwright@<對應已快取 chromium 的版本> -p tsx tsx scripts/cloze-wip/parity-browser.mjs --subjects=…`，寫進 README）用真實 Chromium 的 `DOMParser` 走與 `deriveRegions` 相同的切法，逐 bullet 取 `textContent`（移除巢狀 ul），與 `handout-cloze.json` 的 `bulletText`、以及 D2 模組對全部 bullet 的輸出逐字比對，要求 100% 相等；fan-out 每批都重跑。verify 階段另用內建 Browser 在 `/cram/handout` 實頁抽查。

### D3 閘門：照抄 2nd `cloze-gate.ts`，改四處
新增 `src/handout/cloze-gate.ts`：`validateClozeCorpus({files, recurrence, questions}) → {errors, cards, counts, report}`。
- 錨定：`anchorId` 對 `<科>::<leafIds[0]>`；未標 leaf 的 topic 不可有卡（`unknown-anchor`）。
- `excluded-source` 改判 `hasIntlNote || hasWarning`（試點 290 條 bullet 擋 13 條）。
- `CLOZE_MAX_CARDS_BY_TIER` = {常青必掃:5, 近年新寵:4, 穩定考點:4, 經典但降溫:4, low-yield:3}；鍵集合須等於 `tierOf` 值域（測試鎖）。topic tier = leafIds 中最高 tier（常青必掃 > 近年新寵 > 穩定考點 > 經典但降溫 > low-yield），以 `(subjectId, leafId)` 查表；任一 leaf 查不到 → `unmapped-tier`。
- **上限漂移**：admit 對**新卡**依「現在的 tier」擋上限並寫進 `tierAtAdmission`；已在 `_cloze/` 的卡（同 cardId）重跑 admit 時沿用原 `tierAtAdmission`、不被上限剔除（與「不靜默刪卡」的合併規則一致）；build 依 topic 內卡片最高的 `tierAtAdmission` 擋 `over-cap`，現在 tier 較低只進報告（`tier-drift`）。否則一次 ingest 讓 常青必掃→穩定考點，已有 5 張的考點會讓 prebuild（dev 與 deploy）直接失敗。已知限制：build 無法驗證手改過的 `tierAtAdmission`；報告另列「`tierAtAdmission` 高於該考點 leaf 現在 tier」的卡供人工檢查。
- **tier 值域單一來源**：把 `build-concept-recurrence.ts` 的 tier 清單與 `tierOf` 搬到純模組 `src/concept-tiers.ts`（無副作用、無 `node:`），recurrence build 與 `cloze-gate.ts` 都從它 import；測試斷言 `CLOZE_MAX_CARDS_BY_TIER` 鍵集合＝該清單。直接 import build 腳本會在頂層寫檔，不可行。
- `answer-leak` 的可見文字**不含** cite（避免 `15` 撞 `115` 的子字串誤擋），另拒答案等於該 bullet 的 cite 年份 token；`cite-overlap` 檢查整段 `prefix+exact+suffix`（前後文伸進 cite 會在下次加梯次時失效）。
- `isNegatedStem`、`falseOptionOnly`、`isPartialRange`、`trailingGloss`、`isExampleValue`、`CLOZE_POLARITY_ONLY`、報告（數值矛盾改讀 `<b>`）原樣移植。
- 題目資料：`dist/questions.json`（build 同一條 chain 已產出，用既有 `loadDist`）。

### D4 build 接線：放在 `build-handout.ts` 最後
寫完 `handout.json` 之後（所有既有閘門都已 exit-on-fail）才跑字卡步驟：讀 `_cloze/*.json` → 用 D2 取出貨 html 的 topic 純文字 → 閘門 → 印 imported／rejected（依 reason）／total → 全過才寫 `dist/handout-cloze.json`；失敗先 `rmSync` 舊檔再 exit 1。報告寫 `scripts/cloze-wip/_report.md`＋`_report.json`（gitignore 外，給 admit 讀）。
`copy-content.mjs` 選用清單加 `handout-cloze.json`。

### D5 生成器 `scripts/cloze-wip/`
照 2nd `_cloze-wip/` 移植（`lib.mjs`、`select.mjs`、`pick.mjs`、`agent-pick-check.mjs`、`admit.mjs`＋`admit-lib.mjs`、`grade/`），全部用 content 套件 tsx 跑（可直接 import `.ts`）。改點：
- `lib.mjs`：`loadSubject(科)` 讀 `src/handout/<科>.html` → 跑 `injectLeafAnchors`（與 build 同）→ D2；concept-tags `{qid:[leaf]}`；參數 `--subjects=胚胎學,寄生蟲學`。
- `select.mjs`：只看 bullet；年份訊號讀 `<cite>`（`Y`、`Y/Y`、`Y-2`）；粗體讀 `<b>`；單位表補 mV、ms、mOsm、mmHg、週、天、小時。
- `pick.mjs`：prompt 第一行改「一階國考」；規則「不可包含 `<cite>` 年份」。本次依 owner 指示走 `--emit-prompts` → 平行 Sonnet subagent 寫 `.reply.txt` → `agent-pick-check.mjs` → `--ingest`。
- `admit.mjs`：正本路徑 `src/handout/_cloze/<科>.json`；純數字政策、否定受詞過濾、`assignCardIds`（含跨科同 leaf 修正）原樣。
- admit／promote 單一程序依序跑；平行只用在 pick 與評分。

### D6 評分與講義修正（流程，不是程式）
- 第一輪：依科切 packet，每 packet 一隻 Opus agent，逐卡 good／ordinary／bad＋`medicalError`＋`handoutIssues`。
- 第二輪：每卡附 bigram 重疊最高的 ≤3 題連結考題（題幹、選項、`answer`、`acceptedAnswers`、`optionExplanations`），評 `examAlignment`；`medicalError` 或 `conflicts` 強制 bad（`check.py` 強制）。
- 講義問題：另派 agent 獨立複核（先查官方答案）→ `fix`／`note`／`keep`。`note` 用 `<span class="hdt-intl">（⚠️ 國際教科書：…；作答以歷屆考題答案為準）</span>`；改了 li 的卡會被 `excluded-source` 擋下（這是預期：爭議句不出卡）。同錯全庫 grep。
- 修講義後守衛：`leaf-anchor-gate`、region 測驗、`verify-handout` Layer 3（不可刪 `<cite>`）、honesty lint。
- 修正→評分最多三輪、只重評變動卡；剩下列給 owner。
- ⚠️ 舊的 `scripts/handout-pipeline/fragments/<科>/` 與 `assemble.mjs` 仍在、沒有 `data-leaf-ids`、與已提交 html 不同；**不可重跑**，否則會覆蓋本 change 的 fix／note。修改一律直接改 `src/handout/<科>.html`。

### D7 `hint` 遮罩（試點三輪後新增，owner 2026-09-30 選定）
三輪試點顯示：卡片越貼近考題問點，句子越常自己把答案說出來（R3 bad 22 張中 18 張），因為 neurons 講義句子是為了解釋歷屆考題答案而寫。只調 prompt/select 已試三輪無效。改為讓卡片把洩題片語一起遮住：
- 新 role `hint`（每卡 ≤3、每段 1–20 字，逐字、唯一、同 bullet、不碰 cite、不可彼此重疊 → `mask-overlap`；超過 3 段或 >20 字 → `schema`；只由極性詞組成 → `polarity-only`）。`mask-overlap` 是獨立檢查、在形狀檢查之前跑——`visibleText` 會默默合併重疊區間，不能靠它。
- 緊接答案的英文括號仍歸 `gloss`（`gloss-leak` 只認 gloss），hint 只遮**不緊接**答案的英文原文或同義詞；admit 遇到落在自動 gloss 範圍內的 hide 片段就丟掉該片段，不丟整卡。
- 總遮蔽字數 ≤ bullet（去 cite）的 40% → 否則 `over-masked`；門檻是起始值，寫成常數 `CLOZE_MAX_MASK_RATIO`。
- `answer-leak` 的可見文字已是「拿掉所有 mask」，所以被 `hint` 蓋住的答案重述自動不算洩題，不需要改該檢查。
- 生成器：pick-v4 回覆 `{n, span, hide:[…], why}`，並加 skip 規則：答案是列舉中的一項而同句列了其餘各項（消去法）、或可由句中數字算出、或考點標題本身就含答案 → skip；admit 為每個 hide 片段配 0–12 字前後文轉成 `hint` mask，任何 hide 解不唯一 → 整張卡丟（`pick:` 原因）。評分 prompt 說明 【…】 是被遮住的提示／註解，並要評「遮完後是否仍洩題、句子是否還讀得懂」；另加 `leak` 欄位（`none`／`synonym`／`contrast`／`restatement`／`elimination`／`arithmetic`／`heading`），讓洩題型態分開計數。packet 的 card 另列 `hint: [...]`，與 `gloss` 分開。
- app 端（之後的 change）：`hint` 顯示為 【…】、不計分、不畫螢光。
- **洩題審查（R4 後新增，owner 2026-09-30 選定）**：R4 bad 18 張中 13 張是挑選者自己沒發現的洩題（漏遮 9、消去法 4），挑選 agent 無法可靠地審自己的卡。admit 之後加一道獨立 agent 的洩題審查（`scripts/cloze-wip/audit.mjs` ＋ `grade/prompt-leak-audit.txt`）：只看遮完的卡面判斷能否推出答案，判 `ok`／`hide`（補遮 1–3 段，仍受 hint 全部規則約束）／`drop`；`--apply` 改寫 drafts 後重跑 admit。這是生成流程，不動 build 契約與閘門。

## Risks / Trade-offs

- [parse5 與瀏覽器仍有差異（例如實體、空白）] → D2 的瀏覽器實測逐字比對；不過就修轉換，不放寬比對。
- [Sonnet pick 與 2nd 的 agy 結果風格不同] → 閘門與評分相同；試點就是量這件事。
- [`maxCards` 未量測] → 上限只影響供給。
- [寄生蟲學有 2 個未標 leaf 的 topic] → 不出卡；覆蓋率分母為 33。
- [失敗時只刪 `dist/handout-cloze.json`，`public/` 殘留上一次的複本（`copy-content.mjs` 只複製不刪）] → 本 change 無消費端故無害；app change 開始讀這個檔時要讓 copy-content 同步刪除。

- [`hint` 被濫用成「把整句遮光」] → 40% 上限＋評分檢查可讀性；單字 hint（例「非」）可翻轉句意 → 純極性詞 hint 以 `polarity-only` 拒。
- [40% 未量測] → 常數，試點後依評分調整。試點 69 張 bullet（去 cite）54–252 字、中位 128；現有卡遮蔽比中位 0.12、最大 0.36，不會有既有卡被新規則擋。gloss 沒有長度上限（例 33 字的英文全名），短 bullet 可能只靠 gloss 就超過 40%——接受，被擋就換句。
- [hint 預期效益] → hint 只處理同義詞／縮寫／非緊鄰英文／「並非 X」對照／後文重述五種洩題。消去法（同句列了其餘項目）、算術（給了可算出答案的數字）、h3 標題洩題、答案不唯一、講義錯誤都**不是** hint 能修的；R3 bad 22 張中約 9 張屬後者。前者靠 pick-v4 skip 規則，後者靠評分與講義修正。

## Migration Plan

純新增。rollback：刪 `_cloze/`、拿掉 build 步驟與 copy-content 一行。


## Open Questions

- 螢光層（app change ③）以 bullet 為單位、用 `bulletText`＋`citeRanges` 對位 DOM Range，不以 topic textContent 對位（有事後注入按鈕）：細節留給 app change。
