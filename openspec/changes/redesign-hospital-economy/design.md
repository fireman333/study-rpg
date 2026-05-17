## Context

二階 hospital mode 自 2026-05-15 shipped 後（M_2nd `✓` per `openspec/project.md`），已實裝 8 個 capability（recruitment-gacha / hospital-quiz / hospital-reputation / hospital-tycoon-engine / clinic-level-up / affinity-specialty-bonus 等）。但實際 dogfood 過程觀察到三個結構性問題：

1. **`revenue` 是死欄位**：`grep -rn "revenue.*-=" apps/ packages/` 零個 match。`tick.ts:101` 只寫進去、`HomePage.tsx:152` 只顯示，沒有任何 sink 消耗。
2. **idle tick 跟玩家行為脫鉤**：`runTick()` 每 5 秒自動跑（`TICK_INTERVAL_MS = 5000`），即使玩家不在念書也累積 reputation；offline cap 5 min 但只要回開 app 就補貨。違背「養成型 RPG for exam prep」中「念書 = 進度」的承諾。
3. **單一 reputation gate 被抽運放大**：tier 升級只看 `reputation >= threshold`，但 reputation 累積率 = throughput × time，throughput 又被 `powerMultiplier` 拉開（P1 = 5.0 × P5 = 0.5 → 10 倍差距）。lucky P1 玩家 1.2 小時通關第二階；unlucky P5 玩家 24 小時 — 同一個遊戲玩出截然不同的體驗。

本 change 重新設計營收體系、學習 loop、升級門檻、終局延長機制，目標把中位數玩家 endgame pacing 對齊「30 天累積讀書 200 hr」的承諾。

## Goals / Non-Goals

**Goals:**

- 「念書」變成 hospital tycoon 的唯一進度引擎 — 不念書 = 醫院零產出
- `revenue` 有真實 sink — 進修 + 設施 + 擴建 + 薪水形成「賺 → 花 → 累積 → 賺」閉環
- Tier upgrade pacing dogfood-tunable，中位數玩家 ±20% 命中 30 天 endgame
- Endgame reputation 不會「溢出無用」— 命運卡持續吸收
- 改動 backwards-compatible — 既有玩家 IndexedDB save 不丟失，僅 schema 加欄
- 不破壞 M3 npm publish 的 `@study-rpg/core` 公開 API（economy 機制全部住在 `@study-rpg/content-medexam2-tw`，core 不動）

**Non-Goals:**

- 不改 recruitment gacha 機率分佈（P5 60% / P4 25% / ...）— 這由 `recruitment-gacha` capability 鎖死，不在本 change 範圍
- 不引入「真實貨幣」內購 — 所有 sink 都是 in-game currency（per `openspec/project.md` out-of-scope rules）
- 不做 multiplayer leaderboard 比較 endgame 速度（純單人養成）
- 不改 一階（一階 reading timer 模式跟 二階 study session 是 sibling，共用設計概念但不共用程式碼）
- 不在這個 change 內動 cloud sync — `add-cloud-sync` 是獨立 change，sync engine refactor 跟本 change 互相獨立

## Decisions

### D1. Study session = pure timer mode (option B over A or A+B hybrid)

**Decision**: 唸書 session 是純計時模式，**沒有** quiz / 答題行為。玩家點「開始唸書」進入 reading scene，session 開著期間 tick 跑、reputation/revenue 累積；session 結束 tick 停。答題流程留在 recruitment 招募 banner 內（與 study session 分離），答題正確只增加 `affinity.correctCount`，不再增加 reputation。

**Rationale**:
- 跟一階 reading timer 機制完全 parallel — 設計心智可移植、玩家學一次就懂
- Reading scene 純視覺呈現「醫師看診」氛圍，不額外要求玩家邊讀邊答題（cognitive overload）
- Per-Q reputation hook 跟 idle tick 兩個 reputation source 太分裂；移除 per-Q hook 後 reputation 公式單純化為「session minutes × totalThroughput」
- Quiz 行為的核心激勵已經由 `affinity.correctCount` → 解鎖招募 banner 提供，不需要另外 +reputation 強化

