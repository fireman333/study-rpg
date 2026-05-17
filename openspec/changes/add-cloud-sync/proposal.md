## Why

study-rpg 玩家進度全部在 IndexedDB，換裝置（手機 / 平板 / 桌機）會卡。作者本人就是 dogfood 痛點：畢業換手機後幾個月進度會消失。M4 milestone 目標解決跨裝置 portability，同時為未來 social 功能（M6 leaderboard）鋪 auth 基礎。

## What Changes

- **新增 Google OAuth 登入流程**（Supabase Auth），UI 加 sign-in / sign-out 控制；登入是 **opt-in**，不登入仍可完全 offline 玩
- **Cloud sync engine** — 把 gameplay state（character / 屬性 / mastery / cosmetic unlocks / SRS cards / inventory / streak）mirror 到 Supabase Postgres
- **Conflict policy**：last-write-wins per row by `updated_at` timestamp（無 explicit conflict UI；solo 玩家跨裝置實際不會同秒寫）
- **Sync trigger**：write 後 debounced auto push（3-5s）+ tab focus 時 pull；offline 走本機 IndexedDB queue，連線恢復後 flush
- **Migration prompt**：第一次 sign-in 偵測到本機有 save + cloud 空 → 顯式 modal「要 upload 嗎」
- **Schema mapping**：Dexie tables 1:1 對應 Postgres tables；每 row 加 `user_id` (auth.uid()) + `updated_at`；RLS 強制 `auth.uid() = user_id`
- **Account deletion / export endpoint** — 加進 M4 範圍（GDPR-light、一次做掉省事）

**Not changing**: IndexedDB 仍是 source of truth；offline gameplay 完全不受影響；cloud failure 永不阻擋 user input；persistence 既有 contracts（500ms write、hydration race policy）不變

## Capabilities

### New Capabilities
- `auth`: Google OAuth sign-in/sign-out flow, session state hydration, opt-in semantics（不登入仍可玩）
- `cloud-sync`: Postgres mirror schema, LWW sync engine, offline queue, migration prompt, account deletion/export

### Modified Capabilities
（none — `persistence` 既有 IndexedDB contracts 不變，cloud-sync 是新增 layer 不取代）

## Impact

- **New dependencies**: `@supabase/supabase-js`（client）；Supabase project 設定（free tier，個位數玩家短期不擔心 quota）
- **New env vars**: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（committed `.env.example`、實際 key 走 `.env.local` gitignored）
- **New code surface**:
  - `packages/core/`: 不擴張 public API（cloud-sync 是 app-level concern，content-pack-agnostic 維持）
  - `apps/medexam-tw/`: 新 `src/lib/auth.ts`、`src/lib/sync/`、`SignInButton.tsx`、`MigrationPrompt.tsx`
  - 二階 `apps/medexam2-hospital-tw/`: 同樣 wire（共用 sync engine 模組，content schema 不同 table set）
- **Postgres schema**: 6-8 tables + RLS policies（design.md 細寫 DDL）
- **Affected user-facing flows**:
  - 首頁加 sign-in 入口（minimal、不打擾未登入玩家）
  - 第一次登入有 modal 詢問遷移
  - Settings 加「資料管理」區（last sync time、登出、刪除帳號、export JSON）
- **No breaking changes** to existing `@study-rpg/core@0.2.0` API
- **External impact**: 二階 fork 也跟著拿到 cloud sync（共用 sync engine module），不需另寫
