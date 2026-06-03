## Why

neurons-tw 的神經元變體立繪目前全是靜態 `<img>` — 收集頁 / connectome 節點 / 變體解鎖 reveal 都不會動,收集養成的「生命感」與「獲得時刻」偏平。要讓遊戲更豐富,但在對 55 隻立繪量產動畫**之前**,需先用「一隻 hero + 全域 idle」的 vertical slice 打通完整管線、在真機實測效能、鎖定量產 spec(尺寸 / frame 數 / sheet 格式 / 命名 / 工法),避免先囤大量資產才發現規格要重來。

## What Changes

- 新增**全域 idle「活著感」動畫**:發光脈動(drop-shadow / 亮度週期增減)+ 輕微擺動(rotate ±1.5° 慢速),純 CSS `transform`/`filter`(GPU 合成),一套套用所有變體立繪渲染面(收集頁 `/dmn`、connectome 節點 SVG `<image>`、family picker、`VariantUnlockModal`)。尊重 `prefers-reduced-motion`,off-screen 暫停。
- 新增**多段 sprite-sheet 播放元件**(CSS `steps()`,非逐幀 JS);非 hero 立繪 fallback 靜態 `<img>`。
- 為**一隻 hero(藥理學 slot 3「突觸快樂使者」,`variant:藥理學:3`)**製作 3 段動作 sheet:`idle` loop / `correct`(該家族答對時播一次興奮放電) / `evolve`(變體解鎖時的進化爆光),接到既有事件(`connectome.recordCorrectAnswer` 家族過濾、`connectome.variantSlotUnlocked`)。
- **兩種 frame 工法並排比較**以定調量產:(1) PIL「變形」腳本(對既有 384px 立繪套 squash/stretch/bounce/scale/flash/glow,deterministic、可量產);(2) Aseprite 手繪同一隻至少一段當品質對照。組裝走 Aseprite batch Lua 管線(sheet + JSON + GIF)。
- 先在 `/motion-demo` sandbox prototype 驗證(相 + 效能 + 狀態切換),再 wire 進真實 surface。
- hero sheet 資產放 `packages/theme-pixel-neurons/sprites/animated/`,註冊進 `SPRITE_MAP`。

## Capabilities

### New Capabilities
- `neurons-sprite-animation`: 神經元變體立繪的動畫行為 — (a) 全域 idle「活著感」(CSS,套用所有立繪渲染面,reduced-motion / off-screen 規則);(b) 單隻 hero 的多段 state sprite-sheet 播放(idle / correct / evolve,事件驅動,CSS `steps()`);(c) 非 hero 靜態 fallback;(d) 動畫資產命名 / 註冊約定與量產 spec(尺寸 / frame / 工法 verdict)。

### Modified Capabilities
<!-- 無:純新增自足視覺 capability。對 neuron-variant-gacha 解鎖 reveal、connectome-collection 節點的整合,以本新 capability 的行為描述涵蓋,不改既有 requirement 語意。 -->

## Impact

- **程式**(neurons-tw,track-neurons worktree):新增 idle wrapper + sprite-sheet player component(`apps/neurons-tw/src/components/`);擴充 motion lib timings(`apps/neurons-tw/src/lib/motion/timings.ts`);擴充 sprite 註冊(`packages/theme-pixel-neurons/src/sprites.ts` glob + `SPRITE_MAP`);wire 進 `DmnCollectionPage` / `FamilyNode`(SVG)/ `VariantUnlockModal` / `MotionDemoPage`。
- **資產**:新增 `packages/theme-pixel-neurons/sprites/animated/` 下 hero 3 段 sheet PNG(+ JSON metadata);build-time asset,無 runtime 下載。
- **無 persisted state 變更**:不動 Dexie schema、不動 R2 bundle、不動 leaderboard、無新同步欄位。純前端視覺。
- **依賴**:沿用既有 `framer-motion ^11`;無新 npm 依賴(idle 走 CSS,sheet 走 CSS steps())。
- **效能**:同畫面多個動畫立繪 → 用 GPU-friendly `transform`/`filter` + off-screen / `prefers-reduced-motion` 暫停;slice 要在 Chrome MCP(port 5175)實測無 jank。
- **已知風險**(slice 先驗):SVG `<image>` 套 CSS `transform` 的 `transform-origin` 行為;`steps()` sheet 在不同 DPR / 縮放下的 frame 對齊;`imageRendering: pixelated` 與 sheet 切格的交互。
- **Out of scope**:synapse firing 事件 VFX(延後,POC 已存於 `~/.claude/scratch/synapse-vfx-2026-06-01/`);量產其餘 54 隻 route-C 多段 sheet(等本 slice 鎖定 spec 後另開 follow-up change);非 hero 立繪的 route-C 狀態動畫。
