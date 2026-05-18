## Context

`apps/medexam2-hospital-tw` (二階 hospital mode) 已上線 (M_2nd shipped 2026-05-15)。dogfood 兩週後浮現的真實痛點：玩家會在熟悉科別反覆答題、冷門科別 mastery 永遠 0%。導致：

- **內容覆蓋失衡**：14 個 subject 中只有 5–6 個被認真摸過
- **國考備考偏食風險**：dogfood 對象（作者本人 = 一階 + 二階考生）剛好複製真實偏食習慣，game 沒提供 anti-偏食 nudge
- **既有 mentor-daily 力道不足**：每天只一題、SRS due 永遠優先（手上有 due 卡時 weak-subject layer 永遠不觸發）

現有可 reuse 的 infrastructure：

- `hospital-mastery` spec — `mastery[subjectId].{correct, total}` 已 wire；只增不減 invariant
- `questionHistory` table — 已記 `lastAnsweredAt` / `attempts` per question + denormalized subjectId
- `hospital-events` spec — 已有 7 種隨機事件 + tick-based trigger scheduler 範本可學
- `mentor-daily` spec — `MentorDialog` + skip semantics + streak integration 可直接 fork
- `recruitment-gacha` spec — 既有 doctor sprite roster pipeline + theme-pack pixel-art style

## Goals / Non-Goals

**Goals:**

- 提供 anti-偏食 nudge：把冷門科別題目「主動推到」玩家面前
- diegetic 敘事整合：ER consult 是醫院真實 workflow，符合 hospital mode 經營主題
- 強 reward incentive 補償強制中斷：1.8× XP（高於 mentor 1.5×）
- skip / settings toggle 留逃生口：低耐性玩家可關掉、避免變壓力源
- 不破壞既有 invariant：mastery 仍只增不減；hospital-events 單事件 channel 不被污染

**Non-Goals:**

- ❌ 不做雲端同步 ER consult log（純本機 telemetry）
- ❌ 不做 ER consult 排行榜 / 成就（M6 social light 才考慮）
- ❌ 不做 ER consult 專屬 cosmetic 解鎖（先 ship 核心 loop，cosmetic 後續再加 change）
- ❌ 不修改任何既有 spec 的 requirement（純 additive capability）
- ❌ 不做多階段對話（NPC 只說一句 → 題目 → 反饋，與 MentorDialog 同等 footprint）

## Decisions

### 1. 為什麼用獨立 capability `er-consultation` 而不擴充 `hospital-events`？

**選 A：新 capability `er-consultation`** ← 採用
**選 B：在 `hospital-events` spec 加第 8 種事件**

**理由**：

- ER consult 跟現有 7 個 event 性質根本不同：events 是 outcome-driven（觸發 → 解鎖 / 損失 counter），ER consult 是 quiz-driven（觸發 → 答題 → reward）
- ER consult 需要 question-picker / subject-selector / SRS-integration 邏輯，hospital-events spec 沒這些抽象
- 把 quiz 邏輯塞進 events spec 會違反「单一职责」— events spec 已 248 行，再塞會難維護
- 獨立 capability 讓未來「ER 多題 chain consult」「VIP consult」之類 extension 有 namespace

**Trade-off**：兩個 spec 都各自定義「single-modal-at-a-time」規則 → 需 cross-spec 互斥契約寫進新 spec 的 requirement，避免兩個 modal 同時 pop。

### 2. 「冷門科別」如何定義？

採 **two-layer score**：

```
score(subject) = w1 × normalize(recentAttempts7d^-1)
               + w2 × (1 - masteryPct)
               + w3 × random_jitter

where:
  w1 = 0.6  (recency weight, primary signal)
  w2 = 0.3  (mastery weight, secondary signal)
  w3 = 0.1  (random tie-break)
```

採 score 最高的 subject。

**選擇理由**：

- 純「最少答題」會死循環在某 1 科（永遠是最少 → 答了還是最少）
- 純「mastery 最低」對新玩家無意義（全部都 0%）
- 加 random jitter 讓相近 score 的 subject 輪流出現，避免 deterministic 重複

