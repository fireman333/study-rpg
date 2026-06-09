## Why

The shoutout board backend (`/shoutouts/*` on the shared sync Worker) was built
app-generic for reuse, but only `neurons` is activated. 二階 (`m2`) needs the same
「留言」board. Activating m2 means adding its per-app config + D1 table to the shared
Worker — which lives **here** in `cloudflare/sync-worker/` (study-rpg-2nd holds only
the edge-router, not the sync/shoutout Worker). This unblocks the 二階 留言 UI (a
later change in `study-rpg-2nd`) once `/shoutouts/m2` is live.

## What Changes

- ADD `APP_CONFIG.m2` to `cloudflare/sync-worker/src/shoutout.ts`:
  `{ table: 'shoutouts_m2', leaderboardTable: 'leaderboard_m2', compositeKvKey:
  'leaderboard:m2:top100:composite', avatarType: 'doctor' }`. All four values were
  verified against `leaderboard.ts` (FILTERS includes `composite`; `leaderboard_m2`
  exists and is cron-snapshotted to KV; the shoutout avatar `CHECK` already allows
  `'doctor'`).
- ADD D1 migration `0009_m2_shoutout.sql`: `CREATE TABLE shoutouts_m2` (mirrors the
  `shoutouts_neurons` schema) + `idx_shoutouts_m2_visible`. The shared app-scoped
  `shoutout_audit` / `shoutout_reports` / `shoutout_bans` tables already exist
  (migration 0008) and are REUSED — not recreated. Additive, reversible.
- FIX the stale comment at `shoutout.ts:28-31` — it currently claims m2 "adds its own
  entry there [study-rpg-2nd]", which is wrong (the shoutout Worker only lives here).
- This change is **CODE-ONLY**. It does NOT run `wrangler d1 execute` (D1 remote
  write) or `wrangler deploy`; those are owner-gated outward steps after review.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `shoutout-board-backend`: ADD a requirement that `m2` is an activated app on the
  shared monorepo Worker (doctor avatar enum, `leaderboard_m2` nickname/Top-100 join,
  composite-KV halo, reuse of the shared app-scoped audit/reports/bans, additive
  per-app table). No change to the existing `neurons` behavior.

## Impact

- **Code**: `shoutout.ts` `APP_CONFIG` (+ comment fix) and a new `0009_m2_shoutout.sql`.
  No behavior change to neurons / leaderboard / sync / presign (additive table + one
  new config key; the route guard already 404s unknown apps).
- **⚠️ Shared Worker = 二階 dependency**: the change is purely additive (new table,
  new config key); existing endpoints are untouched → no break risk. The owner
  smoke-tests neurons shoutout + leaderboard + cloud-sync + presign after deploy.
- **Owner-gated outward steps (NOT in this change)**: apply `0009` to the shared D1
  (`study-rpg-leaderboard`, db `365a3809-…`) via the dashboard D1 console or
  per-statement `--command`, recording it in `d1_migrations`; then `wrangler deploy`.
- **Cross-track**: the m2 backend is activated from `track-neurons` because the Worker
  source is on this track; the commit message flags `affects: m2 + shared Worker`.
- **Unblocks**: the 二階 留言 UI in `study-rpg-2nd`, which will hit the live `/shoutouts/m2`.
