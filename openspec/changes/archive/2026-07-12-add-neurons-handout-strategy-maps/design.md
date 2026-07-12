## Context

考前講義的 authored HTML 是一連串 `<section class="hdt-region" id="…">`。解剖學開頭有一個 `id="hdt-overview"` 的一週攻略地圖（單一 `<p class="hdt-intro">` 概覽）。build 兩條路徑：**chapter-keyed**（解剖學，`REGION_TO_CHAPTER` 映射，line 137 對 unmapped region `continue` 略過）與 **region-keyed**（其餘 10 科，`<subject>.config.json`，`build-region-quizzes.ts`）。後者的 bidirectional drift check（`build-region-quizzes.ts:56-57`）會對「HTML region 無 config entry」throw —— 所以直接 prepend `hdt-overview` 到 region-keyed 科會 build fail。

## Goals / Non-Goals

**Goals:**
- 10 科各補一張 grounded、格式一致的一週攻略地圖 overview region。
- region-keyed build 乾淨豁免非測驗 overview region（對映 spec「overview MAY be exempt」）。
- HelpMenu 記錄 考前講義 feature + 救急↔講義整合。

**Non-Goals:**
- ❌ 動 quiz 映射 / config / leaf partition（overview 不帶 leaf、不出 測驗本區）。
- ❌ 改 schema / sync / route。
- ❌ 為 overview 生成年份 `<cite>` 標記（純策略概覽，無逐點年份）。

## Decisions

### D1 — grounded 平行 Workflow 生成內容（非憑空）

一科一 agent，每個 agent 拿到**該科真實 region 清單** + 解剖學範本，寫建議唸書順序時必須引用真實章節、不可虛構。10/10 完成、0 error；主對話逐科 fact-check 嵌入醫學錨點（如胚胎 Müllerian/Wolffian、微生 真菌雙型性 25°C/37°C、免疫 四型過敏）皆正確，且過 honesty lint。**Alternative（手寫 10 段）**：慢且不一致；捨棄。**風險緩解**：study-strategy 內容（唸書順序）風險低於 fact claim，且 grounded 在既有結構；仍逐科人工複審 + honesty lint 雙關卡。

### D2 — `NON_QUIZ_REGION_IDS` 豁免（非改 config）

在 `build-region-quizzes.ts` 加 module const `NON_QUIZ_REGION_IDS = new Set(['hdt-overview'])`，drift check line 56-57 對其 `&& !NON_QUIZ_REGION_IDS.has(rid)` 放行。**理由**：overview 天生無 leaf、無測驗，硬塞進 config.json 反而觸發 0-leaf / partition 檢查。豁免最小、backward-compatible（既有科無 hdt-overview，行為不變；verify-handout 7 violation fixtures 仍全綠）。**Alternative（每科 config 加 hdt-overview entry）**：需給假 leaf / targetDepth，破壞 leaf partition；捨棄。

### D3 — 只 commit source，public handout.json 由 CI 重建

`apps/neurons-tw/public/content/neurons-tw/handout.json` 為 gitignored build artifact；CI 的 prebuild / build:cf 從 source HTML 重建。故 commit 範圍 = 10 source HTML + build-region-quizzes.ts + HelpMenu.tsx（mirror 既有 handout ship 慣例）。

## Risks / Trade-offs

- **[AI 生成醫學內容準確性]** → grounded prompt + 逐科人工 fact-check + honesty banned-word lint；overview 為 study-strategy（低 fact-claim 密度）。
- **[build drift check 迴歸]** → verify-handout（7 violation fixtures + happy path）PASS；章測驗數不變已驗。

## Migration Plan

- 純內容 + build-tooling + 文件；無資料遷移。部署 = merge → CF Pages（owner gate）。Rollback = revert（無持久狀態）。

## Open Questions

- 無。
