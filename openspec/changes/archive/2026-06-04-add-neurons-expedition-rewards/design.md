## Context

出征（`neurons-study-squad` 的「All-subject wrong-question expedition」）透過 `QuizModal` 開啟跨科 `questionHistory.lastResult === 'wrong'` pool。每答對一題的即時獎勵已 live（能量 + maze signal + mastery + 把該題移出未答對 pool）。完成一場出征的 **completion bonus** 在 `lib/services/expedition.ts` `onExpeditionComplete` 被刻意留成 no-op，等本變更實作（`openspec/decisions/2026-06-03-expedition-vs-maze-design-language.md` 鎖定的延後項）。

DMN 抽卡（`neurons-dmn-fate-cards`）目前有兩條 entitlement 軸：
- **time axis**（每日上限 2）：閱讀累積每 30 分 → +1 抽。`reading-timer.ts` 已實際接上（`dmnReadingTimerSubscriber.onMinutesAccrued`），所以這條目前 live。
- **behavior axis**（每日上限 3）：`connectome.variantSlotUnlocked` / `synapseFormed` / `synapseStrengthened` 各 +1。

所有 DMN 計數器都存在 `meta` key-value（`dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` / `dmnDrawsAvailable` / …），無 Dexie table。time-axis 累積/門檻/上限/結轉/午夜 reset 邏輯集中在 `dmn-trigger.ts` 的 `accrueReadingMinutes` + `maybeRunDailyReset`。

平行開發約束：本 worktree `track-neurons-p4`；另一 session 持有 `add-version-check-banner`（commit `94cbbea`）。owner 要求把兩邊唯一的 merge 衝突壓在 `openspec/project.md` roadmap 那一行。

## Goals / Non-Goals

**Goals:**
- 把 DMN 抽卡第一軸的輸入來源由「閱讀分鐘」換成「出征清除錯題數」，發放採門檻里程碑（每清除 N → +1 抽），每日上限維持 2。
- `onExpeditionComplete` 由 no-op 變成 best-effort 發放（失敗不破壞出征關閉）。
- 閱讀解除 DMN 耦合但保留 maze 能量 + `totalStudyMinutes`。
- 純 meta key-value 持久化：不 bump Dexie、不新增 table、不動 `SYNCED_META_KEYS`、不 bump R2 `SCHEMA_VERSION`。

**Non-Goals:**
- 不動行為軸（連線事件 → 抽）。
- 不改每答對即時獎勵、不改 maze 能量公式、不改 gacha/currency。
- 不改 DMN catalog / 事件種類 / artwork。
- 不做跨裝置「出征軸」語意遷移工程（neurons 單一 dogfood user + 計數器每日午夜歸零，無遷移成本）。

## Decisions

### D1 — 獎勵 payload = repurpose DMN 時間軸（owner 決定）
2026-06-03 AskUserQuestion，owner 選擇把 DMN 抽卡的時間軸從閱讀改綁出征，而非我提的三個 payload（灌 maze 能量 / 保底 settle / mastery 進度）。理由：DMN 抽卡額度本來就是 meta key（純 meta、零 Dexie），且「閱讀餵 maze、出征餵 DMN」讓兩個 faucet 各有專屬來源，不再讓閱讀同時餵兩系統。
- **Alternatives considered（皆被 owner 否決）**：(a) 清除數 → 灌對應分支 maze 能量；(b) 清滿門檻 → 免費 maze settle（直接 mint variant）；(c) 清除數 → family mastery 進度。

### D2 — 發放形狀 = 百分比門檻里程碑 + 可達性 clamp（owner 決定，2026-06-03 第二輪）
owner 否決固定絕對 N，改要「清掉目前錯題的百分比」。但純百分比兩端失衡：大 backlog（早期上百錯題）25% = 50+ 題一天清不完 → 出征抽卡死在最需要動力時；小 backlog（剩 ~8 題）25% = 2 題 → 太廉價。最終 owner 選 **百分比 + clamp**：

