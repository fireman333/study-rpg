## Context

`apps/medexam2-hospital-tw` 目前的 disruption model 寄生在 `lib/tick.ts` 的 5s setInterval — 而該 interval 只在 `currentSessionStartedAt !== null`（reading session active）時掛上。後果：

1. 唸書時被 modal popup 打斷專注閱讀
2. 非唸書時段（看排行榜、答考古題、經營醫院）完全不會 fire

這跟玩家直覺相反。目標：把 disruption 從「閱讀 tick 寄生」搬到「使用者互動觸發」。

**Pre-existing context relevant to this change**:
- Tick loop（`lib/tick.ts` 107-509）有兩段 event roll：lines 276–319（modal/toast events）+ lines 321–353（ER consult）。本 change 移除這兩段
- `gameCounters` 已有 `pendingEventId` / `pendingEventTriggeredAt` / `erConsultActive` / `lastEventResolvedAt` 欄位 — 大部分 reuse
- `services/event.ts` 4 個 resolve handler 已寫 `lastEventResolvedAt` — 沿用
- `services/er-consultation.ts` resolve handler **沒有**寫對應 timestamp — 本 change 統一改寫 `lastInteractionEventAt`（新欄位，event + ER 共用）
- Dexie 版本 v19 被對面 commit `dac4eae`（retirement tombstone）佔用 — 本 change 用 v20
- R2 m2 bundle `SCHEMA_VERSION` 是 4（同上 commit），本 change 不變更（新欄位是 additive optional，向後相容）

**Constraints**:
- 對面 commit `dac4eae` 已 ship，retirement tombstone 工作不能 regress
- 一階 `apps/medexam-tw` 完全不受影響
- `@study-rpg/core@0.2.0` 已 publish — 不破壞外部 API（`EVENT_TICK_INTERVAL` / `ER_CONSULT_TICK_INTERVAL_MIN` / `_MAX` constants 留下 + 加 `@deprecated`）

## Goals / Non-Goals

**Goals**:
- 唸書 session active 時，**0 個** event/ER popup fire（natural by design — 新 trigger 不會在 /study 且 session 啟動時觸發）
- 非唸書時段使用者答題 / 切頁面 → 機率觸發 event/ER popup
- 整體事件 frequency 跟舊系統大致一致（一天積極互動 ~5-10 events，包含 4 modal types + ER consult）
- 對面 `dac4eae` retirement tombstone 工作零 regression
- Cooldown 防 popup spam — 使用者 resolve 完一個 event 後 3 分鐘不會再撞下一個

**Non-Goals**:
- 不重新平衡事件**獎勵**（reward / penalty / VIP boost 數值不動）
- 不重新平衡事件**權重**（4 個 modal events 之間的 weighted table 不動，仍由 `rollEvent` 內部決定）
- 不引入新的事件類型
- 不改變事件 resolve 流程（modal UI / dialog 不動）
- 不加 hard daily cap（dogfood 後再決定）
- 不影響一階

## Decisions

### D1: 觸發機制走純機率，不做 cumulative engagement counter

**選擇**：每個 hook 點獨立 `Math.random() < EVENT_ROLL_PROBABILITY` 丟骰，無 cumulative state。

**Alternatives considered**:
- (a) Unified engagement score (1 答題 = 10 分、1 click = 1 分，閾值 ~150)：counter 需 persistence + multi-tab race + 跨 refresh 行為設計 — 複雜
- (b) 答題次數 counter（每 15-20 題 roll）：counter 需 persistence、需 cross-device 同步、需多 quiz source 統一 increment

**Rationale**：stateless、無 race condition、code 改動最小、行為直觀。Cadence 仍可透過 probability 值跟 hook 頻率 calibrate。

### D2: Probability 值 `event = 5%`, `ER = 3.5%`

**選擇**：兩個獨立常數，定義在 `packages/content-medexam2-tw/src/events.ts`（content pack 可調），import 進 service 層。

