## Context

4 屬性 `knowledge / reflex / memory / stamina` 是 dogfood 階段的核心進度指標。當前狀態：

| Stat | 來源 | 狀態 |
|---|---|---|
| `knowledge` | `REWARD.quizCorrect.stat`（quiz 答對 +1） | ✓ wired |
| `stamina` | `REWARD.readPerMinute.stat`（閱讀每分鐘 +1） | ✓ wired |
| `reflex` | — | ❌ no source, stays 0 |
| `memory` | — | ❌ no source, stays 0 |

[`engine-rewards/spec.md`](../../specs/engine-rewards/spec.md) lock 了 REWARD 必須剛好 5 entries，且 modifying 任何 entry 都是 breaking change。本 change 接受這個 cost 走 spec MODIFIED 流程，因為「stat schema 宣稱有 4 個 stat 但只有 2 個有來源」本身就是 spec 不完備的訊號。

## Goals / Non-Goals

**Goals:**

- 讓 4 條 stat bar 全部會動（基本 dogfood signal）
- REWARD 表 5 → 7 entries，自然擴展不破壞既有 contract（既有 5 entry 的數值與 stat 全保留）
- QuizModal 加 elapsedMs 追蹤是 enabling capability，未來想加 streak / time-pressure 不用再改 modal
- 4 條 stat 對玩家可發現性 — CharCard hover tooltip 講清楚怎麼成長

**Non-Goals:**

- 不重新平衡 knowledge / stamina 既有 reward rate（無 dogfood data）
- 不做 skill tree modal（dedicated UI 等 stat 系統有東西可看再做）
- 不加 streak / chain bonus（複合條件）
- 不引入 settings / tunable threshold（hard-coded `FAST_ANSWER_THRESHOLD_MS = 10000`，dogfood 後再調）
- 不解 `Player.stats.reflex` 上限（既有 bar 就 `min(100, eff)` clamp display，stat 內部可超過 100 — 不破壞 mechanic）

## Decisions

### Decision 1: reflex 用「答題速度」而非 streak / chain

**選擇**: 答題 elapsed time < 10s 且 **答對** → +1 reflex
**理由**:
- 反應 (reflex) 的詞意自然映射到速度
- 對 國考 prep 有真實 transfer value（實考一階 ~1 min/題 中位數，快答訓練實用）
- Streak 是復合條件（需 player.state 加新欄位），且 streak 在內容換主題時容易斷不公平
**Alternative considered**:
- Reflex from streak（連 N 題對 +1） — 否決：跟 quiz-runner spec「Reward batched after modal close」會打架（streak 需 mid-session 狀態），且打亂主題時 streak 斷掉不公平
- Reflex from any fast answer（含答錯） — 否決：rewards guessing 行為，dogfood 期間怕被 cheese

### Decision 2: memory 只用 SRS review-mode，不含 reading-mode 答題

**選擇**: 只有當 `mode === 'review'` 的 SRS due card 答對才 +1 memory
**理由**:
- Memory 是「長期記住」的能力，剛學的 reading-mode 題目答對不該當 memory（那是 knowledge）
- SRS review 是 spaced repetition 第 2+ 次見到的題目，答對才真的證明記住了
- 跟 quiz-runner spec 既有 `mode='review'` 概念對齊，不增加新狀態
**Alternative considered**:
- 任何 quiz 答對都 +memory — 否決：跟 knowledge 重複，且 memory 會跟 knowledge 同步成長變成「無差別 bar」
- Memory 依 SM-2 interval 加權（interval 越長加越多） — 否決：複雜化、dogfood 無法快速驗證

### Decision 3: fast answer 不重複給 XP，只給 stat

**選擇**: `REWARD.quizFastAnswer = { xp: 0, subjectXp: 0, stat: { reflex +1 } }`
**理由**:
- XP 已經由 `quizCorrect.xp = 10` 給過，重複給 XP 會破壞 levelling curve
- Stat 是獨立 progression，可以單獨累加不重複
- 同理 `srsReviewCorrect.xp = 0`（XP 由原本的 quizCorrect 路徑給）
**Effect**: Reward table grows in stat dimension, not in XP dimension. levelling 速度不變。

### Decision 4: elapsedMs 追蹤位置在 QuizModal（component-local state）

**選擇**: QuizModal `useState<number | null>(null)` 存 `currentQuestionStartedAt`，每次切到新題重設；submit 時計算 `Date.now() - startedAt` 傳給 onAnswer。
**理由**:
- 純 UI side，不需放進 db.srs / player.state
- 跟既有 modal lifecycle 對齊（modal close 後狀態消失即可）
- Side-effect free：startedAt 不影響 SRS 算法、不影響 XP
**Alternative considered**:
- Store in `db.srs.<questionId>.lastAnswerMs` — 否決：要 schema migration，且只用在當下 session

### Decision 5: CharCard tooltip 用 native `title` 屬性

**選擇**: `<div className="stat-row" title="<成長條件描述>">`
**理由**:
- Zero CSS / new component overhead
- 跨 device support（hover desktop / long-press mobile）
- 不阻塞螢幕閱讀器
**Alternative considered**:
- 自製 tooltip popover — 否決：在這個 change 範圍是 over-engineering（per coding_principles 原則 2 Simplicity First）

## Risks / Trade-offs

- **[Risk] 玩家發現 fast answer 後刻意背答案而不是讀題** → Mitigation: 只獎勵答對 + fast，背錯沒獎勵；threshold 10s 對需要思考的題目算合理；後續若觀察到 grinding，調 threshold 為 5s 或加 cooldown。本 change 不預先優化。
- **[Risk] Native `title` tooltip 在 mobile 不顯示** → Mitigation: 接受 — dogfood 主要是 desktop / iPad。本 change 不為 mobile 做特殊 UX。
- **[Trade-off] 「memory 只在 review-mode 給」會讓沒到 due 日期前 memory 不動** → 接受 — 這就是設計意圖（memory = 隔時記住）；SRS due queue 已 surface（前一個 change），玩家有入口
- **[Trade-off] REWARD 表 5 → 7 entries 觸發 engine-rewards spec MODIFIED** → 接受 — 這個 spec 自己的 discipline 規則就是要求這樣做，按規矩走比繞過好

## Migration Plan

無 — 純擴展，既有 Player save state 的 `stats.reflex` / `stats.memory` 已是 0（schema 從 day 0 就有 4 個 stat），新 reward 從 0 開始往上加，不需 migrate。