- 每場出征 session 結束時：`pool` = 開場錯題數、`cleared` = 本場清除數。
- 對 `DMN_EXPEDITION_MILESTONES`（預設 `[{pct:0.25,min:3,max:15},{pct:0.50,min:6,max:30}]`）每個 milestone，門檻 = `clamp(round(pct × pool), min, max)`；`cleared` 達到即 +1 抽。
- 每日上限 = milestone 數 = 2，由既有 `dmnTimeAxisDrawsConsumedToday` 跨 session 把關。

clamp 保留中段比例感（pool 40 → 10 / 20），但大 backlog 封頂可達（pool 300 → 15 / 30）、小 backlog 設地板防廉價（pool 8 → 3 / 6）。
- **Alternatives（owner 比較後選 clamp 版）**：純 25%/50% 不 clamp（最貼語意但兩端失衡）；絕對 N=5/10（最可預測但不隨 backlog 縮放）。

### D3 — 發放以「單場 session」評估（per-session ratio），非跨日累積
門檻用本場 `cleared / pool` 比例判定（`pool` = 該場開場錯題數，即既有 `onComplete({total, correct})` 的 `total`；`cleared` = `correct`）。好處：(a) 零新增 synced state（直接用既有 payload）；(b)「目前錯題」語意即每場 `total`，完全對上 owner 措辭；(c) 跨 session 由每日 cap counter 把關，pool 隨清除枯竭 + cap 2/day 雙重防刷。`dmnTimeAxisMinutesAccrued`（凍結名）僅作「今日累積清除數」display/telemetry，**不** gate 發抽。

### D4 — 指標用 `correct`，在 wrong-only pool 中即等於 flip 數（防刷）
`onExpeditionComplete({total, correct})` 既有 payload 已足夠：出征 pool 只含 `lastResult === 'wrong'` 的題，每答對一題就是一次 wrong→correct flip 並把該題移出 pool。因此 `correct` 即清除數，且**天生防刷**——pool 隨清除枯竭，無法靠重答已會的題刷抽數。QuizModal 不需改（`correctCountRef` 已是 distinct-correct）。

### D5 — 同步 meta key 名稱凍結 + 公開常數正名（naming vs migration 取捨）
- **凍結**：`dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` 兩個 **synced** meta key 名稱不動（語意改為清除數），`DmnMetaSnapshot` 同名欄位不動 → **零 `SYNCED_META_KEYS` 改動、零 R2 `SCHEMA_VERSION` bump（維持 12）、零 Dexie bump**。在每個 key 與欄位加醒目註解標明「名稱為 legacy 穩定值、自 `add-neurons-expedition-rewards` 起儲存出征清除數」，使 divergence 顯性、單一來源（呼應 `coding_principles` §6 Schema Canonical Form 的精神：不要 silent 走樣，用註解當 single source of truth）。
- **正名**：`packages/content-neurons-tw/src/dmn-types.ts` 的常數**不**綁同步、自由改名：移除 `DMN_TIME_AXIS_MINUTES_PER_DRAW` / `DMN_TIME_AXIS_DAILY_CAP`，改 export milestone 表 `DMN_EXPEDITION_MILESTONES`（見 D8）+ 衍生 `DMN_EXPEDITION_DAILY_CAP = DMN_EXPEDITION_MILESTONES.length`。
- **Why 取捨偏凍結**：owner 明確要求把平行 session 衝突壓到 project.md roadmap 一行。動 `SYNCED_META_KEYS` / `bundles.ts SCHEMA_VERSION` 雖非 Dexie、雖 additive，但會擴大與 `add-version-check-banner` 的 textual 衝突面；而 neurons 是單一 dogfood user + 這些是每日歸零的 transient 計數器，凍結名稱無實質風險。

