# neurons-sprite-animation Specification

## Purpose

神經元變體立繪的動畫行為,讓收集養成「活起來」:(a) 全域 idle「活著感」(發光脈動 + 輕微擺動,純 CSS `transform`/`filter`,套用所有變體立繪渲染面,尊重 `prefers-reduced-motion`);(b) 單隻 hero(藥理學 slot 3)的多段 state sprite-sheet 播放(`idle` / `correct` / `evolve`,CSS `steps()`,事件驅動);(c) 非 hero 立繪靜態 fallback;(d) 動畫資產命名 / 註冊約定與量產 spec。首個 vertical slice 於 `add-neurons-sprite-animation-slice` 打通(hero = 藥理學 slot 3「突觸快樂使者」),量產其餘 54 隻為 follow-up。

## Requirements

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
WHEN 任一家族被記錄一次答對(`connectome.recordCorrectAnswer`,以家族過濾),系統 SHALL 在 reveal 區播放該家族 **featured 反應變體**的 `correct` 反應段一次後回到靜態(idle 由 CSS 維持)。featured 反應變體以 ownership-gated 方式解析:**若該家族 slot-5 傳奇 apex 已擁有(`neuronVariants` 有 `[family,5]` row)且其 `correct` sheet 存在,則 featured = slot 5;否則 featured = slot 3**(既有慣例)。兩者皆無對應 `correct` sheet 的家族 MUST NOT 觸發反應(自動 fallback 無動畫)。QuizModal 以 `db.neuronVariants.get([family,5])` liveQuery 判定擁有狀態,查 `variant:<family>:<resolvedSlot>:correct`。

#### Scenario: 已動畫化但未擁有傳奇 → featured slot-3 反應
- **WHEN** 答對的家族有 slot-3 `correct` sheet,但玩家尚未擁有該科 slot-5 傳奇
- **THEN** 播放 slot-3 featured 變體 `correct` 反應段(既有行為,其他家族不受影響)

#### Scenario: 已擁有傳奇 → featured 升級為 slot-5 傳奇反應
- **WHEN** 答對的家族 slot-5 傳奇已擁有且其 `correct` showpiece sheet 已註冊
- **THEN** 播放該科 slot-5 傳奇的 `correct` showpiece(較 featured 更華麗),取代 slot-3 反應

#### Scenario: 11 科皆動畫化後一致反應
- **WHEN** 全 11 科的 slot-3 + slot-5 `correct` sheet 皆已產出並註冊
- **THEN** 答對任一科都觸發該科 featured 反應(未擁有傳奇 → slot-3;已擁有 → slot-5),消除不一致

#### Scenario: 尚未動畫化的家族答對 → 不反應
- **WHEN** 答對的家族 slot-3 與 slot-5 皆無 `correct` sheet(或玩家未擁有傳奇且無 slot-3 sheet)
- **THEN** 不播放反應(維持既有 reveal 行為,不報錯)

### Requirement: 變體進化動畫(事件驅動)
WHEN 任一變體 slot 被解鎖(`connectome.variantSlotUnlocked`,以家族 + slot 過濾)且**該被解鎖變體擁有對應 `evolve` sheet**(`SPRITE_MAP[`variant:<family>:<slot>:evolve`]` 存在),解鎖 reveal(`VariantUnlockModal`)SHALL 播放該變體的 `evolve` 進化爆光動畫,結束後停在最終格;沒有對應 `evolve` sheet 的變體 MUST 靜態 fallback(不報錯)。本能力涵蓋 featured(slot 3)與**傳奇 apex(slot 5,rarity P1)** 兩種有 sheet 的變體;觸發以被解鎖變體自身 `spriteKey` 為 key,不限特定 slot。

#### Scenario: hero / featured 變體解鎖 → 進化動畫
- **WHEN** `connectome.variantSlotUnlocked` 對應有 `evolve` sheet 的 featured 變體(如 `variant:藥理學:3`)
- **THEN** `VariantUnlockModal` 在 reveal 時播放該變體 `evolve` 段(進化爆光),結束後停在最終格

#### Scenario: slot-5 傳奇 apex 解鎖 → 傳奇 evolve showpiece
- **WHEN** `connectome.variantSlotUnlocked` 對應某科 slot-5 傳奇變體(`variant:<family>:5`)且其 `evolve` showpiece sheet 已註冊
- **THEN** `VariantUnlockModal` 播放該科傳奇的 evolve showpiece(較 featured 更華麗的爆光),結束後停在最終格

#### Scenario: 11 科傳奇 evolve 皆產出後一致高潮
- **WHEN** 全 11 科 slot-5 `evolve` showpiece sheet 皆已產出並註冊
- **THEN** 解鎖任一科傳奇都觸發一致的進化爆光 showpiece(消除「部分傳奇有動畫、部分靜態」的不一致)

