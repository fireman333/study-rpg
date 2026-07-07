# 移植參考：弱點雷達 + 錯因修復 四功能 → 二階 (`study-rpg-2nd`)

> 來源：neurons change `add-neurons-weakness-radar-and-error-repair`（本 repo 已 archive 於 `openspec/changes/archive/2026-07-07-add-neurons-weakness-radar-and-error-repair/`，commit `6ea17b05`）。
> 目標：二階醫院經營 app `medexam2-hospital-tw`（**獨立 repo** `~/coding-scratch/study-rpg-2nd`，consume `@study-rpg/core` from npm）。
> 本文只是**移植指南**，不是 spec；真正落地時在 study-rpg-2nd repo 走該專案自己的 OpenSpec workflow（propose → apply → verify → archive）。

## 一、四個功能是什麼（neurons 版摘要）

| # | 功能 | 核心機制 | neurons 源檔 |
|---|---|---|---|
| 1 | **弱點壓力熱圖** | 掃 `questionHistory`（everWrong / easeFactor / nextDueAt）× `conceptTags` 算 per-family/concept **weakness-pressure**（前瞻「該複習什麼」訊號，與答題準確度 mastery 互補、不覆寫）；染色家族卡 + 一鍵 ≤10 題特訓 | `lib/services/weakness-pressure.ts`、`FamilyPicker.tsx`、`OverviewPage.tsx` |
| 2 | **錯因選項回放** | 答錯後主動秀「你選了 X→迷思 / 正解 Y→關鍵」（資料 = `optionExplanations`）+「加入快速複習」transient 佇列 | `QuizModal.tsx`、`lib/services/quick-review-queue.ts` |
| 3 | **看錯/觀念洞 二鍵標記** | 答錯後 opt-in 旗標（`questionFlags` 加 2 個 additive boolean）；看錯降權 / 觀念洞優先+短 interval；接進 due/出征/quick-review/drill 四條排序（order-then-slice） | `QuizModal.tsx`、`lib/services/question-flags.ts`、`sync/tables.ts`、`srs-scheduler.ts`、`expedition.ts` |
| 4 | **當場回鍋 session-repair** | 出征結算複用 `buildSessionRepairPool`（本場錯題、每題一次、`srsEffect:none`、不 credit 獎勵軸）+ 當場修復戳記 | `lib/services/expedition.ts`、`OverviewPage.tsx` |

**共通設計原則（值得原樣帶到二階）**：全零 schema version bump（純 derived / additive 非索引欄位）；不加付費 gacha / 卡片戰鬥數值 / 讀書時數社交比較；先把已有資料變成讀書決策再談新玩具。

## 二、二階現況盤點（決定可移植性的關鍵事實）

- ✅ **有 SRS**：`apps/medexam2-hospital-tw/src/db/schema.ts` `QuestionHistoryRow` 有 `nextDueAt` / `easeFactor` / `everWrong?`；`MasteryRow`（keyed by `subjectId`）= 答題準確度 mastery（≈ neurons `familyMastery`）。
- ✅ **有錯題 / 複習 builder**：`lib/wrong-practice.ts`、`lib/mock-exam.ts`、`lib/mastery.ts`（對應 neurons 的 `expedition.ts` / `srs-scheduler.ts`，但命名 / 結構不同）。
- ❌ **內容無 `conceptTags`**：`packages/content-medexam2-tw/src` 零匹配（UI 檔的匹配只是引用 core 的 optional 欄位、未 populate）。
- ❌ **內容無 `optionExplanations`**：同上，二階 corpus 沒有 per-option 簡答（neurons 那批是 Haiku pipeline 專門生的，見本 repo memory `neurons-option-explanations-pipeline`）。
- ❌ **無 `questionFlags` 表**：二階 schema 沒有獨立旗標表；✨太簡單/🤔我亂猜的 走不同機制（直接調 SRS，且**可清 everWrong**）。
- ⚠️ **`everWrong` 是 LWW，不是 monotonic-OR**：`lib/sync/r2/bundles.ts` + `tables.ts:442` 註明 ✨太簡單 會 explicit 寫 `everWrong=false` + bump `lastAnsweredAt`。**這是與 neurons 最大的語意差異**（neurons everWrong 永不清）。

## 三、逐功能移植性 + 前置條件

