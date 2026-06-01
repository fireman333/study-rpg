## Context

`add-neurons-sprite-animation-slice`(archived 2026-06-01)打通了「神經元立繪動畫」的完整管線,但只在 hero(藥理學 slot 3)落地:全域 idle CSS 套了全部立繪,而 `correct`/`evolve` 多段 sprite-sheet 只有藥理學:3 有。結果是答對藥理學會放電反應、答對其他 10 科沒有 — 一個 1/11 的不一致,讓這個 feature 還不適合單獨上 prod。本 change 把每科的 featured 變體(slot 3)都補上,使 11 科一致,並驗證 slice 的量產工法在差異化立繪上成立。

Grounded facts(已在 code 驗證,2026-06-01,非假設):
- `SpriteSheetPlayer`(`apps/neurons-tw/src/components/SpriteSheetPlayer.tsx`)以 `SPRITE_MAP[`${spriteKeyBase}:${state}`]` 解析,**無 sheet → 靜態 `<img>` fallback**;新增任何 `variant:<f>:<s>:<state>` key 即自動播放,**不需改元件**。
- `sprites.ts` 的 `animated/*.png` glob 以尾端 `pop()` 解析 `variant:<family>:<slot>:<state>`;丟新 PNG 進 `packages/theme-pixel-neurons/sprites/animated/` 即自動註冊進 `SPRITE_MAP`。
- `QuizModal.tsx` correct gate = `SPRITE_MAP[`variant:${q.subject}:3:correct`] ? `variant:${q.subject}:3` : null`(**slot-3 hardcoded**);各科產好 slot-3 `correct` sheet 後 gate 自動對該科生效。
- `VariantUnlockModal.tsx`:revealed 變體有 `:evolve` sheet → 播 evolve,否則靜態 + `.neuron-sprite--alive`;各科 slot-3 `evolve` sheet 產好即自動接。
- idle = 全域 CSS `.neuron-sprite--alive`(已套 FamilyPicker / VariantUnlockModal 立繪),compositor-driven、reduced-motion aware。
- `STATE_META`(SpriteSheetPlayer)目前硬編 `idle 8 / correct 9 / evolve 11` frames + 各 loop ms;這是**全變體共用**的 timing 表 → 量產 sheet 的 frame 數必須對齊這三個值(或把 STATE_META 改成 per-sheet 讀 JSON)。
- slice render 腳本 `~/.claude/scratch/neuron-hero-anim-2026-06-01/render_hero_frames.py` 的 `SRC` 寫死 `藥理學-3.png`;glow 色寫死金色 `(255,205,80)`。
- slice bundle:單 hero 三段 @384/frame ~1.08 MB(idle 207 / correct 331 / evolve 542 KB)。
- 變體源圖:`packages/theme-pixel-neurons/sprites/variants/<family>-<slot>.png`(384×384,16 色,透明)。
- 11 families:藥理學(金)/ 公共衛生學(金)/ 寄生蟲學(紅褐)/ 組織學(紅)/ 生物化學(GABA)/ 病理學 / 免疫學(藍)/ 解剖學(綠)/ 生理學 / 胚胎學 / 微生物學。

## Goals / Non-Goals

**Goals:**
- 為其餘 10 科的 slot-3 變體產 `correct` + `evolve` sprite-sheet 並註冊,使 11 科一致(答對任一科 → 該科 featured 變體放電反應;任一科 slot-3 解鎖 → evolve)。
- 泛化 PIL render 腳本吃 `(family, slot)`,per-family glow 色配合立繪主色。
- 控制 bundle:downscale + (評估)lazy-load。
- 達 prod-coherent → 收尾後 merge→main 部署。

**Non-Goals:**
- 不做全 55(5 slot × 11 科)— 只 per-family featured(slot 3);全 slot 留更後面 follow-up。
- 不產非 hero 的 **idle sheet**(CSS idle 已涵蓋;slice 證 PIL idle≈CSS idle)。
- 不加 idle/correct/evolve 以外的新 state。
- 不碰 gacha 權重 / slot floor / AP ladder / 變體數 / Dexie / R2 / engine。
- 不做傳說級(slot 5)真手繪升級(人工 Aseprite GUI;本 change 全走 PIL 變形 baseline)。
- 不在本 change 中途部署半成品(收尾才 merge→main)。

## Decisions

### D1 — 範圍 = per-family featured slot 3(10 科 × 2 段)
做其餘 10 科的 slot-3 `correct` + `evolve`(藥理學:3 已完成)。選 slot 3 因為 QuizModal gate 已查 slot-3 → 零 gate 改動即全科生效,且 slot 3 是中階代表性變體(slice hero 同位)。達成「11 科皆反應」的 prod-coherent 里程碑。
- *Alternative considered*:做全 55(5 slot × 11 科)→ rejected,bundle 與工時 5× 且 prod-coherent 不需要全 slot;玩家任一時刻每科只展示一隻 featured。全 slot 留獨立 follow-up。
- *Alternative considered*:每科挑「最稀有已擁有」slot 而非固定 slot 3 → rejected,需 runtime 查 ownership + 改 gate;固定 slot 3 最簡且與 slice 對齊。

### D2 — 工法 = PIL 變形參數化腳本(沿用 slice baseline)
泛化 `render_hero_frames.py` → `render_variant_frames.py`,吃 `--family --slot`,對該立繪套同一套 squash/stretch/bounce/scale/flash/glow,Aseprite batch Lua 組裝 sheet(沿用 slice 管線)。
- *Alternative considered*:Gemini/codex 逐格生圖 → rejected,11 種具象立繪跨格一致性風險高、成本大。
- *Alternative considered*:逐科手繪 → rejected,人工 GUI 不可量產;保留給未來 showpiece(slot 5)。

