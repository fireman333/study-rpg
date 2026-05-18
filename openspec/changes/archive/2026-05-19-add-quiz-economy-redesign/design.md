## Context

二階 medexam2-hospital-tw 既有經濟架構：

- Tick loop ([apps/medexam2-hospital-tw/src/lib/tick.ts:115-128](apps/medexam2-hospital-tw/src/lib/tick.ts:115))：`deltaRevenue = effectiveThroughput × elapsedMin`、`deltaReputation = effectiveThroughput × elapsedMin`（revenue 與 reputation 以同 rate 累積；reputation 不會被 salary 扣，revenue 會）
- Throughput 公式 ([packages/content-medexam2-tw/src/rooms.ts:40](packages/content-medexam2-tw/src/rooms.ts:40))：`baseRate (10) × powerMultiplier × roomFacility × affinityBonus`
- 進帳唯一觸發：玩家手動開 reading session，否則 tick idle = 零累積
- 既有 specialty multiplier ([packages/content-medexam2-tw/src/specialty.ts:31](packages/content-medexam2-tw/src/specialty.ts:31))：P1 1.5 / P2 1.3 / P3 1.2 / P4 1.1 / P5 1.05，**目前只乘到 mastery.correct，不碰 revenue/reputation**
- Tier upgrade ([packages/content-medexam2-tw/src/clinic-tiers.ts:21](packages/content-medexam2-tw/src/clinic-tiers.ts:21))：reputation single gate（48k / 192k / 2M）+ diversification gate（P5 5 / P3 8 / P2 10+P1）
- Tickets ([packages/content-medexam2-tw/src/recruitment.ts:83](packages/content-medexam2-tw/src/recruitment.ts:83))：`INITIAL_TICKETS=10`、`TICKET_CAP=99`、daily +1、fate card 偶發

設計約束（grill 結論）：
1. baseline 永遠允許 quiz 賺 revenue/rep（不要 mania toggle）
2. reading session 變 buff、不再是進帳唯一管道
3. tier 升級 quiz-only 玩家可達
4. doctor partner 仍是核心系統（specialty multiplier 變實際進帳）
5. 30-day full-clear anchor 反推所有常數

## Goals / Non-Goals

**Goals:**
- Quiz 答對 = first-class income source（revenue + reputation + ticket 三種獎勵）
- Reading session 從「必開」變「想開」（×1.5 buff）
- Doctor 招募/分派仍有強烈動機（specialty multiplier 進實際進帳）
- 典型玩家 30 min/day × 30 days 達成全 tier 升級 + 全 14 banner 解鎖
- 所有常數標 `// TUNED 2026-05-18 — first dogfood pass`、預期 1-2 週 dogfood 後 retune

**Non-Goals:**
- 不引入 mania mode toggle UI 或 player-facing setting
- 不改 Dexie 現有 schema（gameCounters / tickets / affinity / questionHistory 結構不動；新增 1 個 local-only table `bannerUnlockBonusLog`）
- 不調 SRS scheduler / mastery 公式
- 不改 cosmetic milestone（M5 系統獨立議題）
- 不改 affinity 累積邏輯（仍 1 per correct）
- 不改 cloud sync table 結構

## 1-Month Full-Clear Math Model（核心 section）

### Typical Player Profile

- **Total play time**: 30 min/day × 30 days = **900 min**
- **Time allocation**:
  - Pure quiz grinding: **~600 min**（66%；包含獨立 quiz session 與穿插 quiz）
  - Reading session active: **~200 min**（22%；其中 ~100 min 與 quiz overlap → 享受 ×1.5 buff）
  - Gacha / roster admin / event handling: **~100 min**（11%；不直接累積經濟）
- **Quiz pace**: 30 sec/correct（含讀題 + 答題 + 看 explanation）
  - Pure quiz 600 min → ~1200 correct attempts
  - 假設 80% correct rate → ~960 fresh correct（含 SRS due 重複作答的 ~240 不算 fresh）
  - 修正：取「fresh correct」≈ 1000 個 distinct questionId（含 SRS 重練扣除後估值，配合 14 科平均覆蓋）

