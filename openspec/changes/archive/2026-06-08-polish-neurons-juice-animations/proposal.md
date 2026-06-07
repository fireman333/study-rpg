## Why

神經元核心 loop 的動畫密度偏低：許多既有 motion primitive（`ParticleBurst` / `CelebrationHalo` / `NumberTickUp` / `AnswerFeedbackFlash` / `SpikeTrainFiring`）已建好卻沒接進 gameplay。排名上升、抽卡啟用、答錯回饋、夥伴反應、迷宮 walker 移動目前都是靜態或瞬跳。這是 3-pack 遊戲動畫 roadmap 的 **Pack 2（純 presentational polish）**，把整體 juice 往商業手遊爽度靠。Pack 1（二回目全腦點亮慶祝 + 連答 streak 升階）已完成；Pack 3（生圖 sheet）獨立最後做。

> propose 前已做一輪 **orphan audit**，砍掉原 grill 清單中 3 個打到「已刪除 / 不存在機制」的項目（reputation/score 幽靈數值、已刪的 connectome SVG 樹、DMN 抽卡不產神經元 variant）— rationale 與證據見 `design.md`。

## What Changes

6 項純前端動畫接線（**零新 asset、零 Dexie/R2 schema bump**）：

- **DMN 消耗品啟用爆發**：在 `BackpackPanel` 啟用 surge / bolus / family-buff 時放一次爆發視覺（`ParticleBurst` / `SpikeTrainFiring`）。目前啟用成功無任何回饋。
- **Leaderboard 名次上升回饋**：「我的排名」數字用 `NumberTickUp` 從舊名次 tween 到新名次；名次進步時加一次 `CelebrationHalo`。（吸收原 NumberTickUp 項唯一有意義的真實數值用途）
- **Route 轉場「神經訊號 wipe」**：用 framer-motion `AnimatePresence` 包 `<Routes>`，頁面切換時放神經訊號掃過的轉場。**部署時必重跑 SPA 三件套（in-app nav + 直接 URL + F5）。**
- **答錯迷宮路徑 decay 閃爍**（重定向自原 connectome 樹 decay）：答錯時在該科 maze 路徑放一次 dim / decay 閃爍，複用 `SYNAPSE_TIMINGS.decay` + `AnswerFeedbackFlash`，落在 live `MazeGrid` 畫布。
- **夥伴答對 idle 反應**：答對時 `MazeExpedition` 夥伴 marcher 做一次 blink / pulse（目前只有 `exp-bob` 行進擺動）。
- **Walker easing tween**：`MazeGrid` walker 在格子間移動改用 easing transition（目前 raw `transform` 瞬跳）。

全部 **尊重 reduced-motion**（reduced → 動畫降級 / 略過）、**不改既有 timing token 語意**、**不改任何 gameplay 數值或機制**。

**Scope cut（orphan audit 結論，明確不做）**：

- ❌ `NumberTickUp` 接 reputation / score — neurons 無此數值（reputation 僅存於 `NumberTickUp.tsx` 註解，二階遺留；`score` grep 0 命中）。唯一有意義的 rank count-up 已併入 leaderboard 項；`MasteryChip` 答對數 count-up 早已 wired。
- ❌ 答錯 connectome 樹 decay — `ConnectomeTreeSvg` 已隨 maze promote-to-home 刪除（`OverviewPage` 註解明寫「the connectome tree no longer mounts here」）。改為上面的「迷宮路徑 decay 閃爍」落在 live 畫布。
- ❌ evolve sheet → `DmnDrawModal` — DMN 抽卡只產 consumable / equipment，從不產神經元 variant（`DrawDmnCardResult` 兩種 kind）。evolve 動畫正確歸屬 `VariantUnlockModal`；DmnDrawModal 已自帶 framer-motion reveal。

## Capabilities

### New Capabilities

- `neurons-juice-animations`: 神經元 gameplay 的 presentational「juice」層 — 把既有 motion primitive 接進核心 loop 的抽卡 / 排名 / 答錯 / 夥伴 / 迷宮移動表面。涵蓋上述 6 項動畫接線的 normative 行為，含 reduced-motion 尊重與「零 persistence 副作用」約束。

### Modified Capabilities

（無 — 純新增 presentational 行為，不改既有 capability 的 requirement 語意。motion primitive 的定義 contract 留在 `neurons-motion-library`；本 change 只「應用」既有 primitive，不新增 primitive 定義。）

## Impact

- **Code（全在 `apps/neurons-tw/src/`）**：
  - `components/BackpackPanel.tsx` + `lib/services/dmn-event-dispatcher.ts` — DMN 啟用爆發
  - `routes/LeaderboardPage.tsx` — rank count-up + 進步 halo
  - `App.tsx` — `AnimatePresence` 包 `<Routes>`（route 轉場）
  - `components/maze/MazeGrid.tsx` — walker easing + 答錯該科路徑 decay 閃爍
  - `components/MazeExpedition.tsx` — 夥伴答對 pulse
  - `components/QuizModal.tsx`（或既有答題 hook）— 答對 / 答錯事件 → 觸發迷宮 decay / 夥伴 pulse
  - 複用既有 `lib/motion/*`（`ParticleBurst` / `CelebrationHalo` / `NumberTickUp` / `AnswerFeedbackFlash` / `SpikeTrainFiring` / `timings`）
- **無 asset 變更**、**無 Dexie `.version()` bump**、**無 R2 `SCHEMA_VERSION` bump**（→ 不觸發 dexie-upgrade-fixture lint）。
- **部署風險**：route 轉場改動 `App.tsx` 路由結構 → 部署前必跑 prod SPA 三件套（含 F5）。
- **Verify**：`/motion-demo` 可加新變體自驗；功能驗證走 Chrome MCP（dev 三件套 + 答對 / 答錯 / 啟用消耗品 / 排名更新 end-to-end）。