**Alternatives considered**:
- **A. 答題 = 唸書**：每答對一題給 reputation/revenue。Pros: 直接接現有 quiz flow。Cons: 模糊了「reading session」跟「answering quiz」的設計界線，玩家不知道哪個比較重要。
- **A+B 混合**：scene 內可選看書或答題。Pros: 最完整。Cons: 兩個 reward channel 校準成本翻倍，dogfood 變數爆炸。

### D2. Tier upgrade dual-gate — reputation + diversification (AND)

**Decision**: tier upgrade 要同時滿足 `reputation >= threshold` AND `distinctSubjectsAtRarity(>=R).count >= N`。

| Tier transition | Reputation | Diversification (AND) |
|---|---|---|
| 診所 → 區域醫院 | 48,000 | ≥ 5 不同科別（任何 rarity） |
| 區域醫院 → 醫學中心 | 192,000 | ≥ 8 不同科別 P3+ |
| 醫學中心 → 國家級教學醫院 | 2,000,000 | ≥ 12 不同科別 P2+ AND ≥ 1 P1 |

**Rationale**:
- Reputation 單一 gate 被抽運放大；diversification gate 把「廣度」變強制 → P3+ pity 在 30 抽，要 8 個 P3+ 不同科別 = ~240+ rolls，自然延伸 pacing
- 跟 exam prep 主題契合 — 國考要會 10 科不是猛背一科
- Reputation 仍存在以保留 idle game flavor（玩家看到數字一直跳）+ 命運卡 sink 需要它

**Numbers calibration**:
- 假設前期 avg throughput 40/min（3 房 × avg P3-P4 mix）→ 48,000 / 40 = 1,200 min = 20 hr
- 中期 avg 80/min（5 房 × avg P3）→ 192,000 / 80 = 2,400 min = 40 hr 額外（累積 60 hr 但我們對齊 50 hr，留 ±20% buffer）
- 後期 avg 200/min（7 房 × avg P2）→ 2,000,000 / 200 = 10,000 min = 167 hr 額外（累積 217 hr 對齊 200 hr）

**Alternatives considered**:
- 純 `totalStudyMinutes` gate：deterministic pacing 但 reputation 失去存在感
- OR gate（reputation OR diversification）：玩家會找最弱條件 sprint，破壞 dual-gate 設計意圖

### D3. 第 4 個 tier「國家級教學醫院」

**Decision**: `TIER_ORDER` 從 `['診所', '區域醫院', '醫學中心']` 擴成 `['診所', '區域醫院', '醫學中心', '國家級教學醫院']`。

**Rationale**:
- User 要求 3 個 tier transition（對應 20/50/200 hr 三個 milestone）— 現有 3 tier 只有 2 transition，補一個才湊滿
- 醫學中心已是現實中「次頂端」醫院定位（台大、長庚等），國家級教學醫院做為虛擬 endgame 合理（如美國 NIH Clinical Center / Mayo Clinic 等級 metaphor）
- 第 4 tier 新增房間：8 outpatient + 3 surgery + 2 ward = 13 rooms（vs 醫學中心 7 rooms）

**Risk**:
- 增加 `TIER_ROOMS['國家級教學醫院']` 資料 — `clinic-level-up` spec 的「Per-tier room rosters are cumulative supersets (deterministic ids)」必須維持 → 13 個 room id 含前一 tier 7 個 + 6 新 id

### D4. 醫師進修：probability + pity，**不掉 rarity**

**Decision**: spend revenue 試升 rarity，失敗只損營收，醫師留原 rarity。同醫師連續失敗 `N_PITY = 5` 次後第 6 次必中。Pity counter 跨 session 持久化、跨進修等級**不重置**（即 P3 升 P2 失敗 5 次後即使下次先試 P5 升 P4，仍計入 pity）— 確保「醫師個體 ≥ 5 次失敗保護」是強約束。