**推算過程（2026-05-26 codex audit 修正 — 含 inner rollEvent rate + cooldown 疊加）**：

`EVENT_ROLL_PROBABILITY` 是 **outer gate**，不是最終 fire rate。實際 event modal 出現的機率是：

```
effective_event_rate
  = outer_gate (5%)
  × P(rollEvent 命中)             [內部 weighted table，medical-malpractice 8% × repScale × tier-gate × etc.]
  × P(通過 5-min session cooldown) [既有 EVENT_POST_RESOLUTION_COOLDOWN_MS]
  × P(通過 3-min wall-clock cooldown) [新增 lastInteractionEventAt]
  × P(no mutex collision)         [pendingEventId / erConsultActive == null]
```

至 ER：

```
effective_er_rate
  = outer_gate (3.5%)
  × P(通過 ER 內部 mutex 7 條件: quiz session active / mentor open / etc.)
  × P(通過 settings.erConsultEnabled)
  × P(no event-mutex collision)
```

**推估典型玩家行為**（dogfood 前估計）：

| 玩家行為 | hook rate | event 內部命中（tier 醫中、rep ~150k）| 雙 cooldown 通過率 | mutex 通過率 | 預期 event/hr |
|---|---|---|---|---|---|
| 積極答題（10s/題 + 偶爾切頁）| ~40 hook/hr | ~25%（malpractice 8% × repScale 1.5 + 其他）| ~70% | ~95% | **40 × 0.05 × 0.25 × 0.7 × 0.95 ≈ 0.33/hr** ≈ 1 event/3hr |
| 重度互動（5s/題）| ~80 hook/hr | 同上 | ~50%（cooldown 撞更頻）| ~90% | **~0.43/hr** ≈ 1 event/2.3hr |
| 純看排行 + 經營（page nav only）| ~10 hook/hr | 同上 | ~85% | ~98% | **~0.10/hr** ≈ 1 event/10hr |

對比舊系統「每 5 min session-time roll」≈ 0.6 event/hr（假設 cap rate 不撞）— 新系統 outer 5% 在積極互動下約 **0.33–0.43 event/hr**，**比舊系統低 30–45%**。

**Cooldown 互動風險**：新 3-min wall-clock cooldown + 既有 5-min session-time cooldown 兩者皆需通過 → 對「兩 popup 間隔 < 5min」場景 effective rate 接近 0。這是 D6 要處理的核心問題（兩 cooldown 統一/合併）。

**Calibration plan**：以 5% / 3.5% **outer gate** ship，dogfood 第一週用 `__events.getStats()` 量 actual fire rate；若 < 0.2 event/hr 太鬼隱、> 1.0 event/hr 太擾人，調 outer gate 至 7-10% 或 2-3%。常數位置在 content-pack，無需 spec change。

**Alternatives considered**:

**Alternatives considered**:
- 較高（10%）：popup 飽和，玩家會煩
- 較低（1-2%）：感覺事件「鬼隱」太久不出來
- 動態（與 reputation / tier scale）：增加複雜度 — 舊系統有 reputation-scaled rate，新系統 D2 設定簡單常數先 ship，dogfood 後決定是否要 scale

### D3: 同一 hook 內 event 跟 ER 獨立 roll，event 先 ER 後

**選擇**：

```ts
async function maybeRollNonReadingEvent(source: 'quiz' | 'nav') {
  if (await isInReadingSession()) return
  if (await isInCooldown()) return
  // event roll first（高優先級）
  if (Math.random() < EVENT_ROLL_PROBABILITY) {
    const result = await rollEvent({...})
    if (result.modalEvent || result.toastEvent) {
      // mutex 自動形成，下面 ER roll 會撞 mutex skip
    }
  }
  // ER roll
  if (Math.random() < ER_ROLL_PROBABILITY) {
    await maybeRollAndPersistERConsult()
  }
}
```

