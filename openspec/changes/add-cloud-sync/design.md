## Context

study-rpg M1–M3 已 ship 純 client-side SPA：Vite + React + Dexie (IndexedDB) + GitHub Pages，零後端，玩家進度全 local。M4 加 Supabase (Auth + Postgres) 作 cloud mirror，但**不**取代 IndexedDB 作 source-of-truth — cloud 純 additive layer。

當前狀態：
- IndexedDB 透過 `packages/core/src/lib/db.ts` Dexie wrapper 操作；hydration race 已解（per persistence spec）
- 二階 fork (`apps/medexam2-hospital-tw/`) 有獨立 Dexie schema（hospital tables）但共用 core helpers
- `@study-rpg/core@0.2.0` 已 publish 到 npm；二階 fork 透過 `^0.2.0` consume
- 玩家規模個位數（作者 + 學弟妹 alpha test），Supabase free tier (50k MAU / 500 MB DB / 2 GB bandwidth) 短期不擔心

設計約束（來自 grill summary 與 project.md）：
- **零後端哲學保留** — 仍 GitHub Pages CSR SPA；Supabase 作為 BaaS、無自建 server
- **vibe-coding-friendly** — Supabase JS SDK 是 first-class；不引入 Next.js / RSC 等過度抽象
- **離線優先** — IndexedDB 仍是 source of truth，cloud 失敗永不阻擋 gameplay
- **二階 fork 友善** — sync engine 設計成 content-pack-agnostic 模組，不寫死 medexam-tw 的 table

## Goals / Non-Goals

**Goals:**

1. 跨裝置同步玩家 gameplay state（character / 屬性 / mastery / cosmetic unlocks / SRS cards / inventory / streak）
2. Google OAuth 一鍵登入；登入完全 opt-in
3. Conflict resolution 自動化（last-write-wins），不引入 conflict UI
4. Offline 持續可玩，重連後自動 flush queued writes
5. GDPR-light：account deletion + JSON export
6. 二階 fork 直接 consume 同套 sync engine（共用 module，不重寫）
7. 既有 IndexedDB contracts 與 hydration race policy 完全不變

**Non-Goals:**

1. **Realtime multi-device collaboration** — 不開 Supabase Realtime channels；不做 real-time conflict UI；solo 玩家跨裝置不會同秒寫
2. **Server-side validation of game logic** — Postgres 純 storage，不重複實作 game rules；trust client（玩家只能害自己）
3. **PVP / leaderboard** — M6 範圍，不在 M4
4. **Self-hosted Postgres / database 遷移自由** — 鎖定 Supabase（free tier 夠用、未來 lock-in 風險已接受）
5. **Mock exam history / 詳解閱讀紀錄 sync**（grill open uncertainty F1.1）— M4 先不做，dogfood 後 follow-up change
6. **Anonymous account upgrade** — 不做 Supabase anonymous auth；登入 = Google or nothing
7. **Multiple providers**（Email magic link / GitHub）— 留給 follow-up，若未來外部 contributor 需要

## Decisions

### D1. Schema strategy: 1:1 mirror of Dexie tables

**Decision**: 每個需要 sync 的 Dexie table 對應一個 Postgres table，column 結構幾乎 1:1。額外加兩欄：`user_id UUID NOT NULL`（auth.uid()）、`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`。

**Alternatives considered**:
- **Single JSON blob per user** (`saves` table with `user_id`, `payload JSONB`)：寫起來最快，但每次 update 都重寫整份 → quota 浪費、無 row-level LWW、無法 partial sync
- **EAV / generic attribute table**：靈活但 query 超慢、schema 顯式性差
- **Event-sourced log** (append-only events, materialize state)：理論最 correct 但 vibe-coding overkill、Postgres free tier 撐不久

**Why 1:1 mirror wins**: 對應 Dexie 心智模型最直接、LWW per row 自然支援、export JSON 結構穩定、二階 fork 加自己 table 沒衝突。

**Cost**: 需要寫 N 個 table DDL（~6-8 個）+ N 個 RLS policy（template 一致、boilerplate 但安全）。

### D2. Conflict resolution: Last-write-wins per row by `updated_at`

**Decision**: 純 LWW。Client push 時帶 `updated_at`；Postgres trigger 或 client check 確保新值較舊不寫。Equal timestamp 時 cloud 贏（deterministic tie-break，避免 thrash）。