**Alternative 考慮**：

- 純「last answered 最久」— 簡單但太剛性
- LLM-driven dynamic difficulty — 過度工程化，dogfood 不需要

**Edge case**: 新玩家 7 天內所有 subject 都 0 attempts → score 退化為純 mastery + random → 公平輪轉

### 3. 觸發節奏 — 為什麼 in-game time 而不是 wall-clock？

採 **in-game session time 每 8 分鐘 ± 2 分鐘 jitter roll**（base rate 100%，由 jitter 控制 cadence），呼應 `hospital-events` 的 session-paused-aware 設計。

理由：

- 玩家 idle / app 背景時不算經過時間 — 避免「打開 app 就被一堆 consult 砸」
- 跟 reading-loop spec 的 `visibilitychange` + idle > 90s pause 設計一致
- 8 分鐘 ± 2 分鐘 = 平均 1 小時 session 觸發 ~7 次，可接受不打擾
- 不採 reputation-scaled rate（不像 hospital-events）— ER consult 是教學機制，不該被聲望「懲罰」

**互斥規則**（hard requirement）：

- ER consult roll 前先檢查 hospital-events `currentEvent` 是否 pending → 是 → skip 本次 roll
- ER consult 自己 pending（玩家還沒答 / 沒 skip）→ 不重複 roll
- Mentor daily question 對話開著 → skip 本次 roll
- 任何 quiz session active（玩家正在答考古題）→ skip 本次 roll

### 4. Reward 公式 — 為什麼 1.8×？

| 機制 | 多倍率 | 理由 |
|---|---|---|
| Normal quiz | 1.0× | base |
| Mentor daily | 1.5× | 補償「每日固定」儀式感 |
| **ER consult** | **1.8×** | **補償「強制中斷玩家正在做的事」摩擦 + 鼓勵接題** |
| Mock exam boss | 2.0× | 已是 boss-tier reward |

1.8× 介於 mentor 跟 mock exam 之間，避免：

- 太低（≤ 1.5×）→ 玩家直接 skip，feature 死掉
- 太高（≥ 2.0×）→ 玩家放棄正常 quiz 等 ER consult 出，破壞主 loop

dogfood 觀察 2 週後可依 telemetry 微調（同 hospital-events 的「dogfood 一週調權重」紀律）。

### 5. 答錯處理 — 不扣 mastery，沿用 SRS

**Hard constraint**: `hospital-mastery` spec requirement 1 明寫「Neither field SHALL ever decrement」。所以**不能**扣 mastery。

採用 mentor-daily 同款規則：

- 答對：`quizCorrect.xp × 1.8 × streakMultiplier` + knowledge +1 + mastery `{correct+1, total+1}`
- 答錯：`quizWrong.xp` (2 XP no multiplier) + mastery `{correct+0, total+1}` + 自動 enqueue SRS（同 quiz wrong-answer path）
- ER 醫師 dialogue 變「下次幫忙」+ 顯示 correct answer + explanation
- Skip：no XP / no mastery change / 從 `erConsultActive` 移除（不重複 roll 同一題）

### 6. Sprite gen 路由 — 為什麼 codex 不是 Gemini？

依 `~/.claude/imports/image_gen_routing.md`：

- 既有 19 個 doctor sprite 全部走 codex CLI（GBA 16-color pixel-art + native 透明 bg）
- ER 醫師 sprite 必須跟 roster 一致 → Gemini 後製 chroma-key 風格會有微妙不一致
- 只 1 張 sprite，~3 min wall + 30K tokens reasoning，成本可接受

**範本 prompt**（pattern 參考 `add-doctor-sprite-roster`）：

```
GBA-era pixel art portrait, 384x384, transparent background, 16-color palette,
emergency department physician (急診醫師), white coat over teal scrubs,
stethoscope, slightly worried/urgent expression, clipboard in hand,
front-facing 3/4 view, consistent with existing hospital doctor roster style.
```