**Rationale**：order deterministic、event 優先（payload 較重）、mutex 在 service 層內部處理。如果 event 命中且寫入 `pendingEventId`，後續 ER roll 內的 `maybeRollAndPersistERConsult` 會看到 `pendingEventId !== null` 自己 skip — 走既有 mutex 邏輯，不另外加 flag。

**Alternatives considered**:
- 共用一個 probability + weighted choice（5% 撞中 → 60% event / 40% ER）：複雜 + 失去獨立 calibrate 彈性
- 完全並行 race：non-deterministic，dogfood 時難 debug

### D4: Hook 點清單 — 答題 + route 切換（玩家內容頁 whitelist）

**Hook 點 A（答題）**：
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` answer commit 之後（在 quiz reward 寫入 Dexie 後、modal 關閉前）
- `apps/medexam2-hospital-tw/src/services/er-consultation.ts` `answerERConsult()` 完成後（answer ER consult 也算一次「答題」hook）
- 注意：若 mentor / training 也有 answer commit 路徑，同樣加 hook（implementation 時 grep `answer` / `recordCorrect` / `recordWrong` 確認覆蓋）

**Hook 點 B（route 切換）**：
- `apps/medexam2-hospital-tw/src/App.tsx` 內加：
  ```ts
  const location = useLocation()
  const prevPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevPathRef.current === null) {
      prevPathRef.current = location.pathname
      return  // 初始 mount 不算「切換」
    }
    if (prevPathRef.current === location.pathname) return
    prevPathRef.current = location.pathname
    if (!isPlayerContentRoute(location.pathname)) return
    maybeRollNonReadingEvent('nav').catch((e) => console.error('[non-reading-trigger]', e))
  }, [location.pathname])
  ```

**Whitelist function**（修正：路由清單對齊 `App.tsx` 實際 `<Route>` 定義，2026-05-26 codex audit）：

實際 `App.tsx` 路由：`/`（HomePage）、`/hospital`（Hospital tycoon view）、`/roster`、`/study`、`/training`（redirect 到 `/roster?tab=training`）、`/fate-cards`、`/bookmarks`、`/leaderboard`、`/achievements`。**沒有 `/quiz` 路由 — QuizModal 是 overlay 不是 route**。

```ts
const PLAYER_CONTENT_ROUTES = new Set<string>([
  '/',
  '/hospital',
  '/roster',
  '/fate-cards',
  '/bookmarks',
  '/leaderboard',
  '/achievements',
])
// Note: '/training' redirects to '/roster?tab=training' — 旅程結束在 /roster，
// 不需要單獨列入 whitelist。'/study' 永遠不在 whitelist（見下方）。