### Per-Correct Reward Constants（反推）

設計目標：玩家 day 30 累積 reputation 應略高於 tier 3 threshold（150k）以順利升 medical center。

**反推 `QUIZ_REPUTATION_PER_CORRECT_BASE`**:
- Day 30 reputation budget needed: ~150,000（含 buffer 跨 tier-3 gate）
- 來自純 quiz: ~1000 fresh correct × BASE × avg_specialty_multiplier ≈ 1000 × BASE × 1.15
- 來自 buff quiz: ~200 buff correct × BASE × avg_specialty × 1.5 ≈ 200 × BASE × 1.725
- 來自 idle reading: 200 min × avg_mid_throughput × `READING_IDLE_RATE_REDUCTION` ≈ 200 × 80 × 0.3 = 4,800
- 來自 fate card / event: ~5,000（estimated）

設 BASE = 80：
- Pure quiz: 1000 × 80 × 1.15 = 92,000
- Buff quiz: 200 × 80 × 1.725 = 27,600
- Idle reading: 4,800
- Events: 5,000
- **Total = 129,400 rep at day 30**（slightly under 150k，留 buffer 給玩家技能不齊）

`QUIZ_REPUTATION_PER_CORRECT_BASE = 80`、`QUIZ_REVENUE_PER_CORRECT_BASE = 80`（rev=rep parity 沿用現有 tick 公式 invariant；revenue 之後再被 salary 扣）

### Tier Threshold Calibration（反推）

| Tier transition | 目標 day | 預期累積 reputation | Threshold（新） | Threshold（舊） |
|---|---|---|---|---|
| 診所 → 區域醫院 | Day 10 | ~38,000 | **30,000** | 48,000 |
| 區域醫院 → 醫學中心 | Day 20 | ~80,000 | **80,000** | 192,000 |
| 醫學中心 → 國家級教學醫院 | Day 30+ | ~129,000 | **150,000** | 2,000,000 |

`國家級教學醫院` 為終局 tier，threshold 設 150k 而非 130k 是為了讓 day 30 玩家有「再玩幾天就到」的尾韻而非 over-shoot 後沒事做。

### Ticket Grant Math

- Daily passive: 30 × 1 = 30 tickets
- Banner unlock bonus: 14 × 1 = 14 tickets（lifetime cap）
- Per-N-correct (N=25): 1200 / 25 = 48 tickets
- Fate cards estimated: ~10 tickets
- **Total earned over 30 days: ~102 tickets**（cap at 99，超出部分視為 wasted — 反映 active 玩家應該 spend 而非囤）
- **Player consumption estimate**: ~80 rolls（針對解鎖 banner 全 14 科 + replay 想要的 P3+ ~5-10 次）
- **End-of-month 預期持有**: ~20-30 tickets（健康）

### Reading Session 角色重塑

**Before**: 唯一進帳觸發；不開 = 零經濟
**After**: ×1.5 buff overlay + 30% idle accrual
- 不開 reading session：quiz 純照 BASE 公式進帳；無 idle
- 開 reading session：quiz × 1.5 buff + idle 30% rate 並存
- Reading session 結束：buff 失效，後續 quiz 立即恢復 1.0×

`READING_IDLE_RATE_REDUCTION = 0.3` 對既有 idle rate 是大砍，但補強 quiz 路徑後總 reward budget 仍 net positive（mid-game 區域醫院 60 min 開 reading + 不答題 = 80/min × 0.3 × 60 = 1,440 rep；同樣 60 min 純 quiz 答 120 題 = 120 × 80 × 1.15 = 11,040 rep — 純 quiz 是 idle reading 的 7.7×）

## Decisions

### D1: Quiz reward formula = constant base × specialty × reading-buff（捨棄 dynamic throughput coupling）

**選項**：
- (a) `revenuePerCorrect = currentThroughputPerMin × 0.5min × 1.3 × specialty`（隨玩家 hospital 規模 scale）
- (b) `revenuePerCorrect = BASE × specialty × (readingActive ? 1.5 : 1.0)`（固定基礎、扣掉 throughput 耦合）

