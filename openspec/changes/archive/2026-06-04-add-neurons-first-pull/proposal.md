## Why

新玩家打開神經元 app 看到的是空白迷宮（4 分支 0 節點亮、0 收藏），缺少「第一眼就活著」的鉤子，也無法立刻建立「四大神經傳導物質家族（DA / 5HT / GABA / Glu）」這個核心心智模型。首抽（first-pull）讓玩家用一次顯式儀式，在四大分支各獲得一隻代表神經元並點亮迷宮，建立收集動機與分支框架。

## What Changes

- 新增一次性「首抽」CTA（位於 first-visit onboarding 卡片內），點擊對 4 個 NT 分支各跑一次真實 gacha roll。
- 每分支：在該分支 families 內**均勻隨機**選 1 個 family（DA 1/2、5HT 1/2、GABA 1/3、Glu 1/4）→ 真實稀有度 roll（沿用既有 P0–P5 pyramid）→ 經**既有 `pullVariant`** mint 真 variant（含 provenance）。
- 迷宮點亮「被抽中 family」的代表節點，即使 `settles = 0` 也亮 → lit-node 推導從「純 frontier」擴為「frontier ∪ starter-lit」。
- **純贈送**：首抽不增加 `maze:<branch>:settles`、不消耗 `earned` energy（首抽**不走** `reconcileSettles`，改直接呼叫 `pullVariant()` 4 次 + 另記 starter-lit 節點）。
- reveal 動畫（重用 motion library 既有 unlock modal）；reveal 期間**抑制成就 toast 洪流**（4 連抽會一次觸發多筆成就），成就靜默 unlock / 入佇列。
- 一次性、跨裝置：新增 synced meta `firstPullDone`（monotonic-OR 語意），防跨裝置或收藏變多後重抽。
- Sync：`firstPullDone` + starter-lit meta key 進 `SYNCED_META_KEYS`；R2 neurons bundle `SCHEMA_VERSION` bump（平行 session 已用到 14，本 change 從 **15** 起跳）。**無 Dexie schema bump**（variants 走既有 table / adapter）。
- 對象：全體玩家（以 `firstPullDone` 判定；實務上目前只有 owner）。
- **不** 觸碰 leaderboard / SRS / mastery / DMN / 裝備（裝備為 Phase 3、parked）。

## Capabilities

### New Capabilities
- `neurons-first-pull`: 一次性首抽儀式 — 顯式觸發、四分支隨機-family + 真實稀有度 roll、純贈送（不動 settle 經濟）、starter-lit 點亮、跨裝置 idempotency、reveal 與成就 toast 抑制。

### Modified Capabilities
- `neurons-brain-maze`: lit-node 推導由「純 frontier（cumulative settles）」改為「frontier ∪ starter-lit（首抽 4 個 family 的代表節點）」；明確首抽**不**推進 settles，settle 經濟其餘不變。
- `neurons-homepage`: first-visit onboarding 增加一次性「首抽」CTA 與其 reveal 進入點；已首抽 / 已 dismiss 後不再出現。

## Impact

- **Code**: `apps/neurons-tw/src/lib/services/`（新 first-pull orchestrator）、`lib/maze/`（`litNodes` union + family→node 代表映射 + economy 不變）、`components/`（onboarding 首抽按鈕 + reveal modal 重用）、`lib/services/`（reveal 期間成就 toast 抑制 hook）。
- **Data / sync**: 新 synced meta keys（`firstPullDone` + starter-lit）；R2 bundle `SCHEMA_VERSION` 15（additive + reader tolerance）；**無 Dexie `.version()` bump**（不觸發 dexie-fixture-lint）。
- **既有玩家**: 首抽以 `firstPullDone` 判定；無 backfill、無 banner。
- **平衡**: 稀有度對迷宮探索零機制影響（speed buff 純看收集「數量」、mastery 是科目精通非變體稀有度），故真實 roll 安全；首抽給每分支 +1 變體 = +4% 速度 head start（intended）。
- **不影響**: leaderboard / worker / D1 / SRS / mastery / DMN — 與平行 session 零重疊。