function isPlayerContentRoute(pathname: string): boolean {
  // exact-match the path before any query string
  const path = pathname.split('?')[0]
  return PLAYER_CONTENT_ROUTES.has(path)
}
```

**`/study` 的明確語意（2026-05-26 codex audit 統一）**：

`/study` **永遠不在 whitelist**。Hook B 的 useEffect 看到 `pathname === '/study'` → 直接 skip，不呼叫 `maybeRollNonReadingEvent('nav')`。

理由：簡化 control flow + 移除三檔自相矛盾（proposal / design / spec scenario 之前對 `/study` 描述不一）。即使使用者 nav 進 `/study` 但 reading session 還沒按開始 → Hook B 不 fire。要回到觸發路徑，必須 nav 離開 `/study` 去另一個 player content 頁。

Defense-in-depth：`isInReadingSession()` 在 service 層仍會擋 — 萬一未來某個 nav 邏輯 bug 不小心 invoke 了 `maybeRollNonReadingEvent('nav')` 給 `/study`，service 內部 reading-gate 仍會擋下。

**Alternatives considered**:
- Blacklist（排除 /onboarding /settings /help）：fail-open，未來新頁面預設 trigger — 風險高
- Whitelist + 把 /study 也放進去 + service 內部判斷 session 是否啟動：control flow 太複雜，會有「session 還沒開始時可 fire」這種微妙 carve-out 散在多處

### D5: 「唸書中」判定 = `gameCounters.currentSessionStartedAt !== null`

**選擇**：service 層的 `isInReadingSession()` 從 Dexie 讀 `gameCounters.currentSessionStartedAt`，非 null 即「唸書中」、不 roll。

```ts
async function isInReadingSession(): Promise<boolean> {
  const counters = await db.gameCounters.get('singleton')
  return counters?.currentSessionStartedAt != null
}
```

**Rationale**：使用者拍板「session 還沒開始 ≠ 唸書」。`currentSessionStartedAt` 已是 reading tick 的權威 flag，沿用。

### D6: Cooldown — soft 3 min，新欄位 `lastInteractionEventAt`，event + ER 共用

**選擇**：在 `gameCounters` 新增 `lastInteractionEventAt: number | null`（單一欄位、Dexie v20）。Event resolve handler（4 個）跟 ER consult resolve handler（answer / skip / expiry — 共 3 path）都寫 `Date.now()`。

**並且 — 移除既有 `EVENT_POST_RESOLUTION_COOLDOWN_MS = 5 min` 的 session-time cooldown**（2026-05-26 codex audit 統一）。理由：舊 cooldown 是 session-time（只在唸書時計時），新 cooldown 是 wall-clock，兩者語意不同且互相干擾 — D2 calibration 算出 effective rate 比舊系統低 30-45% 主要就是兩 cooldown 疊加造成。新系統「不在唸書時 fire」本來就需要 wall-clock 計時，session-time 概念失去意義。

```ts
const COOLDOWN_MS = 3 * 60 * 1000  // 3 min wall-clock

