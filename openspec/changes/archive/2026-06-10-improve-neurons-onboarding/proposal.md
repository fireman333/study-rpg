## Why

宣傳在即，會帶大量新玩家從手機點進來，但目前的新手 onboarding 有四個會直接造成流失的缺口：(1) 錯題出征的好處（清錯題＝修復腦圖連線＋抽 DMN 命運卡）只藏在出征鈕 hover tooltip 與 HelpMenu，新手指引卡完全沒講；(2) 0 錯題的全新玩家看到的出征鈕是灰掉的死按鈕「無錯題」、旁邊沒有任何解鎖提示，看起來像壞掉；(3) 現有 `HomepageOnboarding` 是一張字多的卡、四步等權重、沒有先後順序引導；(4) 用詞偏 jargon（走腦圖 / 節點 / growth cone / wire / 突觸）。新玩家走完第一個 session 後，大概只 get 到「唸書＋答題 → 腦圖長神經元」，但不知道「為什麼要做錯題出征、它給我什麼」——而出征正是這款遊戲把痛苦的錯題複習變成獎勵的核心 hook。

## What Changes

把單張靜態指引卡換成**兩個互補的 onboarding moment**，拼起來才同時補上 #1 缺口（出征好處）並滿足收集 hook：

- **互動引導層（可跳過＋可重播）**：一個非阻斷式的 coachmark / 聚光覆蓋層，觀察既有遊戲事件、依序聚光下一個動作 —— 答第一題 → 看 walker 在腦圖前進 → 累積到首節點 → **抽出第一隻神經元（引導終點＋慶祝）**。首屏一律白話，深度神經學術語移到 HelpMenu（漸進揭露）。首次預設帶完整流程，但任何時候可按「跳過」；HelpMenu 提供重播入口。（首節點需 11 能量、每答對 +3 → 約答對 4 題即達，引導不會拖。）
- **出征解鎖聚光（just-in-time）**：玩家**第一次答錯**時，⚔️ 錯題出征鈕浮出＋光暈，同時彈一段短文把好處講在正確的時機：「答錯不是壞事 → 它會進錯題出征 → 重新答對＝修復腦圖連線＋抽 DMN 命運卡」。出征鈕對全新玩家（從未答錯過）**不再是灰掉的死按鈕**，而是隱藏到首次答錯才一次性揭露（one-way reveal）；揭露後維持常駐（即使之後清空錯題，回到既有的 disabled「無錯題」狀態）。
- **退役舊的靜態 `HomepageOnboarding` 四步卡**，由互動引導層取代，避免兩套並存；保留 dismiss / 永不再現 / 帳號重置會重新出現的既有語意。

不在範圍：不改 walker / 能量 / gacha 核心邏輯；不 bump Dexie schema（onboarding 狀態走純 `meta` key）；不加 telemetry 埋點（驗收走 dogfood + 同學試玩）。

## Capabilities

### New Capabilities
- `neurons-onboarding`: 新玩家首次體驗的引導系統 —— 非阻斷式互動引導覆蓋層（觀察既有事件、可跳過、HelpMenu 可重播、首屏白話術語移 HelpMenu、引導終點為抽出第一隻神經元）＋ just-in-time 出征解鎖聚光（首次答錯時揭露出征鈕並教好處）。狀態全走 `meta` key，不動 Dexie schema 與 maze/quiz 核心邏輯。

### Modified Capabilities
- `neurons-homepage`: (1) 既有「one-tap-dismissable first-visit onboarding」requirement 由「靜態四步卡」改為「託管互動引導覆蓋層」（保留 dismiss / 永不再現 / reset 重現語意，新增可跳過＋可重播）。(2) 既有 CTA toolbar requirement 中「⚔️ 錯題出征 作為常駐 (persistent) primary CTA」改為「對從未答錯過的新玩家隱藏，首次答錯一次性揭露後常駐」（取代目前 always-visible-but-disabled「無錯題」死按鈕行為）。

## Impact

- **新檔（apps/neurons-tw/src）**：互動引導覆蓋層元件 + 出征解鎖聚光元件 + onboarding 狀態 helper（純 `meta` key，mirror 既有 `HOMEPAGE_ONBOARDING_DISMISSED_KEY` pattern）。
- **改檔**：`components/HomepageOnboarding.tsx`（退役 / 收斂為引導層入口）、`routes/OverviewPage.tsx`（掛載引導覆蓋層、出征鈕改為 one-way reveal gating）、`components/HelpMenu.tsx`（加重播入口、吸收被移出首屏的深度術語）、`components/MazeExpedition.tsx`（若聚光需指向出征入口）。
- **事件相依（只訂閱、不改）**：`lib/maze/answer-feedback`（`emitAnswerCorrect` / `emitAnswerWrong`）、connectome `events` bus（`connectome.variantSlotUnlocked` = 抽出神經元）、`lib/maze/maze-focus`（`onMazeFocus` walker 聚焦）。
- **無 schema 影響**：不 bump Dexie、不動 R2 bundle `SCHEMA_VERSION`、不加 `SYNCED_META_KEYS`（onboarding 一次性旗標是 device-local 體驗狀態，不需跨裝置 sync）。
- **約束**：手機 first（聚光覆蓋層而非大文字卡）；所有動畫尊重 `prefers-reduced-motion`。
