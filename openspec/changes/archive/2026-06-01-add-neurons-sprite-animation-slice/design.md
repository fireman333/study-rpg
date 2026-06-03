## Context

neurons-tw 立繪全為靜態 `<img src imageRendering:pixelated>`(384px 源、收集頁 68px / connectome 節點 64px / family picker 48px / 解鎖 modal 128px)。Framer Motion ^11 已裝,motion lib 在 `apps/neurons-tw/src/lib/motion/timings.ts`,CSS keyframes 在 `src/styles.css`(已有 `neuron-firing-pulse`、`AmbientFiring` component)。事件走 `subscribeConnectomeEvents({...})`(`recordCorrectAnswer` / `variantSlotUnlocked` / `synapseFormed`),`FamilyNode` 已示範訂閱 + pulse。`/motion-demo` 是現成 sandbox route。目前無任何 sprite-sheet / `steps()` 動畫,此 change 為首例。

本 change 是「animate sprites」大目標的**第一個 vertical slice**:在一隻 hero 打通完整管線 + 把廉價 idle 套全部,藉此鎖定量產 spec,避免先囤 55 隻才發現規格要重做。

## Goals / Non-Goals

**Goals:**
- 一套 CSS idle 套用所有立繪,近零美術成本、GPU 友善、尊重 reduced-motion。
- 一隻 hero(`variant:藥理學:3`)的 3 段 state sprite-sheet(idle / correct / evolve),事件驅動切換。
- 比較兩種 frame 工法(PIL 變形 / Aseprite 手繪),得出量產 54 隻的 verdict。
- 先在 `/motion-demo` prototype,再 wire 進真實 surface;Chrome MCP 實測效能。

**Non-Goals:**
- 不做 synapse firing 事件 VFX(延後;POC 已存)。
- 不量產其餘 54 隻 route-C sheet(等 spec 鎖定後 follow-up)。
- 不做角色「肢體重畫」級動作(PIL 變形不負責肢體;真肢體動畫保留給手繪 follow-up)。
- 不動 persisted state(Dexie / R2 / leaderboard 皆不碰)。

## Decisions

### D1. idle 走純 CSS `transform`/`filter`,不走 Framer Motion 逐元件
**選擇**:idle「活著感」用全域 CSS `@keyframes`(`scale` 呼吸性可選、`drop-shadow`/`brightness` 發光脈動、`rotate ±1.5°` 慢速擺動),套在共用 sprite wrapper。
**理由**:`transform`/`filter` 由 compositor 處理,GPU 合成、不觸發 layout/paint,數十隻同時動也便宜;CSS 動畫在背景分頁仍由 compositor 跑(與 rAF 不同),驗證時不受 Chrome MCP 背景分頁 throttle 影響。
**Alternatives**:Framer Motion 逐立繪 → 每隻一個 motion 元件 overhead 大、JS 驅動可能掉幀,否決。

### D2. 擺動刻意低調(±1.5°、慢速、與發光錯相位)
**選擇**:rotate 幅度 ≤1.5°、週期 ~3–4s、與 glow 脈動不同步。
**理由**:使用者選了「輕微擺動」,但擺動用力會像果凍(已於提問時標註慎用)。低幅 + 慢速 + 錯相位 → 有生命感不浮誇。
**Alternatives**:明顯搖擺 → 廉價感,否決。

### D3. 多段動畫用 CSS `steps()` sprite-sheet,不逐幀 JS
**選擇**:水平 sheet(N×frameW)+ `background-position` `steps(N)` 動畫播放具名 state 段;封裝成 `<SpriteSheetPlayer state=...>` 元件。
**理由**:`steps()` 是 GPU 友善、零 JS tick、與既有 `imageRendering: pixelated` 相容;對齊前次 firing 驗證的 Aseprite sheet 匯出格式(已有 JSON metadata)。
**Alternatives**:逐幀 JS `requestAnimationFrame` 切 `src` → 背景分頁被 throttle(踩過的坑)、JS overhead,否決。Framer Motion sprite → 無原生 sprite-sheet 支援。

### D4. 非 hero fallback 靜態,hero 才上 sheet
**選擇**:`SpriteSheetPlayer` 查 `SPRITE_MAP` 有無 `variant:<f>:<s>:idle`,有則播 sheet、無則靜態 `<img>`。
**理由**:slice 只做 hero;其餘 54 隻在量產前保持現況零風險。
**Alternatives**:全部強制走 player → 54 隻沒 sheet 會破版,否決。

### D5. hero = 藥理學 slot 3「突觸快樂使者」
**選擇**:VTA 多巴胺、mid-tier、自帶 pulse 訊號圖標。
**理由**:多巴胺=最 iconic 的獎勵/放電神經元,「答對=愉悅放電」最貼題;mid-tier 造型(有配件但不像 slot 5 皇冠那麼繁)最能 generalize 量產 spec;進化朝 slot 4/5 敘事通順;藥理是 dogfood 最熟科。
**Alternatives**:slot 1(太簡,不代表平均)/ slot 5 王(太繁,過度投資且不代表)→ 否決當 slice hero。