**決策**：選 (b)。理由：
- (a) 在 fresh save 時 throughput = 0（無 doctor assigned），quiz 變零獎勵 — 違反「quiz baseline 永遠有進帳」設計目標
- (b) 數字可預測，玩家不需要先理解 throughput 公式才知道 quiz 值多少
- (b) 跟 reading-session idle 進帳天然解耦，不形成「越多 doctor 越強化 quiz、自我加強」循環
- Trade-off：(b) 後期玩家覺得 quiz reward 沒成長感 → 可在 dogfood 後加 tier-scaled buff（例如 `× tier_multiplier`），不在本次 land

### D2: Reading session idle rate × 0.3 而非完全砍掉

**選項**：
- (a) Reading session idle 進帳完全拿掉（只剩 buff 角色）
- (b) Idle rate × 0.3（保留弱 idle，鼓勵 doctor 招募 + assign）

**決策**：選 (b)。理由：
- Doctor / room assignment 是 first-class 系統（grill Facet 4），idle 進帳給「我招來的醫師有在工作」的可見性
- × 0.3 讓 idle 不再是主力但仍有意義（mid-game 60 min idle ≈ 1,440 rep）
- 完全拿掉會讓玩家質疑「為什麼還要招募 / 分派 doctor」

### D3: Per-N ticket grant N=25 而非 20

**選項**：
- (a) N=20: 1200/20 = 60 tickets + 14 unlock + 30 daily = 104 → 超 cap
- (b) N=25: 1200/25 = 48 tickets + 14 + 30 = 92 → 舒適在 cap 內
- (c) N=30: 1200/30 = 40 tickets + 14 + 30 = 84 → 偏低，遊戲後段易感覺缺券

**決策**：選 (b) N=25。28% 的 fresh correct 觸發 +1，pacing 順、cap 不溢。

### D4: Banner unlock bonus 用 local-only Dexie table 紀錄

**選項**：
- (a) 用 affinity row 新增 `unlockBonusGranted: boolean` 欄位 → schema migration
- (b) 用新 table `bannerUnlockBonusLog` 紀錄發過 bonus 的 subjectId 集合（local-only，無 cloud sync）
- (c) 用 `playerPreferences` table（既有的 cloud-sync 表）裝一個 JSON array

**決策**：選 (b)。理由：
- (a) 觸發 Dexie schema migration（v5），影響 cloud sync table 列表，complexity 過高
- (c) cloud sync 必要性低 — banner unlock 跨裝置時 affinity 已 sync 過去（client 偵測到該 subject affinity ≥ threshold 即可決定是否該發 bonus，本地有 log 紀錄就不會重發）
- (b) 純 local append-only 紀錄，跨裝置「首次解鎖」可能在每台裝置各發一次 → 接受這個輕微 over-grant（10-14 tickets total，不破壞經濟）

實作：
```ts
// db/schema.ts — new table
this.version(5).stores({
  // ...existing
  bannerUnlockBonusLog: '&subjectId', // primary key = subjectId
})

interface BannerUnlockBonusLogRow {
  subjectId: SubjectId
  grantedAt: number // epoch ms
}
```

### D5: Specialty multiplier 從 mastery-only 擴展 application scope

**選項**：
- (a) 既有 `getSpecialtyMultiplier()` 多一個 callsite (quiz-rewards.ts)，但 `hospital-specialty-bonus` spec 的「mastery-only」requirement 改為「mastery + revenue + reputation」
- (b) 複製一份 `getQuizRewardMultiplier()` 重複常數表
- (c) Quiz 不吃 specialty multiplier（保持原 mastery-only scope）

**決策**：選 (a)。理由：
- (a) Single source of truth，dogfood 調表只改一處
- (b) 重複常數風險高（兩處不同步）
- (c) Doctor 招募變沒實質作用（違反 grill Facet 4 結論）
- spec 改動：`hospital-specialty-bonus` 既有「Mastery-only application scope」requirement 改為「Mastery + quiz reward application scope」並 list 哪些 scope 仍排除（affinity / SRS / unlock thresholds 仍不吃）

## Risks / Trade-offs