async function isInCooldown(): Promise<boolean> {
  const counters = await db.gameCounters.get('singleton')
  const last = counters?.lastInteractionEventAt ?? 0
  return Date.now() - last < COOLDOWN_MS
}
```

**Cooldown 統一明細**：

| 機制 | 舊系統 | 新系統 |
|---|---|---|
| Inter-event spacing | 5 min session-time via `EVENT_POST_RESOLUTION_COOLDOWN_MS` + `lastResolvedAt` | 3 min wall-clock via `lastInteractionEventAt` |
| ER inter-roll | tick countdown `jitterTicksUntilNextERConsult` 6-10 min | 共用上述 3 min wall-clock cooldown |
| 兩者關係 | 各自獨立 | **統一一個 3 min wall-clock cooldown，event/ER 共用** |

**Implementation 影響**：
- `packages/content-medexam2-tw/src/events.ts` 的 `rollEvent()` 函式仍接 `lastResolvedAt` + `nowSessionMs` + `hasPendingEvent` 參數 — 但 service 層呼叫時傳 `lastResolvedAt: null`（讓 inner cooldown 永遠通過），cooldown 由 outer `isInCooldown()` 統一管
- 既有 `EVENT_POST_RESOLUTION_COOLDOWN_MS` const 跟 `EVENT_TICK_INTERVAL` 一起加 `@deprecated` JSDoc，保留以防外部 fork 用到
- `lastEventResolvedAt` 欄位繼續寫（service.event.ts 既有），但本 change 不再讀它做 cooldown 判斷 — 純作為 audit trail / future-use

**Alternatives considered**:
- 保留兩 cooldown 並 AND 邏輯（兩者皆過才 fire）：D2 calibration 算出 effective rate 過低（< 0.2 event/hr）— 玩家會感覺事件「鬼隱」
- 保留兩 cooldown 並 OR 邏輯（任一過即 fire）：邏輯混亂，難 debug，且失去 cooldown 本意
- 改新 cooldown 為 5 min wall-clock 直接對齊舊值：dogfood 一週後再決定數值；3 min 是「給玩家喘息」的初值，太短可調
- Reuse 既有 `lastEventResolvedAt`：欄位只在 4 個 modal event 寫、ER 沒寫，且仍是 session-time 累積（不是 wall-clock）— 語意不對；加新欄位 cleanup 較明確
- 兩個獨立 cooldown（event 跟 ER 各自）：複雜化，mutex 已防同時兩 popup，3 分鐘 buffer 一體共用即可
- Hard daily cap：dogfood 後再加，現階段 KISS

**Schema migration**：
- Dexie v19 → v20：upgrade callback 對 `gameCounters` row 加 `lastInteractionEventAt: counters.lastEventResolvedAt ?? null`（拿舊欄位當 seed，避免新使用者第一次互動就 fire）
- R2 m2 bundle `hospitalState` array 內每 row 加 optional `lastInteractionEventAt?: number | null`（向後相容、舊 client 略讀無感）
- Cloud sync（`hospital_state` Supabase table）：本來就是 column-level union；upsert_lww 對未知欄位是 forward-compatible — 不需 supabase migration

### D7: 把 `eventRollTickCounter` 跟 `erConsultTicksUntilRoll` 從 schema 刪除

**選擇**：Dexie v20 upgrade 把這兩個欄位從每個 gameCounters row 上 delete。R2 m2 bundle / Supabase row 同步移除。

**Rationale**：tick.ts 不再用 → dead state。留著會混淆閱讀 code 的人。

**Risk**：舊 client（未升級到 v20）讀新 bundle 看不到欄位 — 但這兩個欄位本來就只在 tick 內 mutate、且 tick 不再讀它們，刪掉無功能影響。

**Migration**：Dexie v19 → v20 upgrade callback `delete row.eventRollTickCounter; delete row.erConsultTicksUntilRoll`。

### D8: DEV-only telemetry — `globalThis.__events.getStats()`

**選擇**：service 內部存 in-memory counter object（不持久化）：

```ts
const __stats = {
  rollAttempts: { quiz: 0, nav: 0 },
  eventFires: { quiz: 0, nav: 0 },
  erFires: { quiz: 0, nav: 0 },
  skipReadingSession: 0,
  skipCooldown: 0,
  skipMutex: 0,
}

