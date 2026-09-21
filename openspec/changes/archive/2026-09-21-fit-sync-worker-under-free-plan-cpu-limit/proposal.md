## Why

The account has been on Workers Paid ($5/mo) since 2026-07-14, upgraded as exam-week insurance against the `/presign` request storm. That storm is dead (WAF rule + client backoff + leaderboard throttle): the last 30 days peak at **13k Worker requests/day** across all six workers, 13% of the Free plan's 100k/day cap. R2 usage (0.19 GB, 27k Class A / 55k Class B per month) has always been inside R2's free allowance and bills $0. The only thing that still needs the paid plan is the Free plan's **10 ms CPU per invocation** limit, and the traffic that breaks it is not player sync — a normal request costs 1.6 ms median — it is three cron jobs in `cloudflare/sync-worker`, measured over 2026-09-18 → 21 via `workersInvocationsAdaptive`:

| Cron | CPU per run | Why |
|---|---|---|
| `0 0 * * *` daily R2→R2 save backup | 350–500 ms | copies every `users/*` object one by one (331 today), then lists the whole backup bucket (9,141 objects) to prune |
| `0,30 * * * *` leaderboard pre-compute | 17–20 ms | 二階 and neurons snapshots run in the **same** scheduled invocation; each is ~5 D1 queries + 4–5 KV puts |
| `20 3 * * *` note-image reclamation | ~18 ms | Hyperdrive session + two RPCs + R2 deletes |

Under Free, each of these would be terminated every run: the leaderboard would freeze (again — the third freeze mechanism after the `CHECK` constraint and the silent 500s), the backup would stop, and reclamation would defer forever. Cross-device save sync would be unaffected. Downgrading is therefore an engineering change, not a billing click — and a small one.

## What Changes

- **Remove the daily R2→R2 backup cron** from the Worker. It has never been used for a restore in four months, the risk it guards against (a bad deploy corrupting cloud snapshots) only enters at deploy time, and each player's IndexedDB is the source of truth anyway. Replace it with a **pre-deploy snapshot**: both app deploy scripts (`study-rpg` `deploy:cf`, `study-rpg-2nd` `deploy`) and the Worker's own `deploy` run an `rclone` server-side copy of `study-rpg-saves/users/` into `study-rpg-saves-backup/backup/<ISO timestamp>/` before publishing. Retention moves to an **R2 object lifecycle rule** on the backup bucket (30 days, zero CPU).
- **Split the leaderboard cron into one scheduled invocation per app**: 二階 stays on `0,30 * * * *`; neurons moves to its own expression `5,35 * * * *`. Each invocation then does half the work (~8–10 ms — borderline, so the change carries a measurement gate and a contingency: if either half still exceeds 10 ms P99 after a week, that app's snapshot moves to read-time cache-on-miss).
- **Keep the note-image reclamation cron and measure it first** (owner decision: 「2 不行再 1」). Instrument the sweep to log its own CPU breakdown for one week; if it fits in 10 ms it stays, otherwise a follow-up change moves it to a Mac `launchd` job (the only reason it needs Hyperdrive at all is workerd's trust store — a Mac connects to Supabase directly).
- **One cron per scheduled invocation** becomes a stated rule: scheduled work SHALL NOT be chained inside one `event.cron` case, so a future job cannot silently re-merge budgets.
- **Downgrade gate**: after seven consecutive days with `cpuTimeP99 < 10 ms` on every `scriptName`/`datetimeMinute` bucket of `study-rpg-sync-worker`, the owner MAY downgrade the account to Workers Free in the dashboard. **Outcome (2026-09-21, after day-0 readings): the owner chose to stay on Workers Paid.** The leaderboard split and the pre-deploy snapshot shipped and stand on their own; the sweep (18.6 ms) is recorded as a permitted exception rather than relocated; the gate script stays for the day the decision is revisited.

Not changed: the request-path CPU tail (0.4–8 % of ordinary requests land in minute-buckets whose P99 exceeds 10 ms). Those invocations would fail on Free and the clients already retry with backoff; the week of measurement identifies which endpoint they are before the downgrade, and a separate change addresses them if they concentrate on specific players.

## Capabilities

### New Capabilities
- `sync-worker-cpu-budget`: the Worker's scheduled work fits the Free plan's per-invocation CPU limit — one job per invocation, a 10 ms budget per job with a measured gate, and the pre-deploy cloud-save snapshot that replaces the in-Worker daily backup.

### Modified Capabilities
- `hospital-leaderboard`: `Cron dispatch handler matches wrangler trigger expression` names `CRON_BACKUP_DAILY` / `runBackupCron` as the canonical example; both cease to exist. The 二階 schedule (`:00`/`:30`) is unchanged.
- `neurons-leaderboard`: `Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour` currently requires the neurons refresh to share 二階's trigger with "no additional cron expression". It moves to its own expression at `:05`/`:35`.

## Impact

- **Code (sibling repo `study-rpg`)**: `cloudflare/sync-worker/wrangler.jsonc` (crons), `src/index.ts` (dispatch), `src/backup.ts` (deleted with its tests, if any), `src/note-image-sweep.ts` (CPU instrumentation only), `cloudflare/sync-worker/package.json` + root `package.json` (`predeploy` hooks), new `scripts/r2-snapshot.sh`. Worker ships with `wrangler deploy` — **no `git push` needed and none implied** (a push to this repo rebuilds the neurons production site).
- **Code (this repo `study-rpg-2nd`)**: `package.json` `deploy` gains the same `predeploy` snapshot hook; no app code, no bundle change.
- **Owner prerequisites (outside code)**: `brew install rclone`; one R2 S3 API token (Object Read & Write, scoped to `study-rpg-saves` + `study-rpg-saves-backup`) placed in a gitignored local env file; one R2 lifecycle rule on `study-rpg-saves-backup` (`backup/` prefix, delete after 30 days). The Worker's existing `R2_BACKUP` binding stays (the delete-account path still uses it).
- **Specs**: `hospital-leaderboard` and `neurons-leaderboard` MODIFIED (full restatement); new `sync-worker-cpu-budget`. The 二階 repo's `community-note-images` reclamation requirements are untouched — the sweep's semantics do not change in this change.
- **Risk**: leaderboard halves may still exceed 10 ms (contingency stated above); a laptop-hosted snapshot only runs when a deploy runs, so the restore point is "last deploy", not "last midnight" — accepted by the owner on 2026-09-21 because deploys are the only moment corruption enters.
