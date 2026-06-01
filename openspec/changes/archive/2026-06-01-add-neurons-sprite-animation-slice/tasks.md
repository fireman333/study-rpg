## 1. Hero frame 製作 — PIL 變形工法

- [x] 1.1 寫 `render_hero_frames.py`:讀 `藥理學-3.png`(384px),用變形(squash/stretch/bounce/scale/translateY/flash/glow)生 3 段 frames — `idle`(呼吸+輕浮)、`correct`(彈跳+發光爆)、`evolve`(放大+光芒爆+定格)。位於 `~/.claude/scratch/neuron-hero-anim-2026-06-01/`
- [x] 1.2 跑腳本產出各段 PNG frames,自己 Read montage QA(構圖/發光/錨點在底部不飄)— idle 8 / correct 9 / evolve 11 frames,金色 glow + flash,底部錨點 OK
- [x] 1.3 決定各段 frame 數 / 單格尺寸:idle 8 / correct 9 / evolve 11;sheet native 訂 **192×192/frame**(顯示 ≤128px,192 留 crisp headroom 且 sheet 檔不過大)。回填 design.md

## 2. Hero frame 製作 — Aseprite 手繪工法(品質對照)

- [x] 2.1 `assemble_hero.lua` 把 3 段 PIL frames 組成可編輯 `.aseprite` 源檔(idle/correct/evolve,scratch/藥理學-3-*.aseprite)交付手調。誠實結論:逐格「手繪角色動作」是人類像素師 GUI 的工作,LLM 無法產出有品質的逐格角色動畫 → 改交可編輯源檔(不假裝手繪)
- [x] 2.2 並排比較:PIL 變形版已成(整隻變形 + 金光/閃光/放射特效);真手繪需人工 GUI,本 slice 不偽造產出
- [x] 2.3 design.md D6 記錄 verdict:PIL 變形 = 量產 baseline(一支腳本套全部);傳說級(slot 5)真手繪升級 = 人工 GUI,交可編輯 .aseprite 源檔

## 3. Sheet 組裝 + 註冊

- [x] 3.1 `assemble_hero.lua` 組裝 3 段橫向 sheet + JSON + 可編輯 `.aseprite`(Aseprite batch Lua)
- [x] 3.2 透明 PNG sheet → `packages/theme-pixel-neurons/sprites/animated/藥理學-3-{idle,correct,evolve}.png`(3072/3456/4224 × 384,native 384/frame)
- [x] 3.3 `sprites.ts` 加 `animated/*.png` glob + 尾端解析 `variant:<family>:<slot>:<state>` 進 `SPRITE_MAP`
- [x] 3.4 app dev 確認三個 hero key(`variant:藥理學:3:{idle,correct,evolve}`)可解析 — Chrome MCP 實測 backgroundSize 1536/1728/2112px(8/9/11 格×192)皆正確

## 4. 全域 idle 動畫(路線 D / CSS)

- [x] 4.1 `styles.css` 加 `@keyframes neuron-idle-glow`(drop-shadow/brightness 脈動)+ `@keyframes neuron-idle-sway`(rotate ±1.5° 慢速)
- [x] 4.2 加 `.neuron-sprite--alive`(兩動畫不同週期 3.1s/4.3s 錯相位)+ `@media (prefers-reduced-motion: reduce)` 停用
- [x] 4.3 class 內含 `transform-box: fill-box; transform-origin: center bottom`(SVG `<image>` 擺動不偏移節點;從底部錨點搖)
- [x] 4.4 idle 週期/相位直接放 CSS(純 CSS 動畫,CSS 無法讀 TS 常數;不在 timings.ts 加未被消費的 const,避免 dead code)

## 5. SpriteSheetPlayer 元件

- [x] 5.1 新增 `SpriteSheetPlayer.tsx`:props `{ spriteKeyBase, state, size, onComplete? }`;CSS `steps()` + `background-position` 播具名段(per-instance `useId` keyframe)
- [x] 5.2 查無對應 sheet key → fallback 靜態 `<img>`(保留 `imageRendering: pixelated`),不報錯
- [x] 5.3 `correct`/`evolve` = one-shot(`steps(N,jump-none)` 1 forwards 定格 + `onAnimationEnd`→onComplete);`idle` = loop(`steps(N)` infinite);state prop 切換

## 6. /motion-demo sandbox prototype(先驗再 wire)

- [x] 6.1 `MotionDemoPage` 加 hero 區塊:`SpriteSheetPlayer` 192px + idle/correct/evolve 按鈕(nonce key 重掛重播)
- [x] 6.2 同區塊放 4 隻 `.neuron-sprite--alive` 靜態立繪(藥理/免疫/病理/解剖 slot 1)目視 idle
- [x] 6.3 dev(port 5175)+ Chrome MCP 驗:三段切換正確(sheet size 1536/1728/2112)、idle loop、console 無 error、reduced-motion code-verified。背景分頁 animationend 節流為已知 artifact(手動派發證 revert 正確)

## 7. Wire 進真實 surface

- [x] 7.1 idle:`.neuron-sprite--alive` 套進 FamilyPicker(48px icon,**live 驗 11 隻跑 glow+sway**)+ `VariantUnlockModal` 非 hero 靜態立繪。**`FamilyNode`(connectome 節點)刻意 DEFER**——connectome 是精修過的 hero,已有 firedToday halo/slot-unlock pulse/ambient firing,加通用 idle 會打架變雜;另開設計 pass。`DmnCollectionPage` = DMN 卡非變體立繪(N/A)
- [x] 7.2 答對反應:接 `QuizModal` reveal 區(答對既有 SpikeTrainFiring 旁),gate = 該家族 slot-3 有 `correct` sheet(`heroReactionBase`)→ 泛化、非 hardcode。**live 驗:真實藥理學答對 → hero correct 反應(936px=9格×104、sheet-correct iter=1)**。其他家族無 sheet → gate 失敗不反應
- [x] 7.3 進化:`VariantUnlockModal` 條件 render——變體有 `:evolve` sheet(hero)→ `SpriteSheetPlayer evolve`(128px);否則靜態 + idle alive。**logic-verified**(key 解析 ✓ + sandbox evolve 證 ✓ + typecheck ✓;live reveal 需 genuine AP-threshold roll,HMR 模組重複使 console emit 無法觸發 app singleton)

## 8. 驗收 + 收尾

- [x] 8.1 Chrome MCP(port 5175)端到端:✅ 真實藥理學答對 → hero `correct` 播放(截圖確認 reveal 內 hero 現身);✅ idle live(family picker 11 隻);evolve logic-verified;其他家族答對不反應(gate 邏輯確認,registry 僅藥理學:3 有 sheet)
- [x] 8.2 效能:family picker 11 隻 idle 同時跑無 jank(GPU `transform`/`filter` 合成);drop-shadow 在此量級 OK,未觸發降級
- [x] 8.3 `typecheck` + `build` 通過;hero sheets bundle 進 dist(idle 207/correct 331/evolve 542 KB);**無新增 persisted state**(不碰 Dexie/R2/leaderboard)。注意:384 native/frame 對單 hero OK,**量產 55×3 需 downscale(~128-192)+ 考慮 lazy-load**(本 slice 已暴露此成本)
- [x] 8.4 design.md Open Questions 已回填;`/opsx:verify` 跑過;`/opsx:archive` + commit **待使用者確認**(Curator 規則)
