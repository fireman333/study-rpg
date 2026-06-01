## ADDED Requirements

### Requirement: Idle 「活著感」 animation on all variant sprites
系統 SHALL 對所有神經元變體立繪的渲染面套用低成本 idle 動畫(發光脈動 + 輕微擺動),且 MUST 僅使用 GPU-friendly 的 CSS `transform` / `filter`(不觸發 layout / 大面積 paint)。動畫 MUST 尊重 `prefers-reduced-motion`,且 off-screen 的立繪 SHOULD 暫停以節省資源。套用面涵蓋:收集頁 `/dmn`、connectome 節點(SVG `<image>`)、family picker、`VariantUnlockModal`。

#### Scenario: 立繪在收集頁渲染時播放 idle
- **WHEN** 變體立繪在收集頁 `/dmn` 顯示
- **THEN** 該立繪持續播放 idle 動畫(發光脈動 + 輕微擺動),且不造成可見 jank

#### Scenario: 使用者偏好減少動態
- **WHEN** 系統偵測到 `prefers-reduced-motion: reduce`
- **THEN** idle 動畫 MUST 停用,立繪以靜態呈現

#### Scenario: connectome 節點立繪套用 idle
- **WHEN** 變體立繪以 SVG `<image>` 在 connectome 節點顯示
- **THEN** idle 動畫正確套用且 `transform-origin` 對齊節點中心(不偏移節點位置)

### Requirement: 多段 sprite-sheet 播放元件
系統 SHALL 提供一個 sprite-sheet 播放元件,以 CSS `steps()` 播放具名 state 段(非逐幀 JS 驅動)。對於沒有對應動畫 sheet 的立繪,元件 MUST fallback 為靜態 `<img>`(保持現有 `imageRendering: pixelated` 行為)。

#### Scenario: hero 立繪有 sheet → 播放 idle 段
- **WHEN** 渲染具有註冊動畫 sheet 的 hero 變體(`variant:藥理學:3`)
- **THEN** 元件以 `steps()` 循環播放其 `idle` 段

#### Scenario: 非 hero 立繪無 sheet → 靜態 fallback
- **WHEN** 渲染沒有註冊動畫 sheet 的變體
- **THEN** 元件渲染靜態 `<img>`,行為與現況一致(不報錯、不破版)

### Requirement: 答對反應動畫(事件驅動)
WHEN hero 所屬家族被記錄一次答對(`connectome.recordCorrectAnswer`,以家族過濾),hero 立繪 SHALL 播放一次 `correct` 反應段後回到 `idle`。其他家族的答對事件 MUST NOT 觸發 hero 反應。

#### Scenario: hero 家族答對 → 反應播一次
- **WHEN** `connectome.recordCorrectAnswer` 事件的 familyId 等於 hero 家族(藥理學)
- **THEN** hero 立繪播放一次 `correct` 反應段,結束後回到 `idle` loop

#### Scenario: 其他家族答對 → hero 不反應
- **WHEN** `connectome.recordCorrectAnswer` 事件的 familyId 不等於 hero 家族
- **THEN** hero 立繪維持 `idle`,不播放反應段

### Requirement: 變體進化動畫(事件驅動)
WHEN hero 的變體 slot 被解鎖(`connectome.variantSlotUnlocked`,以家族 + slot 過濾),解鎖 reveal(`VariantUnlockModal`)SHALL 播放 hero 的 `evolve` 進化爆光動畫。

#### Scenario: hero 變體解鎖 → 進化動畫
- **WHEN** `connectome.variantSlotUnlocked` 對應 hero 的家族與 slot
- **THEN** `VariantUnlockModal` 在 reveal 時播放 hero 的 `evolve` 段(進化爆光),結束後停在最終格

### Requirement: 效能與無障礙預算
同畫面多個 idle 立繪同時播放時,動畫 MUST 維持 GPU 合成(僅 `transform` / `filter`,不造成 layout thrash 或逐幀 repaint 過載)。本能力 MUST 在真機(Chrome MCP,`http://localhost:5175`)實測:多立繪同時播放無掉幀、`prefers-reduced-motion` 確實停動畫。

#### Scenario: 多立繪同時可見
- **WHEN** 收集頁同時顯示多隻動畫立繪
- **THEN** 經 Chrome MCP 量測無明顯掉幀(維持流暢),CPU/GPU 無異常飆升

### Requirement: 動畫資產命名與註冊約定
動畫 sheet 資產 SHALL 放在 `packages/theme-pixel-neurons/sprites/animated/`,並註冊進 `SPRITE_MAP`,key 形如 `variant:<family>:<slot>:<state>`(state ∈ `idle` / `correct` / `evolve`)。本 slice MUST 產出「frame 工法比較」(PIL 變形 vs Aseprite 手繪)的並排結果與量產 verdict,作為其餘 54 隻量產 follow-up 的依據。

#### Scenario: build 解析 hero sheet key
- **WHEN** app build 載入 sprite 註冊
- **THEN** `variant:藥理學:3:idle` / `:correct` / `:evolve` 三個 key 皆能解析到對應 sheet URL

#### Scenario: 產出工法比較供決策
- **WHEN** 兩種 frame 工法(PIL 變形 / Aseprite 手繪)在 hero 上各完成至少一段
- **THEN** 產出可並排比較的成品(GIF / 截圖),並在 design.md 記錄量產工法 verdict