#### Scenario: 無 evolve sheet 的變體解鎖 → 靜態 fallback
- **WHEN** 解鎖的變體沒有對應 `evolve` sheet(如尚未動畫化的中間 slot)
- **THEN** `VariantUnlockModal` 以靜態立繪 + CSS idle 呈現(不報錯、不破版)

### Requirement: 效能與無障礙預算
同畫面多個 idle 立繪同時播放時,動畫 MUST 維持 GPU 合成(僅 `transform` / `filter`,不造成 layout thrash 或逐幀 repaint 過載)。本能力 MUST 在真機(Chrome MCP,`http://localhost:5175`)實測:多立繪同時播放無掉幀、`prefers-reduced-motion` 確實停動畫。

#### Scenario: 多立繪同時可見
- **WHEN** 收集頁同時顯示多隻動畫立繪
- **THEN** 經 Chrome MCP 量測無明顯掉幀(維持流暢),CPU/GPU 無異常飆升

### Requirement: 動畫資產命名與註冊約定
動畫 sheet 資產 SHALL 放在 `packages/theme-pixel-neurons/sprites/animated/`,並註冊進 `SPRITE_MAP`,key 形如 `variant:<family>:<slot>:<state>`(state ∈ `correct` / `evolve`;**新增變體的 `idle` 不另產 sheet** — 由全域 CSS `.neuron-sprite--alive` 涵蓋,因 PIL 變形 idle ≈ CSS idle。slice hero `藥理學:3:idle` sheet 為既有 grandfathered 產物)。每科的 featured 變體(slot 3)SHALL 各產 `correct` + `evolve` 兩段;每科的傳奇 apex 變體(slot 5,rarity P1)SHALL 各產 `correct` + `evolve` 兩段 showpiece(不另產 idle)。sheet native 尺寸 SHALL downscale 到約 128–192/frame(取代 slice 的 384)以控制體積;sheets 經 Vite `?url` glob 成獨立 hashed asset、天然 on-demand 載入(不進主 JS bundle)。量產工法:PIL「變形」參數化腳本為 baseline(整隻立繪縮放/發光/特效,per-family glow 色配合立繪主色);**傳奇 apex(slot 5)的 `correct` + `evolve` showpiece 亦以 PIL 變形產出,採較 featured 更激進的變形 recipe(更大放大 / 更強 flash / 更長尾光)以體現「傳奇 > featured」的視覺階層 — 不採真・逐格手繪(LLM 無法產出品質逐格角色動畫;真手繪保留為未來人工 GUI 的選擇性 follow-up)。**

#### Scenario: 新增 featured 家族 sheet 自動註冊與採用
- **WHEN** 某科 slot-3 的 `correct` / `evolve` PNG 放入 `sprites/animated/`
- **THEN** glob 自動以 `variant:<family>:3:<state>` 註冊,SpriteSheetPlayer / QuizModal / VariantUnlockModal 無需改動即採用

#### Scenario: 傳奇 apex showpiece 自動註冊與採用
- **WHEN** 某科 slot-5 的 `evolve` / `correct` showpiece PNG 放入 `sprites/animated/`(命名 `<family>-5-evolve.png` / `<family>-5-correct.png`)
- **THEN** glob 自動以 `variant:<family>:5:evolve` / `variant:<family>:5:correct` 註冊;`VariantUnlockModal` 解鎖傳奇時採用 evolve,`QuizModal`(featured 解析為 slot-5 時)答對採用 correct

#### Scenario: 量產 sheet 對齊共用 frame 表
- **WHEN** 產出各科 `correct` / `evolve` sheet(featured 或傳奇)
- **THEN** frame 數對齊 `STATE_META`(correct 9 / evolve 11),否則 CSS `steps()` 會錯格

### Requirement: 批次量產工法(per-family featured 變體)
系統 SHALL 以參數化的 PIL 變形腳本(吃 `family` + `slot`)對既有變體立繪產 `correct` + `evolve` frames,經 Aseprite batch Lua 組裝成透明 sheet。腳本 MUST 支援 per-family glow / flash 色(避免單一金色 glow 套在藍/綠/紅立繪上顯髒,例如自立繪高亮自動取樣)。量產輸出 MUST 通過 `pnpm build`,且 sheets MUST 維持為 on-demand asset(不使主 JS bundle 膨脹)。

#### Scenario: 參數化腳本產任一科 featured sheet
- **WHEN** 對某科 slot 3 執行量產腳本
- **THEN** 產出該科 `correct` + `evolve` 透明 sheet(per-family glow 色),frame 數對齊 STATE_META

#### Scenario: prod-coherent 才部署
- **WHEN** 11 科 featured 動畫皆完成且 `pnpm build` 通過
- **THEN** 才 merge `track-neurons`→main + `pnpm deploy:cf`(過程不中途部署半成品)
