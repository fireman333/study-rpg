## 1. Groundwork（資料 + 資產，零 version bump）

- [x] 1.1 在 `apps/neurons-tw/src/lib/db.ts` 的 `QuestionFlagRow`（~L251）加 additive 非索引欄位 `wrongAnswerMarked?: boolean` + `insightMarked?: boolean`；確認 **不改 `.stores()`、不加 `.version()`、PK 不變**。
- [x] 1.2 產 👁 (U+1F441) 64×64 GBA pixel-art PNG（命名 `1f441.png`，走 codex CLI 生圖配方），放 `apps/neurons-tw/public/icons/emoji/`，在 `lib/emoji-icons.ts` `ICON_FILES` 加一行；確認 💡 `1f4a1.png` 已存在可直接用。（PNG 已由主 agent 放好；本 agent 加 manifest 行）
- [x] 1.3 新增 `apps/neurons-tw/src/lib/services/weakness-pressure.ts`：純 derived，掃 `questionHistory`（`family`/`lastResult`/`everWrong`/`easeFactor`/`nextDueAt`）× content `conceptTags`，回傳 per-family + per-concept **weakness-pressure** 分數（**不讀取也不覆寫既有 `familyMastery` correct/total**）；無答題紀錄的 family 回「undiagnosed」而非最弱；權重集中一處標 dogfood-tunable。

## 2. Feature 1 — 弱點熱圖（家族卡 + 一鍵特訓）

- [x] 2.1 在 `FamilyPicker` 家族卡渲染 weakness-pressure 色階（暗=弱/亮=強），與既有 `familyMastery` 準確度顯示 + variant chip **視覺與語意分離、不取代**；`prefers-reduced-motion` 下不脈動。
- [x] 2.2 undiagnosed family 顯示中性狀態（非最弱色）。
- [x] 2.3 弱 family/concept 提供「一鍵特訓」affordance → 複用既有 quiz pool builder + quiz-mode 入口，開 ≤10 題、優先取該 family/concept 的高 weakness-pressure 題（wrong/low-ease/overdue）；drill 答題走既有 `recordQuestionResult` + SRS 路徑（非新計分路徑）。（per-family drill；per-concept 弱點在 diagnostic 已算出，UI 目前只暴露 family 級 affordance）

## 3. Feature 2 — 錯因選項回放（QuizModal）

- [x] 3.1 在 `QuizModal.tsx` 答錯揭曉區主動渲染「你選了 X → optionExplanations[X]（迷思）」+「正解 Y → optionExplanations[Y]（關鍵）」，不需展開被動「簡答」摺疊；答對不觸發。
- [x] 3.2 缺 `optionExplanation` 的一側 graceful omit（不留空 block）。
- [x] 3.3 加「加入快速複習」CTA → enqueue 該題進 **transient device-local 佇列**（記憶體/`localStorage`，非新 synced table、無 bump）；下次快速複習 mini-batch 優先取用；CTA 反映已加入狀態。（新 `lib/services/quick-review-queue.ts`；OverviewPage 的 DMN 快速複習 mini-batch 已改成「佇列優先 → 補滿 wrong-pool，cap 5」，close 時 dequeue 已服務 ids）

## 4. Feature 3 — 錯因二鍵標記（看錯 / 觀念洞）

- [x] 4.1 在 `QuizModal.tsx` 答錯揭曉區加 👁「看錯」/ 💡「觀念洞」兩顆 opt-in modifier（`<EmojiIcon>` 像素圖示）；三態（點=套用/再點=清除）；與 ✨🤔 **分時互斥**（答對只見 ✨🤔、答錯只見看錯/觀念洞）。（含 2/3 hotkey 依 isCorrect 路由到對應 pair）
- [x] 4.2 `question-flags.ts` 加 `setWrongAnswer`/`setInsight`/`toggle*` setters；**同時改既有 `setEasy`/`setGuessed`/toggle 為 preserve 全部四旗標**（不可整列重建洗掉他人欄位）；不動 `everWrong`。（統一走 `putFlag` read-existing-then-put）
- [x] 4.3 接 review/出征排序：看錯=降權（排後、不進 targeted-drill 高優先）；觀念洞=優先 + 縮短下次 interval（沿用 `reviewCardBinaryGuessed` 式收斂、不清 everWrong）。（排序在 `buildTargetedDrillPool`/`questionPriority`；觀念洞 interval 收斂用 `applyGuessedModifier`）
- [x] 4.4 **patch `questionFlagsAdapter`**（`sync/tables.ts:791`）：`snapshot` + `apply` 納入 `wrongAnswerMarked`/`insightMarked`（現況只寫 `easyMarked`/`guessedMarked`）；incoming row 缺這兩欄時 **preserve 既有 local 值**（preserve-on-omission），確認跨裝置 propagate 且 **R2 SCHEMA_VERSION 不變**。

