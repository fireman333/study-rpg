## Context

一階 medexam-tw M5 已 mock-exam ✓ shipped（2026-05-15）。Grill quick (`~/.claude/scratch/grilled-add-mentor-daily-question-2026-05-15.md`) 確定方向：低阻力每日 hook、NPC 沉浸感、SRS due 助推、streak 第三條路。

當前 streak check-in 條件由 `hasMetCheckInThreshold` 看 `todayProgress.readingMinutes` + `todayProgress.questionsAnswered` 達閾值。Mentor 完成只需走 `incrementQuestionsAnswered` +1 自動觸發既有 check-in，不改 engine-rewards streak spec — 這是本 change 跟 grill 結論的關鍵簡化。

Theme-pixel-medical 目前已有 doctor sprite roster（19 個白袍醫師，2026-05-15 從 codex `$imagegen` 生成）。Mentor sprite 走同條路徑、同風格、同生成 prompt 模板。

## Goals / Non-Goals

**Goals:**
- 每天打開 app 看到「今日導師題」chip（home view 加 button）
- 點開 MentorDialog：NPC portrait + 對白 + 內嵌 question + 答題反饋
- 答對：1.5× XP + 走 streak check-in path（不改 streak spec）
- 答錯：少量 XP + 進 SRS queue（沿用 quiz-runner 既有規則）
- Skip：選擇不答，今日不算 streak、題不重出
- 漏一天累積到隔天，cap 5 題（避免 hoard）
- 題目挑法 Hybrid：SRS due 最舊優先 → 弱科目隨機 fallback → 純隨機 fallback
- 全 client-side，無外部 API

**Non-Goals:**
- ❌ 多個 NPC / NPC 個性差異 — 單一 mentor for M5
- ❌ NPC 開放對話 / 閒聊 — UI 互動只有「接受 / Skip」
- ❌ NPC 等級進化 / 成長 mentor — sprite 固定
- ❌ 自訂 NPC sprite / 名字 — hard-code 預設
- ❌ Mentor 答對 reroll 機制 — 答完就答完
- ❌ Backlog 無限累積 — hard cap 5
- ❌ 改 streak spec — 走「mentor 完成 = quiz answered +1」自動 path
- ❌ Mentor 跟 mock-exam 互動 — 完全獨立
- ❌ Mentor question 進 SRS card 規則差異化 — 沿用 quiz-runner 規則（quizCorrect 不入、quizWrong 入）

## Decisions

### D1: Hybrid question selection — SRS due → 弱科目 → 純隨機 fallback

**選擇**：每日題挑選演算法分 3 層：
1. **SRS due**: 從 `db.srs.where('dueAt').belowOrEqual(now).toArray()` 取 `dueAt` 最舊那張的 `questionId`
2. **弱科目**: 若 SRS 為空，從 `player.subjectLevels` 找 `mastery` 最低的科目（或 `xp` 最低），從該科 `content.questions` 隨機抽 1 題（exclude 最近 30 天內答過）
3. **純隨機**: 若所有題都答過 / mastery 100%，從全題庫純隨機

**理由**：grill 答案 Q2 = Hybrid，明確優先 SRS（清 backlog hook）+ 弱科 fallback。30-day lookback 避免昨天剛做過的又被選。Mastery% 最低比 xp 最低更直觀。

**Alternatives 考慮**：
- (a) 全隨機 — 失去「導師意圖」意義
- (b) 加權混合（70% SRS / 30% 弱科）— 機率分佈會讓 SRS due 漏出來，違反「清 backlog」意圖

### D2: NPC sprite ownership — theme-pixel-medical 內

**選擇**：mentor-male.png + mentor-female.png 放 `packages/theme-pixel-medical/src/sprites/`，註冊進 `THEME_PIXEL_MEDICAL.sprites` 字典。

**理由**：
- 跟 doctor sprite roster 同條路徑（fork 友善 — 其他考試 fork theme 時可自由換）
- 跟 character-base / character-base-female 同層（player sprite 也在 theme）
- ThemePack contract 已支援 sprites Record；新增 sprite keys 不破壞既有 fork

**Alternatives 考慮**：
- App-local sprite — 拒絕：theme/app 分離原則破壞，難 fork

