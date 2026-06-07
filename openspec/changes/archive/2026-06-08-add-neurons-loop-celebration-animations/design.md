## Context

apps/neurons-tw 的核心 loop 動畫由 CSS + Framer Motion 驅動（零 rAF per-frame loop），motion 庫（`src/lib/motion/`）已提供可複用 primitive：`CelebrationHalo`（expanding rings + sparkles，`intensity` 1–3）、`ParticleBurst`（16-span 放射）、`SpikeTrainFiring`（答對 EEG burst）、`AnswerFeedbackFlash`（綠/紅），全部尊重 `useRespectsReducedMotion`。

- **A 完成偵測來源**：`useMaze(pack)` 對 11 個科系家族各回 `target: MazeNode | null`，`null` = 該家族迷宮（含 second-lap）全部點亮。`target` 是 frontier-derived（`energy.settles` 累積），單調只增 → 一旦變 null 就持續 null。首頁是 SINGLE `useMaze` 訂閱者（重複呼叫會 double-fire reconcile → double pull，`promote-maze-to-home` 既有教訓）。
- **B streak 來源**：`lib/services/streak.ts` 的 `getStreaks()` 回 `{ current }`，已被 `connectome.recordCorrectAnswer` 用來 scale maze 能量（`streakMultiplier(current)`）。`QuizModal` 目前完全沒讀 streak。
- **Sync 紀律**：synced meta 走 `lib/sync/tables.ts` 的 `SYNCED_META_KEYS`（static Set，apply 時 `!SYNCED_META_KEYS.has(key)` 過濾掉未知 key）；R2 neurons bundle `SCHEMA_VERSION` 現為 18，採 additive + reader-tolerant（未知 key silently drop）。Worker bundle-opaque。

## Goals / Non-Goals

**Goals:**
- 二回目家族完成的瞬間有一次高潮慶祝，且只在玩家「真的剛完成」時發、跨裝置 / 跨 session 不重播。
- 連答 streak 越高、答對回饋越猛（連續 scale），強化核心 loop 最高頻的正回饋。
- 全程零 Dexie schema 改動（不觸發 dexie-upgrade-fixture lint）；reduced-motion 有 graceful fallback。

**Non-Goals:**
- 不做生圖 / 新 sprite asset（在獨立 `generate-neurons-animation-sheets` change）。
- 不改 maze 能量 / 出征經濟數值、不改 streak counter 既有語意（只「讀」streak 做視覺）。
- B 不做螢幕邊緣發光、不做離散分階門檻（grill 決定：連續 scale）。
- 不引入新 npm 依賴、不引入 rAF per-frame loop。

## Decisions

### D1 — A 完成偵測 = in-session transition（非 null → null），非「目前就是 null」
慶祝必須是「事件」而非「狀態」。首頁迷宮帶容器持有 `useMaze` view，per-family 記住上一輪的 `target`，當某家族 `target` 由非 null 變成 `null` 時觸發一次慶祝。**Why**：`target === null` 是持久狀態，純看狀態會在每次 mount / 每次 liveQuery re-fire 都「完成」一次。Transition edge 才對應「玩家剛完成」。
- *Alternative*：在 `connectome` / `economy` 的 settle 寫入路徑直接 emit 完成事件。**Rejected（暫不）**：完成由 frontier (`energy.settles` ≥ node count) 決定，分散在 reconcile 迴圈，從 view 層比對 prev/next target 最低侵入、最貼近渲染。

### D2 — A 重播守門 = 同步 one-shot per family（grill 拍板）
慶祝播完即把該家族寫進 synced celebration marker。觸發條件 = `prev target≠null && next target===null && !hasCelebrated(familyId)`。**Why**：(a) transition 偵測只防同 session 重播，無法防「新 session / 新裝置首次 mount 時 target 已是 null」→ 需持久 flag；(b) grill 選同步語意 → 一支裝置完成後其他裝置不再補播（避免 decontextualized 補播）。

### D3 — Marker 持久化形狀 = per-family LWW meta key（由 FAMILY_IDS 衍生），非單一 union-merge key
新增 meta key `mazeSecondLapCelebrated:<familyId>`（值 = 完成時戳），`SYNCED_META_KEYS` 用 `...FAMILY_IDS.map(f => \`mazeSecondLapCelebrated:${f}\`)` spread 進去（11 把，非硬寫）。每把走既有 per-key LWW。**Why**：每家族完成是獨立事件、寫不同 key，LWW 不會互相覆蓋（A 完成解剖、B 完成生理 → 兩 key 各自 propagate，無 conflict）。一旦設為「已慶祝」單調不回退，LWW 對單調 set-once 安全。
- *Alternative*：單一 key 存 JSON family 陣列 + union-merge 碰巧合併。**Rejected**：單 key LWW 會讓「離線各完成不同科」互相覆蓋丟資料；要正確就得在 tables.ts 加 union-merge carve-out（如 `everWrong` / `dmnEventLog`），複雜度高於 11 把 LWW key。per-family key 零 carve-out、零自訂 merge。

