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

- [x] 5.1 Create `apps/medexam-tw/src/lib/sync/` module — `types.ts` (SyncEngine / SyncStatus / RowPayload / CloudRow), `tables.ts` (4 一階 TableAdapter: player_state / srs_cards / item_instances / mentor_backlog), `engine.ts` (factory), `useSync.ts` (React hook)
- [x] 5.2 Implement `engine.ts`:
  - [x] 5.2.1 Dexie hook registration: `creating` / `updating` / `deleting` hooks add `_updatedAt = Date.now()` + mark dirty PK; `deleting` clears dirty marker (no tombstone sync yet)
  - [x] 5.2.2 Debounced push: per-table dirty PK set, debounce window 3000ms (configurable via `VITE_SYNC_DEBOUNCE_MS`), batch `upsert_lww` RPC call per Postgres table
  - [x] 5.2.3 LWW check on push: payload includes `updated_at = new Date().toISOString()` + `app_version`; server-side LWW enforced via 0003_upsert_lww.sql RPC `ON CONFLICT DO UPDATE WHERE cloud.updated_at < incoming.updated_at`
  - [x] 5.2.4 Pull on focus: `visibilitychange` listener triggers `pullNow()` which `SELECT * FROM <table> WHERE user_id = ? AND updated_at > <last_pull_at>` per table; client-side LWW via `cloudIsNewer(cloud.updated_at, local._updatedAt)` before writing back to Dexie
  - [-] 5.2.5 Offline queue: implicit (dirty markers retained in-memory on push failure with `isLikelyNetworkError` detection; status → `offline`). **Explicit persisted queue with exponential backoff deferred** — current behavior: markers cleared on success, kept on failure, next dirty event retries. Spec Req 5 ("offline queue flush") satisfied at first-order level; rare crash-during-offline-window edge case loses queue
- [x] 5.3 Write `supabase/migrations/0003_upsert_lww.sql` — RPC `upsert_lww(table_name TEXT, rows JSONB)` with table whitelist (8 tables), per-row user_id ownership check, ON CONFLICT DO UPDATE WHERE `cloud.updated_at < incoming.updated_at` for server-side LWW enforcement
- [x] 5.4 Wire `sync engine` into app shell — `useSync()` hook in `App.tsx` instantiates engine on first `useAuth() === 'authed'`, calls `start(user.id)`, teardown on unmount or sign-out. Engine debug-exposed via `globalThis.__sync` + `globalThis.__db` (`import.meta.env.DEV` guard — stripped in prod)
- [ ] 5.5 Mirror sync engine setup in 二階 app; inject 二階-specific table set *(deferred to next batch — needs 二階 adapter set for hospital_state / hospital_doctors / hospital_mastery / hospital_question_history)*
- [-] 5.6 Unit tests `engine.test.ts` (vitest) **deferred** — project has no vitest setup yet; manual smoke (8.1a + 8.1b) covers push + LWW + hook injection. Add vitest config + tests in follow-up change if regression risk warrants
- [-] 5.7 Unit tests `migration.test.ts` **deferred** — same as 5.6; modal logic still pending in Task 6

## 5.S Smoke test (M4 sync engine)

- [x] 5.S.1 Cold start sign-in → engine.start() → pullNow() returns 0 rows (cloud empty)
- [x] 5.S.2 Dexie write (xp +1 via `globalThis.__db.players.update`) → hook injects `_updatedAt` → 3s debounce → pushNow() → cloud row appears (`/rest/v1/player_state?user_id=eq.<uid>` returns 1 row with matching `data.xp`)
- [x] 5.S.3 Cloud row has `app_version: "0.2.0"` + Postgres-side `updated_at` timestamp + payload.data deep-equals local Player object
- [x] 5.S.4 Status transitions: `idle` → `pushing` (transient) → `idle` (after success)

## 6. Sign-in resolution modals (migration + conflict chooser)

