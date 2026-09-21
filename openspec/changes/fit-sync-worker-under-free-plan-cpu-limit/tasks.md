## 1. Owner prerequisites (outside code — nothing below deploys until these exist)

- [x] 1.1 `brew install rclone` on the Mac; `rclone version` prints
- [x] 1.2 Create an R2 S3 API token (dashboard → R2 → Manage API tokens): Object Read & Write, scoped to `study-rpg-saves` + `study-rpg-saves-backup` only; write `R2_SNAPSHOT_ACCESS_KEY_ID` / `R2_SNAPSHOT_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID=43631a35f33f4132484a6ce024cc502a` to `~/.config/study-rpg/r2-snapshot.env` (mode 600). The secret is never pasted into a session.
- [x] 1.3 Add the same two values as GitHub Actions secrets on `fireman333/study-rpg` (`R2_SNAPSHOT_ACCESS_KEY_ID`, `R2_SNAPSHOT_SECRET_ACCESS_KEY`); `CF_ACCOUNT_ID` already exists
- [x] 1.4 Add an R2 lifecycle rule on `study-rpg-saves-backup`: prefix `backup/`, delete objects 30 days after upload; confirm the rule lists as active

## 2. Snapshot script (this repo, then a copy in `study-rpg-2nd`)

- [x] 2.1 Write `scripts/r2-snapshot.sh`: `set -euo pipefail`; source `~/.config/study-rpg/r2-snapshot.env` if present; fail with a named message for each of `rclone` missing / any of the three variables unset; define the remote via `RCLONE_CONFIG_R2_TYPE=s3`, `…_PROVIDER=Cloudflare`, `…_ACCESS_KEY_ID`, `…_SECRET_ACCESS_KEY`, `…_ENDPOINT=https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`; `PREFIX=backup/$(date -u +%Y%m%dT%H%M%SZ)`; `rclone copy r2:study-rpg-saves/users r2:study-rpg-saves-backup/$PREFIX/users --s3-no-check-bucket --stats-one-line`; print `snapshot: $PREFIX`
- [x] 2.2 Run it once by hand against production; confirm via `rclone lsd r2:study-rpg-saves-backup/backup/` that the new prefix exists and `rclone size` on it matches `rclone size r2:study-rpg-saves/users` (object count equal); confirm from `rclone copy -v` output that copies were server-side (no download/upload byte counts)
- [x] 2.3 Negative checks: run with the env file renamed → exits non-zero naming the variable; run with `PATH` lacking rclone → exits non-zero naming rclone. Both before any copy is attempted.
- [x] 2.4 Wire `package.json` root `deploy:cf` and `cloudflare/sync-worker/package.json` `deploy` to start with `bash <path>/scripts/r2-snapshot.sh && …` (explicit call, not `predeploy` — pnpm ignores lifecycle pre-scripts here)
- [x] 2.5 Copy the script to `~/coding-scratch/study-rpg-2nd/scripts/r2-snapshot.sh` and prefix that repo's `deploy` the same way; the two files are byte-identical (`cmp`)
- [x] 2.6 Add the snapshot step to `.github/workflows/deploy-worker.yml` and `.github/workflows/deploy-cf-pages.yml` before their deploy step: `sudo apt-get install -y rclone`, then `bash scripts/r2-snapshot.sh` with `env: R2_SNAPSHOT_ACCESS_KEY_ID/…SECRET… from secrets, R2_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}`

## 3. Worker: remove the backup job, split the leaderboard cron

- [x] 3.1 Delete `cloudflare/sync-worker/src/backup.ts`; remove `CRON_BACKUP_DAILY` and its `case` from `src/index.ts`; remove `"0 0 * * *"` from `wrangler.jsonc` `triggers.crons` and the `R2_BACKUP` entry from `r2_buckets`; drop `R2_BACKUP` from the `Env` type; update the `triggers` comment block
- [x] 3.2 Add `CRON_NEURONS_LEADERBOARD_30MIN = "5,35 * * * *"` to `src/index.ts` and `wrangler.jsonc`; the `CRON_LEADERBOARD_30MIN` case calls `runLeaderboardCron` only; the new case calls `runNeuronsLeaderboardCron` only; both keep their `try/catch` + `console.error`; `knownCrons` in the default branch lists the new set
- [x] 3.3 `src/__tests__/note-images.test.ts:220` — keep the assertion, reword the case name so it no longer cites a backup cron
- [x] 3.4 New `src/__tests__/cron-dispatch.test.ts`: (a) `CRON_*` constants in `src/index.ts` ⟺ `wrangler.jsonc` `triggers.crons` as equal sets, asserted in both directions; (b) no `case` block inside `scheduled()` references more than one `run*Cron` identifier. Strip comments before matching (the file has prose that names crons).
- [x] 3.5 Mutation-probe 3.4: add a trigger to `wrangler.jsonc` without a constant → (a) red; add a constant without a trigger → (a) red; put `runNeuronsLeaderboardCron` back inside the 二階 case → (b) red. Restore from a backup copy, not `git checkout`.
- [x] 3.6 `pnpm --filter @study-rpg/sync-worker typecheck && pnpm --filter @study-rpg/sync-worker test` green
- [x] 3.7 Deploy the Worker (`pnpm --filter @study-rpg/sync-worker deploy` — this now takes a snapshot first; confirm the printed prefix); `wrangler deployments list` shows the new version; `wrangler triggers` / dashboard shows exactly three crons `0,30 * * * *`, `5,35 * * * *`, `20 3 * * *`

