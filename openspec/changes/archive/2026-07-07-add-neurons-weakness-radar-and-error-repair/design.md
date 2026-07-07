## Context

三筆已存在但閒置的答題資料是本 change 的原料：`conceptTags`（content pack，per-question，100% 覆蓋）、`optionExplanations`（per-option 簡答，100% 覆蓋）、`questionHistory`（`everWrong` monotonic-OR + SM-2 `easeFactor`/`nextDueAt`/`lastResult`）。現況它們只被動展示，沒有回頭變成「今天讀什麼」的決策。

實作錨點（已定位）：
- 家族卡：`routes/OverviewPage.tsx` 的 `FamilyPicker`（已有 🆕新題 / 🔄錯題 per-family badge，是掛掌握度色階最省的位置）。
- 腦迷宮：`components/maze/MazeGrid.tsx`（offscreen canvas 烘焙，`FAMILY_ENC` per-family color/shape，僅 3 種 synapse 狀態）——canvas 染色成本較高，本 change 不做。
- Flags：`lib/db.ts:251` `QuestionFlagRow`（Dexie v8）= `{ questionId(PK), easyMarked, guessedMarked, updatedAt }`，兩個 boolean + LWW。
- Emoji：`lib/emoji-icons.ts` manifest（codepoint.png 命名）+ `public/icons/emoji/`（44 PNG）；💡 `1f4a1.png` 已有、👁 U+1F441 缺。
- 快速複習：`lib/services/expedition.ts:43` `buildQuickReviewPool(pool, history, n=5)`，觸發於 `OverviewPage.tsx:563` `onExpeditionComplete(s)`；獎勵路徑 `expedition.ts:73`。

## Goals / Non-Goals

**Goals:**
- 把 `conceptTags` × `questionHistory` 變成 per-family/per-concept 掌握度診斷，渲染於家族卡 + 一鍵特訓最弱處。
- 答錯後主動回放錯因（`optionExplanations`）+ 加入快速複習 CTA。
- 加「看錯 / 觀念洞」兩個 opt-in 錯因標記，提升 `everWrong` 訊號品質、影響 review/出征優先度。
- session 結束的「當場回鍋」以 quick-review-batch 的 `session-repair` 變體落地。
- **目標零 Dexie/R2 schema version bump**（掌握度純 derived；flags 為 additive 非索引欄位；session-repair 為既有機制參數化）。

**Non-Goals:**
- 腦迷宮 `MazeGrid` canvas 掌握度染色 → **fast-follow（下一 change）**，非本 change scope。
- 把 SM-2 換成 FSRS → 較大投資、獨立 change 再議（本 change 不動排程演算法）。
- 任何付費/廣告 gacha、卡片戰鬥數值、讀書時數社交比較 → 三方一致標為陷阱，硬紅線。
- 二階 (`study-rpg-2nd`) 的對應更新 → 獨立 repo，本 change 完成後另出「移植參考文件」，不在此 change 動二階程式碼。

## Decisions

**D1 — 弱點壓力 v1 渲染於 `FamilyPicker` 家族卡，不染腦迷宮 canvas。**（user 拍板）
- 理由：家族卡已有 per-family badge、掛色階最省、零 canvas 烘焙風險，直接交付「哪家族弱 + 一鍵特訓」的診斷價值。腦迷宮染色視覺更強但動 load-bearing 烘焙層，列 fast-follow。
- Alternative（rejected v1）：染 `MazeGrid`（成本中、回歸風險）；收藏頁圖鑑染色（open dex 只顯持有卡，弱題不一定有對應卡、覆蓋不完整）。

