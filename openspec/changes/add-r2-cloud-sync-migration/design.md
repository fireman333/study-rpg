## Context

The current cloud-sync stack ([apps/medexam-tw/src/lib/sync/](apps/medexam-tw/src/lib/sync/)) treats Supabase Postgres as a row-mirrored backup of IndexedDB. 9 tables each carry `user_id` + `updated_at`; pushes go through an `upsert_lww` RPC that gate-keeps an 8/9-table whitelist with per-table dispatch. RLS enforces `auth.uid() = user_id` row-by-row. This works correctly and is fully shipped (M4 + M4.5), but the storage footprint per active user runs ~1.7 MB heavy / ~280 KB casual (see [capacity_monitor.sql](supabase/sanity/capacity_monitor.sql)). At ~500–800 active users the free-tier 500 MB DB ceiling cracks; egress 5 GB/月 cracks at ~1500 active users/月.

The owner does not want a recurring $25/月 Supabase Pro subscription. Cloudflare R2 free tier offers 10 GB storage + **zero egress** + generous operation quotas (1M Class A writes/月, 10M Class B reads/月). For an app whose data plane is just "snapshot per user, push debounced, pull on focus" — R2 is a near-perfect fit.

The existing local-first architecture (IndexedDB is source of truth, cloud is additive mirror) makes this migration safer than a typical backend swap: at every phase, the worst case is "cloud sync stops working, gameplay continues from IndexedDB."

## Goals / Non-Goals

**Goals:**

- Eliminate the 500 MB DB ceiling and 5 GB egress/月 ceiling without recurring cost.
- Preserve all existing cloud-sync UX: debounced push, offline queue, tab-focus pull, migration prompt, conflict chooser modal, export/delete RPC equivalents.
- Keep Google OAuth identity flow unchanged — users perceive no auth or sign-in difference.
- Dual-write transition lets us roll back to Supabase reads at any phase if R2 path breaks.
- Existing M4 users (already have Supabase row data) bootstrap transparently — no "your save is gone, please re-import" prompt.
- Daily R2-to-R2 backup gives recovery option against accidental Worker bug overwriting blobs.

**Non-Goals:**

- Migrating Supabase Auth or `auth.users` table — Google OAuth via Supabase Auth stays.
- Migrating `bug_reports` table — owner dashboard needs SQL query, stays on Postgres.
- Reducing per-user data footprint via schema rollup — orthogonal optimization, can layer on later.
- Multi-region R2 (auto-replication) — single region is enough at this scale.
- Real-time subscriptions / multi-device live sync — debounced pull-on-focus is sufficient.
- Dropping the Supabase sync tables at the end of dual-write — separate change after 2-week soak.

## Decisions

### Decision 1: R2 + Worker over alternatives

| Alternative | Why not |
|---|---|
| Supabase Pro ($25/月) | Recurring cost contradicts owner constraint |
| Cloudflare D1 (5 GB SQLite) | Still row-level, similar complexity to current stack, no zero-egress benefit |
| Turso (9 GB libSQL) | Auth bridging similar effort, less mature than R2 |
| Neon (3 GB Postgres) | Same row-level model, only 6× headroom, still has egress meter |
| Shrink schema (rollup) | Defers but does not eliminate ceiling; orthogonal — can still apply later |
| Supabase Storage as blob target | Egress 5 GB/月 still applies; same project ceiling |

R2 wins on three axes simultaneously: largest storage (10 GB), **zero egress**, generous Class A/B quotas. The cost is one Cloudflare Worker for auth bridging (~50 lines TS) and a paradigm shift from row-sync to blob-sync.

### Decision 2: Blob bundle granularity — 3 per user, not 1 or 9

Three options for blob layout:

- **1 blob/user** (`saves/<user_id>/all.json.gz`) — simplest, but every push rewrites everything; concurrent writes from M1 + M2 apps race
- **9 blobs/user** (mirroring current tables) — preserves row-level granularity, but defeats the purpose; many small blobs = more Class A operations
- **3 blobs/user** — `m1-snapshot.json.gz` (一階: player + srs + items + mentor), `m2-snapshot.json.gz` (二階: hospital state + doctors + mastery + question_history), `bookmarks.json.gz` (cross-app /bookmarks page)