### D3: Sprite 隨機選 male / female — 跟 player 性別無關

**選擇**：每次 MentorDialog 開啟時，從 `['mentor-male', 'mentor-female']` 隨機選一個 sprite key 顯示。每天 mentor 不一定同人（戲劇效果 + 不偏性別）。

**理由**：兩款 sprite 共存，避免「mentor 永遠是男 / 女」單調感。也省得加性別偏好設定。

**Alternatives 考慮**：
- 跟 player 性別相反 — 拒絕：默認 player 沒性別概念（character-base / character-base-female 是 cosmetic）
- 固定一款 — 拒絕：浪費另一款 sprite asset

### D4: Streak 整合 — 走「quiz answered +1」既有 path

**選擇**：mentor 完成 = 呼叫 `incrementQuestionsAnswered(player, today, 1)` + 接下來的 `hasMetCheckInThreshold` + `applyCheckIn` 既有 path。**不**改 engine-rewards streak spec。**不**加 mentor-specific check-in 條件。

**理由**：
- Streak spec 已 lock，動它要再開 delta（高 cost）
- 「mentor 完成」語意上 ≈ 「答了一題 quiz」，走 +1 path 自然合理
- 若 mentor + quiz 兩者同日都做，threshold 變更容易達成（這正是 hook 動力）
- 改 spec 的 risk > 直接 +1 path 的 benefit

**Alternatives 考慮**：
- 改 streak spec 加 mentor-specific 條件 — 拒絕：grill open uncertainty 5 推薦此 path

### D5: Reward burst — 1.5× quizCorrect with streak multiplier

**選擇**：
```ts
mentorCorrect: xp = Math.floor(REWARD.quizCorrect.xp * 1.5 * streakMultiplier)
mentorWrong:   xp = REWARD.quizWrong.xp (no multiplier)
```
Stat: 跟 `REWARD.quizCorrect.stat` 一樣 (`knowledge +1`)。若 fast answer (< FAST_ANSWER_THRESHOLD_MS) 加 `quizFastAnswer.stat` (`reflex +1`)。

**理由**：
- 1.5× 對應「導師獎勵 > 普通 quiz」的儀式感
- Streak multiplier 沿用 reading + quiz path 的同一函式（一致性）
- 不加新 REWARD 表 entry —— 計算式直接寫在 mentor-daily.ts，避免動 engine-rewards spec

**Open**：1.5× 數值 dogfood 後可能微調

### D6: Backlog cap 5 + 跨天累積

**選擇**：Dexie `mentorBacklog` singleton 結構：
```ts
{
  key: 'mentorBacklog',
  questionIds: string[],          // pending question IDs, FIFO
  lastAssignedDate: string,        // 'YYYY-MM-DD' UTC+8
}
```
邏輯：
- App mount 時檢查 `lastAssignedDate`：若 ≠ today（UTC+8）且 `questionIds.length < 5` → 跑 question selection algorithm pick 1 題、append；更新 `lastAssignedDate = today`
- 漏多天：若 `lastAssignedDate` 是 3 天前 + 當前 list 2 個，補到 cap 5（每次補一題 picked 演算法獨立跑，不批次同種策略）；若已到 5，silently truncate to 5
- 完成一題 → `questionIds.shift()` pop 第一個
- Skip 一題 → `questionIds.shift()` 一樣 pop（題不重出）

**理由**：cap 5 避免一週沒開累積 7 道；FIFO 確保最老的先處理。

### D7: MentorDialog UI — 獨立 modal，不重用 QuizModal

**選擇**：新元件 `apps/medexam-tw/src/components/MentorDialog.tsx`。Modal overlay 跟 QuizModal / BossModal / RollReveal 一致風格。Layout:
```
┌──────────────────────────────────────┐
│  [NPC sprite 120×120]   今日導師題    │
│                                       │
│  「[NPC 對白 — 開場 variant]」        │
│                                       │
│  ┌─ Question card ─────────────────┐ │
│  │ [subject tag]                   │ │
│  │ [stem...]                       │ │
│  │ (A) ...                         │ │
│  │ (B) ...                         │ │
│  │ (C) ...                         │ │
│  │ (D) ...                         │ │
│  └─────────────────────────────────┘ │
│                                       │
│  Backlog: N pending                  │
│  [Skip]                  [關閉]       │
└──────────────────────────────────────┘
```
答後 feedback：
- 答對：NPC 對白變「correct variant」+ 顯示 +X XP toast → close after 2s
- 答錯：NPC 對白變「wrong variant」+ 顯示正解 + 詳解（沿用 mock-exam 詳解 fallback for 309 OCR-missing）+ 「下一題」按鈕（若 backlog ≥ 1）或「關閉」