**D2 — 弱點壓力（weakness-pressure）分數純 derived、不落 Dexie，且與既有 `familyMastery` 明確區隔。**
- **正名**：既有 `neuron-family-mastery`（`FamilyMasteryRow`，`db.ts:97`）是 per-family **答題準確度 `correct/total`**（不是蒐集掌握度——proposal v1 誤述已修）。本 change 的新分數命名為 **weakness-pressure**，刻意避開第二個「mastery」；它**不讀取也不覆寫** `familyMastery`。
- 逐 row 掃 `questionHistory`（`family`/`lastResult`/`everWrong`/`easeFactor`/`nextDueAt`）+ content `conceptTags`，於 `lib/services/` 新 `weakness-pressure.ts` 計算 per-family/per-concept 分數；用 `useLiveQuery` + memo，questionHistory 至多 ~4600 row、O(n) 掃描可接受。
- 差異化理由：`familyMastery` 是回顧型準確率；weakness-pressure 額外納入 `everWrong` 存在、低 `easeFactor`、逾期 `nextDueAt` 三個「該複習」維度，是前瞻訊號，兩者可合理發散。公式 v1 從簡（線性組合），權重集中一處標 dogfood-tunable。
- Alternative（rejected）：落一張 cache table → staleness + 需 bump + 違背三方「零 schema」共識。

**D3 — 錯因二鍵標記用 additive boolean 加到 `QuestionFlagRow`，無 version bump，但 setter + R2 adapter 必須同步擴充。**
- `QuestionFlagRow` 加 `wrongAnswerMarked?: boolean`（看錯）+ `insightMarked?: boolean`（觀念洞）。非索引欄位，Dexie `.stores()` 不需改、無 `.version()` bump，LWW 沿用 `updatedAt`。
- **關鍵 footgun（Codex 抓）**：(a) 既有 setters `setEasy`/`setGuessed`/`toggle*`（`question-flags.ts`）是 `put({ questionId, easyMarked, guessedMarked, updatedAt })` **整列重建**——不改就會洗掉新 2 欄；必須改成 preserve 四旗標。(b) R2 `questionFlagsAdapter.apply`（`sync/tables.ts:822`）目前 whitelist 只寫 `easyMarked`/`guessedMarked`——不 patch 新 2 欄不會 propagate；必須納入 4 欄 + incoming 缺欄位時 preserve 既有。兩者皆 additive、**不 bump SCHEMA_VERSION**。
- 語意：**看錯 = review/出征降權**（排序靠後、不進 targeted drill 高優先）；**觀念洞 = 優先入出征 + 縮短下次 interval**（沿用既有 `reviewCardBinaryGuessed` 式的 interval 收斂，但不清 `everWrong`）。四個 modifier 明確分時：✨/🤔 **只在答對後**、看錯/觀念洞 **只在答錯後**，同一題單次只見一組。
- Alternative（rejected）：改成單一 enum 欄位 → 與既有「多 flag 共存、不 hard-delete」的 boolean pattern 不一致。

**D4 — 當場回鍋 = `buildSessionRepairPool` 新函式，複用池/QuizModal 但 reward 軸獨立。**（Codex scope 裁決）
- `expedition.ts` 加 `buildSessionRepairPool(pool, history, sessionWrongIds)`：過濾 `sessionWrongIds` ∩ 本場答錯題，每題只出一次。
- **`srsEffect: none` 實作路徑（Codex 要求指明）**：session-repair 答題時 **record 結果但不呼叫 `scheduleSrsForAnswer`**，preserve `interval`/`easeFactor`/`nextDueAt`/`attempts`/`correctCount` 不變；**且不 credit DMN 抽卡軸、不發 maze 能量**（那是新出征的獎勵，回鍋是修復已計數的題），唯一回饋是「當場修復」cosmetic 戳記（純 UI、不入 synced schema）。這確保 reward 軸與 DMN `quick-review-batch` 獨立。
- **Change note — `recordQuestionResult` preserve 連帶修掉一個 latent bug（Codex #1）**：本 change 為了 session-repair 的 `srsEffect: none`，把 `recordQuestionResult` 從「full-row `put` 洗掉 SM-2 欄位」改成「preserve `interval`/`easeFactor`/`nextDueAt`/`attempts`/`correctCount`」。QuizModal 正常流程原本靠緊接的 `scheduleSrsForAnswer` 補回排程、所以沒人踩到；但 `MockExamRunner.doSubmit`（`MockExamRunner.tsx`）在交模考時 batch 呼叫 `recordQuestionResult` 記所有錯/未答題、**不接 scheduler** → 舊行為每次交模考就把那些題的 SM-2 排程洗成 `undefined`，污染 `buildDueReviewPool`（已排程且到期的卡會從 錯題 佇列消失）。此 preserve 一併修掉這個回歸，由 `src/__tests__/session-repair-srs-inert.test.ts` 的 MockExamRunner-style 回歸測試鎖住。
- 與 DMN `quick-review-batch` 界線（spec 明文）：session-repair = **自動觸發 / 來源=本場錯題 / 只問一次 / srsEffect=none / 無 DMN credit**；DMN quick-review-batch = **手動 backpack 啟用 / 來源=歷史錯題池 / credit DMN 抽卡軸**。
- Alternative（rejected by Codex）：獨立第四套錯題系統 → 玩家心智負擔、四個入口都像「重做錯題」。