### D6 — 函式改寫 + 移除 orphan
`dmn-trigger.ts` 的 `accrueReadingMinutes(deltaMinutes)` 改寫為 `creditExpeditionDraws(pool, cleared)`：per-session 評估 `DMN_EXPEDITION_MILESTONES` 門檻、grant `min(本場達標 milestone 數, DMN_EXPEDITION_DAILY_CAP − consumedToday)` 抽、順手把 `cleared` 加進 `dmnTimeAxisMinutesAccrued`（今日累積清除數，display 用）。`maybeRunDailyReset` / behavior-axis / boot listeners 不動。`ReadingTimerSubscriber` interface + `dmnReadingTimerSubscriber` export 在移除 reading 呼叫後變 orphan → 一併刪除（`coding_principles` §3）。`reading-timer.ts` 移除對應 import + `fireMinuteSideEffects` 內的 subscriber 呼叫，保留 `incrementTotalStudyMinutes` + `accrueReadingEnergyAllBranches`。

### D7 — 發放 best-effort
`onExpeditionComplete` 內 `void accrueExpeditionClears(correct).catch(...)`（或 await + try/catch），channel `[expedition-reward]`。獎勵失敗只 log，不可讓 `QuizModal` 關閉流程 throw（呼應既有 achievement/dmn hook 的 post-tx try/catch 紀律）。

### D8 — Milestone 表（dogfood-tunable）
```ts
DMN_EXPEDITION_MILESTONES = [
  { pct: 0.25, min: 3, max: 15 },  // 第 1 抽
  { pct: 0.50, min: 6, max: 30 },  // 第 2 抽
]
DMN_EXPEDITION_DAILY_CAP = DMN_EXPEDITION_MILESTONES.length  // 2
```
pct/min/max 皆 game-loop 數字（非 OE-anchored，project.md 規則），dogfood 後調整單一表即可，無 schema 影響。combined 行為軸 cap 3 → DMN 每日總抽 ≤ 5 不變。對照表：pool 8 → 門檻 3/6；pool 40 → 10/20；pool 300 → 15/30。

## Risks / Trade-offs

- **[凍結 key 名稱 = 名實不符]** `dmnTimeAxisMinutesAccrued` 儲存清除數，未來讀 code 者可能誤解 → 每個 key/欄位加醒目註解，spec 也標明 storage key 為 legacy 名稱；divergence 顯性化。
- **[閱讀者失去 DMN 抽]** 重閱讀輕出征的玩法 DMN 抽數下降 → 設計意圖：閱讀已餵 maze（主進度），DMN 改獎勵 remediation；且行為軸（連線事件，閱讀+答題都會觸發）仍在。
- **[跨版本 bake 期 time-axis 計數混用]** v(舊) 仍把閱讀分鐘寫進同 key、v(新) 寫清除數 → 同 key 數值語意短暫混用。Mitigation：neurons 單一 user + 計數器午夜歸零，且 `dmnDrawsAvailable`（真正抽數餘額）語意不變仍正常同步；影響僅限當日門檻計算的瞬時偏差，可接受。
- **[百分比兩端失衡]** 純 25%/50% 在大 backlog 不可達、小 backlog 太廉價 → clamp（3–15 / 6–30）兩端封口，中段保比例感（D2/D8）。
- **[milestone 調參]** pct/clamp 可能偏鬆/偏緊 → dogfood telemetry 後調整 `DMN_EXPEDITION_MILESTONES` 單一表即可，無 schema 影響。

## Migration Plan

- **無 schema migration**：純 meta key-value、無 Dexie `.version()` bump、無 R2 `SCHEMA_VERSION` bump。既有 `dmnTimeAxisMinutesAccrued` 既有值（若為閱讀分鐘）在午夜首次 reset 後自然歸零並開始累積清除數，無需 backfill。
- **Rollback**：revert change（恢復 `onExpeditionComplete` no-op + reading→DMN 耦合 + 常數舊名）即可；無資料形狀變更，無需資料修復。
- **Deploy**：隨 `track-neurons-p4` → main merge + `pnpm deploy:cf`（neurons 走 CF Pages）；無 Worker / D1 / R2 配置改動。

## Open Questions

- 無 blocking open question。Milestone 表（25%/50% clamp 3–15/6–30）為 dogfood 起始值；模型/上限/來源均已由 owner 決定（2026-06-03 兩輪）。