**理由**：grill Q4 確認新元件 / 不重用。Mock-exam result 那種長 scroll 不適合單題互動，需 NPC 對白 + 答後反饋緊湊呈現。

### D8: Dexie schema v3 — additive `mentorBacklog` singleton

**選擇**：
```ts
this.version(3).stores({
  mentorBacklog: 'key',
})
```
Migration: pure additive，既有 v1/v2 store 不變、不需 migration code。

**理由**：跟 mock-exam Dexie v2 同 pattern；無破壞性。

### D9: NPC 對白 variants — hard-code 3–5 個 per state

**選擇**：3 個 state × 5 variants = 15 條 hard-code 中文 string。Variants 範例：
- 開場（greeting）：「今天來試試這個」「我覺得這題你要看一下」「來，挑戰一下」「測測你」「這題不錯，做做看」
- 答對（praise）：「不錯！記得這結論」「對！這題重點就在這」「答對了，繼續加油」「漂亮！」「沒問題」
- 答錯（teach）：「沒事，下次會記得」「這個容易混淆」「來看詳解」「再看一遍」「下次注意」

實作：常數 array + `pickRandom()` helper。

**理由**：MVP 不做 i18n，hard-code 最快。Variant 數 5 夠避免單調。Future 可改 theme-pack 自訂。

## Risks / Trade-offs

- **Reward 1.5× 太強 / 弱** → dogfood 3–5 天後依屬性增長感調整；變動只改 mentor-daily.ts 常數，不破壞 spec
- **Backlog cap 5 太低**（heavy user 一週累積 10+ 想全清）→ 改 cap constant，spec scenario 寫的是 cap 不是具體值
- **Hybrid 演算法在 0-due + 弱科 mastery 都 100% 時的 fallback**（純隨機 + UI 訊息「你已通透」）— 預期罕見但要 handle
- **Sprite 風格不一致**（codex 生圖每次風格漂浮）→ 用跟 doctor roster 同一 prompt template + 並指明「同 doctor sprite roster 風格」keywords
- **跨天 race condition**（玩家剛過 UTC+8 0:00 時開 app）→ 用 `getTaipeiToday()` 函式統一邊界，不寫 client-side 時間 hack
- **MentorDialog overlay 跟其他 modal 衝突**（同時開 MentorDialog + InventoryModal）→ z-index hierarchy 跟 BossModal 同層；只允許開一個 modal 用 React state 互斥
- **NPC 男 / 女 隨機選每次 dialog 開啟不同人**（每天看 mentor 不一樣）— 是 feature 不是 bug；不影響 spec scenario

## Migration Plan

- Dexie schema bump v3 — pure additive，0 影響既有玩家
- No engine-rewards spec change → 不影響 mock-exam / boss / streak 既有流程
- Deploy：跟一般 PR 流程，build → push → GH Pages action
- Rollback：若 mentor 公式 / cap 錯，patch PR 改常數，玩家既有 mentorBacklog 不需 reset

## Open Questions

1. **NPC 對白 variant 池**：5 個 / state 夠不夠？M6 再加？
2. **Lookback window for 弱科隨機**: 30 天 hard-code，要不要可調？
3. **Mastery % 計算公式**: 用既有 `SubjectProgress.mastery` 還是另算（基於 correct/total）？— 用既有
4. **MentorDialog NPC 隨機選**：每次開都隨機，還是「今日」固定一款（user 一天看到同個 mentor）？— 後者更穩定，但 D3 寫「每次開」— propose 階段可改
5. **Backlog cap 5 vs 7**: 用 5（保守）；dogfood 後調
6. **首次 onboarding**：第一次 mount 時若 lastAssignedDate undefined，立刻 enqueue 1 題還是等下次 UTC+8 0:00？建議立刻 enqueue（first-day hook）