- **[Existing saves 玩家 reputation rate 降速感受]** → Mitigation：tier threshold 同步大降，淨體驗是「進度條看起來爬得比舊版快」。Day 1 玩家 quiz 5 題立即看到 +400 rep，遠強過舊版開 session 等 5 min 看到 +50 rep
- **[後期 quiz reward 沒 scale 感]** → Acknowledged D1 trade-off。Dogfood 後若玩家抱怨「中期 quiz 賺太少」可加 tier-scaled buff（`× tier_multiplier`），不在本次 land
- **[Banner unlock bonus 跨裝置可能多發]** → Acknowledged D4 trade-off。最多 over-grant 14 tickets across N devices，預估實際使用者只有 1-2 裝置，影響 minimal
- **[反作弊：玩家手動編 questionHistory 觸發大量 fresh correct]** → Mitigation：本地 cheat 已可改任何 IndexedDB 欄位，不是本 change 引入的攻擊面；TICKET_CAP=99 自然封頂
- **[Specialty multiplier 同時擴 mastery + revenue 雙寫衝突？]** → Mitigation：分開的 service（`mastery.ts` 寫 mastery、`quiz-rewards.ts` 寫 revenue/rep），都讀同一個 `getSpecialtyMultiplier()` 純函式，無 state 衝突；單 Dexie transaction wrapping 兩者
- **[Reading session buff state 在 quiz 期間切換]** → Mitigation：簡化處理 — buff state 在每次 `applyQuizReward` 呼叫時即時讀取 `gameCounters.currentSessionStartedAt`，不 snapshot；reading session 在 quiz mid-session 結束 → 下一題立即恢復 1.0×
- **[Threshold 從 2M 砍到 150k 對 v3/v4 老玩家衝擊]** → Mitigation：升 tier 是 monotonic（已升的不會降），舊玩家會發現新 threshold 較低 → 立即跳 tier（可能多 tier 連跳），這是正體驗，不是 regression

## Migration Plan

- **Code rollout**: 單 commit land，無 feature flag（grill 結論已決 baseline 接受 quiz reward，不需要 gating）
- **Dexie migration**: v5 新增 `bannerUnlockBonusLog` table — 純新增、無欄位刪除、不破壞舊資料；upgrade hook 不需動 reading session state
- **Existing player onboarding**: 不需 onboarding；玩家下次答題立即看到 +N rev/rep chip 漲，自然 discover；Settings panel 加一行說明文案「答對題目現在會直接加營收與聲望」
- **Rollback strategy**: 
  - revert commit + 手動跑 Dexie downgrade（從 v5 砍掉 `bannerUnlockBonusLog` table）
  - 任何已發放但「revert 不該發」的 reward 不主動 backfill（接受過渡期不一致）
  - 此 change scope 大，建議 dogfood 1-2 週才合進 main，期間若 telemetry 不符預期可整批 revert

## Open Questions

- **後期 quiz reward 是否要 tier-scaled buff**：dogfood 觀察「中期玩家是否覺得 quiz reward 在 區域醫院 / 醫學中心 期太弱」。若是，加 `tier_quiz_multiplier = { 診所: 1.0, 區域醫院: 1.3, 醫學中心: 1.6, 國家級教學醫院: 2.0 }` 跟 D1 並存。預設不 land
- **Reading session buff 是否該對 idle 也生效**：本 change 只讓 buff 乘 quiz reward；idle 進帳保持 30% rate 不變。若 dogfood 後玩家覺得「開 reading session 還是太被動」，可考慮 idle 也吃 buff（× 0.3 × 1.5 = 0.45 rate）。預設不 land
- **Fresh correct 的「fresh」是否該排除 SRS 復習**：當前定義 = questionId 未曾在 questionHistory 出現。但同題二次答對（SRS 復習）也是有效學習行為 — 是否該每 N=100 給 +1 ticket 不論 fresh / repeat？需要 dogfood 看玩家行為
- **Onboarding tutorial 是否要加一步說明新經濟**：M5 已有 tutorial 系統，可在 tier-upgrade-preview 步驟旁加一個「quiz-reward-intro」步驟。本 change 暫不引入（避免 scope 膨脹），跟 M5 維護者另議
