## Context

`apps/neurons-tw` 已 ship open-collection 變體圖鑑（render-only-collected、隱藏總數純計數、永遠可抽 dupe）。本 change 加一層「腦內迷宮探索」——把答題 / 閱讀迴圈接上空間化的長線探索目標。

設計來自三輪 grill（`~/.claude/scratch/grilled-neurons-connectome-brain-maze-2026-06-02.md`），含 OE 查證的神經科學 anchor、視覺方向定案、codex 路徑方案諮詢、v7 prototype 實證。本 slice 鎖 DA 區、獨立 `/maze-beta` route，不動現有 connectome。

**約束**：
- Vite 5 + React 18 + TS（純 CSR）、Dexie 持久化、零後端（slice local-only）。
- 對齊既有 open-collection 范式（不預顯結構、隱藏總數、不復活完成度）。
- 神經學 fact 必須 OE-grounded（project.md neuroscience-rigor 規則）。
- 不可動 `packages/core`（fork 契約）；不可加付費抽卡路徑（hard product principle）。

### 神經科學 anchor（OE 查證，附 PMID/DOI）

橋樑核心：**connectome 在真實大腦裡，就是 axon growth cone「探索」出來的**——字面的神經發育描述，非硬湊隱喻。

| Anchor | 內容 | 出處 |
|---|---|---|
| Growth cone pathfinding | axon 前端 growth cone 伸 filopodia sample 環境，沿 guidance cues（netrins / slits / semaphorins / ephrins）逐個 choice point 找路 → growth cone = Pikmin，岔路 = choice point | Stoeckli 2018 `10.1242/dev.151415`；McCormick & Gupton 2020 `10.1016/j.ceb.2019.12.003` |
| 4 NT 系統空間交織（非分區） | DA / 5HT / GABA / Glu 系統在空間上交織、共用 target node，而非各佔色塊領地 → 用 pathway 走線分色（非 territory 色塊），節點共用 = OE 的「shared target nodes」 | Tremblay 2016 Neuron `10.1016/j.neuron.2016.06.033`；Ostos 2022 Cereb Cortex `10.1093/cercor/bhac314`；Noble 2024 EJN `10.1111/ejn.16230` |
| axon pathfinding 耗時數月 | 人類 axon 8 PCW 開始長，corpus callosum 11 PCW，association fibers 18 PCW 到出生後 →「2–3 個月探索完」對應真實妊娠期神經連線時間軸 | Morales & Kania 2017 `10.1002/dneu.22463` |

DA slice 的通路 anchor：nigrostriatal / mesolimbic / mesocortical（VTA/SNc 中腦投射）——底圖生成 prompt 的解剖 reference。

## Goals / Non-Goals

**Goals:**
- 在獨立 `/maze-beta` route 驗證一周目探索 loop 手感 + 視覺管線可行性。
- growth-signal 經濟接上既有答題 / 閱讀迴圈，答對有即時視覺爽點。
- sprite 確切走在底圖纖維路徑正中心（硬需求，v7 已實證可達成）。
- fog-of-war + 純計數，嚴格對齊 open-collection 范式。
- 既有玩家無痛遷移（已收 DA 變體 = 開局點亮節點）。

**Non-Goals:**
- 二周目 myelination reward 層（變體強化 / 進化）——defer。
- 5HT / GABA / Glu 三區——slice 只做 DA。
- DMN fate-card 收編成探索事件層——defer。
- R2 sync wiring（maze 進度跨裝置）——slice local-only / 由已 sync 的 collected-variant derive。
- migrate 進主 connectome 視圖——先 beta 驗手感再決定。

## Decisions

### D1 — 獨立 `/maze-beta` route，不動現有 connectome
**選擇**：新增獨立 route + 元件 + lib，現有 Collection 2.0 / connectome SVG 一行不改。
**理由**：最安全可回退（revert = 刪 route + lib + asset，零影響 shipped connectome），且避開另一 session 的 git 衝突面。先驗手感再決定 migrate。
**Alternatives**：直接改造現有 connectome 視圖（風險高、不可逆、撞 open-collection 剛穩定的程式）→ 否決。