## 5. Feature 4 — 當場回鍋（session-repair）

- [x] 5.1 在 `lib/services/expedition.ts` 加 `buildSessionRepairPool(pool, history, sessionWrongIds)`：只取本場答錯題、每題一次；不碰 SRS 欄位。
- [x] 5.2 出征結算 recap（`OverviewPage.tsx` `onExpeditionComplete` 區）浮現可跳過的「當場回鍋」pass；答題 **record 結果但不呼叫 `scheduleSrsForAnswer`**，preserve `interval`/`easeFactor`/`nextDueAt`/`attempts`/`correctCount`；**不 credit DMN 抽卡軸、不發 maze 能量**；答對蓋「當場修復」cosmetic 戳記（UI-only、無 synced 欄位）。（QuizModal `sessionRepair` prop；順帶修 `recordQuestionResult` 全列 put 會洗掉 SM-2 的 latent bug）
- [x] 5.3 UI 文案與行為明確區隔 DMN `quick-review-batch`（「快速複習」）：session-repair =「當場回鍋/當場修復」、來源=本場錯題、無 DMN 抽卡軸 credit、無 SRS 效果。

## 6. 驗證（tests + typecheck + smoke）

- [x] 6.1 Vitest：`weakness-pressure` 排序性質（弱 family < 強 family、undiagnosed 非最弱、與 `familyMastery` 可合理發散）、`buildSessionRepairPool`（只本場錯題、去重一次）、四旗標 setter preserve（toggle ✨ 不洗 `wrongAnswerMarked`）、adapter round-trip + preserve-on-omission、session-repair 不動 5 個 SM-2 欄位、看錯降權/觀念洞優先排序。（24 新 test：weakness-pressure ×8 / question-flags-error-cause ×9 / session-repair-pool ×5 / session-repair-srs-inert ×2）
- [x] 6.2 `pnpm -r typecheck` clean；確認**無新 `.version()`**（`lint:dexie-fixtures` 不應被觸發）、R2 SCHEMA_VERSION 未動。
- [x] 6.3 Chrome MCP smoke（prod-equiv dev @5175，2026-07-07）：✓ 家族卡弱點色階（解剖學 40% 綠條）+ undiagnosed 中性；✓ 答錯回放（你選了X迷思 / 正解Y關鍵）+ 加入快速複習 CTA；✓ 看錯/觀念洞像素 modifier + 分時互斥雙向（答對→✨🤔、答錯→看錯/觀念洞）+ 三態；✓ 出征結算當場回鍋 pass + 當場修復戳記（含 todayRepairs=0 全錯 session 仍顯示 = Codex #3）。**smoke 抓到並修 2 個 Feature 4 bug**：(a) `wrongIdsRef.push` 在會 throw 的 `recordIncorrectAnswer` 之後 → 移到之前，session-repair 追蹤不再依賴 maze 記錄成功（`QuizModal.tsx`）；(b) 點當場回鍋後 recap 疊在 repair quiz 上 → recap gate 加 `!repairOpen`（`OverviewPage.tsx`）。**發現 pre-existing（非本 change，已 spawn task）**：`recordCorrectAnswer`/`recordIncorrectAnswer` 在 `familyMastery` 未初始化時 throw，且未包 try/catch。

> 二階 (`study-rpg-2nd`) 題庫系統移植參考文件是本 change **archive/verify 之後**的獨立 deliverable（跨 repo、不動本 repo spec），不列為本 change 的驗收 task；先確認二階是否有 `conceptTags`/`optionExplanations` 覆蓋以判定各功能可移植性，再寫進 `docs/`。
