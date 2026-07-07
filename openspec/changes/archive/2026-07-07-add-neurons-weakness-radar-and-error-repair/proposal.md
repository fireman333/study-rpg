## Why

神經元 app 已經累積了三筆「很貴卻閒置」的答題資料——每題的 `conceptTags`（100% 覆蓋）、`optionExplanations`（每個選項的簡答、100% 覆蓋）、以及 `questionHistory` 的 `everWrong` + SM-2 排程——但目前它們多半只當展示或詳解附庸，沒有回頭變成「考生今天該讀什麼」的決策。一輪三方腦力激盪（開源前案 UWorld/AMBOSS/Anki + Codex + Fable）的共識是：**先把已有資料變成讀書決策，再談新玩具**。本 change 把這三筆資料轉成一個弱點診斷 + 一組錯誤修復機制，全部盡量純 derived、零 schema bump，且嚴守產品紅線（不加付費 gacha、不加卡片戰鬥數值、不動排行榜比較）。

## What Changes

- **概念弱點熱圖 = 家族視覺染色（旗艦）**：以 `conceptTags × everWrong × SM-2 ease/nextDueAt` 計算玩家 per-family / per-concept 的**弱點壓力分數（weakness-pressure）**——一個「現在該複習什麼」的前瞻訊號，**與既有 `familyMastery`（correct/total 準確度）互補、不重複也不覆蓋**（後者是回顧型準確率，前者額外納入 everWrong + 逾期 SRS 壓力）；以「暗 = 弱 / 亮 = 強」色階渲染到既有家族視覺——**v1 落在首頁 `FamilyPicker` 家族卡**（成本低、零 canvas 風險）；腦迷宮 `MazeGrid` 染色列為 fast-follow（下一 change）。弱家族卡 → 一鍵發起該家族/概念的 ≤10 題特訓（沿用既有 quiz pool builder）。讓「複習弱點」與「規劃讀書」變成同一個動作。
- **錯因選項回放（優化 QuizModal）**：答錯後 QuizModal 主動回放「你選的錯誤選項的迷思 + 正解關鍵」，資料來源 = 既有 `optionExplanations`；附「加入快速複習」CTA 串既有 quick-review-batch。目前 `optionExplanations` 只被動收在「簡答」摺疊區。
- **錯因二鍵標記（優化 everWrong 訊號品質）**：答錯後在既有 ✨/🤔（答對 modifier）的對稱位置，加兩顆 opt-in 錯因按鈕「看錯」「觀念洞」。看錯 = 出征/複習降權；觀念洞 = 優先入出征 + 短 interval。沿用既有 `questionFlags` opt-in 多旗標共存 pattern。按鈕圖示走既有 neurons `<EmojiIcon>` 像素系統（非原生 emoji）。
- **當場回鍋（session-repair）**：依 Codex scope 裁決不做成第四套獨立錯題系統——**複用** quick-review 池 + QuizModal 機制（新 `buildSessionRepairPool`：`source: currentSessionWrong` + `maxAttempts: 1` + `srsEffect: none`），但做成 **UI 與 reward 軸獨立**的 pass：session 結束自動出現、只吃本場答錯題、每題只重問一次、不動 SM-2、答對給「當場修復」cosmetic 戳記。與 `neurons-dmn-fate-cards` 的 DMN `quick-review-batch` 事件卡（手動觸發、歷史錯題池、credit DMN 抽卡軸）**行為與文案明確區隔**，避免玩家混淆。

## Capabilities

### New Capabilities
- `neurons-weakness-radar`: 個人概念/家族**弱點壓力（weakness-pressure）**診斷。從 `neurons-concept-tags` 的 tag 與 `neurons-wrong-answer-list` 的 `questionHistory`（`everWrong` + SM-2）derive per-family / per-concept 弱點壓力分數（純 derived、不落 Dexie）；此分數與既有 `neuron-family-mastery`（`familyMastery` correct/total 準確度）互補、**不讀取也不覆寫它**，命名刻意避開第二個「mastery」；v1 以弱點壓力色階渲染於既有 `FamilyPicker` 家族卡（腦迷宮染色為後續 fast-follow）；提供「一鍵特訓最弱家族/概念」的 targeted drill launcher。

### Modified Capabilities
- `neurons-simplified-explanations`: 新增「答錯後主動回放錯因」行為——QuizModal SHALL 在答錯揭曉後，突顯玩家所選錯誤選項的 `optionExplanation` 與正解關鍵，並提供「加入快速複習」CTA。（既有：`optionExplanations` 僅收於被動摺疊「簡答」區。）
- `neurons-quiz-modes`: 新增「答錯後錯因二鍵標記」——答錯後 SHALL 提供「看錯 / 觀念洞」兩顆 opt-in modifier，對映 `questionFlags`，影響 review / 出征優先度（看錯降權；觀念洞優先且縮短 interval）。此為既有 post-correct ✨/🤔 modifier 的 post-wrong 對稱擴充；圖示走 neurons `<EmojiIcon>` 像素資產。
- `neurons-homepage`: 出征結算（expedition settlement）SHALL 提供一次性「當場回鍋」session-repair pass——複用既有 quick-review 池機制（`buildSessionRepairPool`），只吃本場答錯題、每題只重問一次、`srsEffect: none`（不動 SM-2）、答對蓋「當場修復」cosmetic 戳記；spec SHALL 明文界定它與 `neurons-dmn-fate-cards` 既有 DMN `quick-review-batch` 事件卡（手動觸發、來源=歷史錯題池、credit DMN 抽卡軸）的差異，避免玩家混淆。（放 `neurons-homepage` 而非 DMN spec：觸發點與呈現在出征結算 recap，不涉入 22 卡 gacha capability。）

## Impact

- **Code（App）**：`apps/neurons-tw/src/components/QuizModal.tsx`（錯因回放 + 二鍵標記）、`routes/OverviewPage.tsx` + `FamilyPicker`（家族卡弱點色階 + 一鍵特訓）、`lib/services/` 弱點掌握度計算（純 derived，掃 `questionHistory`）+ `expedition.ts` 新 `buildSessionRepairPool`、既有 quiz pool builder（targeted drill）、`lib/db.ts` `QuestionFlagRow` 加 2 個 additive boolean、`lib/emoji-icons.ts` + `public/icons/emoji/`（👁 補生 64×64，💡已有）。
- **資料 / schema**：零 Dexie `.version()` bump、零 R2 SCHEMA_VERSION bump（全 additive）。弱點熱圖純 derived（讀既有 `questionHistory` + content `conceptTags`）；錯因二鍵標記加 2 個 additive 非索引 boolean 到 `QuestionFlagRow`——**但必須同步擴充** (a) 既有 flag setters（`setEasy`/`setGuessed`/toggle 等，避免整列重建洗掉新欄）與 (b) `questionFlags` R2 adapter（目前 whitelist 只序列化 `easyMarked`/`guessedMarked`，需納入新 2 欄 + preserve-on-omission），兩者皆 additive、不 bump version；`session-repair` 為既有 quick-review 機制的參數化，不新增 synced table。
- **紅線遵循**：不引入付費 / 廣告 gacha、不加卡片戰鬥數值、不加讀書時數社交比較（三方一致標為陷阱）。
- **並行協調**：v1 弱點色階染首頁家族卡（不動 connectome/maze SVG）；與另一 session 進行中的 `add-neurons-study-room`（動 CollectionPage 書房 subtab）幾乎無重疊；apply 時走 multi-agent git safety（explicit per-file `git add`、commit 前 `git diff --cached` 檢查）。
