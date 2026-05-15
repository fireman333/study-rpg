## Context

一階 medexam-tw 已 M2 shipped（全科開放 + skill tree + SRS queue + daily streak）。題庫 `_extracted/醫學一/` + `_extracted/醫學二/` 結構為「每年每科 .md 檔，按 session 切」— 一階國考實際為「醫一 100 題 + 醫二 100 題」per session × 2 sessions/year × 9 年 ≈ 36 papers。

使用者（dogfood = 作者本人）2026 H2 要考一階，需要 mock-exam mode 在 app 內做完整一份原卷的考前演練。Grill quick 結果（`~/.claude/scratch/grilled-add-mock-exam-mode-2026-05-15.md`）確定方向：**practice-mode > simulator-mode**（stopwatch / auto-pause / 全展開詳解 / 個人進步曲線），不模擬真實考試壓力。

關聯 capability：`quiz-runner`（提供題目資料但 mock 不重用 modal）、`engine-rewards`（REWARD 表加 boss-tier 項）、`srs-queue`（mock 結果頁可一鍵 enqueue 錯題）、`persistence`（Dexie schema bump）、`content-pack-contract`（questions.json `year` + `paper` metadata）。

## Goals / Non-Goals

**Goals:**
- 一份原卷 ≈100 題完整重做（一階國考標準），UI 上明示「醫一 / 醫二 + 年份」
- Stopwatch 計時 + visibilitychange 自動暫停（reading-loop 紀律）
- 一頁式結果：總分 + ~100 題對錯卡片 + 詳解全展開 + 進步曲線
- 同原卷重做時跟自己歷史成績比（純 client-side，無外部資料）
- 完成全卷 = boss-tier reward burst（一次大量屬性 + 1 次保底 SR loot）
- 結果頁「將錯題加入 SRS queue」一鍵 button
- 缺詳解題 graceful fallback（不 crash、明確 placeholder）

**Non-Goals:**
- ❌ 真實考試模擬（倒數計時 + 不可暫停）— 留 future `mock-exam-strict-mode` extension
- ❌ 隨機抽樣 mock 100 題（按科別配額）— 留 future feature
- ❌ 自訂科別比例 / 題庫 subset mock — 留 future feature
- ❌ 全國百分位 / 考選部分數對照 — 純個人進步曲線，避免外部資料源依賴
- ❌ 朋友 leaderboard / 排行榜（已 align project.md M6 social light）
- ❌ AI 評語 / 推薦下次學什麼（已 align project.md OOS「後端 LLM 評分」永不做）
- ❌ Mock 跨裝置 sync / 雲端存檔（已 align project.md M4 Supabase）
- ❌ 重用 `quiz-runner` 的 QuizModal（mock = 獨立 flow，不混用 mini-quiz UI）
- ❌ 重用 `mini-boss` state machine（mock = 自有 ultimate boss tier，不複用）

## Decisions

### D1: Mock = 獨立 capability，不重用 quiz-runner / mini-boss

**選擇**：mock-exam 作為新 capability，自有 UI flow + 資料層。quiz-runner 的 QuizModal 不改，mini-boss state machine 不改。

**理由**：
- quiz-runner 的 QuizModal 設計給 N=5 mini-quiz，逐題立即 feedback + reward。Mock 是 ~100 題、答完統一交卷、結果頁延後顯示 — 行為差太多
- mini-boss 是「一個 boss 對應一個科目 N 題挑戰」，mock 是「一份原卷 ~100 題」— scope 跟科目對齊邏輯不同
- 獨立 capability 讓 future「strict mode」/「random 100 mock」加 sibling 不破壞既有 spec
- 共享層只有：題目資料（從 `content-pack-contract` 拿）+ reward 發放接口（從 `engine-rewards` 拿）+ SRS enqueue（從 `srs-queue` 拿）

**Alternatives 考慮**：
- (a) 重用 QuizModal 加 prop `mode: 'mock' | 'mini'` — 拒絕：modal 內部複雜度爆炸，未來改 mini 容易誤傷 mock
- (b) Mock 視為 mini-boss 的 specialized boss type — 拒絕：boss 邏輯都假設 N≤20 題，~100 題會打破許多假設

### D2: Stopwatch 而非倒數，且 visibility-change 自動暫停

**選擇**：右上角顯示 `mm:ss` 累計時間，從點「開始作答」起算。`document.visibilitychange` 觸發 + idle 偵測（同 reading-loop 90 秒 threshold）自動 freeze stopwatch。

**理由**：使用者 grill 答案明確要 practice-mode，無倒數壓力。auto-pause 沿用 reading-loop 已有的 visibility hook，省一輪實作。

**Alternatives 考慮**：
- 倒數 100 min 強制交卷 — 留 strict mode future feature
- 手動 pause button — 多餘，自動偵測夠用；不加 UI 干擾

### D3: 結果頁一頁式長 scroll，所有詳解預設展開

**選擇**：交卷後跳轉 result screen，DOM 一次 render 全部 ~100 題卡片（題幹 / 你的答案 chip / 正確答案 chip / 詳解 prose / SRS enqueue button per Q），預設 expanded。

**理由**：使用者明選「詳解全展開」。Scroll 長度可接受（每題 ~300 px ≈ 24000 px，現代瀏覽器 OK）。Lazy render 可 optimize 但 MVP 不需要。

**Risks**：渲染 ~100 題若全含長詳解可能 first paint 慢 → mitigation：result screen 顯示 skeleton 後 idle-callback 漸進 hydrate。

### D4: 缺詳解題的 placeholder UX

