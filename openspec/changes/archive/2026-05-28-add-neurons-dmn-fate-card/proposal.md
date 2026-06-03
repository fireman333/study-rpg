## Why

neurons-tw (M_3rd track) 目前的 collection loop（連線層 + variant gacha + family mastery + achievements）已 ship 11/11，但缺一個「不必動腦也能拿到的隨機驚喜」鉤子 — 玩家在唸書累到不想答題、又還沒滿足回 connectome 看新東西的需求時，少了一個能立刻產生小高潮的入口。同時，現有 collection 雖然完整，但缺乏一個能跟「神經科學主題」自然契合的 narrative novelty 機制，無法支撐 owner 即將走的 Threads 公開介紹（需要一個可以三句話講完的「這個遊戲很有梗」鉤子）。

引入 **DMN (Default Mode Network) fate card** 解這兩個 gap：DMN 是真實神經科學概念（大腦休息態 / 發散思考時自發活化的網路），把抽卡 reskin 成「大腦進入發散模式 → 自發產生靈感」，narrative 自洽、視覺獨立、scope 收得緊。同時讓玩家累積唸書時間 + 達成行為里程碑 = 解鎖抽卡，補上「rest time produces inspiration」的設計循環。

## What Changes

- **New capability `neurons-dmn-fate-cards`**: 混合觸發 (時間 + 行為) 的 fate-card 抽卡系統，每張卡同時是圖鑑收藏 + 一次性「靈感事件」觸發器；抽完事件用完，卡留圖鑑
- **混合觸發機制**: 累積唸書時間 N 分鐘解鎖一抽（每日上限），同時達成行為里程碑（streak day++ / family AP 跨 threshold / variant slot unlock）解鎖 bonus 抽
- **Payout = 蒐集 + 事件混合**: 每張卡有 `eventKind`（一次性靈感事件 type，事件用完不可重觸）+ `artworkId`（圖鑑永久保留）
- **獨立 modal 抽卡 UX**: 新 `DmnDrawModal` + `DmnCollectionPage`；**不**動 connectome SVG / SYNAPSE_TIMINGS token / force-sim — 完全 self-contained 在獨立 route + modal
- **新內容 catalog**: `packages/content-neurons-tw/src/dmn-cards.ts` 定義 DMN 卡 catalog，含 4-tier rarity (P1–P4，比 variant gacha 少一階，更易拿到 P1)、event type pool (5 種一次性事件)、build-time validator
- **Dexie schema bump**: `apps/neurons-tw` local DB v5 → v6，加 `dmnCards` table (composite PK: `cardId`)、`dmnDailyDrawsConsumed` (LWW)、`dmnBonusDrawsAvailable` (monotonic)、`dmnEventLog` (已觸發事件紀錄、防重複)
- **R2 bundle schema bump v1 → v2 (BREAKING-ish)**: neurons bundle 加 4 個 dmn-* optional fields；同步把 reader code 改 **tolerant on higher schema_version**（silently drop unknown fields + log info），避免 v1 client 升級到 v2 bundle 時 throw `unsupported_schema_version`
- **Worker schema bump 同步**: `cloudflare/sync-worker/` neurons bundle schema 一起 bump v1 → v2，承接新 fields；presign 路徑不變（沿用既有 `neurons` bundle、不開新 bundle）
- **不在本 change scope**：reading-timer 接 study-category achievement / connectome empty-state copy / DMN 卡的真實 pixel-art asset（placeholder this change）/ Threads 文案 → 走 sibling change `polish-neurons-pre-ship` + follow-up `generate-dmn-card-artworks` + Threads 文案 owner 手寫

## Capabilities

### New Capabilities

- `neurons-dmn-fate-cards`: 混合觸發 (時間 + 行為) 的 DMN fate-card 抽卡系統 — 累積唸書 + 行為里程碑 → 解鎖抽卡額度 → 抽出帶 rarity 的 DMN 卡 → 卡同時觸發一次性靈感事件 + 進入永久圖鑑收藏 — 不影響 connectome / variant gacha / 既有 game loop，純疊加層

### Modified Capabilities

- `neurons-deploy`: bundle schema version 從硬性 `= 1` 改為「current = 2、reader tolerant on `> SCHEMA_VERSION`（silently drop unknown fields + log info）」。理由 = backward compat for v1 clients reading v2 bundles（mirror 二階 `add-bookmarks-filters-and-wrong-history-medexam2` 的「v1 clients tolerate v2 bundles (drop unknown field)」紀律）

## Impact

