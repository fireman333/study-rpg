## Context

`selectBlindSpotFamily`（in `prescription.ts`）目前純用 coverage-weighted score 選開發新連結科目 + 連續 2 天跳過 guard + deterministic tie-break。`add-neurons-ng0717-lineage-imprints` 已上線：完成當日 breadth 科目長一顆 NG-0717 芽。本 change 讓選科偏壓覆蓋度，把芽鋪滿全 11 科，但完全不明示（Codex 後續 #1，考前 cost/value 最佳）。

## Goals / Non-Goals

**Goals:** 讓開發新連結逐日巡到還沒長芽 / 最久沒長芽的科；零 UI/文案改動；零 schema；向後相容（無 imprint 時＝純 score）。

**Non-Goals:** ❌ 任何覆蓋地圖/完成度/分母 UI；❌ 把偏壓明示（「因為你還沒碰 X」）；❌ accent 美術；❌ R2 sync；❌ 修改 eligibility / 連續 2 天 guard / tie-break 的既有語意。

## Decisions

### D1 — 分層偏壓（tiered），不是 score 加權
選科在 eligible 內先分兩層：never-imprinted 一層、imprinted 一層。never-imprinted 層存在時只從該層選（既有 score 排）；否則 imprinted 層選 `lastTouchedDate` 最舊者（再 score、再 hash）。
- **Alternative（否決）**：把「imprint recency」做成 score 的加權項（soft bonus）。較難調、語意混（一個高 unseen 的 never-imprinted 可能仍輸給爆高分 imprinted）。分層乾淨、可測、直接表達「先覆蓋全科再輪替」。
- **「溫和」在哪**：偏壓只在 eligible（都有未做題、都值得做）之間選 WHICH，不會服務沒題可做的科；且 breadth 線本就是「覆蓋/廣度」線（弱點交給修補線），所以偏向未覆蓋科完全切題。

### D2 — 讀 prior-days imprints（時序天然正確）
今日 imprint 於「當日完成後」才寫，故今晨 `getOrCreateTodayPlan` 讀到的 imprint 反映**先前幾天**覆蓋狀態 → 今天自然巡到還沒碰的科。plan 一天凍結一次，讀取點單一、deterministic。

### D3 — 純函式邊界：`selectBlindSpotFamily` 加 optional 參數
`selectBlindSpotFamily(..., imprintLastTouchedByFamily = new Map())`：key=已長芽科 → `lastTouchedDate`；缺席＝never-imprinted。預設空 map → 既有純 score 行為與現有測試不動（向後相容）。`buildPlan` opts 傳遞；impure `getOrCreateTodayPlan` 用 `getImprints()` 建 map。

### D4 — guard 順序
連續 2 天跳過 guard 先套（縮小候選），再套 imprint 分層偏壓。兩者不衝突：guard 排除「剛連兩天的科」，偏壓在剩下的裡選覆蓋最缺的。

## Risks / Trade-offs

- **[偏壓服務低分未覆蓋科，感覺忽略弱點]** → breadth 線本就是廣度線、弱點走修補線；且只在 eligible 間選，低分科仍有未做題值得做。接受。
- **[全科都長過芽後行為改變]** → 落到 least-recently 輪替，仍是合理「回訪最久沒碰的科」。無 denominator、無「你漏了」。
- **[timing：同日多次 build?]** → plan write-once 凍結，一天一次；imprint 於完成後寫，不影響當日已凍結的 plan。無競態。
