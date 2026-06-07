## Why

神經元 app 的核心 loop（答題 → 出征 → 收集）動畫 baseline 健全，但兩個高頻 / 高 payoff 的時刻目前「靜默」，與「整體 juice 升級」的目標有落差：

1. **二回目完成沒有任何 fanfare。** 玩家把一個科系家族的迷宮（含剛 ship 的 second-lap route2 + 220 變體位置）全部點亮（`useMaze` 的該家族 `target` 變成 `null`）時，畫面毫無反應。這是整個收集養成最缺的一個高潮收尾 — 投入大量出征清題後，完成的瞬間應該要有 payoff。
2. **連答 streak 完全沒有視覺。** streak counter 已存在（`meta` 的 `currentQuizCorrectStreak` / `maxQuizCorrectStreak`，且已驅動 maze 能量 multiplier），但 `QuizModal` 從不顯示它 — 連答 1 題和連答 15 題的答對回饋一模一樣，核心 loop 最頻繁的正回饋沒有遞增爽感。

兩者都是純 presentational 缺口，補上能直接提升每日核心 loop 的手感，且複用既有 motion 庫 primitive、成本低。

## What Changes

- **A — 二回目全腦點亮完成慶祝**：當任一科家族的迷宮在 session 內 live 完成（`target` 由非 null 轉為 `null`）時，在首頁迷宮帶播放一次「全腦點亮」高潮動畫，複用既有 `CelebrationHalo`（expanding rings + sparkles）+ `ParticleBurst` primitive。
  - **重播語意 = 同步 one-shot（每科全域一次）**：完成當下播一次後，把該家族標記寫進 synced meta（`SYNCED_META_KEYS` 新增 per-family key），跨裝置 / 跨 session 不再重播。只在玩家「真的剛完成」那一刻發，narratively 乾淨。
  - 純加性 sync-surface 改動：新增 per-family celebration-marker meta key + R2 neurons bundle `SCHEMA_VERSION` 18 → 19（additive + reader-tolerant，舊 client drop 未知 key）。**無 Dexie `.version()` bump**（不觸發 dexie-upgrade-fixture lint）。
- **B — 連答 streak 升階（漸進連續 scale）**：`QuizModal` 答對流讀取當前 streak，把答對回饋強度（spike-train EEG burst 為主）依 streak **連續** scale（intensity ∝ streak，clamp 上限），無離散分階門檻、無螢幕邊緣發光。dogfood-tunable 常數。**零持久化 / 零 sync 改動**。
- 兩者皆全 CSS / Framer Motion、零 rAF per-frame loop，且尊重 `prefers-reduced-motion`（reduced 時 A 退為靜態 end-state、B 退為固定強度），對齊既有 `neurons-motion-library` 紀律。

## Capabilities

### New Capabilities

（無新 capability — 兩個 feature 都是對既有 capability 的加性行為）

### Modified Capabilities

- `neurons-maze-second-lap`: 新增「二回目完成慶祝」需求 — 家族迷宮 live 完成時播放一次慶祝動畫，並以 synced one-shot marker 保證每科全域只播一次。
- `neurons-motion-library`: 新增「答對回饋強度依連答 streak 連續 scale」需求 — spike-train / 答對 feedback 強度隨當前 streak 遞增，既有 timing token 不變。

## Impact

- **Code（apps/neurons-tw/src/）**：
  - A：`components/MazeExpedition.tsx`（或首頁迷宮帶容器）偵測 per-family `target` 由非 null → null 的 in-session transition + 掛慶祝 overlay；新 helper `lib/services/maze-celebration.ts`（read/write per-family marker meta）；`lib/sync/tables.ts` `SYNCED_META_KEYS` 加 per-family key（由 `FAMILY_IDS` 衍生）；`lib/sync/r2/bundles.ts` `SCHEMA_VERSION` 18 → 19 + history comment。
  - B：`components/QuizModal.tsx` 答對流讀 `getStreaks()` → 算 intensity → 傳入 spike-train / feedback-flash；新 dogfood-tunable 常數（intensity step + cap）。
- **Sync**：R2 neurons bundle `SCHEMA_VERSION` 18 → 19（additive meta keys，reader-tolerant）；Worker bundle-opaque（無 Worker 改動）。**無 Dexie schema 改動。**
- **無依賴新增**（複用既有 framer-motion + motion 庫 primitive）。
- **無新 asset**（生圖項在獨立的 `generate-neurons-animation-sheets` change）。
- **驗證**：Chrome MCP 在 dev + prod 驗 A（live 完成觸發 + reduced-motion 退靜態 + 跨 session 不重播）+ B（連答強度遞增）；A 的 prod 部署走 SPA 三件套（含 F5）。
