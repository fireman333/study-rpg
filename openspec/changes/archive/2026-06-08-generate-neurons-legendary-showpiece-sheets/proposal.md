## Why

每個神經元家族的 slot-5「傳奇 apex」(rarity P1)是該科最稀有、敘事最高潮的變體 — 但目前解鎖傳奇變體時 `VariantUnlockModal` 只能播放靜態立繪,缺乏與稀有度匹配的高潮感。動畫基礎建設(`SpriteSheetPlayer` + `animated/*.png` glob 自動註冊)早已就緒,且 evolve sheet 的觸發點已 keyed by 解鎖變體自己的 spriteKey,所以這是一次純資產、零 render change 的「juice 升級」機會,把解鎖傳奇那一刻拉到商業手遊等級的爽度。

## What Changes

- 為全 **11 科**家族的 slot-5 傳奇 apex 變體各產出 **`<科>-5-evolve.png`(11 幀進化爆光)+ `<科>-5-correct.png`(9 幀答對反應)** 兩段 showpiece sprite-sheet(~192px/frame native,水平排列),讀對應已存在的 `variants/<科>-5.png` 靜態傳奇立繪當 base,以 **PIL 程序變形工法**(復原並重用 `render_variant_frames.py`)批次合成。
- Sheet 透過既有 `import.meta.glob('../sprites/animated/*.png')` 自動註冊為 `variant:<科>:5:{evolve,correct}`:
  - **evolve**:`VariantUnlockModal` 已 keyed by 解鎖變體自身 spriteKey → 解鎖傳奇時自動播放,**零 render code 改動**。
  - **correct**:需小幅 render change — `QuizModal` 的 featured 答對反應從 hardcode slot-3 改為「**該科 slot-5 傳奇已擁有且有 correct sheet → 用 slot-5,否則 slot-3**」(加一個 `db.neuronVariants.get([family,5])` liveQuery + 擴 `heroReactionBase` 三元式)。ownership-gate 確保只在玩家真正擁有傳奇時才升級反應立繪(沒擁有的傳奇不會憑空反應)。
- 一致性紀律:11 科全做(對齊 `neurons-sprite-animation` 既有「11 科全完才 merge」原則),避免「有些傳奇有華麗動畫、有些沒有」。
- **不做**:夥伴 march sheet(2 隻膠細胞夥伴維持單幀 + CSS `exp-bob`,2026-06-04 已 ship、多幀想法已 closed);slot-5 `idle` sheet(全域 CSS `.neuron-sprite--alive` 已涵蓋,既有 spec「新增變體 idle 不另產 sheet」)。

## Capabilities

### New Capabilities
<!-- 無新增 capability — 純擴充既有動畫 capability 的覆蓋面 -->

### Modified Capabilities
- `neurons-sprite-animation`(3 個 requirement):
  - **變體進化動畫** — evolve 觸發從 hero-only(藥理 slot-3)擴充到涵蓋全 11 科 slot-5 傳奇變體;解鎖傳奇 → `VariantUnlockModal` 播該科 evolve showpiece;11 科齊後一致爆光。
  - **答對反應動畫** — featured-for-correct 從 hardcode slot-3 改為 ownership-gated 解析(slot-5 傳奇已擁有且有 sheet → slot-5,否則 slot-3),涵蓋 11 科。
  - **動畫資產命名約定** — 更新既有「slot 5 = 真・逐格手繪」stale note 為 PIL showpiece;規範 slot-5 產 `correct` + `evolve` 兩段。

## Impact

- **新增資產**:`packages/theme-pixel-neurons/sprites/animated/<科>-5-{evolve,correct}.png` × 22(11 科 × 2 段;透過既有 glob 自動進 `SPRITE_MAP`,成獨立 hashed asset bundle 進 dist)。
- **復原工具**:`render_variant_frames.py`(PIL 批次變形 script,從 scratch 復原進 repo `scripts/` 留版控,供未來重生)。
- **Render change(小)**:`apps/neurons-tw/src/components/QuizModal.tsx` — 加 `db.neuronVariants.get([q.subject,5])` liveQuery + 擴 `heroReactionBase` 解析(slot-5-if-owned-else-slot-3)。`VariantUnlockModal` / `SpriteSheetPlayer` / `STATE_META` 不動。
- **零改動**:無 Dexie / R2 schema、無 leaderboard、無 content 常數 → 不觸發 dexie-upgrade-fixture lint。
- **部署**:merge main → `deploy-cf-pages.yml` rebuild neurons,新 sheet 進 prod bundle。
