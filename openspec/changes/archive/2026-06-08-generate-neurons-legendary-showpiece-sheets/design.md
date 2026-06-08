## Context

神經元變體動畫的基礎建設於 `add-neurons-sprite-animation-slice`(2026-06-01,藥理 slot-3 hero)打通,並由 `animate-neuron-variants-per-family` 量產 11 科 slot-3 featured 的 `correct`+`evolve` sheet。播放走 `SpriteSheetPlayer`(CSS `steps()`,compositor-friendly,免逐格 JS,抗背景分頁 rAF throttle);sheet 透過 `packages/theme-pixel-neurons/src/sprites.ts` 的 `import.meta.glob('../sprites/animated/*.png')` 以 key `variant:<family>:<slot>:<state>` 自動註冊;frame 數由 `SpriteSheetPlayer.tsx` 的 `STATE_META` 鎖死(idle 8 / correct 9 / evolve 11)。

當前缺口:各家族 slot-5「傳奇 apex」(rarity P1,敘事最高潮的變體)目前解鎖時 `VariantUnlockModal` 只播靜態立繪。而 `VariantUnlockModal:129` 的 evolve 觸發**已 keyed by 被解鎖變體自己的 `spriteKey`**(`SPRITE_MAP[`${variant.spriteKey}:evolve`]`),所以只要產出 `variant:<科>:5:evolve` sheet,解鎖傳奇時就會自動播放 — 無需任何 render code 改動。

生成工法已確立:slice 的誠實結論是「逐格手繪角色動畫 LLM 產不出品質」,改採 **PIL 程序變形工法**(讀靜態 base sprite,套 squash/stretch/bounce/scale/translateY/flash/glow 合成 frames)。批次量產腳本 `render_variant_frames.py` 仍存在於 `~/.claude/scratch/neuron-variant-anim-2026-06-01/`,吃 `family`+`slot` 參數。

## Goals / Non-Goals

**Goals:**
- 全 11 科 slot-5 傳奇 apex 各產 `<科>-5-evolve.png`(11 幀爆光)+ `<科>-5-correct.png`(9 幀答對反應)兩段 showpiece(~192px/frame),解鎖傳奇 / 擁有傳奇後答對時播放,達商業手遊等級高潮感。
- evolve 零 render change;correct 僅小幅 render change(QuizModal featured 解析 ownership-gated),不碰 schema。純前端 presentational。
- 復原 PIL 批次腳本進 repo 版控,供未來重生 / 調參。
- 修正既有 spec 中「slot 5 = 真・逐格手繪」的 stale 假設(改為 PIL showpiece)。

**Non-Goals:**
- 夥伴(膠細胞)march sheet — 維持單幀 + CSS `exp-bob`(2026-06-04 已 ship,多幀想法已 closed)。
- slot-5 的 `idle` sheet(全域 CSS `.neuron-sprite--alive` 已涵蓋,既有 spec「新增變體 idle 不另產 sheet」)。
- 改動 `SpriteSheetPlayer` / `VariantUnlockModal` / `STATE_META`(僅 QuizModal 小改 featured 解析)。
- 任何 Dexie / R2 / leaderboard / content 常數變動。
- 真・逐格手繪(GUI 像素師工作,LLM 不產出品質逐格角色動畫)。
- 把 featured 反應綁定到「玩家選的 representative slot」(更通用但耦合 representative 系統 — 本批用簡單的 slot-5-if-owned;representative 耦合留 follow-up)。

## Decisions

### D1 — evolve + correct(不做 idle);owner 2026-06-08 GATE-1 加做 correct
**選擇**:slot-5 產 `evolve`(11 幀)+ `correct`(9 幀)兩段 showpiece,不產 `idle`。
**理由**:
- evolve 是**純資產零 render change**:`VariantUnlockModal` 已 keyed by 解鎖變體 spriteKey,直接採用。
- correct 讓「擁有傳奇的玩家答對時,反應立繪升級成傳奇」— 與 evolve 配對才是完整的傳奇 juice(原 GATE-1 預設只做 evolve,owner 選擇加做 correct,接受隨之而來的小 render change,見 D6)。
- `idle` 由全域 CSS `.neuron-sprite--alive` 涵蓋(既有 spec:「新增變體的 idle 不另產 sheet」),slot-5 不需獨立 idle sheet。