**Alternatives considered**:
- **Per-field merge**: e.g. mastery.correct 取 max, cosmetic_unlocks 取 union, streak 取 max。理論最少資料遺失，但 impl 複雜度高出 5 倍、bug 機率高
- **Device-priority (主裝置)**：玩家指定一台 master，其他 read-only。Solo 玩家覺得 friction 大、Roadmap 沒答應做
- **Explicit conflict UI**：偵測衝突跳 dialog 讓玩家選。個位數玩家實際遇到頻率 < 0.1%，UX 投資 ROI 太低

**Why LWW wins**: Solo 玩家跨裝置實際**不會**同秒寫（不可能 phone + laptop 同秒答題）；業界事實上多數 mobile-cloud sync 都 LWW（Notion / Apple Notes / iCloud）；impl 簡單；equal-timestamp 用 cloud-wins tie-break 避免 ping-pong。

### D3. Sync trigger: Debounced auto push (3-5s) + on-focus pull

**Decision**: IndexedDB write hook 後啟 3-5s timer，timer 到了 batch push 所有累積的 dirty rows。Tab visibilitychange = visible 時 pull cloud → 比對 LWW → apply 較新的。

**Alternatives considered**:
- **Real-time per-write push**：每 mutation 立即 push。最即時，但 quota / bandwidth 浪費（玩家答 100 題 = 100 push 而非 ~10 batch）；需要 Supabase Realtime 訂閱 cloud 變動成本更高
- **Manual sync button only**：完全靠玩家點。Dogfood UX 災難、容易忘
- **On tab close only**：crash / refresh 時遺失幾分鐘進度

**Why hybrid wins**: 3-5s debounce 是 sweet spot（玩家 burst answer 多題、單 push 涵蓋）；on-focus pull 解「裝置 A 寫完跳到裝置 B 看到舊資料」最常見 UX 痛點；不需要 Realtime channel 省複雜度。

**Tunable**: debounce window default 3000ms，design 留 env var override `VITE_SYNC_DEBOUNCE_MS` 讓 dogfood 調。

### D4. Sync engine 模組位置：`apps/medexam-tw/src/lib/sync/`（不進 `@study-rpg/core`）

**Decision**: Sync engine 放在 app-level、不擴張 `@study-rpg/core` public API。Engine 接受「table 清單 + Dexie instance」作為 dependency injection，content-pack-agnostic。

**Alternatives considered**:
- **塞進 `@study-rpg/core`**：理論上 reusable 但會把 Supabase 拉進 core dep tree、提高 fork 門檻（外部 fork 不一定想要 Supabase）；違反 `core` 的 content-agnostic 哲學
- **獨立 `@study-rpg/cloud-sync` package**：太早 over-engineer，個位數玩家 + 兩 app dogfood 階段先在 app-level
- **複製到兩個 app 各一份**：違反 DRY、bug 修兩次

**Why app-level shared module wins**: 兩 app 透過 import 共用（一階 import `apps/medexam-tw/src/lib/sync/`、二階 import 同檔），dependency injection 處理 schema 差異；core 維持純淨；未來真有第三方 fork 要這功能再 extract 成 separate package。

**Implementation note**: 兩 app 在 monorepo 同 root，用 relative import 或 pnpm workspace alias。

### D5. Schema drift policy: forward-compatible columns + `app_version` row tag

**Decision**: Postgres column 一律 nullable + DEFAULT 合理值；client `app_version` 寫進每 row。新 client 寫舊 row 時補 default；舊 client 讀新 row 時忽略未知 column（Postgres REST API 自然行為）。Postgres schema migration 走 Supabase migration files (`supabase/migrations/*.sql`)，semver-aligned。

**Alternatives considered**:
- **Strict schema, breaking changes need new table**：太僵化，dogfood 階段每次小調都得 migrate
- **無 versioning，全靠 JSON blob 容錯**：見 D1 alternatives，已否決

**Mitigation if 舊 client 讀新 row crash**：每 row 含 `app_version`；如果未來真撞 schema break，新 row 寫進 `cloud_sync_state_v2` 之類新 table，舊 client 透過 `app_version >= X` filter 跳過。M4 範圍**只**做 v1 schema、不預先設計 v2 migration path。

### D6. Auth provider scope: Google OAuth only（M4）

**Decision**: 只接 Supabase Auth 的 Google OAuth provider。

**Alternatives considered**:
- **+ Email magic link**：給不能用 Google 的玩家、但接近零（學生族群）；Supabase Email template 設定 ~10 min 不算貴，但 M4 範圍砍掉省事
- **+ Anonymous device account**：technical lock-in 強、anonymous → upgrade flow 是 source of bugs；low ROI
- **+ GitHub**：給外部 contributor，當前 0 個 → 不做

**Why Google only wins**: 目標玩家（台灣醫學生）100% 用 Gmail；implementation 是 Supabase config single setting；外部 contributor 真出現時再加（10 min change）。

