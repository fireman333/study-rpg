## Context

神經元 app 的 motion library（`apps/neurons-tw/src/lib/motion/`）已備齊 14 個 primitive（`ParticleBurst` / `CelebrationHalo` / `NumberTickUp` / `AnswerFeedbackFlash` / `SpikeTrainFiring` / `SignalOscillation` / `AmbientFiring` / `Toast` / `RarityRevealModal` / `AchievementUnlockModal` 等）+ `timings.ts`（`SYNAPSE_TIMINGS` 含 `decay: 600`）+ `streakIntensity.ts`，並有 `/motion-demo` dev 路由逐項自驗。但多數 primitive 只活在 demo 或單一表面（`NumberTickUp` 僅 `MasteryChip`），核心 loop 的數值/抽卡/排名/答錯/夥伴/walker 移動仍靜態或瞬跳。

這是 3-pack 動畫 roadmap 的 **Pack 2**。Pack 1（`add-neurons-loop-celebration-animations`：二回目全腦點亮慶祝 + 連答 streak 升階）已 archived 在 `track-neurons`（未部署，等與本包一起 deploy）。Pack 3（生圖 sheet）獨立最後做。

**約束**：純 presentational。零 asset、零 Dexie `.version()` bump、零 R2 `SCHEMA_VERSION` bump（避免觸發 `dexie-upgrade-fixture` lint）。全部尊重 reduced-motion，不改既有 timing token 語意，不改任何 gameplay 數值或機制。

## Goals / Non-Goals

**Goals:**

- 把既有 motion primitive 接進 6 個核心 loop 表面，整體 juice 往商業手遊爽度靠。
- 每項都落在**確認 live** 的畫布（先做 orphan audit 排除打到已刪機制的項目）。
- 零 persistence 副作用：所有動畫 state 為 session-only（component state / ref / in-memory event bus），reload 不殘留、不跨裝置同步。

**Non-Goals:**

- 不新增 motion primitive 定義（primitive contract 留在 `neurons-motion-library`；本包只「應用」）。
- 不做生圖 sheet（Pack 3）。
- 不碰 Dexie / R2 / Worker / D1（純前端）。
- 不改 gameplay 平衡數值（能量公式 / AP threshold / 抽卡權重）。

## Decisions

### D1 — Orphan audit 先行，砍掉 3 個打到已刪/不存在機制的項目

propose 前對 grill 清單 8 項逐項驗證目標機制是否 live，砍掉 3 項（grep / 檔案搜尋證據）：

| 原項目 | 證據 | 處置 |
|---|---|---|
| NumberTickUp 接 **reputation / score** | `reputation` 在 neurons-tw 唯一命中是 `NumberTickUp.tsx:2` 的註解（二階遺留）；`score` grep 0 命中；`NumberTickUp` 已 wired 在 `MasteryChip.tsx:78`（答對數 count-up） | **砍**；唯一有意義的 rank count-up 併入 D4 leaderboard 項 |
| 答錯 **connectome 樹** decay | `ConnectomeTreeSvg` 已不存在為檔案（`find -iname '*connectome*'` 只剩 service `connectome.ts` + demo `SynapseDemoSvg`）；`OverviewPage.tsx` 註解明寫「the connectome tree no longer mounts here」（maze promote-to-home 取代） | **重定向** → D3 迷宮路徑 decay 閃爍 |
| **evolve sheet → DmnDrawModal** | `DrawDmnCardResult` 只有 `kind: 'consumable' \| 'equipment'`（`dmn-fate-card.ts:148`），DMN 抽卡從不產神經元 variant；evolve 是「神經元進化」動畫，正確歸屬 `VariantUnlockModal:131`；DmnDrawModal 已自帶 framer-motion reveal | **砍** |

**底層 synapse 機制本身沒死**：`connectome.ts` 仍發 `synapseFormed/Strengthened/Decayed` 事件，餵 `SynapseFormationToast`（仍 mount 於 `App.tsx:9`）+ DMN 行為軸抽卡 + achievements。死的只是 synapse 的 **SVG 樹視覺**。

Alternatives considered：全做（grill 原意）→ 否決，因 3 項落在已刪畫布 / 錯置語意，做了也看不到或語意錯。保守全砍含可救項 → 否決，item 5 重定向到迷宮主題更貼切且落在 live 畫布。

### D2 — 跨元件答題反應走獨立輕量 emitter（mirror `maze-focus`），零 persistence

答對 → 夥伴 pulse、答錯 → band synapse-decay 微暗，兩者都落在 `MazeExpedition`，需要從答題流程（`QuizModal` → `connectome.ts` `recordCorrectAnswer` / `recordIncorrectAnswer`）廣播到該元件。

**決定**：新增一個**獨立輕量 emitter** `lib/maze/answer-feedback.ts`，mirror 既有 `lib/maze/maze-focus.ts` 的 house pattern（module-level `Set<listener>` + `onX`/`emitX` + best-effort try/catch + 回傳 unsubscribe）。匯出 `emitAnswerCorrect(familyId)` / `onAnswerCorrect` + `emitAnswerWrong(familyId)` / `onAnswerWrong`，由 `connectome.ts` 在 record 流程 emit；`MazeExpedition` subscribe 觸發一次性動畫。

- 為何**不**擴充 `connectome/events.ts` 的 `connectomeEvents` bus：那條 bus 的事件是 semantic domain 事件（synapse formed/strengthened/decayed），語意上是「資料層發生了什麼」；answerCorrect/Wrong 是純 UI-feedback 信號，concern 不同。`maze-focus.ts` 已示範「answer flow → maze-band 的一次性 UI 信號」正是這個 house pattern（其註解明寫 mirror masteryEvents / first-pull bridge）。沿用它最一致。
- 兩者皆 in-memory → reload 不殘留、不寫 Dexie/R2 → 零 schema。
- Alternatives：prop-drill callback 從 `QuizModal` 傳到 band → 否決，要穿透多層；用 Dexie 暫存「待播動畫」flag → 否決，違反零 persistence 且觸發 lint。

