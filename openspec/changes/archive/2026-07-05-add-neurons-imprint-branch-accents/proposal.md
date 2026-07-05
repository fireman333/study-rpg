## Why

NG-0717 分支印記的芽目前只靠 per-科 tint（`subject.color`）區分。Codex/Fable 後續建議加「per-subject 1–2px accent」深化每顆芽的識別/生命感。但在 ~20px 芽上放 11 個各異的微 accent 根本分不出來（會變雜訊）。改用**per-NT-branch accent motif**（4 種，對應多巴胺 / 血清素 / GABA / 麩胺酸傳導物質家族）：既清楚、又有神經科學意義（芽的傳導物質分支），且是純程式 SVG overlay，零新美術、零 sprite。每顆芽 = 專屬色 tint + 分支符號兩個維度。

## What Changes

- **Per-NT-branch accent glyph**：每顆已長的芽依其 subject 的 `group`（DA / 5HT / GABA / Glu）在右上角疊一個小 SVG motif（DA 火花 / 5HT 環 / GABA 橫槓 / Glu 上箭），純程式繪製、隨芽 size/stage 縮放。
- **只在已長的芽上**：不新增 legend、不列未長科目、不因 accent 暗示「完整分支集」——沿用既有 anti-anxiety 契約（無分母/無缺口）。
- **資料**：`EnrichedImprint` 加 `group`（NT branch），OverviewPage enrich 時從 `subject.group` 帶入。
- **Out of scope**：11 個 bespoke per-subject accent（分不出來、且近 bespoke sprite，Codex 建議 skip）、任何 accent 圖例/計數 UI。

無 schema / sync / 美術資產改動；純 UI overlay。

## Capabilities

### New Capabilities
<!-- 無新 capability。 -->

### Modified Capabilities
- `neurons-daily-prescription`: MODIFIED「The lineage imprint UI SHALL render only grown branches and SHALL NEVER expose a denominator or gap」——新增一句：已長的芽 MAY 依 NT branch 疊一個 accent motif（純視覺識別），且該 accent SHALL NOT 引入 legend / 圖例 / 分母 / 完整分支集暗示。既有 no-denominator / only-grown / accumulate-positive 契約不變。

## Impact

- **Code**：`apps/neurons-tw/src/components/Ng0717BranchBuds.tsx`（`EnrichedImprint` 加 `group`、`Bud` 內疊 per-branch SVG accent + 4 motif map）、`apps/neurons-tw/src/routes/OverviewPage.tsx`（enrich 帶入 `subject.group`）。無美術資產、無 schema。
- **Tests**：Vitest 覆蓋 group → accent motif 純映射（4 branch 各對、未知 group fallback）。視覺由 Chrome preview 驗證。
- **相容**：純加法 overlay；imprint state / sync / 既有 render 全不動。
