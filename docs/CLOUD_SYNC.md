# Cloud Sync — Deploy Guide for Forks

study-rpg M4 cloud sync mirrors gameplay state to Supabase Postgres via opt-in
Google OAuth. IndexedDB stays the source of truth; cloud is purely additive.
This guide walks a content/theme fork through wiring its own Supabase project.

## Architecture summary

- **Client**: `apps/medexam-tw/src/lib/{auth,sync}/` — `@study-rpg/core` does NOT
  ship cloud-sync code (keeps the engine content-pack-agnostic). Each app owns
  its sync engine wiring (see design D4 in `openspec/changes/add-cloud-sync/design.md`).
- **Backend**: Supabase free tier (50k MAU / 500 MB DB / 2 GB bandwidth) —
  Auth (Google OAuth) + Postgres (REST + RPC, no Realtime / Edge Functions).
- **Conflict policy**: last-write-wins per row by `updated_at`. Equal timestamps
  → cloud wins (deterministic tie-break).
- **Synced tables (9)**: `player_state`, `srs_cards`, `item_instances`,
  `mentor_backlog` (一階) + `hospital_state`, `hospital_doctors`,
  `hospital_mastery`, `hospital_question_history`, `question_bookmarks` (二階).
  `question_bookmarks` uses composite PK `(user_id, question_id)` and carries
  an immutable `added_at` column distinct from the LWW `updated_at`.
- **Sync triggers**: debounced auto-push (3-5s) on Dexie mutations + on-focus
  pull (`visibilitychange === 'visible'`).
- **Offline**: dirty markers kept in memory on network failure; flushed on next
  successful write. IndexedDB never blocked.

## Step 1 — Bootstrap your Supabase project

1. Create a free Supabase project at https://supabase.com/dashboard (recommend
   Tokyo `ap-northeast-1` for Taiwan latency)
2. Enable Google OAuth provider:
   - Create Google OAuth 2.0 Client at https://console.cloud.google.com → APIs & Services → Credentials
   - Application type: Web application
   - Authorized redirect URIs: paste the `<project-ref>.supabase.co/auth/v1/callback` URL from Supabase dashboard's Auth → Providers → Google
   - Copy Client ID + Client Secret to Supabase dashboard's Google provider settings
3. Apply the three migrations in `supabase/migrations/` via dashboard SQL editor
   (run in order: `0001_init_cloud_sync.sql` → `0002_account_lifecycle.sql` →
   `0003_upsert_lww.sql`)
4. Verify in dashboard:
   - 8 tables exist (`player_state` / `srs_cards` / `item_instances` /
     `mentor_backlog` / `hospital_*` × 4)
   - 32 RLS policies exist (4 ops × 8 tables, all on `auth.uid() = user_id`)
   - 4 RPCs exist (`delete_my_data` / `delete_my_account` / `export_my_data` /
     `upsert_lww`)
5. **Configure Auth → URL Configuration** (https://supabase.com/dashboard/project/<project-ref>/auth/url-configuration):
   - **Site URL**: set to your production host (used as default redirect when
     a request lacks `redirectTo` or fails whitelist). Example:
     `https://<your-username>.github.io/<repo-name>/`
   - **Additional Redirect URLs**: whitelist every `redirectTo` your app will
     ever pass. Supabase silently falls back to Site URL when an OAuth
     redirect target isn't in this list — so missing entries quietly break
     production sign-in even though the code is correct. Add at minimum:
     ```
     https://<your-username>.github.io/<repo-name>/
     https://<your-username>.github.io/<repo-name>/<subpath>/
     http://localhost:5173/<repo-name>/
     http://localhost:5174/<repo-name>/<subpath>/
     ```
     (Adjust ports + subpaths to match your actual dev/prod URLs. Each line
     is matched as a prefix in newer Supabase, but listing exact URLs is
     safer.)
   - **Why this matters**: `signInWithOAuth({ options: { redirectTo } })` in
     code resolves `window.location.origin + import.meta.env.BASE_URL` at
     runtime — but Supabase rejects unrecognized redirect URLs server-side
     and falls back to Site URL. If Site URL is still the default
     `http://localhost:3000/`, your production OAuth completes successfully
     but lands on a dead port with the access_token in the URL hash that
     nobody is listening for.

## Step 2 — Client env

`apps/<your-app>/.env.local` (gitignored):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_<...>
VITE_CLOUD_SYNC_ENABLED=true
VITE_SYNC_DEBOUNCE_MS=3000
```

`apps/<your-app>/.env.example` (committed, no real values):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_CLOUD_SYNC_ENABLED=true
VITE_SYNC_DEBOUNCE_MS=3000
```

For prod deploy via GitHub Actions, add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` as repo secrets and reference them in `deploy.yml`'s build step.

## Step 3 — Wire sync engine in your app

`@supabase/supabase-js` is already a workspace dep on `apps/medexam-tw`. To wire
sync into a new app:

1. Copy `apps/medexam-tw/src/lib/{auth,sync}/` to your app's `src/lib/`
2. If your app uses a different Dexie schema, adapt `tables.ts` — create a
   `TableAdapter` for each table you want synced:

```ts
const MY_TABLE: TableAdapter = {
  postgresTable: 'my_table',
  shape: 'collection',           // or 'singleton'
  dexieTable: 'myDexieTable',
  async snapshotDirty(db, dirtyPks, userId, updatedAt, appVersion) { /* ... */ },
  async snapshotAll(db, userId, updatedAt, appVersion) { /* ... */ },
  async applyToLocal(db, cloudRow, opts) { /* ... LWW logic ... */ },
}

export const MY_APP_ADAPTERS: readonly TableAdapter[] = [MY_TABLE, /* ... */]
```

3. In `engine.ts`, swap `ONE_STAGE_ADAPTERS` for your adapter array.
4. Mount `<AuthProvider>` in `main.tsx`, call `useSync()` somewhere in `App.tsx`,
   render the 3 modals (`MigrationUploadPrompt` / `ConflictChooserModal` /
   `SettingsPanel`) based on `gateState`.

## Step 4 — Extend schema for your app

If your fork has tables not in the default 8, add a new migration:

```sql
-- supabase/migrations/0004_my_extension.sql
CREATE TABLE public.my_table (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pk_field TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, pk_field)
);