**選擇**：缺 `explanation` 欄位的題（309/3600）在卡片中顯示 inline placeholder「📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢」。

**理由**：透明告知 + 提供使用者自助管道，不假裝有但內容空白。

### D5: 進步曲線 = 同原卷歷次成績比較

**選擇**：Dexie `mockAttempts` table 存 `{ paperId, startedAt, finishedAt, elapsedSec, totalScore, perQuestionAnswers }`。Result screen 查詢 `mockAttempts.where('paperId').equals(currentPaperId)` 取歷史 attempts，顯示「第 N 次嘗試 — 上次 X 分 / 這次 Y 分 / Δ +Z」。

**理由**：純 client-side，避免外部資料源依賴；同卷比較才有意義（不同卷難度不同）。

**Alternatives 考慮**：
- 跨原卷 normalize 分數 — 拒絕 MVP：需要 difficulty model，過度設計
- 跟全國平均比 — 拒絕：考選部歷年資料法規 + 品質不可控

### D6: Boss-tier reward burst 公式

**選擇**：
```ts
mockExamPass: {
  xp: 800,          // ≈ 4 × bossAnnualPass (200) — 但 mock = 終極 boss tier
  subjectXp: 240,   // ≈ 4 × bossAnnualPass (60)
  stat: { name: 'knowledge', delta: 4 },  // 一次性 +4 knowledge
  loot: { guaranteedTier: 'SR' },  // 保底 1 次 SR roll
}
```
另加 per-correct bonus：每答對一題額外 +0.5 stamina（~100 題 max +50 stamina）— 但受「每分鐘 +1 屬性 rate limit」**豁免**（mock-exam 為 explicit exception，spec 中標明）。

**理由**：grill 答案「終極 boss：一次大量 burst」對應 4× bossAnnualPass 量級。`mockExamPass` 列入 REWARD 表為 explicit exception of rate limit（spec 文字會寫死）。

**Open question** → 數值需 dogfood 後微調（telemetry 紀錄前 5 次 mock attempt 的 stat delta vs 答對率，依分佈調整）。

### D7: Questions.json schema — `year` + `paper` metadata 必填

**選擇**：`questions.json` 每筆題目 SHALL 含 `year: number`（e.g. `2024`）+ `paper: 'medexam-1' | 'medexam-2'`。Mock exam UI 用此兩欄做「年份 × 醫一/醫二」grid。

**理由**：build script 解析 source `.md` 檔名（路徑含「醫學一」/「醫學二」+ 年份）已隱含此資訊，只需 surface 到 JSON。

**Risks**：若 build script 未 surface → 需先補 build script PR（task 1.0 第一步驗證）。Mitigation：tasks 第一步加 verification step，若已 surface 則 noop，否則加 1-line in `scripts/build.ts`。

### D8: Dexie schema migration v(current+1)

**選擇**：新增 `mockAttempts` store with primary key `id` (UUID v4 generated client-side), index on `paperId` for 歷史查詢。既有 store 不變。

**Migration 策略**：Dexie 自動處理（純 additive），無需資料遷移。

### D9: SRS enqueue button = optional click (not auto)

**選擇**：Result screen 頂端顯示「將 N 道錯題加入 SRS queue」button。Click 後呼叫 `srsQueue.enqueueMany(wrongQuestionIds)` + 顯示 toast。**不**自動 enqueue。

**理由**：使用者 grill Q4 選 option A（總分 + 對錯 + 詳解）而非 option D（錯題自動進 SRS）。respect intent — 給使用者 control 而非 auto-magic。

## Risks / Trade-offs

- **First paint slow**（~100 題一次 render）→ skeleton + idle-callback hydration
- **Reward 數值不平衡**（mock burst 太強或太弱）→ dogfood 5 次後依 telemetry 微調 + 確保 mock burst 在 spec 中為 explicit rate-limit exception
- **缺詳解題比例高**（309/3600 ≈ 8.6%）→ placeholder UX + future link 引導使用者 contribute（M7 stretch）
- **Stopwatch 與 reading timer 計時衝突**（同時 mock + 計算 reading-loop time）→ mock 期間 reading-loop 必須 pause（不重複算）；spec 中明示
- **Idle threshold 90s 對 mock 太嚴**（思考難題可能停超過 90s）→ 提升到 180s for mock context（reading 不變）
- **未明確 OOS items（leaderboard / AI 評語 / 自訂科別比例）**→ design.md 已在 Non-Goals 中顯式 lock，依 project.md 對齊

## Migration Plan

- Dexie schema bump v(current+1) — pure additive `mockAttempts` store，既有玩家資料 0 影響
- 既有 reward state 不變（mockExamPass 是新 entry，向下相容）
- Deploy：跟一般 PR 流程，build → push → GH Pages action（無 backend，無 rollout 風險）
- Rollback：若 mock burst 公式錯誤 → 後續 patch PR 改 REWARD 表 `mockExamPass`，玩家既有 mockAttempts 不需 reset

## Open Questions

1. **questions.json 是否已 surface `year` + `paper`？** — task 1.1 第一步驗證
2. **Idle threshold for mock**：90s（reading-loop default）vs 180s（思考難題容忍）— 預設 180s，dogfood 後調
3. **per-correct bonus 公式**：+0.5 stamina/answer vs 其他分佈 — 預設 +0.5 stamina，dogfood 後調
4. **缺詳解題的「contribute link」**：MVP 不做，M7 stretch
5. **Picker UI 排版**：年份 × 醫一/醫二 二維 grid vs 兩個 dropdown（年份 + 醫一/醫二）— design.md 預設 grid（一眼看到所有原卷），實作時可能因螢幕窄改 dropdown