### D7. Migration UX: 顯式 attach prompt（modal，三個選項）

**Decision**: 第一次 sign-in 偵測 `local has data ∧ cloud has no rows for this user_id` → modal 三選項：「Upload」/「Keep separate」/「Decide later」。"Decide later" 不寫 state、下次 sign-in 再問。"Keep separate" 寫 `migration_choice_keep_separate` 進 IndexedDB、之後 sync 完全跳過此玩家直到他手動觸發 upload。

**Alternatives considered**:
- **Auto upload on first sign-in**：偷偷上傳。違反「informed consent」、若玩家 sign-in 的是別人帳號（家人共用）會把對方進度 leak
- **Fresh account = fresh start (no migration)**：作者自己幾個月本機進度直接丟掉，dogfood 體驗極差
- **Manual export/import only**：太麻煩、Roadmap 已有 manual export 不算新功能

**Edge case**: cloud 有資料 + local 也有資料（玩家 device A 已 sync、device B 第一次 sign-in） → **不**跳 modal，直接走正常 LWW pull（cloud 新值會自動 overwrite local 舊值，或反之）。

### D8. Account deletion: Postgres CASCADE + Supabase Auth admin API

**Decision**: 一個 RPC function `delete_my_data()` (SECURITY DEFINER) 跑 `DELETE FROM <table> WHERE user_id = auth.uid()` 串接所有 sync tables，然後 client 呼 Supabase Auth `auth.admin.deleteUser()` (需要 service role key — 走另一個 RPC 包裝)。

**Alternatives considered**:
- **Client 一個個 DELETE**：N 個 round trip、容易失敗一半留 orphan rows
- **Postgres ON DELETE CASCADE 跨 user 表**：Supabase Auth `auth.users` 是外部 schema，CASCADE 設計需小心；且 auth.users 不一定能直接從 client 觸發 delete

**Why RPC wins**: 一個 transaction、原子性；service-role key 寫在 RPC 內 client 看不到；export 端 (D9) 類似 RPC pattern 可重用。

### D9. Account export: client-side JSON aggregation

**Decision**: Client SELECT 所有 sync tables 過濾 `user_id = auth.uid()`，JS 端 aggregate 成 `{ schema_version, exported_at, tables: { player: [...], mastery: [...], ... } }` 結構，trigger `Blob` download。

**Alternatives considered**:
- **Server-side RPC return zip**：bigger payload、不必要的 server work
- **CSV multi-file zip**：阻擋未來 re-import / GDPR portability 弱

**Why client JSON aggregation wins**: 無 server overhead、與 manual import path 對稱（將來想 import 直接 reverse）、容易 dogfood verify。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Supabase 突然關門 / 大幅漲價 | Schema 是純 Postgres + 標準 OAuth，理論上可遷移到自架 PostgREST + 自架 Auth。Schema migration files 進 git、所有 data shape 公開。Lock-in 風險中等、acceptable |
| Free tier 撞牆（500 MB / 50k MAU） | Dashboard `pnpm gen-status` 加 Supabase usage row（M6 範圍）。當前個位數玩家 × ~5 MB/save ≈ 0.05 MB → 撞牆前 9000× 安全 margin |
| 玩家 sign-in 別人帳號（家人共用 device）→ 資料 leak | D7 modal 顯式 prompt 已 mitigate。Settings 永遠顯示 sign-in 的 email，明確告知 |
| LWW 偶爾「我明明寫了怎麼沒了」 | Open uncertainty F6.1 — design 留設定面板顯示 `last_sync_at` per device + 最近 push 數量。dogfood 後再決定要不要加更顯眼 UI |
| Cloud schema drift 撞舊 client | D5 forward-compat column 設計。dogfood 階段 schema 變動頻繁就 `pnpm typecheck` 嚴格化 + 每 schema 版本 bump core minor |
| `auth.users` delete 經 RPC service-role key 風險 | Service role key 純 server-side（Supabase Edge Function or PostgREST RPC），client 看不到。RPC scope 限制只能刪 `auth.uid()` |
| Sync engine bug 把 local 寫壞 | LWW + IndexedDB authoritative + Cloud pull error 永不 mutate local。Test scenario 涵蓋 100% RLS / LWW / offline queue 三條路徑 |
| 玩家撤回 Google 授權 → session expired | Supabase Auth 自動 refresh；refresh fail 時 client 進 "session expired" toast 並轉 unauthed state（gameplay 繼續 local）|

## Migration Plan

**M4 是新功能、無 deprecation。Deploy 流程**：