| 功能 | 可移植性 | 前置條件 / 適配點 |
|---|---|---|
| **1a 弱點壓力（家族/科別級）** | 🟢 **直接可移植** | 只用 `questionHistory`（everWrong/easeFactor/nextDueAt），二階全有。render 在二階的 subject/hospital 卡上。⚠️ 命名避開第二個「mastery」——二階 `MasteryRow` 已是答題 mastery，新分數叫 weakness-pressure、**不讀不覆寫** MasteryRow。 |
| **1b 弱點壓力（概念級）** | 🔴 **需先補資料** | 二階內容無 `conceptTags`。要嘛先給 `content-medexam2-tw` 加概念標籤 pipeline（工程量大），要嘛二階版**只做科別級**、跳過概念級。 |
| **2 錯因選項回放** | 🔴 **需先補資料** | 二階內容無 `optionExplanations`。前置 = 為二階 6066 題跑 per-option 簡答生成（比照 neurons Haiku pipeline）。**沒這批資料，此功能無法移植**。「加入快速複習」佇列本身（transient localStorage）與資料無關、可先移。 |
| **3 看錯/觀念洞** | 🟡 **需先建旗標表** | 二階無 `questionFlags` 表 → 新增一張（或存在 questionHistory row 上）。**everWrong LWW 差異要處理**：neurons 規定「看錯/觀念洞 SHALL NOT alter everWrong」是因為 monotonic-OR 讓清除無意義；二階 everWrong 可清，所以要**顯式決定**看錯要不要清 everWrong（建議仍不清，但理由不同、spec 要重寫）。旗標 UI 用二階自己的 pixel emoji 系統（`ui-emoji-icons` capability，非 neurons EmojiIcon）。 |
| **3b flag-priority 排序** | 🟡 **依賴 3** | 旗標存在後，把 `orderByErrorCausePriority`（觀念洞前/看錯後、order-then-slice）接進二階的 `wrong-practice.ts` / due-review / mock builder。 |
| **4 session-repair** | 🟢 **可移植（需適配）** | 二階有 questionHistory + SRS + wrong-practice 流程。把 `buildSessionRepairPool` 移植到 `wrong-practice.ts`，接二階的答題結算 UI。⚠️ **關鍵地雷**：neurons 這次順帶修了 `recordQuestionResult` full-row `put` 洗掉 SM-2 欄位的 latent bug（見下）——二階若有等價的「record 但不接 scheduler」caller（如 mock-exam 批次記錯題），檢查同樣的洗欄位問題。 |

## 四、移植時務必帶走的三個 hard-won 教訓（neurons smoke/review 抓到的）

1. **`recordQuestionResult` 不可 full-row `put` 洗掉 SRS 欄位**：結果記錄函式要 preserve `interval/easeFactor/nextDueAt/attempts/correctCount`；否則任何「record 但不接 scheduler」的 caller（mock exam 批次記錯題、session-repair）會靜默清掉 SRS 排程、污染 due 佇列。二階 `mock-exam.ts` 批次寫錯題本時**檢查有無此坑**。
2. **旗標 setter + sync adapter 要 preserve 全部旗標**：加新 boolean 欄位時，既有 setter 若整列重建會洗掉他人欄位；R2 adapter 若 field-whitelist 會漏 propagate 新欄。兩者都要 preserve-on-omission（neurons `question-flags.ts` `putFlag` + `sync/tables.ts questionFlagsAdapter` 是正確範本）。
3. **session-repair 追蹤不可依賴 maze/mastery 記錄成功**：把「記本場錯題 id」放在會 throw 的 `recordIncorrectAnswer` **之前**；否則記錄失敗會靜默漏掉 session-repair。

## 五、建議移植順序（低風險先行）

1. **先移純資料無關 + 直接可用的**：① 弱點壓力（科別級，1a）＋ ④ session-repair（含教訓 1）。這兩個不需要新內容資料。
2. **建旗標表後**：③ 看錯/觀念洞（含 everWrong LWW 決策）＋ 3b flag-priority 排序（含教訓 2）。
3. **內容 pipeline 就緒後（大工程，可能單獨開 change）**：② 錯因回放（需 optionExplanations）＋ 1b 概念級弱點（需 conceptTags）。

> 本文放在 neurons repo（模式來源）。實際到 study-rpg-2nd 動工時，可把本檔複製過去、依二階 OpenSpec workflow 拆成 1–3 個 change 落地。
