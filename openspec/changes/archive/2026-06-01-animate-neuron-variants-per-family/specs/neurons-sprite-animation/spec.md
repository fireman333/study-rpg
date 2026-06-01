## MODIFIED Requirements

### Requirement: 答對反應動畫(事件驅動)
WHEN 任一家族被記錄一次答對(`connectome.recordCorrectAnswer`,以家族過濾),**若該家族的 featured 變體(slot 3)有 `correct` sheet**,則該變體立繪 SHALL 在 reveal 區播放一次 `correct` 反應段後回到靜態(idle 由 CSS 維持)。沒有 featured `correct` sheet 的家族 MUST NOT 觸發反應(自動 fallback 無動畫)。本能力以「featured = slot 3」為慣例(QuizModal 查 `variant:<family>:3:correct`)。

#### Scenario: 已動畫化的家族答對 → featured 變體反應
- **WHEN** `connectome.recordCorrectAnswer` 的 familyId 屬於已產出 slot-3 `correct` sheet 的家族
- **THEN** 該家族 featured 變體播放一次 `correct` 反應段(其他家族不受影響)

#### Scenario: 11 科皆動畫化後一致反應
- **WHEN** 全 11 科的 slot-3 `correct` sheet 皆已產出並註冊
- **THEN** 答對任一科都觸發該科 featured 變體反應(消除 hero-only 的不一致)

#### Scenario: 尚未動畫化的家族答對 → 不反應
- **WHEN** 答對的家族尚無 slot-3 `correct` sheet
- **THEN** 不播放反應(維持既有 reveal 行為,不報錯)

### Requirement: 動畫資產命名與註冊約定
動畫 sheet 資產 SHALL 放在 `packages/theme-pixel-neurons/sprites/animated/`,並註冊進 `SPRITE_MAP`,key 形如 `variant:<family>:<slot>:<state>`(state ∈ `correct` / `evolve`;**`idle` 不另產 sheet** — 由全域 CSS `.neuron-sprite--alive` 涵蓋,因 PIL 變形 idle ≈ CSS idle)。每科的 featured 變體(slot 3)SHALL 各產 `correct` + `evolve` 兩段。sheet native 尺寸 SHALL downscale 到約 128–192/frame(取代 slice 的 384)以控制 bundle,並 SHOULD 對非首屏 sheet 採 lazy-load。量產工法:PIL「變形」參數化腳本為 baseline(整隻立繪縮放/發光/特效,per-family glow 色配合立繪主色);真・逐格手繪保留給少數 showpiece(slot 5,人工 GUI)。

#### Scenario: 新增家族 sheet 自動註冊與採用
- **WHEN** 某科 slot-3 的 `correct` / `evolve` PNG 放入 `sprites/animated/`
- **THEN** glob 自動以 `variant:<family>:3:<state>` 註冊,SpriteSheetPlayer / QuizModal / VariantUnlockModal 無需改動即採用

#### Scenario: 量產 sheet 對齊共用 frame 表
- **WHEN** 產出各科 `correct` / `evolve` sheet
- **THEN** frame 數對齊 `STATE_META`(correct 9 / evolve 11),否則 CSS `steps()` 會錯格

## ADDED Requirements

### Requirement: 批次量產工法(per-family featured 變體)
系統 SHALL 以參數化的 PIL 變形腳本(吃 `family` + `slot`)對既有變體立繪產 `correct` + `evolve` frames,經 Aseprite batch Lua 組裝成透明 sheet。腳本 MUST 支援 per-family glow / flash 色(避免單一金色 glow 套在藍/綠/紅立繪上顯髒)。量產輸出 MUST 通過 `pnpm build`,且 bundle 體積 SHOULD 經量測在 downscale + lazy-load 後維持合理。

#### Scenario: 參數化腳本產任一科 featured sheet
- **WHEN** 對某科 slot 3 執行量產腳本
- **THEN** 產出該科 `correct` + `evolve` 透明 sheet(per-family glow 色),frame 數對齊 STATE_META

#### Scenario: prod-coherent 才部署
- **WHEN** 11 科 featured 動畫皆完成且 `pnpm build` 通過
- **THEN** 才 merge `track-neurons`→main + `pnpm deploy:cf`(過程不中途部署半成品)