if (import.meta.env.DEV) {
  ;(globalThis as any).__events = {
    getStats: () => ({ ...__stats }),
    resetStats: () => { /* reset all */ },
  }
}
```

**Rationale**：dogfood 一週後 calibrate probability 值用。Prod build vite tree-shake `import.meta.env.DEV === false` block — 確認 0 byte 進 bundle（驗證手段：build 後 grep `globalThis.__events` 無 hits）。

### D9: 既有 `EVENT_TICK_INTERVAL` 等 constants 標 `@deprecated` 但保留

**選擇**：`@study-rpg/core@0.2.0` 已 publish，外部 fork 可能 reference。Constants 保留 + 加 JSDoc `@deprecated since v0.3.0 — replaced by interaction-based trigger in apps/medexam2-hospital-tw; constants retained for backwards-compat only`。

**Rationale**：避免 breaking external API。下個 major release (`@study-rpg/core@1.0.0`) 才考慮移除。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Probability 5% / 3.5% 估計不準 → 太多或太少 popup | Content-pack 常數可調，dogfood telemetry 一週後 calibrate；不需重跑 OpenSpec change |
| 未來新增玩家內容頁忘記加 whitelist → 新頁永不觸發 event | `App.tsx` whitelist 加 inline 註解「新頁面記得加進來」+ smoke test 涵蓋 |
| 對面 `dac4eae` retirement work 還沒完全穩定，本 change 加新 schema bump 造成混淆 | Dexie 版本顯式跳 v20、跟 v19 retirement work 隔離；本 change 不碰 retirement_log / hospital_doctors 任何 table |
| 使用者剛 resolve 完 event → page nav 又 fire → cooldown skip → 但使用者期待還有事件 | 3 分鐘 cooldown 是「buffer」不是「cap」，過了 3 分鐘下一個 hook 還是有 5% 機率 fire — 行為仍是機率，使用者不會察覺 |
| Multi-tab：tab A roll fire event、tab B 同時 page nav 想 roll | Dexie write 是 IDB transaction atomic + mutex 用 `pendingEventId` 競爭 — 後 commit 的看到 mutex 自動 skip。已有保護 |
| ER consult 自己的 dialog 答完後又 fire 另一個 event/ER | `answerERConsult` 內部 sequence：clear `erConsultActive` → write reward → call `maybeRollNonReadingEvent('quiz')`。即使 hook 又 roll 中 ER，因為 `erConsultActive` 已被 clear，這次 roll 屬於「新 ER」是正常行為（不過 cooldown 應該擋掉，因為 ER resolve 也寫 `lastInteractionEventAt`） |
| Reading session active 期間使用者「逃出」/study 切到 /leaderboard → fire popup | 這是 desired behavior：使用者選擇離開 reading focus mode → 互動模式 → 應該 fire。但 reading timer 仍在跑（`currentSessionStartedAt` 還 non-null）→ `isInReadingSession()` 仍回 true → skip。需要明確決定 |
| ↑ 上述狀態的明確 spec：使用者離開 /study 但 session 還沒按結束 = reading 中還是非 reading？ | **明確 spec**：以 `currentSessionStartedAt` 為唯一 source of truth。離開 /study 不等於結束 session（session 結束要按按鈕清掉 timestamp）。所以「離開 /study 但 timer 還在跑」=「仍在唸書」=不 fire。Whitelist 是 outer gate、`isInReadingSession()` 是 inner gate，兩道 — 切到 /leaderboard 過 outer，但 inner 擋下 |

## Migration Plan

1. **Phase A — Dexie schema v20**：upgrade callback 加 `lastInteractionEventAt` (seed from `lastEventResolvedAt` 或 null) + delete `eventRollTickCounter` + delete `erConsultTicksUntilRoll`
2. **Phase B — Service 層**：新增 `services/non-reading-event-trigger.ts`，**先不接 hook**，純 lib 提供 `maybeRollNonReadingEvent()` 給 caller
3. **Phase C — tick.ts 縮減**：移除 event roll loop（276-319）+ ER consult roll loop（321-353），順手清掉 unused imports
4. **Phase D — hook 接上**：QuizModal + er-consultation.ts + App.tsx
5. **Phase E — resolve handler 改寫 `lastInteractionEventAt`**：event.ts 4 個 handler + er-consultation.ts 3 個 resolve path
6. **Phase F — Vitest**：probability gate、cooldown gate、reading session gate、whitelist filter
7. **Phase G — Chrome MCP smoke**：(1) reading session 期間 0 popup、(2) page nav 觸發 popup、(3) cooldown 3 min 期間 0 popup
8. **Phase H — DEV telemetry handle 加入**

**Rollback**：如果 dogfood 顯示 probability 太低/太高 → 改 content-pack 常數，不需要 rollback architecture。如果有 fundamental issue → revert 本 change commit（單 commit 整包），retirement tombstone 不受影響（zero overlap）。

## Open Questions

1. ~~Mentor / training 是否也有 answer commit 路徑需要加 hook？~~ — implementation 階段 grep 確認，design 不卡關
2. ~~/study 切換進 /leaderboard 但 session 還在跑時的行為？~~ — D6 解決：`isInReadingSession()` inner gate 擋下
3. 是否要在第一次 fire event 後加一個「歡迎」toast 解釋新機制？ — 不需要，使用者拍板「不設計」reading session 行為，預設 silent rollout；如有玩家回報困惑再加 in-game tutorial