1. **Supabase project bootstrap**（owner 跑一次）：
   - 建 Supabase project（free tier）
   - Enable Google OAuth provider，設 Authorized redirect URL = GitHub Pages site URL
   - 跑 `supabase/migrations/0001_init_cloud_sync.sql` 建所有 table + RLS policy + RPC

2. **Client 部署**：
   - `apps/medexam-tw/.env.production` 加 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`（anon key 公開無妨，RLS 保護）
   - 二階 `apps/medexam2-hospital-tw/.env.production` 同樣
   - GitHub Actions workflow `.github/workflows/deploy.yml` 加 secrets 兩個 env var
   - `pnpm build` + deploy GH Pages

3. **第一次玩家體驗**：
   - 既有玩家 reload 看到首頁多一個 "Sign in with Google"（不打擾）
   - 點 → 走 Google OAuth → 回來看到 migration modal（local 有 save）→ pick Upload → 進度上 cloud
   - 之後換 device → sign in same Google → pull → 進度一致

**Rollback**：如果 cloud sync 出大 bug，client 端透過 feature flag `VITE_CLOUD_SYNC_ENABLED=false` 一鍵關閉（保留 sign-in UI 但 sync engine 不啟動），不影響 local gameplay。GH Pages 重 deploy 5 分鐘內生效。

## Decisions

### 2026-05-17 00:08 — Chrome MCP click reliability for migration modals (Task 6 smoke)

Chrome MCP `computer.left_click` with `ref` (即 `mcp__Claude_in_Chrome__computer + action: left_click + ref: ref_N`) **沒有可靠地觸發 React `onClick`** for the three migration modals (`MigrationUploadPrompt` / `ConflictChooserModal` / `SettingsPanel`). 點擊事件在 MCP layer 註冊（tool 回報「Clicked on element ref_X」），但 React handler 從未執行 — `migration_paused:<uid>` meta row 沒寫進去、engine 沒進 paused 狀態（雖然狀態剛好是 paused 但那是初始狀態不是這次點擊的結果）。

**Workaround**：改用 `javascript_tool` 直接 `element.click()` 觸發 synthetic native click。立即工作 — meta 寫入、engine pause/resume、UI 跳轉全部如預期。

**可能 root cause**（未深究）：
1. `.modal-backdrop` 上沒 onClick 但 `.modal` 內 wrapper 有 `onClick={(e) => e.stopPropagation()}` — Chrome MCP 的 `ref` 點擊可能透過某個 accessibility-tree path 派發事件，路徑被 stopPropagation 攔到？
2. Chrome MCP 的 ref-based click 可能是模擬 `pointerdown/pointerup` 而非完整 native click，碰到 React 17+ event delegation 對 capture phase 的處理不一致。
3. 與 React 同步狀態 timing 競爭（Chrome MCP 在 React render 前點擊）。

**Recommendation for future SPA smoke tests**（特別是要驗證 React modal 行為時）：
- **First try**: `mcp__Claude_in_Chrome__find` → `javascript_tool .click()` 透過 query + native click。比 ref-based 更可靠
- **Fallback**: 只在需要真實 pointer event（hover、drag、focus-on-click）才用 `computer.left_click ref`
- **Verification 一律寫**: 用 `javascript_tool` await + 直接讀取預期副作用（Dexie row、localStorage、Redux store state），不要只看 DOM diff（DOM 可能因 stopPropagation 沒變但 state 反而變）

**為什麼記在這**：Task 6 smoke 花了 ~15 min 才意識到 click 沒 fire（first symptom: meta 表是空的、但 button disabled 狀態看起來像 react 接到了）。Task 7 + future 二階 mirror smoke 都會遇到同樣的 modal — 記下來下次直接走 `.click()`。

## Open Questions

1. **Mock exam history 是否 sync**（grill F1.1）— 預設不做，但 dogfood 換 device 後可能想看「上次模擬考第 12 題我選哪個」。Follow-up change `add-mock-exam-history-sync` 評估
2. **Sync engine 抽 separate package 時機**（D4 follow-up）— 第三方 fork 真的出現 + 想要 cloud 功能時觸發
3. **Pull-on-focus 太頻繁影響電量？**（mobile use case）— dogfood 觀察，必要時加 throttle (e.g. 至少 30s 間隔)
4. **Account deletion 後 Supabase Auth email 是否可重新註冊**（fresh start use case）— Supabase 預設行為待 verify；M4 第一次 implement 時測一遍
5. **Backup / disaster recovery**（Supabase 端 data loss）— free tier 無自動 backup；先接受 risk，dogfood 累積真的有人在用後再評估升 Pro tier ($25/mo) 拿 daily backup