### D3 — sheet native 尺寸 downscale 到 128–192/frame + 評估 lazy-load
量產 sheet 以 ~128–192/frame 匯出(顯示 ≤128px,足夠 crisp),取代 slice 的 384。10 科 ×2 段在此尺寸下 bundle 可控。大圖 sheet 評估改 `import()` 動態載入(只在該科首次觸發時抓)。
- *Alternative considered*:沿用 384/frame → rejected,slice 已暴露單 hero 三段 1.08 MB,10 科 ×2 段 @384 會數 MB 級進 bundle。
- *Alternative considered*:全部 lazy-load → 視 build 量測決定;correct/evolve 非首屏,lazy 合理,但要避免首次觸發延遲感 → 量測後定。

### D4 — render 腳本泛化吃 (family, slot) + per-family glow 色
腳本參數化來源路徑與輸出 state;glow/flash 色從寫死金色改成**可帶 `--glow` 或從立繪主色自動取樣**(金色立繪用白金、藍/綠/紅立繪用對應暖白或同色系),避免所有科都套金色 glow 顯突兀。底部錨點 squash 對「無明顯雙腿」構圖的立繪逐科目視微調。
- *Alternative considered*:全科統一白金 glow → 部分採用(白色 flash 通用),但純金 halo 疊在藍/綠立繪會髒 → glow 色 per-family。

### D5 — 非 hero idle = CSS,不產 idle sheet
非 hero 變體的 idle 完全靠既有 `.neuron-sprite--alive`(已全域套用),本 change **不為任何科產 idle sheet**。每科只 2 段(correct/evolve)。
- *Alternative considered*:每科也產 idle sheet 以「richer idle」→ rejected,slice 實證 PIL 變形 idle ≈ CSS idle(都是整隻 transform),無視覺增益、徒增 bundle 與工時。

### D6 — correct gate 標準化為 featured = slot 3(維持現狀,不抽設定)
維持 QuizModal 查 `variant:<family>:3:correct`;把「featured 變體 = slot 3」定為慣例,不引入 per-family featured-slot 設定檔。
- *Alternative considered*:抽成 `FEATURED_SLOT_BY_FAMILY` 設定 → rejected(本 change 範圍內每科都用 slot 3,設定檔是 premature flexibility;未來若要 per-family 不同 featured 再引入)。
- 註:`STATE_META` 的 frame 數是全變體共用,所以量產 sheet 必須維持 correct=9 / evolve=11 frames(或在本 change 順手把 STATE_META 改 per-sheet 讀 JSON metadata — 列 Open Question)。

## Risks / Trade-offs

- **10 科 ×2 段 sheet 進 bundle 體積** → Mitigation:D3 downscale 到 128–192/frame + lazy-load;`pnpm build` 量測 dist 大小,超標再加重 lazy。
- **同畫面多動畫 sprite 效能**(收集頁/未來 connectome 多隻) → Mitigation:本 change 的 correct/evolve 是 one-shot 單點觸發(非同時多隻);idle 維持便宜 CSS。仍 Chrome MCP 量 FPS。
- **PIL 變形的 glow/flash 色在非金色立繪上顯髒** → Mitigation:D4 per-family glow 色 + 逐科 QA(主 agent Read montage)。
- **各科立繪構圖差異**(有的無明顯底部雙腿 → 底部錨點 squash 會怪) → Mitigation:逐科目視微調錨點;必要時該科改用中心錨點。→ Documented,逐科 QA 吸收。
- **`STATE_META` 共用 frame 數綁死所有 sheet** → 量產 sheet 必須對齊 correct=9/evolve=11;若某科內容需不同 frame 數,需改 STATE_META 為 per-sheet。→ Open Question。
- **Reviewer 質疑「為何不一次做全 55」** → 由 D1 預先說明(prod-coherent 只需 per-family featured;全 slot 是獨立 follow-up)。

## Migration Plan

- 純 asset(+ scratch 腳本泛化 + 可能 QuizModal/STATE_META 小改);無 Dexie / R2 / schema / Worker 改動。
- 無資料遷移:新 sheet 一進 SPRITE_MAP 即被既有元件自動採用;沒做到的科自動 fallback 靜態 + CSS idle(零破壞)。
- Rollback:移除對應 sheet PNG → 該科自動回靜態 + CSS idle;無資料風險。
- Deploy:收尾達 prod-coherent 後,`git merge track-neurons`→main + `pnpm deploy:cf`(從 `~/coding-scratch/study-rpg` deploy worktree)。本 change 過程不中途部署。

## Open Questions — Resolved (apply 2026-06-01)

- **STATE_META**:維持固定 correct 9 / evolve 11,量產 sheet 對齊(未改 per-sheet JSON)。簡單且 10 科都適用,無科需要不同節奏。
- **lazy-load**:**不需顯式 lazy 程式碼** — Vite `import.meta.glob(..., {query:'?url'})` 讓每張 sheet 成獨立 hashed asset,只在該 sprite 真的 render(答對該科 / 該科變體解鎖)時才 fetch;build 確認主 JS bundle 819 KB 不變、sheets 為 dist/assets/ 獨立檔。on-demand 天然成立。
- **per-family glow 色**:**自動取樣成立** — 取 opaque 高亮均色再 lighten;藍/綠/紅/金各科 glow 皆配合立繪主色,contact-sheet 抽查無金色亂套。未用手填。
- **sheet native 尺寸**:160/frame(downscale from 384);10 科 ×2 段 ~5.3 MB on-demand assets(可接受,非首屏)。
- connectome 節點 idle:維持 Non-Goal,不在本 change(留專屬設計 pass)。
