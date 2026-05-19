## 1. Pre-Phase 0 — Cloudflare account + project bootstrap

- [x] 1.1 Owner creates Cloudflare account (no credit card; free tier)
- [x] 1.2 Create R2 bucket `study-rpg-saves` (primary) in Auto region
- [x] 1.3 Create R2 bucket `study-rpg-saves-backup` (daily mirror)
- [x] 1.4 Generate R2 API token scoped to both buckets (read/write); store in 1Password. Bound to Worker as `R2_S3_ACCESS_KEY_ID` + `R2_S3_SECRET_ACCESS_KEY` secrets.
- [x] 1.5 Configure CORS policy on `study-rpg-saves` to allow `GET, PUT` from `https://fireman333.github.io` and `http://localhost:5173`
- [x] 1.6 Install Wrangler CLI globally (`npm i -g wrangler`); `wrangler login`
- [x] 1.7 Scaffold Worker project at `cloudflare/sync-worker/` (TypeScript, ESM, no framework). Adopted `wrangler.jsonc` format (preferred since wrangler 4.x).
- [x] 1.8 Add Worker dependencies: `aws4fetch` (R2 presign), `jose` (JWKS verify), `@cloudflare/workers-types`. Added `cloudflare/*` to `pnpm-workspace.yaml`.
- [ ] 1.9 Configure GitHub Actions secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID` for Worker deploy
- [x] 1.10 Create `wrangler.jsonc` with bindings `R2_PRIMARY = "study-rpg-saves"`, `R2_BACKUP = "study-rpg-saves-backup"`, cron `0 0 * * *`, vars for CORS allowlist + presign TTL, secret placeholders for `SUPABASE_JWKS_URL` / `SUPABASE_PROJECT_REF` / `R2_S3_ACCESS_KEY_ID` / `R2_S3_SECRET_ACCESS_KEY` / `R2_S3_ENDPOINT`. **NO `SUPABASE_SERVICE_ROLE_KEY`** — migration is client-driven, Worker never reads user data on behalf of a user.

## 2. Phase 0 — Worker MVP (week 1)

- [x] 2.1 Implement `POST /presign` endpoint: verify JWT, extract `sub`, validate `bundle ∈ {m1,m2,bookmarks}`, generate R2 S3-compat presigned URL via `aws4fetch`, return `{ url, expiresAt }`. File: `src/presign.ts`.
- [x] 2.2 Implement JWKS cache: fetch Supabase JWKS on first verify, cache in module scope for 1 hour, refetch on cache miss. File: `src/auth.ts`.
- [x] 2.3 Implement `POST /delete-account` endpoint via shared handler: list+delete all R2 objects under `users/<sub>/`. Worker returns `{ r2: 'ok', deleted: N }`. File: `src/delete.ts`.
- [x] 2.4 Implement `POST /reset` endpoint via same shared handler. Semantic difference is client-side only.
- [x] 2.5 (removed — no `/bootstrap` endpoint; migration is client-driven, see Phase 1 banner tasks)
- [x] 2.6 Add cron trigger handler (`scheduled` export): list all `users/*` keys, copy each to `study-rpg-saves-backup` under `backup/<YYYY-MM-DD>/users/<u>/<b>`, prune backup keys older than 30 days. File: `src/backup.ts`.
- [x] 2.7 Add CORS preflight handler (`OPTIONS *` returning origin allowlist + `POST, OPTIONS` methods + Authorization header). File: `src/cors.ts`.
- [x] 2.8 Wrangler smoke tested via deployed Worker + Chrome MCP from real 二階 page (`https://fireman333.github.io/study-rpg/hospital/`). curl-level tests for health/unauth/preflight pre-deploy validation.
- [x] 2.9 Browser CORS smoke test: end-to-end OPTIONS preflight + PUT + GET from real GH Pages origin succeeded after fixing presign bug (see 2.11). R2 returns correct `Access-Control-Allow-Origin: https://fireman333.github.io` on both preflight and actual response.
- [x] 2.10 Deploy Worker to Cloudflare: live at `https://study-rpg-sync-worker.tony85314.workers.dev`. 5 secrets bound. Cron registered.
- [x] 2.11 Manual end-to-end JWT smoke from real Supabase Google-OAuth session: PUT 1-byte `0x74` → presigned URL ✓ → R2 stored ✓ (ETag `e358efa489f58062f10dd7316b65649e`) → GET round-trip returned same byte ✓ → R2 key correctly path-scoped to `users/<jwt.sub>/m1-snapshot.json.gz` ✓. Test blob deleted after verification. **Bug fix during smoke**: corrected `X-Amz-Expires` from signed-header to query-param via `aws4fetch.expires` option (signed header form broke browser PUT because browsers don't send `x-amz-expires` as request header). Initial JWKS URL also corrected from `/auth/v1/keys` (401) to `/auth/v1/.well-known/jwks.json` (200).
- [x] 2.12 Worker error logging: structured `console.error` in catch blocks; `observability.enabled = true` in wrangler.jsonc; visible via `wrangler tail`.

## 3. Phase 1 — Client dual-write M1 bundle (week 2–3)

- [x] 3.1 Create new package `apps/medexam-tw/src/lib/sync/r2/` with files: `client.ts` (presign+fetch), `bundles.ts` (M1/M2/bookmarks bundle builders), `etag.ts` (in-memory ETag tracker), `engine-r2.ts` (push/pull adapter)
- [x] 3.2 Implement `client.ts.requestPresign(bundle, op)`: calls Worker `/presign` with current Supabase JWT, returns `{ url, expiresAt }`; cache result for `expiresAt - 60s`
- [x] 3.3 Implement `bundles.ts.buildBundleSnapshot(db, adapters, userId)`: gather all bundle's tables from Dexie via existing `adapter.snapshotAll`, wrap in `{ meta: { schema_version, updated_at, client_id }, data: { ... } }`. Gzip via `gzipBundle(snapshot)` helper using `CompressionStream('gzip')`. Generic over adapter set so 二階 Phase 2 reuses without rewrite.
- [x] 3.4 Implement `bundles.ts.applyBundleSnapshot(db, adapters, snapshot)`: decompress via `gunzipBundle`, validate meta via `validateBundleMeta`, route rows through existing `adapter.applyToLocal` for per-row LWW merge. Reuses Supabase adapters so semantics are identical.
- [x] 3.5 Implement `engine-r2.ts.pushBundle(bundle)`: requestPresign → PUT R2 with `If-Match: <last-etag>` (or `If-None-Match: *` for first push) → on 412/409/428, pull-merge-retry up to 3 attempts with exponential backoff (250/1000/4000ms)
- [x] 3.6 Implement `engine-r2.ts.pullBundle(bundle, opts: { conditional, force })`: requestPresign → GET R2 with `If-None-Match: <last-etag>` if `conditional`, else unconditional → on 200 apply snapshot, on 304 no-op, on 404 return blobMissing=true
- [x] 3.7 Add `VITE_CLOUD_SYNC_BACKEND` + `VITE_CLOUD_SYNC_READ_BACKEND` + `VITE_SYNC_WORKER_URL` to `.env.example`; document valid combinations in `backend-config.ts` (fails fast on `supabase` + `r2` combination)
- [x] 3.8 Wire dual-write into existing `engine.ts.pushNow()` AND `pushAllNow()`: when `writeSupabase`, run legacy per-table loop; when `writeR2 && r2BundleName`, call `pushBundle(supabase, db, adapters, r2BundleName, userId)`. R2 failures recorded via `recordError('push', 'r2:<bundle>', err)` without unwinding successful Supabase writes. `useSync.ts` passes `r2BundleName: 'm1'` to engine.
- [x] 3.9 Reads still flow through existing Supabase path; do NOT switch reads yet
- [ ] 3.10 Add nightly reconciliation script `scripts/reconcile-m1.ts`: for each authed user (sample 10 random), pull Supabase rows + R2 M1 bundle, diff, print mismatches
- [x] 3.11 Implement `apps/medexam-tw/src/components/MigrationBanner.tsx`: render-detection logic (`authed && supabaseHasRows && !r2HasM1Blob` — Phase 1 scope), two buttons (「立即遷移」 / 「稍後再說」), non-modal sticky-top placement, dismissible. State machine: `checking → visible → migrating → done | error` (auto-hide on done after 5s)
- [x] 3.12 Implement `lib/sync/r2/migrate-from-supabase.ts`: paginated SELECT from each M1 sync table (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog`) → assemble bundle → gzip → PUT via presign with `If-None-Match: *`. Idempotent (`r2BlobExists` Range-byte probe skips upload; 412/428 also treated as already-present). Returns `{ status, rowsByTable, bytes?, error? }`. Phase 2 (task 4.5) extends to M2 + bookmarks.
- [x] 3.13 Implement banner snooze state in `localStorage['migration-banner-dismiss-log']` (combined snooze + dismiss array); banner returns after 24h or on next sign-in
- [x] 3.14 Implement escalated copy after ≥ 3 dismissals AND ≥ 1 of them ≥ 7 days old (tracked in `dismisses[]` of dismiss log)
- [x] 3.15 Wire banner into `apps/medexam-tw` `App.tsx` layout (sticky banner below header, above Routes). Conditional render: only when `backendConfig.writeR2 && supabase && authUser` — banner stays dormant in Phase 0 / supabase-only deploys.
- [ ] 3.16 Smoke-test migration end-to-end on a real M4-era user fixture (owner's own account with seeded Supabase rows): click 「立即遷移」 → verify all 3 blobs exist in R2 → verify banner dismisses → verify subsequent sign-in does NOT re-show banner
- [ ] 3.17 Smoke-test partial migration recovery: kill tab mid-PUT, sign back in, verify banner re-renders, verify second click resumes from missing bundle
- [ ] 3.18 Bake 14 days dogfooded (owner only); zero unreconciled diffs required to proceed
- [x] 3.19 Add Phase 1 entry to `docs/CLOUD_SYNC.md` (Appendix R2: blob-based sync via Cloudflare) documenting the dual-write architecture, flag matrix, banner UX, rollback procedure per phase, and operational handles (Worker tail, R2 object list). M4 instructions retained as legacy reference during dual-write window.

## 4. Phase 2 — Client dual-write M2 + bookmarks (week 4–5)

- [ ] 4.1 Mirror tasks 3.3–3.6 for M2 bundle in `apps/medexam2-hospital-tw/src/lib/sync/r2/`
- [ ] 4.2 Mirror tasks 3.3–3.6 for bookmarks bundle (cross-app — lives in shared location, e.g., `packages/core/src/sync/bookmarks-bundle.ts` or per-app duplicate)
- [ ] 4.3 Wire dual-write into 二階 `engine.ts.pushNow()`
- [ ] 4.4 Extend nightly reconciliation script to cover M2 and bookmarks bundles
- [ ] 4.5 Extend `MigrationBanner` and `migrate-from-supabase.ts` detection to cover M2 + bookmarks bundles (Phase 1 only covered M1 — banner now triggers when ANY of 3 blobs missing while Supabase has corresponding rows)
- [ ] 4.6 Wire banner into 二階 `apps/medexam2-hospital-tw` layout
- [ ] 4.7 Verify migration end-to-end for an M4-era user with both 一階 and 二階 data: owner seeds a test account with both M1 and M2 Supabase rows → first sign-in shows banner → click migrates all 3 bundles → R2 verifies
- [ ] 4.8 Bake 14 days; zero unreconciled diffs across all 3 bundles required to proceed
- [ ] 4.9 Document the migration banner's decision tree in `docs/CLOUD_SYNC.md`: when banner appears vs not, what triggers escalated copy, partial-migration resume flow

## 5. Phase 3 — Cut over reads to R2 (week 6)

- [ ] 5.1 Update both apps' engine `pullNow()` and `pullAllNow()` to read from R2 when `READ_BACKEND=r2`
- [ ] 5.2 Update `SyncStatusChip` last-synced timestamp source: read from `engine.lastPullAt` regardless of backend
- [ ] 5.3 Update `MigrationUploadPrompt` and `ConflictChooserModal` to operate on bundles instead of per-table rows: keep the same 3 user-facing choices ("Upload local", "Keep separate", "Decide later")
- [ ] 5.4 Update `SettingsPanel` export action to call new R2-aware export (downloads combined JSON of all 3 bundles)
- [ ] 5.5 Update 二階 `HelpMenu` account section similarly
- [ ] 5.6 Deploy with `VITE_CLOUD_SYNC_BACKEND=dual`, `VITE_CLOUD_SYNC_READ_BACKEND=r2`
- [ ] 5.7 Monitor `bug_reports` for new submissions categorized `cloud-sync` for 7 days; investigate any
- [ ] 5.8 If zero rollback-worthy issues after 7 days, proceed to Phase 4

## 6. Phase 4 — Drop Supabase writes (week 7)

- [ ] 6.1 Flip `VITE_CLOUD_SYNC_BACKEND=r2`; deploy
- [ ] 6.2 Verify no client code path writes to Supabase sync tables (grep for `upsert_lww` callsites; should all be inside `if (backend !== 'r2')` branch)
- [ ] 6.3 Keep Supabase rows in place; they freeze (no more updates) but remain queryable
- [ ] 6.4 Update `docs/CLOUD_SYNC.md` to mark Supabase sync tables as "read-only, archived"
- [ ] 6.5 Monitor 14 days for any "missing data" reports

## 7. Phase 5 — Cleanup (week 8+, separate change boundary)

- [ ] 7.1 Verify Phase 4 has been stable for ≥ 14 days with zero rollback events
- [ ] 7.2 Archive this change (`/opsx:archive add-r2-cloud-sync-migration`)
- [ ] 7.3 Open a separate follow-up change `drop-supabase-sync-tables` that issues `DROP TABLE` migrations for the 9 sync tables — explicitly out of scope for this change

## 8. Documentation + capacity revalidation

- [ ] 8.1 Update `apps/medexam-tw/CLAUDE.md` repo-level memory to point at R2 architecture
- [ ] 8.2 Update `openspec/project.md` M4 row to note backend migration to R2
- [ ] 8.3 Update `docs/BUG_REPORTING.md` to note that `bug_reports` table stays on Supabase
- [ ] 8.4 Add `cloudflare/sync-worker/README.md` covering: local dev with `wrangler dev`, secret rotation, deploy flow, monitoring (`wrangler tail`), cron schedule
- [ ] 8.5 Re-run `supabase/sanity/capacity_monitor.sql` after Phase 4 to confirm DB size drops (Supabase should be < 50 MB excluding bug_reports + auth.users)
- [ ] 8.6 Write `cloudflare/sync-worker/capacity_monitor.md`: how to inspect R2 usage from Cloudflare dashboard; per-bundle size sampling; expected growth rate
