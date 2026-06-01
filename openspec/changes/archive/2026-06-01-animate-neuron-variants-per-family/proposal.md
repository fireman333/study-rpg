## Why

`add-neurons-sprite-animation-slice`(archived 2026-06-01)只讓 hero(藥理學 slot 3)會動 → 玩家答對藥理學有 hero 放電反應、答對其他 10 科沒有,形成 **1/11 不一致**,不適合單獨上 prod。本 change 把**每科 featured 變體(slot 3)**都產動畫,讓 11 科全部有 `correct` 反應 + `evolve` 進化,達到 prod-coherent 後才 merge→main 部署。同時驗證 slice 鎖定的量產工法(PIL 變形 baseline + downscale)在 11 種差異化立繪上是否成立。

## What Changes

- 為其餘 **10 科的 slot-3 變體**(藥理學:3 已完成)產 `correct` + `evolve` sprite-sheet,放進 `packages/theme-pixel-neurons/sprites/animated/` 並經既有 glob 自動註冊。
- **idle 不另產 sheet**:全域 CSS `.neuron-sprite--alive` 已套所有靜態立繪(slice 已發現 PIL idle ≈ CSS idle,做 idle sheet 無增益)→ 每科只需 **2 段**(correct/evolve)非 3。
- 泛化 PIL render 腳本吃 `(family, slot)` 參數(目前寫死藥理學-3);per-family glow/flash 色配合各科立繪主色微調。
- sheet native 尺寸 **downscale 到 128–192/frame** + 評估 lazy-load(slice 單 hero 三段 ~1.08 MB @384,量產會爆 bundle)。
- QuizModal correct gate 已查 `variant:<family>:3:correct` → 各科產好 slot-3 sheet 即自動對全 11 科生效(可能標準化 featured=slot3 或抽成設定)。
- 收尾達 prod-coherent → 才 merge `track-neurons`→main + `pnpm deploy:cf`(本 change 不在中途部署半成品)。

## Capabilities

### New Capabilities
<!-- 無新增 capability;延伸既有 neurons-sprite-animation -->

### Modified Capabilities
- `neurons-sprite-animation`: 擴充「動畫資產命名與註冊約定」requirement(hero-only → **per-family featured 變體**);對「答對反應動畫」requirement 加 scenario(11 科皆能反應、各科獨立);新增「批次量產工法」normative(PIL 參數化 + downscale + lazy-load + 非 hero idle 走 CSS)。

## Impact

- **資產**:10 科 × 2 段(correct/evolve)透明 PNG sheet 進 `packages/theme-pixel-neurons/sprites/animated/`(downscale 後體積遠小於 slice 的 384 版)。
- **程式**:render 腳本泛化(scratch 工具,非 repo);可能 QuizModal gate 小幅標準化;**SpriteSheetPlayer / sprites.ts glob / VariantUnlockModal 不需改動**(slice 已設計成自動解析 + fallback)。
- **無 persisted state 改動**:不動 Dexie / R2 / leaderboard / gacha / engine。純前端 asset(+ 腳本)。
- **Bundle**:downscale + lazy-load 控制 10 科 ×2 段體積;`pnpm build` 量測。
- **Deploy**:`pnpm deploy:cf`(從 `~/coding-scratch/study-rpg` deploy worktree);本 change 收尾後才 merge→main 觸發 prod 部署。
- **Out of scope**:全 55(5 slot × 11 科)→ 更後面 follow-up;connectome 節點 idle 設計 pass;idle/correct/evolve 以外新 state;傳說級(slot 5)真手繪升級(人工 GUI)。