### D2 — 視覺管線 = codex 底圖 → build-time skeleton→graph → runtime arc-length tween
**選擇**：採 codex 路徑方案諮詢結論（2026-06-02，gpt-5.5）的第三方案：
```
codex flat-saturated 4 色底圖 → HSV mask → morphological close → Zhang-Suen skeletonize
  → skeleton→graph(endpoint/branch/edge) → RDP 簡化 polyline → arc-length JSON
runtime: sprite 沿 polyline arc-length tween；fog 隨節點點亮散開
```
- **底圖**：codex `gpt-image-2`（`-m gpt-5.5`）生 flat-saturated non-overlapping 4 色 DA 通路像素圖，sparse projection-pathway 複雜度（~12–16 主束）。**創作資產，apply 時需視覺認可**（會像 prototype 6+ 版那樣停下挑）。
- **分析解析度** 384×256+（build-time 一次性，計算量非問題）。
- **節點綁 skeleton 拓撲特徵**（degree 1 endpoint / degree ≥3 branch），**非人工撒** → 「點更精準」的根本實現。
- **graph build-time 預存 JSON，runtime 零重算**。
**理由**：v7 prototype（純 JS Zhang-Suen，無 OpenCV）已實證 234 段中線抽出、sprite 走中線正中心、192×128 分析 <1s、console 零 error。三方案對比：A（SVG 平滑連線）路徑不從圖抽→永遠只是「看起來像」會偏移；B（grid+BFS flood）走格邊+塗色非沿 tract 移動；**C（skeletonization）走中線正中心 + 平滑 + route 語義** → 唯一同時滿足 exact-on-path + smooth + route semantics。
**Alternatives**：A / B 見上，均否決。OpenCV → 過重，Zhang-Suen 自寫夠輕。

### D3 — 混合來源探索經濟（答題 + 閱讀都餵，抵節點批次抽卡）
**選擇**：答對 + 閱讀都產 growth signal 進池；答對 = 即時看到 growth cone 前進一格 + 音效（即時視覺爽）；streak 加快累積；signal 累積推進探索；**抵節點統一結算抽卡**（延遲批次，非每次即時抽），保底 1 抽必出該 family 未收 slot。
**理由**：二階有玩家反饋「想不斷答題拿即時反饋」，故推翻「探索變唯一抽卡出口」的乾淨單出口模型，改混合。即時爽點靠視覺前進 + 音效給足，抽卡仍批次結算維持節奏。
**待 tune（dogfood telemetry）**：答題 vs 閱讀產 signal 的具體比重、節點抽卡保底 / pity 細節數值。

### D4 — 已收集變體 = Pikmin；基礎速度固定 + 變體加速 buff
**選擇**：已收集 variant 當探索小兵，DA 隊探索 DA 區；基礎探索速度固定（保證空隊新玩家也能慢推），已收集變體越多 / 越稀有 → 該區探索越快。
**理由**：給「已收集變體」用途（不只圖鑑）；正回饋但不卡死新玩家（slice 上正回饋幅度先保守，dogfood 校準）。

### D5 — fog of war + 純計數（對齊 open-collection）
**選擇**：未探索節點 = 迷霧（**不顯剪影、不預顯形狀 / rarity**，比剪影更徹底）；NT 區域輪廓可見、區內節點在霧中。chip「🧠 已連線 X 個腦區」**無分母**。不復活 family-complete / 完成度。
**理由**：open-collection（owner 主動推翻 closed-cap、已 ship `17eccc3`）的鐵律 = 不預顯結構 + 隱藏總數。fog of war 是比剪影更徹底的調和。
**顆粒度張力（已接受）**：「4 NT 區輪廓預顯」跟「不預顯結構」有輕微張力，比照 Pikmin Bloom（地圖輪廓可見、走過去才知有什麼）可接受——slice 只 DA 一區，張力最小。

### D6 — 持久化優先用既有 `meta` key-value，避開 Dexie schema bump
**選擇**：signal-pool + per-node 探索進度優先寫既有 `meta` key-value table（如 `meta['maze:da:signal']`、`meta['maze:da:explored']`），**不 bump Dexie `.version()`**。lit-node state（已收變體對應）由既有 collected-variant state **derive**，不重複儲存。
**理由**：slice 資料量小（DA 20 節點 + 一個 signal 數字），key-value 足夠；避開 v9→v10 schema bump + upgrade fixture + lint CI 的整套 overhead。
**逃生門（明寫）**：若 apply 發現 key-value 真的不夠（例需 indexed query / 大量 per-node row）→ 改開 v9→v10 store，**必須**配 v9→v10 upgrade fixture（project hard rule，`dexie-fixture-lint.yml` 強制；canonical pattern `retirement-tombstone.test.ts`）。

### D7 — 色弱友善三重編碼框架先立
**選擇**：4 隊用 顏色 + 線型 + 節點形狀三重編碼，slice 只有 DA 一隊但先把編碼 schema 立起來（DA = 既定色 + 線型 + 形狀）。
**理由**：cheap 且已決定；4 區擴張直接沿用，避免事後 retrofit。Chrome MCP 去色測試在 prototype 已通過。