### D6 — QuizModal featured 答對反應:ownership-gated slot-5-if-owned-else-slot-3
**選擇**:`QuizModal.tsx:470` 的 `heroReactionBase` 從 hardcode `variant:<family>:3` 改為:
```
ownsLegendary = useLiveQuery(() => db.neuronVariants.get([q.subject, 5]), [q.subject])   // slot-5 是否已擁有
heroReactionBase = isCorrect
  ? (ownsLegendary && SPRITE_MAP[`variant:${q.subject}:5:correct`] ? `variant:${q.subject}:5`
     : SPRITE_MAP[`variant:${q.subject}:3:correct`] ? `variant:${q.subject}:3`
     : null)
  : null
```
**理由**:
- **ownership-gate 是必要的**:沒擁有傳奇就播傳奇反應立繪 = 顯示玩家沒有的東西,敘事錯。`neuronVariants` PK `[familyId+slotIndex]`,`get([family,5])` 是最直接的 ownership 查詢。
- liveQuery 是 neurons 既有慣例(CollectionPage 用 `useLiveQuery`),per-question 訂閱 `q.subject` 成本低。
- 退階順序明確:擁有傳奇且有 sheet → slot-5;否則 slot-3(既有行為);都沒 sheet → null(無反應,既有 fallback)。
**替代方案**:
- 綁 representative slot(玩家選的代表變體)→ 更通用但耦合 representative 系統,本批用簡單 slot-5-if-owned,representative 耦合留 follow-up。
- 不 gate、sheet 存在就用 slot-5 → 否決(沒擁有也反應,敘事錯)。

### D2 — PIL 變形 showpiece(非逐格手繪),但 recipe 比 featured 更華麗
**選擇**:復原 `render_variant_frames.py`,對 slot-5 base sprite 跑 evolve 段,但用比 slot-3 featured 更戲劇化的變形參數(更大放大、更強 flash 爆光、更長尾光暈),體現「傳奇 > featured」的視覺階層。
**理由**:slice 已證 LLM 無法產品質逐格手繪;PIL 變形是確定性、跨幀一致、零 image-gen quota 的 baseline。傳奇的「華麗度」由(a)更激進的變形 recipe +(b)base sprite 本身已是最精緻的傳奇立繪 共同達成。
**替代方案**:codex/Gemini image-gen 逐格 → 否決(慢、卡 quota/content-gate、跨幀不一致)。

### D3 — per-family glow 取色(避免單一金色套髒)
**選擇**:沿用既有量產工法的 per-family glow / flash 取色(自立繪高亮自動取樣,既有 spec「批次量產工法」requirement 已要求),不要硬套單一金色 glow 在藍/綠/紅立繪上。
**理由**:既有 spec 已立此規範,slot-5 沿用即可保持 11 科視覺一致。

### D4 — native frame size 192/frame(downscale,非 384)
**選擇**:slot-5 evolve sheet native 訂 ~192px/frame(11 幀 → sheet ~2112×192)。
**理由**:slice 已暴露「384/frame 對單 hero OK,量產需 downscale + lazy-load」。192 留 crisp headroom(顯示 ≤128px)且控制 bundle。sheets 經 Vite `?url` glob 成獨立 hashed asset,天然 on-demand,不進主 JS bundle。

### D5 — 11 科 prod-coherent 才 merge
**選擇**:11 科 slot-5 evolve sheet 全產出 + `pnpm build` 過,才 merge → 部署(對齊既有「11 科全完才 merge」一致性紀律)。
**理由**:避免「有些傳奇有 evolve、有些靜態」的不一致觀感。

## Risks / Trade-offs

- **base sprite 風格不一 → evolve 變形後 11 科華麗度不齊** → Mitigation:逐科 montage QA(底部錨點不飄、glow 取色正確、爆光強度一致);不一致就微調 recipe 重跑(腳本確定性,重跑成本低)。
- **PIL 變形 ≠ 真手繪,owner 期待「手繪等級」可能落差** → Mitigation:GATE 1 已明示 evolve = PIL showpiece(非手繪);更激進 recipe + 傳奇 base 立繪拉視覺;若仍不滿意,保留「未來人工 Aseprite 重繪少數最 hero 科」作 follow-up(不阻塞本批)。
- **bundle 體積** → Mitigation:192/frame downscale + on-demand hashed asset;`pnpm build` 後檢查 11 張 evolve sheet 總體積(對照 slice evolve 542KB@384 → 192 約降 4×)。
- **frame 數對不上 STATE_META(evolve=11)會錯格** → Mitigation:腳本固定輸出 11 幀;組裝後 `sheet_width / 192 === 11` 斷言。

## Migration Plan

無資料遷移(純 asset)。部署 = merge `track-neurons` → main → `deploy-cf-pages.yml` rebuild neurons,新 sheet 進 prod bundle。Rollback = revert asset commit(無 schema、無 persisted state,玩家無任何資料受影響;最壞情況退回靜態立繪)。

## Open Questions

- **OQ1 — RESOLVED(owner 2026-06-08 GATE-1)**:slot-5 也做 `correct` sheet,QuizModal featured 改 ownership-gated slot-5-if-owned-else-slot-3(D6)。
- **OQ2(apply 階段定)**:per-family showpiece recipe 的「更華麗」具體參數(放大倍率、flash 強度、尾光長度)→ 跑首科(建議藥理或生化 Purkinje)montage QA 校準 evolve + correct 兩段後套用 11 科。
- **OQ3(apply 階段查)**:`CollectionPage` / `/dmn` 收集頁是否會用 `SpriteSheetPlayer state=idle` 渲染 slot-5?若是,slot-5 無 idle sheet 會自動 fallback 靜態(既有行為,OK);確認不會破版即可。
