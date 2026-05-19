# Cloud Sync — Deploy Guide for Forks

> ⚠️ **Architecture in transition.** The study-rpg main repo is migrating from
> Supabase Postgres row-sync to Cloudflare R2 blob-sync (see
> `openspec/changes/add-r2-cloud-sync-migration/`). Phase 0–1 land Q2 2026.
> M4 instructions below remain accurate for **forks staying on Supabase** and
> for understanding the legacy path during dual-write. The R2 overlay is
> documented in [Appendix R2](#appendix-r2-blob-based-sync-via-cloudflare).

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

---

## Appendix R2: blob-based sync via Cloudflare

Phase 1 of `add-r2-cloud-sync-migration` (shipped 2026-05-19) introduces a
parallel R2 write path. This appendix documents what changed for owners
running the main repo; forks staying on pure Supabase can ignore it. Full
rationale lives in `openspec/changes/add-r2-cloud-sync-migration/design.md`.

### Why migrate

Supabase free tier caps at 500 MB DB + 5 GB egress/月. Heavy users push ~1.7 MB
each; ceiling cracks at ~500–800 actives. R2 free tier gives 10 GB storage +
**zero egress**, raising the ceiling 20×+ at zero recurring cost. Cloudflare
Worker (~50 lines of TS) bridges Supabase JWT → R2 presigned URLs so the
client uploads directly to R2 without exposing R2 credentials.

### Architecture overlay (additive to M4)

- **Worker** `study-rpg-sync-worker` (`cloudflare/sync-worker/`) verifies the
  Supabase JWT against Supabase's JWKS endpoint and issues presigned R2 URLs
  scoped to `users/<jwt.sub>/<bundle>.json.gz`. The Worker NEVER holds a
  Supabase service-role key — migration is client-driven.
- **R2 buckets**: `study-rpg-saves` (primary, CORS allowlists GH Pages +
  localhost), `study-rpg-saves-backup` (daily cron-mirrored copy with 30-day
  retention).
- **Bundles**: 3 blobs per user instead of 9 row-tables.
  - `m1-snapshot.json.gz` — 一階 (`player_state` / `srs_cards` /
    `item_instances` / `mentor_backlog`)
  - `m2-snapshot.json.gz` — 二階 (`hospital_state` / `hospital_doctors` /
    `hospital_mastery` / `hospital_question_history`)
  - `bookmarks.json.gz` — cross-app `/bookmarks` page (`question_bookmarks`)
- **Conflict policy**: `If-Match: <etag>` optimistic concurrency on PUT.
  412 → pull-merge-retry up to 3 attempts (250 / 1000 / 4000 ms backoff).
  In-blob per-row `updated_at` LWW handles same-blob cross-device race.
- **Migration ceremony**: M4-era users see a one-time top-of-viewport banner
  on sign-in (「立即遷移」 / 「稍後再說」). Click reads RLS-scoped Supabase
  rows via the existing JS client, builds bundles in-browser, PUTs to R2.
- **Tenancy**: enforced at URL-signing time by the Worker (Worker won't sign
  URLs whose path `<user_id>` doesn't match the JWT's `sub`). RLS is no
  longer in the data-plane critical path for R2 reads/writes — the bucket
  has no public listing and only the Worker holds bucket-scope credentials.

### Feature flag matrix

The client reads two env vars at startup; invalid combinations throw via
`backend-config.ts`.

| `VITE_CLOUD_SYNC_BACKEND` | `VITE_CLOUD_SYNC_READ_BACKEND` | Phase | Writes | Reads |
|---|---|---|---|---|
| `supabase` (default) | (ignored) | Phase 0 / legacy | Supabase only | Supabase |
| `dual` | `supabase` | Phase 1–2 | Supabase + R2 | Supabase |
| `dual` | `r2` | Phase 3 | Supabase + R2 | R2 |
| `r2` | (ignored) | Phase 4+ | R2 only | R2 |
| `supabase` | `r2` | INVALID | — | — (throws at startup) |

`VITE_SYNC_WORKER_URL` defaults to the prod Worker
(`https://study-rpg-sync-worker.tony85314.workers.dev`); override in
`.env.local` for `wrangler dev` local Worker testing.

### Banner UX

`apps/medexam-tw/src/components/MigrationBanner.tsx` renders a sticky banner
below the app header when ALL hold:

1. `backendConfig.writeR2` (env flag is `dual` or `r2`)
2. Supabase client is configured AND user is authed
3. Probe `detectM1NeedsMigration` shows Supabase has M1 rows AND R2 lacks
   the `m1-snapshot.json.gz` blob

The probe uses a `Range: bytes=0-0` GET against the presigned R2 URL —
cheaper than HEAD (which isn't presignable for method-bound URLs) and
correctly returns 404 on missing blob.

**State machine** (visible to user):

```
checking → visible → migrating → done   (auto-hides after 5s)
                                error    (offers retry + 稍後再說)
                  → hidden (24h snooze, or until 7+ days of repeated dismissal escalates copy)
```

**Snooze + escalation**: dismiss log lives in
`localStorage['migration-banner-dismiss-log']` as `{ snoozedUntil,
dismisses[] }`. After ≥ 3 dismissals AND ≥ 1 dismissal ≥ 7 days old, the
banner copy escalates to:

> 您的雲端存檔還在舊系統中，請點此遷移以確保跨裝置同步繼續運作

Even escalated, the banner remains non-modal and dismissible.

**Idempotency**: `migrate-from-supabase.ts` checks R2 blob existence before
upload (Range-byte probe). 412 / 428 on `If-None-Match: *` also count as
"already-present" — a partial migration that uploaded M1 and crashed mid-
flight is resumable on next click without duplicating work.

### Rollback procedure

Every phase is reversible by flag flip alone (no schema migrations, no data
moves), except Phase 5 which physically drops Supabase sync tables and ships
as a separate change.

| Current phase | Symptom needing rollback | Action |
|---|---|---|
| Phase 1–2 (dual writes) | R2 push fails consistently | Flip `VITE_CLOUD_SYNC_BACKEND=supabase`, redeploy. Supabase remains authoritative; R2 blobs become orphans (retained for forensics). |
| Phase 3 (R2 reads) | Users report stale data, R2 latency spikes | Flip `VITE_CLOUD_SYNC_READ_BACKEND=supabase`, redeploy. Writes stay dual. |
| Phase 4 (R2 only) | Critical R2 outage / Worker bug | Flip `VITE_CLOUD_SYNC_BACKEND=dual`, `VITE_CLOUD_SYNC_READ_BACKEND=supabase`, redeploy. Supabase row state from before Phase 4 cutover is still there (frozen) — Worker `/restore` endpoint can replay R2 → Supabase if needed. |
| Phase 5+ | (drop tables irreversible) | Restore from daily R2 backup bucket via manual Worker invocation. Coordinate with Phase 5 follow-up change before pulling the trigger. |

### Operational handles

DEV-only globals (gated by `import.meta.env.DEV`):

```js
globalThis.__sync   // SyncEngine — pushNow / pullNow / pushAllNow / pullAllNow / status
globalThis.__db     // Dexie StudyRpgDB
```

CLI:

```bash
# Worker health (no auth)
curl https://study-rpg-sync-worker.tony85314.workers.dev/health

# Tail Worker logs (auth via wrangler)
wrangler tail study-rpg-sync-worker

# List a user's R2 blobs (owner-only, requires R2 API credentials)
wrangler r2 object list study-rpg-saves --prefix=users/<jwt-sub>/

# Daily backup state
wrangler r2 object list study-rpg-saves-backup --prefix=backup/$(date +%Y-%m-%d)/
```

### Known gaps (Phase 1 carryover)

- **Reconciliation script** (task 3.10) not implemented yet — daily diff
  Supabase rows ↔ R2 bundle for unreconciled rows. Requires service-role
  Supabase key; deferred until dogfood traffic accumulates.
- **End-to-end smoke tests** (tasks 3.16–3.17) need Chrome MCP + real
  M4-era user fixture — run manually before Phase 2 ramp.
- **14-day bake** (task 3.18) is calendar-bound; tracks dogfood errors
  before unblocking Phase 2.
- **M2 + bookmarks bundle wiring** is Phase 2 work (tasks 4.1–4.9). Phase 1
  only covers 一階 (M1).