### D8 — 走纖維的領頭 sprite = 動態玩家代表變體立繪
**選擇**：arc-length 沿纖維中線走的「growth cone（生長錐）」**用一隻真實 variant 立繪呈現**，不畫抽象生長錐。具體選角：
- **有收集**：取玩家當前**最稀有**的已收集 DA 變體立繪（rarity P0 > P1 > … > P5；同 rarity tiebreak 最新收集）當領頭，收集變強領頭跟著換、即時反映收集成果。
- **空隊（0 收集 DA 變體）**：fallback 用一隻**通用 growth-cone sprite**（手狀 filopodia 風、中性無 family），對齊 spec「空隊仍以 base speed 推進」。
- 領頭選角在 collection 變化時重算（re-pick representative）。
**理由**：給「已收集變體」第二個用途（不只圖鑑、不只 speed buff，還當看得到的探索化身），呼應 Pikmin 隊長感；用既有 variant 立繪零新美術成本（只需多一隻通用生長錐 fallback）。
**Alternatives**：固定 family 代表變體（不獎勵收集深度）/ 一律通用生長錐（弱化 Pikmin 感）——均否決。

### D9 — 4 區擴張走「per-branch 單色圖 + render 分層疊」,非「一張 4 色圖一次畫完」
**選擇**：每個 NT branch 一張**單色** tract 底圖（slice = DA amber 一張），各自跑 skeleton→graph 輸出 per-branch JSON（`da-graph.json` / 未來 `5ht-graph.json`…），loader 按 branch 合併；render 把 N 層 colored tract z-stack 疊在同一張共用腦輪廓上。slice 的 pipeline + graph schema + loader + renderer **從第一天就做 per-branch**（slice 只跑 1 branch）。
**理由**：
- mask 永遠乾淨——每張圖單色 → HSV mask 不會 4 色互相 bleeding（單張多色才會）。
- 擴張**純 additive**：加 3 張單色圖 + 3 份 JSON，**DA 圖永不需重畫** → DA 節點位置永遠穩定，加 5HT 不挪 DA。
- 視覺 overlap 是預期且生物正確（Tremblay 2016「shared target nodes」：4 NT 系統空間交織、共用標的），分層疊 colored tract = 真實 connectome 樣貌。
**Alternatives**：一張 4 色圖一次畫完——codex 生乾淨 4 色 non-overlapping 較難、提前 commit 全視覺、任一 branch 要改就整張重生 → 否決。
**留給擴張階段（非 slice）**：若要 4 branch 腦輪廓像素級對齊，屆時把腦輪廓抽成共用底層、各 branch 只畫純 tract（additive refactor，不碰 DA 資料）。slice 的 DA 圖腦輪廓 baked-in 可接受。

## Risks / Trade-offs

- **codex 底圖內容 gate / 品質不穩** → Mitigation：apply 設視覺認可 checkpoint；codex 卡牆 > 10 min 改 Gemini 3.5 Flash（`image_gen_routing.md`）；prototype 已有可 cannibalize 的 sparse 底圖當 fallback。
- **AI 圖纖維 1–3px 斷裂 → skeleton 斷** → Mitigation：mask 做 morphological close 補斷裂；交會處 prune short spurs；生成時就要求 flat saturated non-overlapping palette。
- **fog-of-war「往哪探索」迷失** → Mitigation：已點亮節點向外輻射式解霧 + 探索方向提示；slice 階段觀察手感再調（列入 open question）。
- **正回饋 buff 失衡（老玩家秒爆 / 新玩家太慢）** → Mitigation：slice buff 幅度保守、防刷沿用既有 idle pause + 每分鐘上限 + 答題冷卻；dogfood telemetry 校準。
- **`meta` key-value 不夠用** → Mitigation：D6 逃生門（開 store + 強制 fixture）。
- **build-time pipeline 列為 dev script，不在 prod runtime** → graph JSON 是 commit 進 repo 的 static asset；CI 不重跑 pipeline，避免 build-time 影像處理拖慢 deploy。

## Migration Plan

- **Deploy**：merge → main → `deploy-cf-pages.yml` build neurons → CF Pages（`med-study-rpg.com/neurons/maze-beta`）。neurons-tw 不上 GH Pages。
- **既有玩家**：開 `/maze-beta` 即看到已收 DA 變體對應節點點亮（derive，無 backfill / 無 migration banner）。
- **Rollback**：route + lib + asset 純加 → revert = 刪除即可，shipped connectome 零影響。CI 綠但 prod smoke 壞 → revert change（Step 9-c 路徑）。

## Open Questions

- 答題 vs 閱讀產 signal 的具體比重（dogfood tune）。
- 節點抽卡保底 / pity 具體數值（呼應 pyramid 保底，slice 先沿用 family 保底 1 抽）。
- fog-of-war 解霧顆粒度 / 探索方向提示的具體 UX（slice 觀察手感後定）。
- 110 節點 vs 原估 50 的 2–3 個月配速——slice 只 20 節點，全圖配速待 4 區擴張用實際數重算。