**Cost / probability table**:

| Tier 升級 | Revenue cost | Base success rate | Pity (連續失敗 ≥ 5 → 第 6 次) |
|---|---|---|---|
| P5 → P4 | 1,000 | 50% | 必中 |
| P4 → P3 | 5,000 | 30% | 必中 |
| P3 → P2 | 25,000 | 15% | 必中 |
| P2 → P1 | 125,000 | 5% | 必中 |

**Rationale**:
- 「失敗不掉 rarity」避免純挫折感（D2/MapleStory 強化卷軸最大痛點是降級）
- Pity 5 次保底符合 recruitment-gacha pity 設計慣例（同 codebase 已有 pity 概念 — `RECRUITMENT_PITY_RULES`）
- Revenue cost 設計成 endgame 玩家在 200 hr 累積後可挑戰 1-2 次 P2 → P1（依後期 200/min × 12,000 min = 2,400,000 revenue，扣掉 facility / 薪水 / 事件後剩 ~500,000-1,000,000）

**Alternatives considered**:
- **Affinity-locked insurance** (我前期提議): 消耗 affinity 換失敗保護。**已撤回** — affinity 是「科別 → 招募」unlock 機制，跟「單一醫師進修」邏輯不接，UX 怪。
- **Material-cost (consume tickets)**: 進修成本含招募券。Cons: 過早切斷招募流程 — 後期玩家會 hoard tickets 不去抽。

### D5. 醫師薪水：proportional × powerMultiplier，保證 default 不破產

**Decision**: 薪水跟醫師 `powerMultiplier` 成正比 — 強者拿高薪、弱者便宜。每分鐘扣款 = `Σ over ALL owned doctors of (powerMultiplier × SALARY_BASE)`。**Bench 醫師也扣薪**。

```
SALARY_BASE = 4   (per powerMultiplier per minute)
```

衍生薪水率表：

| Rarity | powerMultiplier | Salary per minute |
|---|---|---|
| P1 | 5.0 | 20 |
| P2 | 3.5 | 14 |
| P3 | 2.0 | 8 |
| P4 | 1.0 | 4 |
| P5 | 0.5 | 2 |

**Tier-staged activation**:

| Tier | Salary rate multiplier | Onboarding 意圖 |
|---|---|---|
| 診所 | **0%** (grace) | 教學期，純練手 |
| 區域醫院 | 100% | 全速 economy 啟動 |
| 醫學中心 | 100% | 同上 |
| 國家級教學醫院 | 100% | 同上 |

**No-zero invariant**: default 配置在每個 tier 都 net positive。Revenue 不會被 clamp 觸發。**Defensive 0 floor 仍保留**（防 edge case：玩家手動退一堆 P1 醫師 / 修改 IDB / 抽運奇差），但正常玩法絕對不會觸發。

**Rationale**:
- 把 salary 寫成 `powerMultiplier × CONST` → throughput 公式裡也有 powerMultiplier → **assigned 醫師永遠 net positive contribution**（throughput 10 × pm vs salary 4 × pm → 6 × pm 淨收入）
- Bench 醫師才會「光花錢」 — 但 diversification gate 要求 collection，所以 bench 數量受 gate 約束（區域 3 個 bench / 醫學中心 6 個 bench / 國家級 5 個 bench）
- Tier 1 grace 仍保留，給新手 onboarding 時間集滿 diversification gate
- 不需用 tier rate 漸進（70% / 100%）— proportional salary 本身已內建「強者高薪、弱者低薪」的平衡感

**Math check (default config，無 facility 升級 / 無 room 擴建)**:

| 階段 | Doctors / Assigned (default) | Assigned throughput | 全員 payroll | Net |
|---|---|---|---|---|
| **診所** — 5 doctors avg P5, 3 assigned | 5 / 3 | 3 × 10 × 0.5 × 1.0 = 15/min | **0** (grace) | **+15** ✓ |
| **區域醫院** — 8 doctors avg P3, 5 assigned | 8 / 5 | 5 × 10 × 2.0 × 1.0 = 100/min | 8 × 8 = 64/min | **+36** ✓ |
| **醫學中心** — 13 doctors avg P2, 7 assigned | 13 / 7 | 7 × 10 × 3.5 × 1.0 = 245/min | 13 × 14 = 182/min | **+63** ✓ |
| **國家級教學醫院** — 15 doctors (3 P1 + 12 P2), 10 assigned | 15 / 10 | 3 × 10 × 5.0 + 7 × 10 × 3.5 = 395/min | 3 × 20 + 12 × 14 = 228/min | **+167** ✓ |

每個 tier **不投資也微正**。投資（facility / extension）只是放大正值，不是「不投資就破產」。

**Math check (full investment)**:

| 階段 | 配置 | Throughput | Payroll | Net |
|---|---|---|---|---|
| 區域醫院 + 8 房 + facility 2.0 | 8 P3 assigned | 8 × 10 × 2.0 × 2.0 = 320/min | 64 | **+256** |
| 醫學中心 + 10 房 + facility 3.0 | 10 P2 + 3 P2 bench | 10 × 10 × 3.5 × 3.0 = 1050/min | 182 | **+868** |
| 國家級 + 15 房 + facility 3.0 + P1 mix | 7 P1 + 3 P2 + 5 bench | 7 × 10 × 5.0 × 3.0 + 3 × 10 × 3.5 × 3.0 = 1365/min | 228 | **+1137** |

投資後 net rate 翻倍 ~6 倍，玩家有強烈動機升級。

**Alternatives considered**:
- **Fixed salary table (P1 100, P2 60, ...)**: default 配置會 net negative（例 區域 -68/min）→ 違反 user「不能扣到歸零」rule。**已拒**
- **Tier-rate ramp 0/70/100/100%**: 區域階段仍 -18/min，仍違反 no-zero invariant。**已拒**
- **Assigned-only salary**: 缺乏擴張壓力，diversification gate 沒對應的 economy 壓力。**已拒**
- **強制退休機制**: 違反 diversification gate 設計。**已拒**

### D6. Reputation overflow → 命運卡 (fate cards) with consecutive-bad-luck pity

**Decision**: 4 階卡包消耗 reputation，內容池含正向 (招募券 / 進修保證券 / facility / throughput buff) + 中性 (微量營收) + 衰運 (-rep)。**加 pity counter：每階獨立追蹤 consecutive bad luck 次數，連續 3 次衰運後第 4 次強制 reward**。

| 卡包 | Cost | Pool | 衰運機率 | Pity threshold |
|---|---|---|---|---|
| 普通命運（白） | 1,000 rep | 招募券 ×3 / 微量 revenue / 事件免疫卡 | 5% (-1,000 rep) | 3 連衰運後第 4 次必中 reward |
| 稀有命運（藍） | 10,000 rep | 招募券 ×10 / 進修保證券 ×1 / 事件正向觸發券 | 5% (-10,000 rep) | 同上 |
| 史詩命運（紫） | 100,000 rep | 指定科 P3+ 招募券 / facility +0.5 永久 / 1 週薪水免除 | 5% (-50,000 rep) | 同上 |
| 傳奇命運（金） | 1,000,000 rep | 指定科 P2 招募券 / 全院 facility +1 / 1 週 throughput ×2 | 0% | N/A（無衰運） |

**Pity mechanics**:
- 每階獨立追蹤 `consecutiveBadLuckCount[tier]`
- 衰運抽到 → `consecutiveBadLuckCount[tier] += 1`
- Reward 抽到 → `consecutiveBadLuckCount[tier] = 0`
- 抽前 if `consecutiveBadLuckCount[tier] >= 3` → 強制 reward（跳過 5% 衰運判定）→ counter reset 0

