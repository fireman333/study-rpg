## 1. Supabase project bootstrap (owner-only, one-time)

- [x] 1.1 Create Supabase free-tier project; record project ref + URL — `jakdyjxojokyqxeiuukx` / `https://jakdyjxojokyqxeiuukx.supabase.co` (region: Tokyo `ap-northeast-1`)
- [x] 1.2 Enable Google OAuth provider; add Authorized redirect URLs for localhost dev + GH Pages prod — Google client `study-rpg-web` (client id `554492800193-1gp4...`), redirect URI to Supabase callback verified
- [ ] 1.3 Capture `SUPABASE_URL` + `SUPABASE_ANON_KEY`; commit `.env.example` with placeholder, add real values to `.env.local` (gitignored) and GitHub Actions secrets *(client `.env.local` + `.env.example` done in this session; GitHub Actions secrets still TBD before deploy)*

## 2. Postgres schema + RLS

- [x] 2.1 Add `supabase/` directory at repo root (migration files); document convention in `CLAUDE.md` *(directory created; CLAUDE.md doc step in task 9.1)*
- [x] 2.2 Write `supabase/migrations/0001_init_cloud_sync.sql`:
  - [x] 2.2.1 Tables: `player_state` (singleton, full Player JSONB), `srs_cards` (per question), `item_instances` (per item), `mentor_backlog` (singleton). 一階 covers character/屬性/cosmetic/streak/inventory/mentor — all nested inside Player JSON or own per-row table
  - [x] 2.2.2 Tables for 二階: `hospital_state` (singleton, collapsed gachaStats+tickets+gameCounters+rooms+affinity), `hospital_doctors` (per doctor), `hospital_mastery` (per subject), `hospital_question_history` (per question SRS)
  - [x] 2.2.3 Every table: `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `app_version TEXT`
  - [x] 2.2.4 RLS policies per table: SELECT/INSERT/UPDATE/DELETE all gated on `auth.uid() = user_id` — 32 policies (4 ops × 8 tables)
  - [x] 2.2.5 Indexes: PK on `(user_id, <row_pk>)`; secondary `idx_<table>_user_updated` on `(user_id, updated_at)` for sync filter queries
- [x] 2.3 Write `supabase/migrations/0002_account_lifecycle.sql`:
  - [x] 2.3.1 RPC `delete_my_data()` (SECURITY DEFINER, scoped to auth.uid()) — deletes from all sync tables in one transaction
  - [x] 2.3.2 RPC `delete_my_account()` — calls `delete_my_data()` then `DELETE FROM auth.users WHERE id = uid` (SECURITY DEFINER, no service_role key needed on client)
  - [x] 2.3.3 RPC `export_my_data()` — returns single JSONB blob with `{schema_version, exported_at, user_id, tables{}}` for client-side Blob download
- [x] 2.4 Apply migrations to Supabase project; verify RLS via dashboard test queries — applied via Chrome MCP + JS XHR + Monaco setValue (raw GitHub URL fetch). Verify query confirmed 12 rows = 4 RPCs (`delete_my_account` / `delete_my_data` / `export_my_data` / `upsert_lww`) + 8 tables (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog` / `hospital_state` / `hospital_doctors` / `hospital_mastery` / `hospital_question_history`). RLS cross-user-isolation test deferred to Task 8.5

## 3. Client dependencies & config

