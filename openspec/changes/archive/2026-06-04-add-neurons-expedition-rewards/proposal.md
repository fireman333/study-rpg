## Why

出征（全科錯題 drill）目前只有「每答對一題」的即時獎勵；完成一場出征沒有任何 completion bonus（`onExpeditionComplete` 是刻意保留的 no-op，見 `openspec/decisions/2026-06-03-expedition-vs-maze-design-language.md`）。同時，DMN 抽卡的「時間軸」目前綁在閱讀分鐘數上（閱讀 30 分 → +1 抽），但閱讀已經是 maze 能量的主要 faucet——讓閱讀同時餵兩個系統，使「出征清錯題」這個 remediation 動作沒有對應的收集獎勵。本變更把 DMN 抽卡的時間軸從閱讀改綁到出征清除數，讓「清掉自己的弱點」直接轉化成 DMN 抽卡機會。

## What Changes

- **DMN 抽卡時間軸改 source**：原本「閱讀 30 分 → +1 抽（每日上限 2）」改為「出征清除錯題達百分比門檻 → +1 抽（每日上限維持 2）」。每場出征結束以 per-session 比例判定：清除數達 `clamp(round(pct × 開場錯題數), min, max)` 即發抽，milestone 表預設 `[{25%,3–15},{50%,6–30}]`（2 個 milestone = 每日上限 2）。clamp 讓大/小 backlog 兩端都不失衡。未用抽數跨日保留、午夜 daily-reset。
- **行為軸不變**：`connectome.variantSlotUnlocked` / `synapseFormed` / `synapseStrengthened`（每日上限 3）維持原樣。DMN 每日總抽數仍 ≤ 5。
- **閱讀解除 DMN 耦合**：`reading-timer.ts` 不再呼叫 DMN subscriber。閱讀仍累加 `totalStudyMinutes` 並仍餵 maze 四分支能量（`accrueReadingEnergyAllBranches`）——只有「閱讀 → DMN 抽」這條線移除。
- **`onExpeditionComplete` 由 no-op 變成發放**：出征 session 結束時，以 `pool`（開場錯題數 = 既有 `total`）+ `cleared`（= `correct`，在「只含錯題」pool 中等同 wrong→correct flip 數）呼叫 `creditExpeditionDraws(pool, cleared)`。pool 天生防刷（清掉就離開 pool）+ 每日 cap 雙重防刷。發放必須 best-effort（try/catch），獎勵失敗不可中斷出征關閉流程。
- **常數正名**：`packages/content-neurons-tw` 移除 `DMN_TIME_AXIS_MINUTES_PER_DRAW` / `DMN_TIME_AXIS_DAILY_CAP`，改 export milestone 表 `DMN_EXPEDITION_MILESTONES = [{pct:0.25,min:3,max:15},{pct:0.50,min:6,max:30}]` + 衍生 `DMN_EXPEDITION_DAILY_CAP = length`（dogfood-tunable game-loop 數字，非 OE-anchored）。

## Capabilities

### New Capabilities
<!-- 無新 capability — 本變更只改既有兩個 capability 的行為 -->

### Modified Capabilities
- `neurons-dmn-fate-cards`: 抽卡 entitlement 的第一軸（原 time axis）改為由出征清除數的 per-session 百分比門檻（`DMN_EXPEDITION_MILESTONES` clamp）發放，不再由閱讀分鐘數驅動；`ReadingTimerSubscriber` 契約改為 `creditExpeditionDraws(pool, cleared)` 契約；「reading-timer 未接前 time axis inactive」備註作廢移除。每日上限、daily-reset、未用抽數結轉等 scenario 維持。
- `neurons-study-squad`: 「Reward seam left as a no-op extension point」requirement 改為——`onExpeditionComplete` 發放出征軸 DMN 抽卡額度（不再 no-op），且必須 best-effort（失敗不破壞出征關閉）。
- `neurons-homepage`: 「cap-aware next DMN draw progress ring」requirement 的資料來源由 reading-timer 分鐘改為出征軸（ring fill = 今日出征抽數 / cap、caption 顯示今日累積清除數）；移除「每 30 min 觸發」prose 措辭。cap-aware terminal state 維持。

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/services/dmn-trigger.ts`（`accrueReadingMinutes` → `creditExpeditionDraws(pool, cleared)` per-session milestone；移除 orphaned `ReadingTimerSubscriber` / `dmnReadingTimerSubscriber`）
  - `apps/neurons-tw/src/lib/services/reading-timer.ts`（移除 DMN subscriber 呼叫；保留 totalStudyMinutes + maze 能量）
  - `apps/neurons-tw/src/lib/services/expedition.ts`（`onExpeditionComplete` 實作發放）
  - `apps/neurons-tw/src/routes/OverviewPage.tsx`（completion wiring 已存在，視需要 async 化）
  - `packages/content-neurons-tw/src/dmn-types.ts` + `index.ts`（常數正名 + `DmnMetaSnapshot` doc）
  - UI 文案：`DmnDrawButton` / `DmnDrawProgressRing` / `HelpMenu` / `HomepageOnboarding` / `OverviewPage` / `LeaderboardPage`（「閱讀 30 分 → 抽」改「出征清錯題 → 抽」）
- **持久化**：純 meta key-value。**不** bump Dexie `.version()`（不觸發 dexie-upgrade-fixture-lint）、**不**新增 Dexie table。同步 meta key 名稱維持凍結（`dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday` 名稱不動，現在語意為清除數，以醒目註解標明）→ **不動 `SYNCED_META_KEYS`、不 bump R2 `SCHEMA_VERSION`（維持 12）**。
- **平行 session 協調**：本 worktree `track-neurons-p4`；另一 session 持有 `add-version-check-banner`。凍結 sync key 名稱使兩邊唯一 merge 衝突收斂在 `openspec/project.md` roadmap 那一行。
- **Tests**: `expedition.test.ts` / `dmn-trigger-counters.test.ts` / `reading-timer.test.ts`（Vitest；無 fixture-lint 因無 Dexie bump）。
- **Out of scope**: 不動 gacha/currency、不改 Dexie/R2 schema、不動行為軸、不改每答對即時獎勵、不改 DMN catalog/artwork。