### D4 — Sync surface = SYNCED_META_KEYS 加 key + SCHEMA_VERSION 18 → 19（additive、reader-tolerant），無 Dexie bump
新 meta key 透過既有 meta adapter 隨 bundle 流動。v18 client 讀 v19 bundle → 過濾掉未知 marker key（forward-compat tolerance，既有行為）；v19 client 讀 v18 bundle → marker 不存在 → 該科視為未慶祝（下次 live 完成才補發，可接受）。bump 18→19 是專案慣例（記錄 additive meta key 變更，對齊 DMN change 為新 meta key bump 的前例），更新 bundles.ts 頂部 SCHEMA_VERSION history comment。**Why no Dexie bump**：marker 是 meta key-value，非新 table / 非改 PK → `.version()` 不動 → dexie-upgrade-fixture lint 不觸發。

### D5 — A 慶祝渲染 = 首頁迷宮帶 overlay，複用 CelebrationHalo(intensity 3) + ParticleBurst
慶祝 overlay `pointer-events:none` 蓋在迷宮帶上，由 motion 庫既有 primitive 組合（halo intensity 3 = P1 spectacle 等級 + 一輪 particle burst），可選疊一層「全節點同時 pulse」的點亮感（複用既有 `.neuron-firing-node` keyframe 或 lit-node 既有渲染加一次性 flash）。reduced-motion → primitive 自身回 null，退為靜態（lit nodes 維持點亮、無 burst）。**Why 複用**：grill 目標是 juice 升級且零新 asset；現成 primitive 直接給 P1 級華麗。

### D6 — B 強度 = 連續 scale function，dogfood-tunable 常數，零持久化
新 pure helper（例 `streakFeedbackIntensity(streak): number`）= `clamp(1 + streak * STREAK_INTENSITY_STEP, 1, STREAK_INTENSITY_MAX)`，常數 dogfood-tunable（initial 例：step 0.12、max 2.2）。`QuizModal` 答對時 `const { current } = await getStreaks()` → 算 intensity → 傳給 `SpikeTrainFiring`（主）+ 可選 `AnswerFeedbackFlash`（強度微調 glow）。`SpikeTrainFiring` 接受 intensity prop 放大 stroke width / glow / spike 幅度（既有 timing token 不變，只放大幅度）。reduced-motion → intensity 固定 1（或 primitive 自身靜態 fallback）。**Why 連續非分階**：grill 拍板；連續更平滑、無「跨門檻突跳」、tuning 只有兩個常數。

## Risks / Trade-offs

- **[A 跨裝置補播缺口]** v19 client 在 v18-only 裝置完成的科，因 v18 bundle 無 marker，於 v19 裝置首次仍可能在「未來某次 live 完成判定」補播一次 → 可接受（mixed-version 過渡期短，且至多多播一次）。
- **[A transition 偵測 vs reconcile 時序]** `target` 變 null 由 `reconcileSettles` 寫 settles meta → liveQuery re-fire → recompute 後才反映。偵測掛在 view 層 prev/next 比對即可捕捉，但要確保比對發生在 setView 之後的 render；用 ref 存 prev target map → mitigation。
- **[B 強度過頭吵]** intensity 上限沒調好可能高 streak 太閃 → 兩個常數 dogfood-tunable + reduced-motion 退固定強度；initial 取保守值。
- **[A 重複觸發 double-fire]** 首頁僅一個 `useMaze` 訂閱者（既有紀律），慶祝偵測掛同一容器、用 per-family ref 守門 → 不會雙跑。

## Migration Plan

- 全加性：A 的 marker 缺省即「未慶祝」，既有玩家升級後第一次 live 完成才發（不回溯補發已完成的科 → 避免升級當下一次噴 11 個慶祝）。B 無狀態、即時生效。
- 部署：dev Chrome MCP 驗 A（DEV 手動把某科 settles 推到完成觸發 transition + reduced-motion 退靜態 + 重開頁不重播）+ B（連答強度遞增）；prod 走 SPA 三件套（in-app nav + 直接 URL + F5）。
- Rollback：純前端 + 加性 meta key；revert change 即可，已寫入的 marker key 在舊 client 被 ignore（無破壞）。

## Open Questions

- A 是否在「全部 11 科都完成」時再疊一個「全腦 master 完成」終極慶祝？— 暫不，本 change 只做 per-family；master 完成留 follow-up（telemetry 後再評估）。
- B intensity 是否也微調 `SquadCelebration` 彈跳幅度？— 暫定只驅動 spike-train（peripheral、不阻塞）；squad 彈跳維持現狀，apply 時看手感再決定。