- [x] 6.1 Post-sign-in trigger logic — implemented in `lib/sync/useSync.ts` + `lib/sync/migration.ts`:
  - [x] 6.1.1 `hasNonDefaultLocalState(db)` — inspects `player.xp/level/totalRolls/badges/unlocks/currentStreak` + `itemInstances.count` + `srs.count` + `attempts.count` + `mentorBacklog` existence
  - [x] 6.1.2 `cloudHasAnyRows(supabase, userId)` — HEAD count with `Range: 0-0` across all 4 cloud-sync tables (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog`); short-circuits on first hit
  - [x] 6.1.3 `computeGateState` returns one of: `fresh-start` / `silent-pull` / `migration-upload` / `conflict-chooser` / `keep-separate` (persisted choice) / `resolved` (persisted choice) / `paused` (persisted from previous "Decide later")
- [x] 6.2 `MigrationUploadPrompt.tsx` modal (Upload / Keep separate / Decide later)
  - [x] 6.2.1 "Upload" → `engine.pushAllNow()` (bulk-push every local row, `updated_at=now()`) → persist `migration_choice: 'uploaded'` → resume engine
  - [x] 6.2.2 "Keep separate" → persist `migration_choice: 'keep-separate'` → `engine.stop()` → engine ref nulled; gate state goes to `keep-separate` (no modal next sign-in)
  - [x] 6.2.3 "Decide later" → modal dismissed for current session via gateState='resolved' transition; no persisted choice; re-evaluates on next sign-in
- [x] 6.3 `ConflictChooserModal.tsx` modal (Use cloud / Use local / Decide later)
  - [x] 6.3.1 Display max `updated_at` per side via `getMaxLocalUpdatedAt(db)` + `getMaxCloudUpdatedAt(supabase, userId)`; fresher side highlighted with SR-color border + "較新" badge
  - [x] 6.3.2 "Use cloud" → `snapshotLocalToBackup()` (writes `LocalBackupRecord` with reason='use-cloud-overwrite-local') → `wipeLocalSyncedTables()` (clears `players` + `itemInstances` + `srs` + `mentorBacklog`) → `engine.pullAllNow({force:true})` (no time filter, `applyingFromCloud=true` so hooks don't echo) → persist `migration_choice: 'cloud-chosen'` → resume
  - [x] 6.3.3 "Use local" → `engine.pushAllNow(new Date().toISOString())` (LWW server-side rejects nothing since incoming.updated_at > cloud's) → persist `migration_choice: 'local-chosen'` → resume. Smoke verified cloud `updated_at` advanced 11:45 → 13:44
  - [x] 6.3.4 "Decide later" → `setPausedForUser(true)` writes meta `migration_paused:<uid>` → `engine.pause()` → modal stays mounted via state='paused'. Smoke verified persistence (refresh re-shows modal in paused state)
  - [x] 6.3.5 `localBackup` table added in `packages/core/src/lib/db.ts` as Dexie v4 schema bump (additive; primary key `key`, indexed by `takenAt`). `LocalBackupRecord` type re-exported from `@study-rpg/core`
- [x] 6.4 Re-open conflict chooser from settings — `useSync.reopenConflictChooser()` exposed; SettingsPanel 同步狀態 section shows "重新解決衝突" button when `gateState === 'paused' || status === 'paused'`; click recomputes fresh `gateSnapshot` (refreshes timestamps) + force-renders ConflictChooserModal. Also exposed `resetMigrationPreference()` for the "重置同步偏好（重新詢問）" button which clears persisted `migration_choice` + `migration_paused` and re-runs full gate detection.

**Smoke evidence (Chrome MCP, 2026-05-16 ~21:45)**:
- Cold reload (cloud + local both non-empty) → conflict-chooser modal renders with both timestamps + "較新" badge on cloud side
- "Decide later" click → status='paused', meta has `migration_paused:<uid>`, modal stays
- Refresh after "Decide later" → modal re-shown immediately (paused state persists)
- "Use local" click → cloud `updated_at` advanced from 11:45 → 13:44 (push fired), meta has `migration_choice: 'local-chosen'`, status='idle', modal gone
- Refresh after "Use local" → modal stays gone (resolved state honored)
- "Use cloud" click → `localBackup` table has snapshot `{key:'snapshot-2026-05-16T13:45:55.673Z', reason:'use-cloud-overwrite-local', backedUpXp:999}`, local `_updatedAt` overwritten with cloud's timestamp, status='idle', modal gone, meta has `migration_choice: 'cloud-chosen'`

## 7. Account settings UI

- [x] 7.1 `apps/medexam-tw/src/components/SettingsPanel.tsx` — modal with 3 sections (帳號 / 同步狀態 / 資料管理), opened by clicking the authed AuthButton (previously the button signed-out directly; now opens settings). Reused existing `.modal-backdrop + .frame` pattern + new `.settings-*` CSS classes.
- [x] 7.2 "匯出雲端資料 JSON" button → `supabase.rpc('export_my_data')` → wrap returned JSONB in `Blob`, trigger anchor click for `study-rpg-export-YYYY-MM-DD.json`, revoke object URL. Smoke verified blob size 51370 bytes with structure `{tables: {srs_cards: [...], ...}}`.
- [x] 7.3 "刪除帳號雲端資料" button → `window.confirm` dialog with full disclosure → `supabase.rpc('delete_my_account')` → forced sign out → settings panel auto-closes. Verified UI rendering only (didn't fire RPC in smoke to keep dogfood account intact).
- [x] 7.4 "最後上傳" + "最後下載" indicators pull from `engine.lastPushAt()` + `engine.lastPullAt()`; `formatRelative()` helper shows 剛剛 / N 秒前 / N 分鐘前 / N 小時前 / ISO timestamp; 30-second `setInterval` rerender keeps freshness without re-querying engine
- [x] 7.5 (bonus) "重置同步偏好（重新詢問）" button → `useSync.resetMigrationPreference()` clears persisted `migration_choice:<uid>` + `migration_paused:<uid>` + re-runs `computeGateState`. Settings panel stays open with success toast; closing it reveals the appropriate fresh-detection modal. Smoke verified: before metaKeys `['migration_choice:<uid>']` → after `[]` → close panel → conflict-chooser modal shown.
- [x] 7.6 Status chip uses semantic colors per `SyncStatus`: idle=green / pushing-pulling=blue / offline=orange / paused-error=red / unauthed-disabled=gray
- [x] 7.7 AuthButton click semantics changed: authed click now opens SettingsPanel (less destructive than immediate sign-out); sign-out moved to a button inside the panel. Unauthed click unchanged (triggers Google OAuth).

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

- [x] 9.1 `CLAUDE.md` — new "Supabase cloud sync (M4)" section with project ref / dashboard URL / env var table, schema layout (3 migrations / 8 tables / 4 RPCs), architecture file pointers, DEV-only `globalThis.__sync` + `__db` debug handles, RLS sanity SQL
- [x] 9.2 `openspec/project.md` Roadmap M4 row → `🚧 ~85%` with sub-bullet breakdown of done vs remaining
- [-] 9.3 `docs/CONTENT_SCHEMA.md` cloud-sync section *(intentionally skipped)* — sync engine is app-level (per design D4), NOT exposed via `@study-rpg/core` public API. External fork authors who only consume `@study-rpg/core@0.x` don't see sync types. Coverage moved to dedicated `docs/CLOUD_SYNC.md` (9.4) which explains the app-level integration path.
- [x] 9.4 `docs/CLOUD_SYNC.md` — full deploy guide for forks: architecture summary, 5-step bootstrap (Supabase project / env / client wiring / schema extension / verify), cost expectations, troubleshooting table (5 common symptoms), out-of-scope clarifications

## 10. Archive prep

- [ ] 10.1 Run `openspec validate add-cloud-sync` — must pass
- [ ] 10.2 Verify all checkboxes 1.x–9.x ticked
- [ ] 10.3 `/opsx:verify add-cloud-sync` — confirm implementation matches spec scenarios
- [ ] 10.4 `/opsx:archive add-cloud-sync` (Curator gate: explicit user confirm) — merges deltas into main specs
- [ ] 10.5 Add decision log entry in `openspec/decisions/<date>.md`: M4 shipped, summarize Supabase setup + dogfood learnings
- [ ] 10.6 `pnpm gen-status` — refresh dashboard
- [ ] 10.7 auto-git commit (Curator gate: explicit user confirm)