可選擇做 1 張 (neutral) 或 2 張 (neutral + worried) frame — MVP 先 1 張，後續視 dogfood feedback 再加。

### 7. Settings toggle 預設 ON 但 first-time 顯示 onboarding tooltip

第一次觸發 ER consult 時，顯示 one-shot tooltip：「💡 急診照會 = 隨機跨科 consult，可從設定關閉」。tooltip 顯示後寫 `player_state.settings.erConsultOnboarded = true`，之後不再 nudge。

避免玩家「為什麼一直跳出來打斷我」的 confusion → 直接告知 + 給逃生路徑。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 玩家覺得太煩、關 toggle 比例高 | 預設 8 min jitter cadence 偏稀疏；first-time onboarding 明告「可關」；telemetry 追 toggle-off rate，> 30% 就降頻 |
| 冷門 specialty selector 真的把同一科一直丟出來 | random jitter w3=0.1 + 同 subject 7 天內已觸發過 ≥ 3 次降權；極端情況採 7-day rolling cooldown per subject |
| 跟 hospital-events 同時觸發、雙 modal 撞 | Hard requirement: ER roll 前檢查 hospital-events `currentEvent`，pending 就 skip 本次 roll（不是 queue） |
| Telemetry log 無上限暴漲 | `erConsultLog` rolling cap 500 rows，超過從 oldest 刪 |
| Sprite 不過關 / codex 卡牆 | Fallback 用既有 mentor-male 或某張現成 doctor sprite；先 ship 功能，sprite 後補也行 |
| 改 Dexie schema 漏 migration → 既有玩家炸 save | v? → v?+1 純加性（只加 table、不動 row），參考 mentor-daily backlog table 加法的 zero-incident migration |
| 1.8× reward 失衡 → 玩家放棄正常 quiz 等 ER consult | Cadence 限制 = 平均 7 次/小時，總 reward 上限可控；dogfood 2 週看實際 XP 來源分佈再調 |

## Migration Plan

1. **Dexie schema bump**（v? → v?+1）— 加 `erConsultLog` table + `erConsultActive` singleton key；v3 → v4-style 加 table、不動既有 row
2. **Feature flag**: 透過 settings toggle default ON 上線，dogfood 自己跑一週
3. **Telemetry collection**: 一週後抓 `erConsultLog` 數據看 (a) trigger rate (b) answer accuracy by subject (c) skip rate
4. **Tuning round**: 依數據調 cadence / score weights / reward multiplier
5. **Rollback strategy**: 如果嚴重炸（玩家大量回報 / dogfood 體驗差），把 `tick.ts` 內 ER roll handler 直接 early-return（一行 patch），settings toggle 預設改 OFF，不需 rollback schema

## Open Questions

1. **ER 醫師對話池**：要做幾個 greeting variant？mentor-daily 是 5 個 — 沿用 5 個是否夠？是否要分 「冷門 specialty 警告」 / 「請求支援」 / 「教學機會」 三類 tone？→ MVP 先一律「請求支援」tone × 5 變體，後續 expand
2. **Cosmetic 解鎖**：proposal 提到 「連續 3 次答對 ER consult 解鎖隱藏 ER 識別證 cosmetic」 — 本 change 不做（單獨開後續 change `add-er-consult-cosmetic`）。本 change 只埋 trigger event 給 cosmetic system listen
3. **跨 spec 互斥契約**：ER consult ↔ hospital-events ↔ mentor-daily 三方互斥規則是否需要寫進共用 `hospital-modal-orchestration` capability？→ MVP 先在 `er-consultation` spec 寫單方向檢查（ER 讓另兩個），不開新 capability；如果未來再加第 4 種 modal type 才重構
4. **觀察 ER consult 對 reading-loop 中斷的影響**：玩家在 reading mode 累積 reading XP 時被 ER consult 打斷會否引發體感不爽？→ 建議 reading-loop 進行中也 skip ER roll（加入互斥規則），dogfood 觀察
