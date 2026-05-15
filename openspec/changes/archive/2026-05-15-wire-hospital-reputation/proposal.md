## Why

`wire-hospital-tycoon-engine` 已 archive 並把 10 個 requirement 鎖進 spec，但留下 5 個 deferred items：subject↔room affinity bonus、per-Q reputation hook、formula shape、currency 分化、tick interval 調整（紀錄於 `openspec/decisions/2026-05-15.md` 11:50 entry）。**Throughput 公式只有 `baseRate × powerMultiplier × roomFacility`**，沒有「對的人放對 room」的策略空間 — 玩家 P1 doctor 隨便丟進任何 room 都拿一樣 reward，二階「醫師專業性」的核心立意失效。本 change 補上 affinity bonus 維度 + per-Q reputation kicker，把答題 → 派遣 → 經營三層 loop 收緊，且把所有常數鎖死好 QA。

## What Changes

- 新增 **`hospital-reputation`** capability，集中本 change 引入的三條 mechanic：
  - **Subject↔room mapping table**（14 二階 subjects → ward/surgery/outpatient 1對1 strict mapping）
  - **Affinity bonus 5 階表**（P1 1.5× / P2 1.4× / P3 1.3× / P4 1.2× / P5 1.1× when subject↔room match; 1.0× when mismatch）
  - **Per-Q reputation hook**（quiz-runner 正答事件 → reputation += 0.3 × 當前 throughput / 60；idle tick 維持 70% 佔比，per-Q 30%）
- **MODIFIED** `hospital-tycoon-engine`：throughput 公式從 `baseRate × powerMultiplier × roomFacility` 改為 `baseRate × powerMultiplier × roomFacility × affinityBonus`；reputation 累積規則從「純 idle tick」改為「idle tick 70% + per-Q 30%」雙來源。Tick interval 維持 5s 不動。
- **Out of scope**（明確 defer）：
  - Reputation 公式 shape（log / sqrt / diminishing）— 仍維持 linear baseline，等 dogfood 數據再另開 change
  - Revenue / Reputation 分化（保持 1:1）— defer 到 `wire-hospital-spend`
  - Hospital tier-up threshold 調整 — 已 lock 在 `clinic-level-up`，本 change 不動

## Capabilities

### New Capabilities

- `hospital-reputation`: 集中聲望計算的三條 mechanic（mapping table / affinity bonus / per-Q hook）。`hospital-tycoon-engine` 仍是 throughput 與 tick loop 的權威 capability；`hospital-reputation` 是「在已知 throughput baseline 之上加上策略性 modifier」的補強層。

### Modified Capabilities

- `hospital-tycoon-engine`: throughput 公式加入 `affinityBonus` 項；reputation 累積規則從純 idle 改成 idle + per-Q 雙來源（占比 70/30）。

## Impact

- **Engine** (`packages/core/`)：
  - `src/lib/quizEvents.ts`（新檔）— 匯出 process-singleton emitter；`emit('correct-answer')` / `on('correct-answer', listener)`。Content-agnostic，一階 + 二階共用 emit code path
- **Content pack** (`packages/content-medexam2-tw/`)：
  - `src/affinity.ts`（新檔）— 匯出 `SUBJECT_TO_ROOM` mapping table + `getAffinityBonus(rarity, doctorSubject, roomType)` helper
  - `src/reputation.ts`（新檔）— 匯出 `createPerQReputationListener({ getRooms, getDoctors, updateCounters })` factory；attach 給 `quizEvents` 並回傳 unsubscribe
  - `src/rooms.ts` — extend `computeThroughput` 接受 affinity bonus 維度（或新增 `computeThroughputWithAffinity` helper，視 minimal diff 而定）
- **App (二階)** (`apps/medexam2-hospital-tw/`)：
  - `src/lib/tick.ts` — throughput 計算改用 affinity-aware 版本；`deltaReputation = deltaRevenue × 0.7`
  - `src/App.tsx` — boot 時 register `createPerQReputationListener`，cleanup on unmount
  - `src/components/RoomCard.tsx` — 顯示 affinity bonus marker（match → `✨1.5×`；mismatch → 無）+ 使用 affinity-adjusted throughput
  - `src/components/DevAffinityControls.tsx` + 未來 quiz UI — call `quizEvents.emit('correct-answer')` after `onAffinityIncrement`
  - Recruitment result modal / DoctorRoster — 顯示「適合 room: <roomType>」hint
- **App (一階)** (`apps/medexam-tw/`)：
  - `src/App.tsx` — `qr.correct === true` 分支裡 emit `quizEvents.emit('correct-answer')`（無 listener，no-op；spec scenario「One階 app does not register hospital listener」要求 shared emit code path）
- **App** (`apps/medexam2-hospital-tw/`)：
  - 主畫面 throughput display 顯示 affinity bonus 標記（match → ✨ 1.5× / mismatch → 1.0×）
  - Recruitment doctor card hover/tap → 顯示「適合 room: <roomType>」hint
- **Tests**：engine `tycoon.spec.ts` 加 4 個 scenarios（P1 match / P1 mismatch / P5 match / per-Q hook）；engine 已有 reputation tick test 需 update
- **Save schema**：無 breaking change — `affinityBonus` 是純 derived value，不存進 IndexedDB；現有 save 直接 forward-compatible
