## Why

M1 已把 4 屬性（Knowledge / Reflex / Memory / Stamina — 與 `DEFAULT_STAT_SCHEMA.order` 對齊）wire 起來能持續累積數值，但目前只有純數字呈現，沒有視覺化 progression。玩家看不到「下一個目標」、養成投入也缺乏儀式感。Skill Tree UI 把屬性成長轉成可見的節點解鎖軌跡，讓「升等就有東西開」變成玩家持續讀書的近期 reward，閉環 M1 已建立的 reading-loop → 屬性累積路徑。

## What Changes

- 新增 standalone route `/skills`（react-router v6 子路徑），呈現 4 屬性各自的成長樹
- 每屬性一條獨立 branch（4 棵 mini tree），節點依該屬性的數值門檻線性解鎖
- 節點解鎖 = 視覺 token（pixel icon），點開顯示 flavor text；**不**掛 combat perk / 屬性 bonus
- Home screen 的 character card 加一個入口按鈕「技能樹」導去 `/skills`
- Skill tree 進度純衍生自 `Player.stats`（read-only），不需要在 persistence 加新欄位
- Theme pack 透過既有 `theme.sprites` map 提供節點 sprite（無新 contract slot），文案由新增的 `theme.skillTree` 結構提供

## Capabilities

### New Capabilities

- `skill-tree`: 屬性成長樹的 tree topology 定義、節點 unlock check（純衍生自 `Player.stats`）、`/skills` 路由與 UI render 行為、theme pack 對節點 sprite + 文案的供應介面

### Modified Capabilities

（無）— `character-system` 保持不動；skill-tree 只 read-only 消費 `Player.stats`，不改 stat 累積公式、不改 equipment / inventory 行為。`theme-pack-contract` 也不改 — 新增的 `theme.skillTree` 結構走既有的 theme 開放欄位機制（contract 已允許 theme 擴充非 sprite 結構）。

## Impact

- **新增程式碼**
  - `packages/core/src/skill-tree/`: tree topology 定義、unlock evaluator、TypeScript types
  - `apps/medexam-tw/src/routes/SkillTreeRoute.tsx`: `/skills` 路由 component
  - `apps/medexam-tw/src/components/SkillTree*.tsx`: tree render 元件（branch、node、tooltip）
  - `packages/theme-pixel-medical/src/skillTree.ts`: 醫學主題的節點文案 + sprite key 對應
  - `packages/theme-pixel-medical/src/sprites/skill-*.png`: 新節點 sprite assets
- **修改檔案**
  - `apps/medexam-tw/src/App.tsx`: 加 `/skills` route
  - `apps/medexam-tw/src/components/CharacterCard.tsx`: 加「技能樹」入口按鈕
  - `packages/theme-pixel-medical/src/index.ts`: export skillTree
- **dependencies**: 無新 npm 依賴；沿用既存 react-router v6 + framer-motion
- **out of scope（明確不做）**
  - 不掛 combat perk / passive bonus（M5 工作）
  - 不重設既有屬性累積公式
  - 不做 respec / 重置功能
  - 不在 mobile (<768px) 做 collapse 互動（橫向 scroll 即可）