**Rationale**:
- Endgame 玩家累積 reputation 持續增加（達標後仍 study session 跑）→ 必須有 sink，否則「reputation 1,000,000 後沒事做」
- 內容池跟其他 sink 整合（招募券 / 進修券 / facility / 事件 / throughput）— 不開新系統
- 衰運機率 ≤ 5% 維持「正向期望值」，符合 gacha 慣例
- **Pity 3 加上來保護重複衰運**：5% × 5% × 5% = 0.0125% 的「三連衰」機率本來就低，但 pity 確保不會出現「8 連衰運讓玩家爆怒」的災難
- 傳奇卡包 cost 1M = endgame 玩家每 ~80 hr 抽一次，剛好夠玩到下次

**Risk**: 內容池設計不平衡 → 傳奇 facility +1 永久 vs 史詩 facility +0.5 永久 倍率差距 → dogfood tune

### D7. Schema migration v4 → v6 (with LWW / MAX-merge row split)

**Decision**: HospitalDB version bump 走兩段：
- **v5**: `add-cloud-sync` change 預留（meta + localBackup 表）— 跟本 change 互不衝突
- **v6**: 本 change 加新表 `monotonicCounters` (MAX merge), `trainingHistory`, `eventLog`, `fateCardHistory`, `retirementLog`；patch `gameCounters.singleton` 加 tutorial / session 欄

**Row split rationale (per audit B3)**:
- `gameCounters` LWW: revenue, reputation, lastTickAt, tier, hasUsedStarterPull, session metadata, tutorial state
- `monotonicCounters` MAX merge: totalStudyMinutes, fateCardBadLuckPity（這兩個 monotonic field，LWW 會 lose progress on conflict — 換機後讀書時間/pity 可能被「shorter」cloud value 蓋掉）
- 分 row 是為了避開 sync engine per-field merge hook 的 infra 改動 — `add-cloud-sync` 走 row-level merge strategy 就好

**Upgrade hook**:
```typescript
.version(6).stores({
  // ... existing v5 stores
  monotonicCounters: '&id',
  trainingHistory: '++id, doctorId, attemptedAt',
  eventLog: '++id, triggeredAt',
  fateCardHistory: '++id, drawnAt',
  retirementLog: '++id, retiredAt, doctorId',
}).upgrade(async (tx) => {
  // 1. Create monotonicCounters singleton if missing
  const monotonic = await tx.table('monotonicCounters').get('singleton')
  if (!monotonic) {
    await tx.table('monotonicCounters').put({
      id: 'singleton',
      totalStudyMinutes: 0,
      fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
    })
  }
  // 2. Patch existing gameCounters with new LWW fields
  const counters = await tx.table('gameCounters').get('singleton')
  if (counters) {
    await tx.table('gameCounters').put({
      ...counters,
      currentSessionStartedAt: counters.currentSessionStartedAt ?? null,
      lastSessionEndedAt: counters.lastSessionEndedAt ?? null,
      tutorial: counters.tutorial ?? { completedSteps: {}, firstVisit: {}, firedTips: {} },
    })
  }
  // 3. Patch doctors with pityCounter = 0 if missing
  await tx.table('doctors').toCollection().modify((d) => {
    if (d.pityCounter === undefined) d.pityCounter = 0
  })
  // 4. Patch rooms with facilityLevel = 1 if missing
  await tx.table('rooms').toCollection().modify((r) => {
    if (r.facilityLevel === undefined) r.facilityLevel = 1
  })
})
```

**Cloud sync table mapping** (per `add-cloud-sync` capability):
- `gameCounters` → existing `hospital_state` cloud table (LWW)
- `monotonicCounters` → **new cloud table** `hospital_monotonic_counters`（須在 `add-cloud-sync` schema 加；sync engine 對此 table 走 max(local, cloud) 而非 LWW）

**Backwards compat**: 既有玩家 v4 → v6 走 chain upgrade。Migration patcher 全部 additive，不會丟資料。

### D8. 看診 scene assets — codex `$imagegen`