CREATE INDEX idx_my_table_user_updated ON public.my_table (user_id, updated_at);

ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY my_table_select ON public.my_table FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY my_table_insert ON public.my_table FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY my_table_update ON public.my_table FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY my_table_delete ON public.my_table FOR DELETE USING (auth.uid() = user_id);

-- Add to upsert_lww whitelist via a NEW migration file (never edit 0003 in place)
```

Don't forget to add your new table name to the `upsert_lww` RPC's table whitelist.

**Migration convention**: every change to `upsert_lww` SHALL ship as a new
numbered migration that `CREATE OR REPLACE`s the full RPC body. Never edit an
existing migration after it has been applied to any environment. Example:
`0006_upsert_lww_bookmarks.sql` adds `question_bookmarks` to the whitelist +
a new ELSIF dispatch branch, leaving `0003_upsert_lww.sql` untouched. This
keeps migration history append-only and `git revert`-safe.

## Step 5 — Verify

Sign in with a Google account, answer a question (or do anything that mutates
synced state), wait 3s, then in dashboard:

```sql
SELECT user_id, updated_at, app_version FROM player_state ORDER BY updated_at DESC LIMIT 5;
```

You should see your fresh row.

Sign out + sign in with a second Google account on another device — should
trigger the migration / conflict modal flow described in
`openspec/specs/cloud-sync/spec.md` (Reqs "Migration prompt" + "Conflict chooser").

## Cost expectations

- Solo player × ~5 MB per save × normal play frequency = far under free tier
  quotas (500 MB DB / 2 GB bandwidth / 50k MAU)
- Free tier suspends after 7 days inactivity (auto-resumes on next request) —
  fine for hobby projects, plan upgrade if you need always-on
- Daily backups require Pro tier ($25/mo) — for hobby forks, accept the risk
  or run periodic `export_my_data` cron via Edge Function

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| AuthButton stays hidden in prod | `VITE_SUPABASE_*` env vars missing from GH Actions secrets; `client.ts` returns `null` and `<AuthButton />` early-exits on `status === 'disabled'` |
| Sign-in succeeds but no row pushed after 5s | Check `globalThis.__sync.getStatus()` — `paused` means migration gate is waiting on user choice; `offline` means push failed (check console for RLS / RPC errors) |
| `upsert_lww` RPC returns 400 | Table not in whitelist inside `0003_upsert_lww.sql`; either add it or push to a whitelisted table |
| Cross-device sign-in shows wrong data | Check `auth.uid()` actually matches — two different Google accounts = two different `user_id` values = separate row sets |
| `[sync:pull:player_state]` repeats in console | Could be old `applyingFromCloud` bug (fixed in Task 6 — pulled rows would re-trigger dirty marker → push echo). Confirm `lib/sync/engine.ts` has the `applyingFromCloud = true` block around `pullNow()` body. |

## Out of scope (deliberately not implemented)

- Realtime / collaborative editing (no Supabase Realtime channels)
- Per-field merge / 3-way conflict resolution (LWW is the policy)
- Anonymous → upgrade flow (Google-only, no anonymous auth)
- Self-hosted Postgres support (schema is standard, but Auth provider tied to Supabase Auth)

See `openspec/changes/add-cloud-sync/design.md` for full rationale on each decision.
