## MODIFIED Requirements

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