**Decision**: 用 codex CLI `$imagegen`（per `~/.claude/imports/codex_image_gen.md` 配方）生成看診 sprites：
- 至少 3 種 room type × 1 種狀態（outpatient / surgery / ward）= 3 張底圖
- 加 8-12 個 doctor sprite overlay（per rarity tier × per common subject）— 已部分存在於 `add-doctor-sprite-roster` change shipped
- 風格繼承 `add-doctor-sprite-roster` 的 GBA-era 像素 8-bit，384×384 PNG transparent bg

**Cost estimate**: 3 + 8 = 11 sprites × ~3 min/sprite = ~33 min codex CLI time。

**Risk**: codex CLI 跑在 hook-injection 干擾下偶有失敗（per `codex_image_gen.md` 反例教訓）→ 從 `/tmp` 跑 batch、避開 SessionStart hook 注入。

### D9. Anti-cheat for session timer

**Decision**: 沿用一階 reading timer 設計（per `openspec/project.md` Failure Modes & Constraints "reading timer must catch visibilitychange + idle > 90s auto-pause"）：
- `document.visibilityState === 'hidden'` → 暫停 tick
- 90 秒無互動（mousemove / scroll / keypress 任一）→ 暫停 tick
- 每分鐘最多 +1 reputation 累積率 cap（per project.md "防刷"）— but 本 change 走 throughput 公式，cap 改成「session minutes 累積不能超過 wall-clock minutes × 1.0」（即不能超過 100% real time）

**Risk**: 玩家可寫腳本模擬 mousemove；接受此風險（per 一階先例），不額外加 captcha。

### D10. 教學提示系統（hospital-tutorial）三層次設計

**Decision**: 三層次提示 — 不同強度給不同情境：

| 層次 | 觸發 | 強度 | UI 形式 |
|---|---|---|---|
| **L1 · 首次玩 onboarding** | 全新 save（無 gameCounters）| 強制 sequential | 7 步 modal flow，每步 gate 在小 action |
| **L2 · Surface 首訪 hint** | 進入新頁第 1 次 | 一次性、可 dismiss | 浮層卡片，講 surface 的核心機制 |
| **L3 · State milestone tip** | revenue / pity / tier 跨門檻 | 通知性、自動消失 | Toast，8 秒 auto-dismiss |

加上**隨時可開的 `❓` help menu** 列全機制，給已 onboard 但忘了的玩家 fallback。

**Rationale**:
- 6 個新 capability + 雙 gate + 4 個 sink + pity 系統 = 玩家認知負荷高
- 一次塞滿 onboarding 會嚇跑新玩家 → L1 漸進、L2 just-in-time、L3 emergent
- L3 toast tips 是「自動展開」mechanic — 不會的玩家不會被打擾、會的玩家可主動察覺臨界事件
- Help menu 跟 settings panel 整合（仿一階）— 不另開新 surface
- `tutorial.completedSteps` / `firstVisit.*` / `firedTips.*` 全存 `gameCounters` JSON blob，不開新 table

**Cost estimate**: 寫 ~20 個 hint 文案 + 7 個 modal + 1 個 help menu + 5 個 toast trigger ≈ 1-2 個 session 的 UI 工。Cloud sync 也需要同步 tutorial state（避免換機後又看一次教學）。

