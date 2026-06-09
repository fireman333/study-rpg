## 1. Worker config

- [x] 1.1 Add the `m2` entry to `APP_CONFIG` in `cloudflare/sync-worker/src/shoutout.ts`: `{ table: 'shoutouts_m2', leaderboardTable: 'leaderboard_m2', compositeKvKey: 'leaderboard:m2:top100:composite', avatarType: 'doctor' }`.
- [x] 1.2 Fix the stale comment at `shoutout.ts:28-31` — state that `m2` is activated in this monorepo Worker (study-rpg-2nd hosts only the edge-router + the 留言 UI, not this backend).

## 2. D1 migration

- [x] 2.1 Create `cloudflare/sync-worker/migrations/0009_m2_shoutout.sql`: `CREATE TABLE IF NOT EXISTS shoutouts_m2` mirroring `shoutouts_neurons` (same columns + CHECKs) + `CREATE INDEX IF NOT EXISTS idx_shoutouts_m2_visible ON shoutouts_m2 (created_at DESC) WHERE deleted = 0 AND hidden = 0`. Do NOT recreate the shared `shoutout_audit` / `shoutout_reports` / `shoutout_bans` tables.
- [x] 2.2 In the migration header, document: additive/reversible; the same shared D1 (`study-rpg-leaderboard`, db `365a3809-…`); and the owner apply path (dashboard D1 console, or two `--command` statements, then record in `d1_migrations`). State it is NOT applied by this change.

## 3. Verify (no deploy, no remote D1 write)

- [x] 3.1 `pnpm --filter` the Worker (or `cd cloudflare/sync-worker && pnpm typecheck`) → exit 0.
- [x] 3.2 Confirm no neurons-side behavior change: `APP_CONFIG.neurons` untouched, route guard still 404s unknown apps, migration touches only `shoutouts_m2` (+ index). Grep that `0009` contains no `DROP`/`ALTER` of existing tables.
- [x] 3.3 Confirm this change ran no `wrangler deploy` and no `wrangler d1 execute` (outward steps are owner-gated and deferred).

## 4. Owner-handoff note (documented, not executed)

- [x] 4.1 Record the exact owner steps (in design / commit body): (a) apply `0009` to the shared D1, (b) `wrangler deploy`, (c) post-deploy smoke — neurons `/shoutouts/neurons` GET, one leaderboard filter, a cloud-sync round-trip, a presign — all unchanged; then `/shoutouts/m2` GET returns an empty board (200). Order: migration BEFORE deploy.
