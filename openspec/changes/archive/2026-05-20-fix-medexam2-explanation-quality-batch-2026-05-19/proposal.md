## Why

二階 (`medexam2-hospital-tw`) 線上題庫的詳解 sidecar 因 Haiku-driven explainer pipeline 留下兩類問題：

1. **每份 paper 末尾的 `## ⚠️ Conflict with official` audit footer 被吸進最後一題詳解** (187/6080 題受影響)，QuizModal 顯示時末段出現 `Q22/Q29/...` 等不相干標記列表，user-facing noise。
2. **✓/✗ 標記與 `answer` 欄位不一致的 inversion** (480/6080 題)，最嚴重的 66 條是 audit footer self-flagged Haiku-disagreement（如 Q76：official=D，但詳解標 A=✓、D=✗ 並寫滿 pyelonephritis reasoning），玩家答對被判錯或詳解理由跟 ✓ marks 矛盾。

第二類在今早 prod bug-report channel 收到一筆 user 回報（106-2 醫學四 小兒科 Q76「印象中答案是 D」 — yh），是 bug-triage 路線進入 corpus 系統性質量改善的觸發點。

## What Changes

- **Build pipeline strip helpers** (`packages/content-medexam2-tw/scripts/build.ts` 內 `stripPdfExtractionJunk`)：
  - 新增 Pass 4：strip `\n+---\n+## ⚠️ Conflict with official[\s\S]*$` 到 EOS（解 187 題 audit-footer leak）
  - 新增 Pass 5：strip `※\s*官方允許\s*[A-DＡ-Ｄ]\s*給分。?`（解 Haiku 在 prose 內加 grading directive 的 1 條殘留 + 防後續再生）

- **Sidecar source hand-edits**（3 條 hand-curated）：
  - `109-2/醫學四/小兒科/Q2`：清掉 D 選項 bold heading 內 `※第2題答Ｂ、Ｄ給分。` + 詳解 prose 內 `※官方允許D給分。`
  - `107-1/醫學四/小兒科/Q29`：修正「童年期 NHL:HL 3.5:1，**明顯高於**成人約 10:1」方向錯誤（3.5 < 10），改寫為「NHL:HL 比例約 3.5:1。HL 好發於青少年與成人，10 歲以下相對罕見」
  - `106-2/醫學四/小兒科/Q76`：Gemini-anchored 重寫（official D 為前提），修 ✓/✗ inversion + prose reasoning。Topic header 從錯誤的「acute pyelonephritis」修正為「renal infarction (renal artery thrombosis)」

- **Stage 1 Haiku-inversion batch rewrite**（audit-footer specific subset，65 條，**Q76 含在內**）：
  - 49 條由 `gemini -p` 直接重寫成功（prompt anchor on official answer + Haiku 舊 prose context）
  - 14 條由 post-process `/tmp/recover_false_rejections.py` 救回（validator polarity 偵測錯但 Gemini unique-mark-position == official answer，logically 正確）
  - 2 條失敗 (`110-1-Q2`, `112-1-Q21`)，Gemini 生成不完整（missing A block），sidecar 保留原版不寫入（玩家透過 in-app 🐞 回報 fallback）
  - Net：63/65 audit-footer entries fixed (96.9% success)

- **OUT OF SCOPE — 留待下一條 change**：剩餘 414 silent inversions（audit footer 沒抓到的 ✓/✗ 不一致），Stage 2 後續 batch 處理。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `medexam2-corpus-ingestion`: 「Explanation sidecar SHALL be merged per-question」requirement 收緊 — explanation text SHALL NOT 含 audit footer marker (`## ⚠️ Conflict with official`)，且 SHALL NOT 含 inline `※官方允許[A-D]給分` directive

## Impact

- **Code**：
  - `packages/content-medexam2-tw/scripts/build.ts`：~10 LOC（Pass 4 + Pass 5 regex + 註解）
- **Data (sidecar source)**：
  - 3 條 hand-edit (Q2 / Q29 / Q76)
  - 63 條 Gemini batch rewrite（涵蓋 醫學三 7 / 醫學四 16 / 醫學五 9 / 醫學六 31，subject 分佈：婦產 17 / 復健 15 / 小兒 11 / 外 9 / 內 6 / 皮膚 4 / 家醫 1）
- **Generated artifacts**：
  - `packages/content-medexam2-tw/dist/*.json` 重建
  - `apps/medexam2-hospital-tw/public/content/medexam2-tw/*.json` copy
- **Cloud sync**：無 — questions.json 是 client-side static asset，build-time 產出
- **驗收 metrics**：
  - `jq '[.[] | select(.explanation | test("Conflict with official"))] | length' < questions.json` 應為 0
  - inversion 總數從 480 → 416 (Stage 1 範圍內 -64)
  - 全 6080 題仍 `explanationStatus: ok`（100% coverage 維持）