**Affected code**:
- `packages/content-neurons-tw/src/dmn-cards.ts` — NEW, exports `DMN_CARD_CATALOG: DmnCardDef[]` + `DMN_RARITY_WEIGHTS` (P1-P4 4-tier) + `DMN_EVENT_TYPES` (5 種一次性事件枚舉) + `DmnCardSchema` zod-shape 給 validator 用
- `packages/content-neurons-tw/src/dmn-card-validator.ts` — NEW, build-time validator (mirror `achievement-validator.ts`)：確保 catalog ids unique、每張卡都有 eventKind + artworkId、rarity 合法、每個 eventKind 至少有一張卡帶它（避免 unreachable event type）
- `packages/content-neurons-tw/src/index.ts` — re-export DMN symbols
- `packages/theme-pixel-neurons/src/sprites.ts` — register placeholder DMN card sprite keys (1×1 transparent PNG, 真實 art 走 follow-up change)
- `apps/neurons-tw/src/lib/db.ts` — Dexie v5 → v6 migration：新 `dmnCards` table + 3 個 meta keys (`dmnDailyDrawsConsumed`, `dmnBonusDrawsAvailable`, `dmnEventLog`)
- `apps/neurons-tw/src/services/dmn-fate-card.ts` — NEW, 抽卡 orchestrator：rollDmnCard → persist → dispatch event → queue toast/modal
- `apps/neurons-tw/src/services/dmn-event-dispatcher.ts` — NEW, 5 種事件 type 的處理 (family buff / variant rate-up / quick review batch / streak shield / hidden achievement reveal)
- `apps/neurons-tw/src/services/dmn-trigger.ts` — NEW, 混合觸發 detector：listens to reading-timer ticks (時間軸) + 既有 `connectome.variantSlotUnlocked` / streak day++ events (行為軸)
- `apps/neurons-tw/src/components/DmnDrawModal.tsx` — NEW
- `apps/neurons-tw/src/components/DmnCardReveal.tsx` — NEW
- `apps/neurons-tw/src/components/DmnDrawButton.tsx` — NEW (top nav / 角落浮動按鈕，顯示可用抽卡數)
- `apps/neurons-tw/src/pages/DmnCollectionPage.tsx` — NEW, `/dmn` route
- `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — SCHEMA_VERSION 1 → 2；reader 改 tolerant；schema 新增 4 個 dmn-* optional fields
- `apps/neurons-tw/src/lib/sync/r2/tables.ts` — 新 TableAdapter for `dmnCards`（LWW per cardId）+ 3 meta keys 的 sync 處理
- `apps/neurons-tw/src/App.tsx` — 註冊 dmn trigger listener at boot + 加 `/dmn` route + 加 DMN 入口按鈕
- `cloudflare/sync-worker/src/bundles/neurons.ts` (or wherever neurons bundle schema lives) — bump schema 接 dmn-* fields；presign whitelist 不變
- `apps/neurons-tw/src/__tests__/dmn-fate-card.test.ts` — NEW, Vitest unit tests (catalog validator / roll mechanics / event dispatch idempotency / bundle round-trip with v1↔v2 cross-version)

**Affected APIs / contracts**:
- `connectome-collection` events: 純消費端，不改 publisher
- `neuron-variant-gacha` events: 純消費端
- `neurons-deploy` bundle schema: bump v1 → v2，新增 reader tolerance requirement（modified spec delta）
- `@study-rpg/core` public API: 不動
- 不開新 R2 bundle（沿用 `neurons` bundle），所以 Worker presign whitelist + auth flow 都不需改

**Dependencies**: 無新 npm package。複用 `neurons-motion-library` (modal + toast 動畫) + 既有 `connectome-collection` / `neuron-variant-gacha` event bus + 既有 reading-timer (從 sibling change `polish-neurons-pre-ship` 接 — 本 change 把 trigger code 寫好但接口先 stub，timer 上線後串)。

**Risks**:
- v1 client 讀 v2 bundle 的 backward compat：靠 reader tolerance 改 + optional field design 兩道防線；需要 Vitest cross-version round-trip test 確認（mirror 二階 `question-history-merge.test.ts` 紀律）
- Dexie v5 → v6 migration on existing dogfood saves：純加 table + meta key，標準 Dexie upgrade callback；不破壞既有資料
- 抽卡平衡：每日時間 cap N + 行為 bonus 上限需要 design.md 給具體數字 + 上線後 dogfood telemetry 一週後微調
- Event type 平衡：5 種事件 effect 大小需 design.md 鎖定 magnitude；過強 → power creep 破壞 variant gacha 平衡，過弱 → 玩家無感
- Placeholder artwork = 醜：可接受、走 scaffold-era convention；real art 走 follow-up `generate-dmn-card-artworks`
- 跟 sibling change `polish-neurons-pre-ship` 的順序：建議先 ship polish（接通 reading-timer）再 ship DMN，DMN 才有時間軸觸發源頭；但本 change 內部把 timer 接口 stub 可以先獨立 ship、polish 上線後自動接通