### D6. frame 工法:slice 兩種都做、並排比,定調量產
**選擇**:(1) PIL 變形腳本(對 384px 立繪套 squash/stretch/bounce/scale/flash/glow,deterministic、參數化可量產);(2) Aseprite 手繪同一隻至少「答對反應」一段。組裝走前次驗證的 Aseprite batch Lua 管線(sheet + JSON + GIF)。
**理由**:PIL 變形對「整體變形 + 發光特效」勝任且可一支腳本量產 55 隻,但不重畫肢體;手繪品質最高但慢。實測比較才能誠實決定:預期結論 = PIL 變形當 baseline + 傳說級(slot 5)保留手繪升級。
**Alternatives**:Gemini/codex 逐格 → 具象角色跨格一致性風險高、55×3 成本大,本 slice 不選為主力(可列 follow-up 備案)。
**Verdict(slice 實測,2026-06-01)**:PIL 變形對「整隻變形 + 金光/閃光/放射光芒」勝任,讀得出 idle 呼吸 / correct 獎勵彈跳 / evolve 進化爆光,且一支參數化腳本可量產全 55 隻 → **採為量產 baseline**。真・逐格「手繪角色動作」(墨鏡反光、pulse 圖標獨立跳、肢體擺動)經確認是**人類像素師在 Aseprite GUI 的工作**,LLM 無法產出有品質的逐格角色動畫;故本 slice 交付可編輯 `.aseprite` 源檔(`scratch/藥理學-3-*.aseprite`)供人工精修,**傳說級(slot 5)才值得這樣升級**。Gemini/codex 逐格列為 follow-up 備案(若要真肢體動作又不想全手繪)。

### D7. 先 `/motion-demo` prototype,再 wire 真實 surface
**選擇**:idle + hero 三段先在 sandbox 跑通(相 + 效能 + 狀態切換),再接 `DmnCollectionPage` / `FamilyNode` / `VariantUnlockModal`。
**理由**:sandbox 隔離降低破壞現有頁面的風險;符合 vertical-slice 紀律。

## Risks / Trade-offs

- **SVG `<image>` 套 CSS transform 的 origin 行為** → connectome 節點立繪可能偏移。Mitigation:在 SVG image 上設 `transform-box: fill-box; transform-origin: center`,slice 在節點實測對齊。
- **`steps()` sheet 在非整數 DPR / 縮放下 frame 對齊跑掉**(露出相鄰格邊) → Mitigation:frame 用整數像素尺寸 + sheet 無 padding(對齊前次 firing 匯出),必要時每格留 1px transparent gutter 並用 `background-size` 精算;Chrome MCP 在多縮放測。
- **多立繪同時 `filter: drop-shadow` 成本** → drop-shadow 比 transform 貴。Mitigation:idle 發光優先用 `box-shadow`/預烘焙 glow 或限制 drop-shadow 同時數量;Chrome MCP 量 FPS,超標就降級為亮度脈動。
- **PIL 變形動畫對具象角色「假」** → 純縮放/位移可能顯得僵硬。Mitigation:加 squash&stretch + 錨點在底部 + 特效(flash/glow/粒子)補強;若仍不足,該段改手繪(這正是 slice 要回答的問題)。
- **背景分頁動畫驗證** → CSS 動畫不受 rAF throttle,但仍按既有紀律「斷言終態 / 多縮放」驗。

## Migration Plan

- 純附加、無資料遷移:不動 Dexie schema、不動 R2 bundle、不動 leaderboard。
- 資產 build-time 進 bundle(Vite glob);無 runtime 下載、無後端。
- Rollback:移除 wrapper / player 的掛載點即回到靜態 `<img>`(fallback 路徑本就保留);CSS idle 以單一 class toggle,可一鍵關閉。
- Deploy 不變(CF Pages `/neurons/` + GH Pages 不發 neurons);本 change 不影響 deploy 矩陣。

## Open Questions — Resolved (slice 2026-06-01)

- **發光手法**:`filter: drop-shadow` + `brightness` 脈動。Chrome MCP 實測 family picker 11 隻同時跑無 jank,未需降級為純亮度脈動。
- **frame 數 / 尺寸**:idle 8 / correct 9 / evolve 11;sheet **native 384/frame**(對齊既有變體立繪)。單 hero 三段 bundle ~1.08 MB OK,但**量產 55×3 需 downscale 到 ~128–192/frame + 考慮 lazy-load**(本 slice build 已暴露此成本)。
- **「答對反應」surface**:接 **QuizModal reveal 區**(答對既有 SpikeTrainFiring 旁),gate = 該家族 featured 變體(slot 3)有 `correct` sheet。最貼「答對=獎勵」且為 `recordCorrectAnswer` 源頭;非 hardcode 藥理學。connectome 節點 idle **DEFER**(避免動精修過的 hero)。
- **量產 verdict**:成立(見 D6)。PIL 變形 = 量產 baseline;真手繪 = 人工 GUI,交可編輯 `.aseprite` 源檔,傳說級才升級。

### 仍待後續(follow-up changes)

- connectome 節點 idle 的專屬設計 pass(跟既有 motion 協調)。
- 量產其餘 54 隻 route-C sheet(含 downscale + lazy-load 策略)。
- VariantUnlockModal evolve 的真實 reveal 驗證(genuine AP-threshold roll;本 slice 為 logic-verified)。
- synapse firing 事件 VFX wire(POC 已存 `~/.claude/scratch/synapse-vfx-2026-06-01/`)。