- [x] 3.1 Add `@supabase/supabase-js` to root `package.json` (workspace dep) + `apps/medexam-tw` + `apps/medexam2-hospital-tw` — installed `@supabase/supabase-js@^2.105.4` in both apps via `pnpm --filter <app> add`
- [x] 3.2 Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` + `VITE_CLOUD_SYNC_ENABLED` (default `true`) + `VITE_SYNC_DEBOUNCE_MS` (default `3000`) to env config; document in `.env.example` — `.env.example` committed, `.env.local` populated (gitignored)
- [ ] 3.3 Add Supabase secrets to `.github/workflows/deploy.yml`; verify build picks them up *(owner: GH Actions Secrets UI; deferred until first prod deploy)*

## 4. Auth module (shared between apps)

- [x] 4.1 Create `apps/medexam-tw/src/lib/auth/` with: `client.ts` (Supabase client singleton + env gate, returns null when disabled), `AuthContext.tsx` (combined Provider + hydration + useAuth hook; status ∈ initializing|authed|unauthed|disabled)
- [x] 4.2 + 4.3 `AuthButton.tsx` component combines sign-in / sign-out — single component renders authed (`☁️ <email>`) vs unauthed (`☁ Sign in`) state, click toggles. signInWithOAuth({ provider: 'google', redirectTo: BASE_URL }); signOut() does not touch IndexedDB (per spec auth Req 3)
- [x] 4.4 Wire `<AuthProvider>` into app shell at `main.tsx`, wraps `<App />`; exposes `useAuth()` returning `{ status, session, user, signInWithGoogle, signOut }`
- [x] 4.5 Mount `<AuthButton />` at top of `homeView` fragment in `App.tsx`; styled `position: fixed; top: 12px; right: 12px` in `styles.css` (visible on all routes that render home, unobtrusive over CharCard area)
- [ ] 4.6 Mirror module setup in `apps/medexam2-hospital-tw/src/lib/auth/` via shared import (or relative path) *(deferred to next batch with sync-engine wiring)*

## 5. Sync engine (shared module)

- [ ] 5.1 Create `apps/medexam-tw/src/lib/sync/` module with content-pack-agnostic API: `createSyncEngine({ tables, dexieDb, supabase, debounceMs, onError })`
- [ ] 5.2 Implement `engine.ts`:
  - [ ] 5.2.1 Dexie hook registration: subscribe to writes on listed tables → mark dirty + enqueue debounced push
  - [ ] 5.2.2 Debounced push: collect dirty rows after `debounceMs`, batch UPSERT to Supabase with `user_id` + `updated_at`
  - [ ] 5.2.3 LWW check on push: include `updated_at` in payload; rely on Postgres RPC `upsert_lww(table, rows)` to enforce server-side comparison
  - [ ] 5.2.4 Pull on focus: `visibilitychange === 'visible'` → SELECT rows where `updated_at > <last_pull_at>` per table → apply to Dexie via LWW
  - [ ] 5.2.5 Offline queue: persist `sync_queue` Dexie table (pending pushes); flush on `online` event with exponential backoff
- [x] 5.3 Write `supabase/migrations/0003_upsert_lww.sql` — RPC `upsert_lww(table_name TEXT, rows JSONB)` with table whitelist (8 tables), per-row user_id ownership check, ON CONFLICT DO UPDATE WHERE `cloud.updated_at < incoming.updated_at` for server-side LWW enforcement
- [ ] 5.4 Wire `sync engine` into app shell — initialize on `useAuth()` returns authed session; teardown on sign-out
- [ ] 5.5 Mirror sync engine setup in 二階 app; inject 二階-specific table set
- [ ] 5.6 Unit tests `apps/medexam-tw/src/lib/sync/engine.test.ts` (vitest) covering: LWW push (newer local wins), LWW pull (newer cloud wins), offline queue flush order preserves write sequence, debounce coalesces burst writes into single batch, on-focus pull invocation, pull failure leaves local intact (no mutation)
- [ ] 5.7 Unit tests `migration.test.ts` covering the 4 sign-in conditions (local empty/non-empty × cloud empty/non-empty) and verifying correct UI route: migration upload modal / conflict chooser modal / silent pull / fresh start — plus all conflict chooser branches (use-cloud snapshot, use-local force push, decide-later pause)

## 6. Sign-in resolution modals (migration + conflict chooser)

- [ ] 6.1 Post-sign-in trigger logic in `useAuth.ts`:
  - [ ] 6.1.1 Compute `local_has_nondefault_state` (compare IndexedDB to `newPlayer()` defaults)
  - [ ] 6.1.2 Compute `cloud_has_rows` (HEAD count on cloud sync tables filtered by `user_id`)
  - [ ] 6.1.3 Route to one of four states: `migration-upload` (local non-empty + cloud empty) / `conflict-chooser` (both non-empty) / `silent-pull` (local empty + cloud non-empty) / `fresh-start` (both empty)
- [ ] 6.2 `MigrationUploadPrompt.tsx` modal (Upload / Keep separate / Decide later)
  - [ ] 6.2.1 "Upload" action: bulk push every local row with `user_id = auth.uid()` and current `updated_at`
  - [ ] 6.2.2 "Keep separate" action: persist `migration_choice = 'keep_separate'` in Dexie; sync engine skips this user until manual toggle
  - [ ] 6.2.3 "Decide later" action: no-op (re-prompt next sign-in)
- [ ] 6.3 `ConflictChooserModal.tsx` modal (Use cloud / Use local / Decide later)
  - [ ] 6.3.1 Display max `updated_at` per side so user can tell which is newer
  - [ ] 6.3.2 "Use cloud" action: snapshot local rows into `local_backup` Dexie table → full pull → replace local → resume sync
  - [ ] 6.3.3 "Use local" action: push every local row with `updated_at = now()` (LWW guarantees local wins) → resume sync
  - [ ] 6.3.4 "Decide later" action: pause sync engine (no auto push / no auto pull) until user re-opens chooser from settings
  - [ ] 6.3.5 Add `local_backup` Dexie table schema (one-time snapshot, never auto-cleared)
- [ ] 6.4 Re-open conflict chooser from settings: surface entry in Settings → 資料管理 when sync is paused due to "Decide later"

## 7. Account settings UI

- [ ] 7.1 Create `SettingsPanel.tsx` or extend existing settings route — sections: 帳號 (email + sign-out) / 同步狀態 (last_sync_at + queue length) / 資料管理 (export + delete)
- [ ] 7.2 "Export cloud data" button → calls `supabase.rpc('export_my_data')` (or client-side aggregation) → `Blob` download `study-rpg-export-<date>.json`
- [ ] 7.3 "Delete account data" button → confirm dialog → calls `delete_my_account()` RPC → sign out → toast
- [ ] 7.4 "Last sync" indicator pulls from `sync engine` last-success timestamp; refresh every 30s

## 8. Tests / verification

- [x] 8.1a Smoke test (auth-only, pre-sync-engine): localhost:5173/study-rpg/ → AuthButton renders top-right unauthed `☁ Sign in` → click → Google consent → redirect back authed `☁️ tony85314@gmail.com` → refresh persists. ✅ 2026-05-16, Chrome MCP. Spec auth Req 1 / 2 / 3 / 4 / 5 all green.
- [ ] 8.1 Manual test in dev (full pipeline, after sync engine): sign in → see migration modal → upload local → cross-device sign-in (Chrome incognito as 2nd device) → verify pulled state matches
- [ ] 8.2 Manual test: offline → write 10 quiz answers → reconnect → verify queue flushes; cloud rows match local
- [ ] 8.3 Manual test: 2 tabs same user → tab A writes → tab B focuses → verify B pulls A's changes within 5s
- [ ] 8.4 Manual test: account deletion → cloud rows gone (verify via Supabase dashboard) → local IndexedDB intact
- [ ] 8.5 RLS test: use Supabase JS to query without `user_id` filter → expect only own rows
- [ ] 8.6 Chrome MCP smoke (one-stage app): sign in / sign out / migration modal flow at localhost
- [ ] 8.7 Chrome MCP SPA 三件套（per `~/.claude/imports/chrome_mcp_preflight.md`）: in-app navigation + direct URL + F5 reload all work at production
- [ ] 8.8 二階 app: repeat 8.1 + 8.6 + 8.7 against `apps/medexam2-hospital-tw/`

## 9. Documentation

- [ ] 9.1 Update `<project>/CLAUDE.md`: add Supabase setup quick reference (env vars, migration command, RLS test query)
- [ ] 9.2 Update `openspec/project.md` Roadmap row M4 from `⏳` to in-progress, then `✓ shipped` after archive
- [ ] 9.3 Update `docs/CONTENT_SCHEMA.md`: document the cloud sync interface for fork authors (optional; can skip if sync engine stays internal)
- [ ] 9.4 Add `docs/CLOUD_SYNC.md`: deployment guide for new forks (Supabase project setup steps, env vars, RLS template)

## 10. Archive prep

- [ ] 10.1 Run `openspec validate add-cloud-sync` — must pass
- [ ] 10.2 Verify all checkboxes 1.x–9.x ticked
- [ ] 10.3 `/opsx:verify add-cloud-sync` — confirm implementation matches spec scenarios
- [ ] 10.4 `/opsx:archive add-cloud-sync` (Curator gate: explicit user confirm) — merges deltas into main specs
- [ ] 10.5 Add decision log entry in `openspec/decisions/<date>.md`: M4 shipped, summarize Supabase setup + dogfood learnings
- [ ] 10.6 `pnpm gen-status` — refresh dashboard
- [ ] 10.7 auto-git commit (Curator gate: explicit user confirm)