**Alternatives considered**:
- **只做 L1 onboarding，沒 L2/L3**: 玩家忘了機制只能翻 OpenSpec 文件 → 不可行
- **L1 強制全部步驟，不能跳過**: 趕緊上手的玩家會被卡 → 加「跳過」link
- **把所有 hint 包進 sidebar**: 一階沒這個 pattern，學新 UI 反而更累 → 用 modal + toast 跟一階一致

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 數值未經 dogfood，第一版 pacing 可能偏離 30 天 target | clinic-tiers.ts / training.ts / finances.ts 等常數集中在 `@study-rpg/content-medexam2-tw`，一個 PR 改值，重 build 就好 |
| Diversification gate 過硬 → 玩家挫折 | P3+ 10 不同科別 → 8（first dogfood）；可 telemetry 收集中位數玩家通關時間，3 個月內第二版調整 |
| 命運卡內容池失衡（傳奇卡包太強或太弱） | 命運卡 unlock 條件設在「醫學中心 tier 才解鎖」— 中前期玩家不接觸、降低設計風險 |
| 進修保底跨等級不重置可能反直覺 | UI 顯式顯示「該醫師已連續失敗 N 次（達 5 必中）」— pity 透明化 |
| 醫師薪水可能讓新玩家被 revenue 卡 deadlock（薪水 > 收入） | 第 1 階「診所」薪水率打 70% 折扣（玩家還在 onboarding）— 累積保護 |
| 第 4 tier「國家級教學醫院」visual assets 增加開發負擔 | 第一版可重用 醫學中心 scene + 加 banner / 字樣差異化；專屬 sprites 留 follow-up |
| Study session 強制 visibility check 可能讓行動裝置玩家挫折（切 app 一下就 pause） | visibility pause 改成 5 秒 grace period，避免誤觸 |
| 跟 `add-cloud-sync` change 順序問題：兩 change 都改 schema | 本 change 顯式 require add-cloud-sync 先 archive（v5 → v6 chain）；tasks.md prereq 寫清楚 |

## Migration Plan

1. **Prereq**: `add-cloud-sync` archive 完（HospitalDB v5 已 deployed）
2. **Stage 1 — content pack 純改動**（`@study-rpg/content-medexam2-tw`）：新增 `training.ts` / `finances.ts` / `events.ts` / `fate-cards.ts` / `study-session.ts`；改 `clinic-tiers.ts`（加 tier + diversification helper）/ `reputation.ts`（移除 per-Q listener）
3. **Stage 2 — app schema + tick**：`apps/medexam2-hospital-tw/src/db/schema.ts` 加 v6 upgrade chain；`tick.ts` 從 setInterval 改 session-gated；移除 per-Q listener 註冊
4. **Stage 3 — UI pages**：新增 `StudySessionPage.tsx` / `TrainingPage.tsx` / `EventPage.tsx` / `FateCardPage.tsx`；改 `HomePage.tsx`（banner 加 totalStudyMinutes / tier-gate-progress 顯示）
5. **Stage 4 — assets**：codex 生看診 sprites；放 `apps/medexam2-hospital-tw/public/sprites/scenes/`
6. **Stage 5 — verify**：Chrome MCP smoke（cold start → study session 開 → 5 min 後 reputation 增加 → 進修一筆 → 設施升一級 → 命運卡抽一張）
7. **Stage 6 — archive**：`/opsx:verify` 4-dim → `/opsx:archive`

**Rollback**: 純 client-side change + IDB schema 上加（不破壞舊資料）。可隨時用 git revert + 重 deploy。若 v6 upgrade 中發現 bug，patcher 可加 try/catch 跳過、保 v5 行為 fallback。

## Open Questions

1. **TIER 4 房間數量是否合理？** 13 房（vs 醫學中心 7）— 是否會讓 UI 太擁擠？建議第一版 10 房（8 outpatient + 1 surgery + 1 ward），endgame extension 再加
2. **命運卡是否需要「pity counter」**（連抽 N 張普通卡未出大獎後保底大獎）？目前設計沒 pity，純機率 — 是否需要保護？
3. **特殊事件 trigger 模型** — 純隨機（每 N 分鐘 1% 機率）vs 跟 reputation/throughput 掛鉤（VIP 病人在高 rep 機率更高）？傾向後者但需要 dogfood
4. **`totalStudyMinutes` 在 cloud sync 怎麼處理 — RESOLVED**：採 `max(local, cloud)` 而非 LWW（讀書時間是 monotonic，不能下降）。`fateCardBadLuckPity.*` 同理用 max 防止換機後 pity 重置。其他 fields（revenue / reputation / 醫師 rarity）走標準 LWW。Sync engine 需要 per-field merge strategy hook
5. **進修 UI 怎麼呈現「機率」** — 顯示 success rate% 對玩家是否會引起賭徒心理？建議顯示但加「pity counter 距離保底 X 次」緩解
