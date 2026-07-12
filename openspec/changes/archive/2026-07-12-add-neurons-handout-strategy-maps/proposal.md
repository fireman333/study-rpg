## Why

考前講義只有**解剖學**在開頭有一張「🗺️ 一週攻略地圖」——一段告訴學生「這科怎麼唸、建議順序、各區重點」的 study-strategy 概覽。其餘 10 科一打開就直接進內容，少了那層「先看地圖再上路」的定向。補齊這 10 張地圖能讓每一科都有一致的入口體驗。順帶把新做的**考前講義**功能與**救急↔講義**整合寫進 HelpMenu，讓玩家找得到。

## What Changes

- 為 10 個 region-keyed 科目（組織 / 胚胎 / 生理 / 藥理 / 病理 / 寄生 / 微生 / 生化 / 公衛 / 免疫）各加一個 `hdt-overview` 一週攻略地圖 region，置於該科講義開頭，格式對齊既有的解剖學範本（單一 `<p class="hdt-intro">`：白話導言 + 建議唸書順序①②③④ + 各區組織方式 + 頻率誠實提醒）。內容由**平行 Workflow**（一科一 agent）產生、且**grounded 在該科真實章節結構**（agent 拿到該科的 region 清單再寫建議順序，非憑空生成）；主對話已逐科 fact-check 嵌入的醫學錨點並過 honesty lint（移除 1 處「必考」）。
- `build-region-quizzes.ts`：把 `hdt-overview` 列為 **non-quiz region**，豁免 region-keyed 的「HTML region 必須有 config entry」drift check（此前只有 chapter-keyed 路徑會 `continue` 略過 unmapped region；region-keyed 路徑會 throw）。這對映 spec 既有的「overview / 非測驗 region MAY be declared exempt」。overview region 不帶 leaf、不產生 測驗本區 CTA。
- `HelpMenu.tsx`：新增「📖 考前講義」section（feature 說明 + 一週攻略地圖 + 測驗本區 + 考卷順序排列），並把 **救急↔講義整合**寫進「考前救急」section（戰情圖概念可點開講義）與新 section（← 回救急 閉環、診斷→補讀→再測）。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-anatomy-handout`：ADDED requirement — 每科 handout SHALL 以一個 quiz-exempt 的 `hdt-overview` 一週攻略地圖 overview region 開頭；build 對非測驗 overview region 豁免 config↔HTML drift check。

## Impact

- **改動檔**：`packages/content-neurons-tw/src/handout/<10 科>.html`（各 prepend 一個 overview region）+ `packages/content-neurons-tw/src/handout/build-region-quizzes.ts`（`NON_QUIZ_REGION_IDS` 豁免）+ `apps/neurons-tw/src/components/HelpMenu.tsx`（新 section + 整合文案）。
- **無** schema / sync / route 改動；純內容 + build-tooling + 文件。R2 SV / Dexie / `SYNCED_META_KEYS` 皆不觸及。
- **Build**：`build:neurons-content` 重建 `handout.json`（各科 KB 微增），公開 `handout.json` 為 gitignored build artifact，由 CI 從 source HTML 重建 —— 故只 commit source HTML + build script + HelpMenu。章測驗數不變（overview 不進 quiz 映射，已驗）。`verify:handout` PASS。
- **內容誠實**：overview 依歷屆頻率收斂措辭，過 build-handout 的 honesty banned-word lint（無 命中率/保證/必考/包中 等 guarantee slang）。