## 4. Specs sync

- [x] 4.1 `openspec validate fit-sync-worker-under-free-plan-cpu-limit --strict` valid
- [x] 4.2 Mechanical comparison of the two MODIFIED requirements against main specs: every main-spec scenario is either restated verbatim or listed as intentionally replaced (`hospital-leaderboard`: +1 scenario; `neurons-leaderboard`: same three scenarios, one gains an AND clause). `--strict` does not check restatement completeness.

## 5. Measurement window (7 days from 3.7)

- [x] 5.1 Write `scripts/worker-cpu-gate.mjs` per design D8 (token `~/.cf-analytics-token`; 7-day `datetimeMinute` buckets for `study-rpg-sync-worker`; prints over-budget buckets, per-cron max P99, ordinary-request tail; exit 0 only when no bucket ≥ 10 ms across all 7 days)
> Day-0 readings (deploy `961d658b` at 01:56 UTC 2026-09-21; `workersInvocationsAdaptive` per-minute, cpu µs → ms):
> - 二階 `runLeaderboardCron` alone: 02:01 bucket req=1 **6.5 ms**; 02:31 bucket req=3 P99 9.2 ms (two ordinary requests mixed in — attribution ambiguous). m2 KV `last_updated_at` 02:01:02 / 02:31:15 ✓
> - neurons `runNeuronsLeaderboardCron` alone: 02:35 bucket req=1 **3.8 ms**; neurons KV `last_updated_at` 02:05:08 / 02:35:08 ✓ (the 02:05 run refreshed KV but its analytics bucket never surfaced — analytics is not lossless at 1 invocation/min; KV timestamp is the primary evidence that the trigger fires)
> - Combined baseline was 17–20 ms; split halves 3.8 + 6.5 ≈ 10.3 — consistent. 二階's margin is thin (6.5–9.2 of 10); the day-1 reading decides whether D5's contingency opens.
> - sweep: not yet run under the new deploy (next 03:20 UTC).

- [ ] 5.2 Day 1 (24 h after 3.7): run it; record 二階 `:00/:30`, neurons `:05/:35`, sweep `03:20` max P99 in this file. Expected: 二階 and neurons each ≈ 8–10 ms, sweep ≈ 18 ms.
- [ ] 5.3 Day 1 decision on the leaderboard halves: if either > 10 ms → open the D5 contingency change now rather than waiting the week
- [ ] 5.4 Day 1 decision on the sweep: if > 10 ms → open the follow-up (owner's 「不行再 1」: relocate to Mac `launchd`; breakdown experiment per D7 first)
- [ ] 5.5 Day 7: `scripts/worker-cpu-gate.mjs` exits 0. Record the ordinary-request tail (count, share, and which minutes) — this is the input to the separate tail change, and it is recorded whether or not it blocks the downgrade
- [ ] 5.6 Owner downgrades the account to Workers Free in the dashboard (owner action; not performed by a session). Day 8: rerun the gate and check `errors` per minute for the sync Worker — 1102 terminations would appear there.

## 6. Close-out

- [ ] 6.1 `/opsx:verify` clause-level: every SHALL in `sync-worker-cpu-budget` has either a test, a script, or a named owner action against it; the one with none is written down as such
- [x] 6.2 Update `cloudflare/sync-worker/README.md` (backup section → pre-deploy snapshot; three crons) and this repo's `openspec/project.md` Cloudflare row if it names the daily backup
- [x] 6.3 In `study-rpg-2nd`: `docs/` or `CLAUDE.md` Deploy section notes that `pnpm run deploy` now snapshots first and what to do when it refuses (env file / rclone)
- [ ] 6.4 Archive via `/opsx:archive` (never raw `openspec archive --yes`); commits per repo only on explicit confirmation; ⚠️ a push of this repo to `main` deploys neurons production and the Worker — that is a §3 gate, not a routine push
