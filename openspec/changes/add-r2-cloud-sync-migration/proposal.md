## Why

Supabase free-tier Postgres caps at 500 MB DB storage + 5 GB egress/month. With the current row-level sync schema, the per-user footprint runs ~1.7 MB heavy / ~280 KB casual; ceiling hits at roughly 500–800 active users before requiring a paid Pro tier ($25/月) the owner does not want to commit to. Cloudflare R2 offers 10 GB storage + **zero egress fees** on the free tier, which raises the practical capacity ceiling by 20×+ without ongoing cost. Migrating now (while user count is still effectively zero) avoids painful data-pressure migration later, and the existing local-first architecture means cloud is already treated as an additive snapshot store — a perfect fit for blob-based object storage.

## What Changes

- **BREAKING**: Replace Supabase Postgres sync tables with Cloudflare R2 object storage. Sync payload model changes from per-table per-row LWW to per-bundle whole-blob LWW.
- Introduce a Cloudflare Worker as the auth-bridging proxy: client sends Supabase JWT, Worker verifies against Supabase JWKS, returns short-lived R2 presigned URLs scoped to the caller's `user_id`.
- Replace 9 sync tables (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog` / `hospital_state` / `hospital_doctors` / `hospital_mastery` / `hospital_question_history` / `question_bookmarks`) with 3 blob bundles per user: `m1-snapshot.json.gz` (一階), `m2-snapshot.json.gz` (二階), `bookmarks.json.gz` (cross-app /bookmarks page).
- Keep Supabase Auth (Google OAuth) and `auth.users` untouched — only the data plane moves.
- Keep `bug_reports` table in Supabase Postgres — it requires server-side query for owner dashboard and is too small to justify migration.
- Add a daily R2-to-R2 backup bucket via Cloudflare Worker cron (zero egress, free).
- Add a dual-write phase: client writes to both Supabase rows and R2 blobs concurrently for 4–6 weeks while reads stay on Supabase, then cut over reads to R2, then drop Supabase writes.
- Update conflict-resolution UX: blob-level LWW is coarser than row-level. Migration / conflict modals stay (still 3 outcomes: Upload local / Keep separate / Decide later) but operate on whole bundles, not individual rows.
- Migration ceremony for existing M4-era users: on first sign-in post-cutover with Supabase rows but incomplete R2 blobs, the client renders a one-time banner (「雲端架構升級中」) with a 「立即遷移」 button. On click, the client (NOT the Worker) reads its own RLS-scoped Supabase rows via the authenticated Supabase JS client, builds the 3 blob bundles in-browser, and pushes via Worker presign. Eliminates any need for a service-role Supabase key in the Worker.

## Capabilities

### New Capabilities
<!-- none — this change replaces an existing backend, not introducing new capabilities -->

### Modified Capabilities
- `cloud-sync`: Backend moves from Supabase Postgres to Cloudflare R2 via auth-bridging Worker. Sync unit changes from row-level (with `upsert_lww` RPC and 9-table whitelist) to blob-level (with HTTP PUT/GET of presigned URLs and per-bundle LWW). RLS replaced by Worker-enforced JWT verification + path-scoping. Debounced push, offline queue, tab-focus pull, and migration prompt SHALL be preserved with adapted semantics.

## Impact

**Affected code:**
- `apps/medexam-tw/src/lib/sync/` — engine, tables.ts (per-table adapter), useSync.ts: rewrite to blob-based adapter
- `apps/medexam2-hospital-tw/src/lib/sync/` — same rewrite for 二階
- `apps/medexam-tw/src/components/{MigrationUploadPrompt,ConflictChooserModal,SettingsPanel}.tsx` — adapt copy and resolution logic for blob-level LWW
- `apps/medexam2-hospital-tw/` — same for 二階 settings panel and modals
- `supabase/migrations/` — no new migration; keep existing tables intact during dual-write; drop sync tables in final phase (separate change)

**New infrastructure:**
- Cloudflare R2 bucket: `study-rpg-saves` (primary) + `study-rpg-saves-backup` (daily mirror)
- Cloudflare Worker: `study-rpg-sync-worker` (TypeScript, deployed via Wrangler) hosting `/presign`, `/delete-account`, and `/reset` endpoints (no `/bootstrap` — migration is client-driven)
- CORS policy on R2 bucket allowing browser PUT/GET from GH Pages origin

**Dependencies:**
- New: `@cloudflare/workers-types`, `aws4fetch` or `@aws-sdk/s3-request-presigner` (for R2 S3-compat presigning inside Worker), `jose` (JWKS verify)
- Removed (post-cutover): Supabase RPC calls for `upsert_lww` / 9-table SELECT/INSERT/UPDATE paths (Supabase client itself stays for Auth)

**Migration risk:**
- Dual-write window (~4–6 weeks) where any one phase failing requires rollback to Supabase reads (still functional)
- Existing M4 users need transparent bootstrap; failure mode = falls back to migration prompt as if first sign-in

**Out of scope for this change:**
- Dropping Supabase sync tables (separate change after 2-week soak post-cutover)
- Bug-reports backend migration (stays on Supabase indefinitely)
- Auth provider migration (Google OAuth via Supabase stays)