### D3 — item 5 重定向（二次）：答錯時**出征 band** synapse-decay 微暗

原 grill 的「connectome 樹 decay」因 D1 樹已刪 → 一度改為「`MazeGrid` 路徑 decay」。但 apply 期發現 **`QuizModal` 答題時會蓋住首頁 `MazeGrid`**（modal backdrop），decay 打在 MazeGrid 上player 答題當下看不到；且 QuizModal 內已有 `AnswerFeedbackFlash` 紅色答錯 flash。

**決定**：item 5 改打到 **`MazeExpedition` compact band**（`QuizModal` 內 `{!bandHidden && <MazeExpedition compact />}` 是答題時可見的 maze-adjacent 表面）。答錯時對 band 放一次 synapse-decay 微暗（dim→restore），timing 複用 `SYNAPSE_TIMINGS.decay`（600ms）。主題上 band = 行進中的神經元遠征隊，答錯 = 訊號短暫弱化，貼合「synapse 弱化」敘事。純視覺，不扣任何進度。與 modal 既有紅 flash 互補（band-level dim vs 全 modal tint）。`MazeGrid` 不再需要 wrong 事件。

### D4 — Leaderboard 名次上升回饋（吸收原 NumberTickUp 項唯一真實用途）

`LeaderboardPage` 用 `useRef` 記住上一次「我的排名」，snapshot refresh 時：排名數字用 `NumberTickUp` 從 prevRank tween 到 newRank；**名次進步**（newRank < prevRank）時疊一次 `CelebrationHalo`。prevRank 是 session-only ref → reload 無動畫（可接受，非進步事件不該每次重整都放煙火）。

### D5 — Route 轉場用 framer-motion `AnimatePresence`（已 import 未用）

`App.tsx:2` 已 import `AnimatePresence` 但沒包 `<Routes>`。用 `AnimatePresence mode="wait"` + `motion.div` keyed by `location.pathname`，做「神經訊號 wipe」入場（opacity + 輕微 x/scale，magnitude ≤ 12px / ≤3%，duration 140–280ms，對齊 motion library 紀律）。**部署前必跑 prod SPA 三件套（in-app nav + 直接 URL + F5）**——route 結構改動是 SPA fallback 高風險區。

### D6 — reduced-motion 一致降級

所有新動畫透過既有 `useRespectsReducedMotion()` / `ReducedMotionAware` gate：reduced → 動畫略過或瞬時呈現終態（route 轉場降為純 opacity 短淡入 / decay 閃爍與夥伴 pulse 不播 / NumberTickUp 直接顯示終值）。沿用 Pack 1 與 motion library 既定 pattern。

## Risks / Trade-offs

- **[Route 轉場破壞 SPA 路由 / F5 / 直接 URL]** → 部署前 Chrome MCP 跑三件套在 prod；dev 先跑一輪；`AnimatePresence mode="wait"` 不改 route 定義本身只包 wrapper，降低結構風險。
- **[新 event 在答題熱路徑 emit 失敗拖垮答題]** → emit 端 try/catch（mirror 既有 `[dmn]` / `[achievement]` channel 紀律），UI 動畫失敗絕不阻斷 `recordCorrectAnswer` 主流程。
- **[夥伴 pulse 罕見（只 2 隻、~5% DMN 裝備抽到）]** → 接受；機制 live，沒夥伴時 no-op，不報錯；夥伴出現時才有反應，屬正向驚喜。
- **[誤觸 schema bump → dexie-fixture lint]** → 全程不碰 `db.ts` `.version()` / `bundles.ts` `SCHEMA_VERSION`；apply 收尾跑 `pnpm lint:dexie-fixtures` 確認 0 觸發。
- **[動畫過吵 / 干擾閱讀]** → magnitude 守 motion library 紀律（短 duration、小位移、必含 opacity）；dogfood 後可微調 intensity，屬 tunable 非結構。

## Migration Plan

- **部署 = merge `track-neurons` → `main`**（push 觸發 CF Pages `deploy-cf-pages.yml` 自動上線 `med-study-rpg.com/neurons/`，對外）。本包與 hold 著的 Pack 1 一起一次部署（user 決定）。
- 部署後驗證：CI 綠 → prod SPA 三件套（含 F5）+ 答對/答錯/啟用消耗品/排名更新 end-to-end spot-check。
- **Rollback**：純前端 + 零 schema → 若 prod 動畫壞，revert 本 change 的 commit 即可，無資料遷移、無 Dexie/R2 回滾顧慮。route 轉場若是唯一壞點，可單獨 revert `App.tsx` 的 `AnimatePresence` wrapper。

## Open Questions

（apply 階段定，皆為 dogfood-tunable，非結構性）

- **OQ1**：route「神經訊號 wipe」具體視覺（純 opacity 淡入 vs 加一道 signal sweep overlay）— apply 時先做最小 opacity+輕位移，dogfood 後決定要不要加 sweep。
- **OQ2**：迷宮答錯 decay 閃爍鎖定「該科整條路徑」還是「最近點亮節點」— apply 時看 `MazeGrid` 既有 per-family 元素粒度決定。
- **OQ3**：DMN 啟用爆發 surge/bolus/family-buff 是否用不同色 ParticleBurst 區分 lane — 預設同色一致，dogfood 後再分色。
- **OQ4**：夥伴 pulse keyframe（blink vs scale-pulse vs glow）— apply 時挑一個與 `exp-bob` 不打架的。