Choose **3 blobs**. Each blob corresponds to one logically-independent storage zone, matching how data is actually mutated (一階 quiz session touches only M1; 二階 hospital tick touches only M2; bookmark toggle touches only bookmarks). Cross-blob writes never collide. Each blob is small enough (~50–500 KB gzipped) for full re-upload to be cheap.

### Decision 3: Worker as auth-bridging presigner, not a write proxy

Two ways to architect the Worker:

- **Write-proxy** — client sends data to Worker, Worker validates and writes to R2 directly. Worker is in every request path.
- **Presigner** — client requests a short-lived presigned URL from Worker, then PUTs/GETs R2 directly. Worker only in URL-grant path.

Choose **presigner**. R2 traffic flows browser → R2 directly (zero-egress benefit preserved); Worker only handles the auth check. Lower latency for large blobs, Worker CPU usage stays trivial, fits within Worker free tier (100k requests/day) easily even at high active-user counts.

Presigned URL TTL = 5 minutes (enough for the largest plausible push/pull, not so long that leaked URLs are dangerous).

### Decision 4: Path-scoping enforces tenancy, not RLS

Postgres RLS enforces `auth.uid() = user_id` at the row level. R2 has no row concept; the Worker must enforce tenancy in URL signing:

- Verified JWT yields `sub` claim = user UUID
- Worker only signs URLs with `Key = users/<sub>/<bundle>.json.gz` — the JWT-bound user_id is the URL path prefix
- A client cannot obtain a URL for another user's path (Worker will not sign it)
- R2 bucket has no public listing; ListObjects requires bucket-scope credentials the Worker holds privately

Tenancy is therefore enforced **at URL-signing time** by the Worker, not at storage-engine time. The bucket-scope R2 credentials never leave the Worker.

### Decision 5: Blob-level LWW with `If-Match` ETag headers

Conflict resolution moves from per-row `updated_at` comparison to per-blob comparison. Two sub-mechanisms:

- **ETag-based optimistic concurrency**: Each blob has an R2-generated ETag. Push includes `If-Match: <last-known-etag>`. If R2 returns 412 Precondition Failed → another device pushed first → client must pull, merge, push again.
- **In-blob `updated_at` for visible LWW**: Each blob's JSON payload includes top-level `meta.updated_at`. On pull, client compares cloud blob's `meta.updated_at` against local IndexedDB's max `updated_at` across the same scope; pull wins if cloud newer.

ETag handles "two devices push simultaneously" (rare; merge-and-retry is correct). `meta.updated_at` handles "device A was offline, device B pushed, device A came online, who wins" (the original LWW semantics).

### Decision 6: Migration ceremony — banner-prompted client-side bootstrap (NOT transparent server-side)

For users who have Supabase row data and incomplete R2 blobs when the cutover ships, the client renders a one-time banner with an explicit migration trigger:

```
🔄 雲端架構升級中
你的存檔需要一次性遷移（約 5 秒，可繼續玩）。
[ 立即遷移 ]   [ 稍後再說 ]
```

On 「立即遷移」 click:

1. Client uses its current Supabase JS client (authenticated via existing JWT, RLS-scoped to own user) to SELECT rows from all sync tables
2. Client builds the 3 blob bundles in-browser (gzip via `CompressionStream`)
3. Client requests a presigned URL from the Worker for each bundle
4. Client PUTs each blob to R2 (with `If-None-Match: *` since this is the first write)
5. Banner dismisses; engine resumes normal sync

**Alternative considered and rejected: server-side transparent bootstrap.** An earlier draft of this design had the Worker hold a Supabase service-role key and migrate users invisibly. Three reasons to reject that path:

- **Security**: service-role key bypasses RLS. Any Worker bug or compromise grants any-user-data access. Holding it is a real liability for a hobby project with no security on-call rotation.
- **Observability**: silent failures during transparent bootstrap mean affected users see "missing data" weeks later with no signal what happened. Banner UI fails loudly — broken state surfaces immediately.
- **Trust**: hidden admin-level data movement is ironically *less* transparent than asking the user to click once. "We're upgrading, please click to refresh your save" gives the user agency and a clear mental model.

**Banner displays when ALL of these are true:**
- User is authenticated AND
- Client detects Supabase rows exist for this user (any of the 9 sync tables has rows) AND
- Client detects R2 has fewer than 3 blobs for this user

**Banner dismissal**: 「稍後再說」 hides the banner for 24 hours. It returns on next sign-in or after 24h. Eventually rolls off when (a) user migrates, (b) Phase 5 drops Supabase rows (banner will detect no Supabase data → won't show).

**Failure modes:**
- Worker presign fails → banner stays, error toast surfaces, user retries
- R2 PUT fails (network) → banner stays, partial blobs OK (idempotent on re-migrate)
- JWT expired mid-migration → client refreshes session via Supabase Auth, retries; if refresh fails, banner copy switches to "請重新登入"

This is the user-visible cost of the banner approach: ~1 click per existing user. The Worker complexity savings + security wins far outweigh this friction.

### Decision 7: Dual-write phasing, not big-bang cutover

Phases mirror the safe-mode pattern used in the original M4 cloud-sync rollout:

| Phase | Writes | Reads | Rollback if broken |
|---|---|---|---|
| 0. Worker MVP deployed (no client wired) | Supabase only | Supabase | (no client effect) |
| 1. Client dual-writes, M1 only | Supabase + R2 (M1 bundle) | Supabase | Disable R2 write path via feature flag |
| 2. Client dual-writes, M2 + bookmarks | Supabase + R2 (all 3 bundles) | Supabase | Same flag |
| 3. Reads cut over to R2, writes still dual | Supabase + R2 | R2 | Flip read flag back to Supabase |
| 4. Writes drop Supabase | R2 only | R2 | Re-enable Supabase writes (Postgres rows still exist) |
| 5. Soak 2 weeks, then drop Supabase sync tables | R2 only | R2 | Cannot rollback after drop; explicit separate change |

Each phase is reversible via a single feature flag (`VITE_CLOUD_SYNC_BACKEND=supabase|r2|dual`). The full migration runs ~6–8 weeks at one phase per week.

### Decision 8: Backup via Worker cron, not external backup service

Cloudflare Workers free tier supports cron triggers (1000 invocations/day). Daily cron: list all `saves/*/m1-snapshot.json.gz` etc., copy each to a second bucket `study-rpg-saves-backup` with date-prefixed key (`backup/2026-05-19/saves/<user>/m1.json.gz`). Zero egress (R2-to-R2 internal). Retain 30 days, then prune.

This gives 30-day point-in-time recovery against accidental Worker bug overwriting current blobs — a real risk during dual-write iteration.

### 2026-05-19 17:06 — Phase 1 (M1 dual-write + migration banner) shipped

Phase 1 shipped code-complete on 2026-05-19. Done: r2/ adapter package (client / bundles / etag / engine-r2), backend-config flag matrix (supabase/dual/r2 + supabase/r2 read), dual-write wired into engine.ts pushNow + pushAllNow (Supabase writes first then R2 bundle push; R2 failure logged but doesn't unwind Supabase), MigrationBanner.tsx with sticky-top placement + 24h snooze + escalated copy after 3 dismissals across 7 days, migrate-from-supabase.ts with paginated SELECT + Range-byte idempotency probe + 412/428 already-present handling, CLOUD_SYNC.md Appendix R2 covering rollback per phase. Tasks 3.1–3.9, 3.11–3.15, 3.19 ticked. Deferred: 3.10 reconcile script (needs service-role key, defer until dogfood traffic), 3.16–3.17 end-to-end smoke (needs Chrome MCP + seeded M4 fixture), 3.18 14-day bake (calendar). Validate passes, typecheck clean. Working tree dirty in track-m2 worktree (cross-track affects:both pattern matching prior R2 / reset commits). Worker URL https://study-rpg-sync-worker.tony85314.workers.dev unchanged from Phase 0.

### 2026-05-19 19:27 — Phase 2 (M2 + bookmarks dual-write) shipped

Phase 2 shipped code-complete on 2026-05-19. Done: 二階 r2/ adapter mirror (4 files copied + tables.ts partition into M2_ADAPTERS (7 tables) + BOOKMARKS_ADAPTERS (1 table)), refactored engine `r2BundleName: Bundle` → `r2Bundles: ReadonlyArray<R2BundleBinding>` so one engine can own multiple bundles, wired dual-write into 二階 pushNow + pushAllNow, 一階 retrofitted to array form. Extended migrate-from-supabase.ts to all 3 bundle specs (M1 + M2 + bookmarks) with `migrateAllBundlesFromSupabase` + `detectAllBundlesMigrationNeeded`. Banner detection now triggers when ANY bundle has Supabase rows but no R2 blob; per-bundle status reported with inline error summary. Copied MigrationBanner to 二階 + wired into App.tsx (between header-controls and account-switch prompt) + added banner CSS to 二階 styles.css. Tasks 4.1, 4.2, 4.3, 4.5, 4.6, 4.9 ticked. Deferred (same blockers as Phase 1): 4.4 reconcile (service-role), 4.7 e2e smoke (Chrome MCP fixture), 4.8 14-day bake (calendar). Validate ✓, both apps typecheck ✓. Phase 3 (read cutover) unblocked once 4.7 + 4.8 pass.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **Blob-level LWW is coarser than row-level** — two devices editing different bundles within debounce can still collide if user toggles bookmarks (bookmarks blob) and answers quiz (M1 blob) simultaneously across devices | 3-blob split aligns with natural mutation boundaries; cross-bundle collision is rare. ETag retry handles the race within a single bundle. |
| **Worker JWT verification adds ~50–100ms latency per push** vs direct Supabase | One verification per push; debounce window (3s) absorbs latency entirely. Cache JWKS in Worker memory (1h TTL). |
| **Worker dev story unfamiliar to owner** (no prior Worker code in repo) | Wrangler CLI has good local dev (`wrangler dev`); 1–2 day learning curve. Worker MVP is ~50 lines, well within Claude Code vibe-coding capability. |
| **CORS misconfiguration blocks browser → R2 PUT/GET** | Phase 0 deliverable includes CORS smoke test from the GH Pages origin. Add `cors-test.html` to the change repo. |
| **JWKS rotation breaks Worker verification** | Supabase rotates JWKS keys infrequently; Worker fetches JWKS on cache miss (auto-recovers). Add monitoring: log verification failures rate. |
| **User dismisses migration banner repeatedly, never migrates** | Banner reappears every 24h + on every sign-in until migration completes; copy escalates after 7 days dismissed («您的雲端存檔還在舊系統中，請點此遷移以確保跨裝置同步繼續運作»); after Phase 5 (Supabase rows dropped), banner stops showing because the underlying data is gone — user is effectively reset to fresh-start on next pull |
| **User starts client-side migration, closes tab mid-upload** | Each blob PUT is atomic (R2 either has full blob or no blob). Banner detects on next load whether all 3 blobs exist; if not, re-renders and resumes from missing bundle. Partial state is impossible per-bundle. |
| **Client-side migration fetches all Supabase rows in one shot** — for a power user with ~6000 hospital_question_history rows, this could be a 1–2 MB SELECT | Supabase JS client paginates by default at 1000 rows; client wraps the SELECT in a loop. Acceptable since migration is one-time per user. |
| **Dual-write doubles client write count** during phases 1–4 | Acceptable — Supabase free tier handles the duplicate writes; R2 Class A operations cap is 1M/月 (one push burns ~3 Class A, so 333k pushes/月 = ~11k pushes/day = thousands of users worth of headroom). |
| **`If-Match` ETag retry can loop infinitely under high concurrency** | Cap retry attempts at 3 with exponential backoff; on final failure, surface a "sync conflict" toast and trigger pull-then-push manually. In practice single-user multi-device collision rate is near-zero. |
| **R2 region (Auto/APAC) latency for Taiwan users** | R2 auto-replicates across CF edge; Taiwan POP closeby; expect < 100ms PUT/GET. Benchmark in Phase 0. |
| **Bootstrap may run for users with corrupted Supabase rows** | Bootstrap is idempotent (overwrite R2 with whatever Supabase says); add validation: if bootstrap output blob fails schema check, log + fall back to migration prompt. |
| **Worker free tier 100k requests/day cap** | Each push = 1 Worker request (presign). Even 10k DAU × 30 pushes/day = 300k > cap. Mitigation: cache presigned URLs client-side for 4 minutes (URL TTL 5 min); same user reusing URL within window = 0 Worker requests. Cuts request count by ~80%. |

## Migration Plan

Phased as per Decision 7. Each phase ships as a separate deploy with feature flag toggle.

**Pre-Phase 0** (in this change):
- Provision Cloudflare account + R2 bucket
- Configure Wrangler local dev
- Set up GitHub Actions secrets for Worker deployment

**Phase 0** — Worker MVP + CORS smoke test (week 1):
- Deploy `study-rpg-sync-worker` with `/presign`, `/delete-account`, `/reset` endpoints (no `/bootstrap` — migration is client-driven)
- Manually `curl` test with a real Supabase JWT
- Browser smoke test from `localhost` and `fireman333.github.io`

**Phase 1** — Dual-write M1 bundle + migration banner UI (week 2–3):
- Client `lib/sync/r2/` package: blob adapter, ETag handling, push/pull helpers
- Wire M1 push path: on every M1 mutation, after Supabase upsert succeeds, also push R2
- Implement `MigrationBanner` component + detection logic (Supabase has rows AND R2 incomplete → render banner)
- Client-side migration handler: paginated SELECT from Supabase → build bundles → PUT to R2 via presign
- Reads still go to Supabase
- Daily reconciliation check: diff Supabase rows ↔ R2 blob; alert on mismatch
- Bake for 2 weeks before Phase 2

**Phase 2** — Dual-write M2 + bookmarks (week 4–5):
- Same pattern for 二階 + bookmarks blob
- Extend migration banner detection to cover M2 and bookmarks bundles
- Reconciliation check covers all 3 bundles

**Phase 3** — Cut over reads to R2 (week 6):
- Flip `VITE_CLOUD_SYNC_READ_BACKEND=r2`
- Pulls now load from R2; pushes still dual
- Monitor for "user lost data" reports

**Phase 4** — Drop Supabase writes (week 7):
- Flip `VITE_CLOUD_SYNC_BACKEND=r2`
- Supabase rows freeze (no more updates); R2 is sole writer

**Phase 5** — Soak + drop tables (week 8+):
- After 2 weeks of R2-only operation with no rollback events
- Separate change `drop-supabase-sync-tables` issues `DROP TABLE` migrations
- This change archives after Phase 4 completes; the table drop is its own commitment

**Rollback strategy:**

- Phases 1–3: flip feature flag to `supabase`; clients revert immediately on next page load
- Phase 4: flag flip + manual Supabase row catch-up from latest R2 blob (Worker `/restore` endpoint, scoped to user)
- Phase 5+: irreversible; commit only after Phase 4 has been stable 2+ weeks

## Open Questions

- **Cloudflare account ownership**: Owner currently has no Cloudflare account. Need to create one before Phase 0. Free tier is sufficient throughout. → Resolved at task start.
- **R2 bucket naming + region selection**: Default to auto-region first; revisit if Taiwan latency > 200ms. → Decided at Phase 0.
- **Wrangler secrets vs `.env`**: For local Worker dev, use `.dev.vars`; for deploy, use `wrangler secret put`. → Trivial, handled in tasks.
- **Daily backup retention beyond 30 days**: Could go longer at zero cost; cap at 30 to limit blast radius of accidental restore-from-old-backup. → Confirm with owner if 30 days insufficient.
- **Whether to keep Supabase JS client at all post-Phase 5**: Yes — needed for Auth + `bug_reports`. → Confirmed.