**D5 — 像素圖示走既有 `EmojiIcon` manifest。**
- 看錯 → 👁 `1f441.png`（需 codex 生 64×64 GBA pixel，比照現有命名慣例 + `ICON_FILES` 加一行）；觀念洞 → 💡 `1f4a1.png`（已存在，直接用）。UI 一律 `<EmojiIcon char=…>`，不用原生 emoji。

**D6 — 錯因回放 UI 落在 QuizModal 答錯揭曉區；快速複習走 transient 本地佇列。**
- 答錯後突顯：`你選了 X → optionExplanations[X]（迷思）` + `正解 Y → optionExplanations[Y]（關鍵）`。資料全來自既有 `optionExplanations`。
- 「加入快速複習」CTA：enqueue 該題進一個 **transient device-local 佇列**（記憶體 / `localStorage`，**非新 synced Dexie table、無 bump**）；下次快速複習 mini-batch 優先取用。刻意不落雲端——只是即時補刀的便利緩衝。

## Risks / Trade-offs

- **[weakness-pressure 每次重算掃全 questionHistory 可能卡]** → memo + 只在進家族卡/弱點視圖時算；~4600 row O(n) 實測可接受，必要時加輕量增量快取（記憶體、非 Dexie）。
- **[四個 modifier（✨🤔看錯觀念洞）玩家混淆]** → 答對/答錯分時互斥呈現（D3），文案與位置區隔。
- **[session-repair 與 quick-review-batch 混淆]** → spec 明文界線 + UI 文案「當場修復」vs「快速複習」+ reward 軸獨立（D4）。
- **[questionFlags 新 boolean 被既有 setter 洗掉 / R2 adapter whitelist 不 propagate]**（Codex 確認為 blocker）→ 已升為 D3 硬要求 + tasks 4.2/4.4：改 setters preserve 四旗標、patch adapter 序列化 4 欄 + preserve-on-omission；皆 additive、不 bump version。
- **[並行 `add-neurons-study-room` session 動 CollectionPage]** → 本 change 碰 OverviewPage/FamilyPicker + QuizModal + expedition.ts + db.ts flags + emoji manifest，與 study-room 的 CollectionPage 書房 subtab 低重疊；apply 走 multi-agent git safety（explicit per-file `git add`、commit 前 `git diff --cached` 檢查）。
- **[旗艦缺腦迷宮染色打折]** → 家族卡已足夠交付診斷；迷宮染色 fast-follow 排下一 change，不阻塞本次。

## Migration Plan

- 全部 additive、無 Dexie version bump（非索引 boolean 欄位不需改 `.stores()`）、無 R2 SCHEMA_VERSION bump。無回填舊 row；缺欄位一律讀作 false。
- Rollback：純前端 + additive 欄位，revert commit 即可；已寫入的 `wrongAnswerMarked`/`insightMarked` 對舊 build 是無害多餘欄位（LWW 保留、被忽略）。
- R2 sync：patch `questionFlagsAdapter`（serialize + apply 4 欄 + preserve-on-omission）後，新 boolean 自動 propagate；SCHEMA_VERSION 不變。

## Open Questions

- weakness-pressure 公式各項權重（everWrong vs 低 ease vs 逾期 due）→ 先上簡單版，dogfood telemetry 再調。
- 看錯/觀念洞 對 review 優先度的具體排序權重 → 先上簡單規則（看錯沉底、觀念洞置頂），再調。
