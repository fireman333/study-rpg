## Why

`apps/neurons-tw` 已有 open-collection 變體圖鑑（render-only-collected、純計數、永遠可抽），但「收集」與「唸書 / 答題」之間缺少一個讓玩家**主動探索、看著進度長出來**的空間敘事。神經科學上，connectome 在真實大腦裡正是 axon growth cone「探索」白質束、沿 guidance cue 找路長出來的——這不是硬湊的隱喻，是神經發育的字面描述。把收集視圖改造成「腦內迷宮」探索，能把既有的答題 / 閱讀迴圈接上一條「派變體去探索、抵節點抽卡點亮」的長線目標（一周目 axon pathfinding，~2–3 個月探索一整張圖）。

本 change 只切**第一個 MVP vertical slice**：單一 NT 區（DA = 藥理學 + 公共衛生學 = 20 節點）、獨立 `/maze-beta` route、完全不動現有 connectome，先驗證探索 loop 手感 + 視覺管線可行性，再決定是否 migrate 進主視圖 / 擴張到 4 區。

## What Changes

- **新增 `/maze-beta` route**（獨立、不動現有 connectome / Collection 2.0 view）：在一張 DA 通路腦圖上探索，sprite 沿白質束走廊推進、抵節點 reveal + 抽卡點亮。
- **新增 growth-signal 探索經濟**：答對 + 閱讀都產 growth signal 進池；答對即時看到 growth cone 前進一格 + 音效；streak 加快累積；signal 累積推進探索；抵節點統一結算抽卡（保底 1 抽必出該 family 未收 slot）。
- **已收集變體 = Pikmin 探索小兵**：DA 隊探索 DA 區；基礎探索速度固定（新玩家也能推），已收集變體越多 / 越稀有 → 探索越快（buff，不卡死）。
- **fog of war 顯示**：未探索節點 = 迷霧（不顯剪影、不預顯形狀 / rarity，比剪影更徹底）；NT 區域輪廓可見、區內節點在霧中。對齊 open-collection「不預顯結構」范式。
- **純計數 chip 「🧠 已連線 X 個腦區」**（無 X/20、無 X/110 分母；隱藏總數，mirror open-collection `🧬 X 隻`）。**不復活** family-complete / 完成度里程碑。
- **無痛遷移**：既有玩家已收集的 DA 變體 = 對應節點開局即點亮（lit-node state 由既有 collected-variant state **derive**，不重複儲存）。
- **build-time 視覺管線**：codex 生 flat-saturated 4 色乾淨 DA 通路像素底圖 → build-time（HSV mask → Zhang-Suen skeletonize → skeleton→graph endpoint/branch → RDP 簡化 polyline → arc-length JSON），一次預處理存 JSON，runtime 零重算。節點綁 skeleton 拓撲特徵（endpoint / branch），非人工撒。runtime sprite 沿 polyline arc-length tween（平滑、非粗格）。
- **色弱友善三重編碼**（顏色 + 線型 + 節點形狀）— 雖然 slice 只有 DA 一隊，先把編碼框架立起來，4 區擴張時直接沿用。

## Capabilities

### New Capabilities
- `neurons-brain-maze`: A fog-of-war exploration view over a DA-pathway brain map for `apps/neurons-tw`. Defines the growth-signal economy (答題 + 閱讀 → signal → exploration advance → node settle + gacha), node↔variant-slot binding, collected-variant→lit-node migration, fog-of-war display rules, pure-count chip, the build-time image→skeleton→graph pipeline contract, and the runtime arc-length sprite-walk. Scoped to the DA region MVP slice on an independent `/maze-beta` route.

### Modified Capabilities
<!-- None. The slice is purely additive on an independent route; it does NOT change neurons-variant-collection-view, neuron-variant-gacha, or neurons-mode requirements. Migration reads existing collected-variant state read-only. -->

## Impact

- **New route**: `apps/neurons-tw/src/routes/MazeBetaPage.tsx` (+ maze sub-components) wired into the router as `/maze-beta`. No change to existing routes.
- **New services / lib** (`apps/neurons-tw/src/lib/`): growth-signal accumulator + exploration-advance + node-settle/gacha-bridge + maze-graph loader.
- **Build-time script** (`apps/neurons-tw/scripts/` or `packages/theme-pixel-neurons/`): image→skeleton→graph generator emitting a static graph JSON consumed at runtime. Dev-dependency on a polyline simplifier (`simplify-js`); Zhang-Suen thinning + HSV mask + skeleton-to-graph self-written (no OpenCV) per validated v7 prototype.
- **New asset**: one flat-saturated 4-color DA-pathway pixel base image (codex `gpt-image-2`, visual-approval checkpoint during apply) + its derived graph JSON.
- **Persistence**: signal-pool + per-node exploration progress. Prefer the existing `meta` key-value table (no Dexie `.version()` bump). If a dedicated store proves necessary, a v9→v10 upgrade fixture is mandatory (project hard rule, `dexie-fixture-lint.yml`). Lit-node state for already-collected variants is derived, not stored.
- **Gacha reuse**: settle-pull reuses the existing `neuron-variant-gacha` pull path + pity (read-only consumption of the 110 catalog / `FAMILY_NT_BRANCH`); no gacha requirement change.
- **Explicitly out of scope** (follow-ups): 二周目 myelination reward layer; 5HT / GABA / Glu regions; DMN fate-card收編 as event layer; R2 sync wiring for maze progress (slice stays local / derives from already-synced collected variants).
- **Reversibility**: independent route + additive only → revert = delete the route + lib + asset; zero impact on shipped connectome.
