## Context

- Worker source: `cloudflare/sync-worker/` in this repo (`study-rpg`). It ships two ways and **both must keep the snapshot step**: locally via `pnpm --filter @study-rpg/sync-worker deploy` (`wrangler deploy`), and by CI `.github/workflows/deploy-worker.yml` on any push to `main` touching `cloudflare/sync-worker/**`.
- Client deploys: neurons ships by CI `.github/workflows/deploy-cf-pages.yml` on **every** push to `main` (no path filter); 一階 by local `pnpm run deploy:cf`; 二階 by local `pnpm run deploy` in the sibling repo `study-rpg-2nd` (direct-upload, no CI). Four deploy paths in total; the snapshot has to sit in each one, or the requirement "every deploy is preceded by a snapshot" is false on the path that was skipped.
- `pnpm` does **not** run `pre*`/`post*` npm lifecycle scripts unless `enable-pre-post-scripts=true` is set in `.npmrc`. Neither repo sets it. A `predeploy` script would therefore be silently ignored — the exact shape of "a guard that is present and does nothing".
- Measured baseline (2026-09-18 → 21, `workersInvocationsAdaptive`, `datetimeMinute`): backup 355–503 ms; leaderboard minute buckets 16–20 ms (二階 + neurons in one invocation); sweep ~17.7 ms; ordinary requests median 1.6 ms, with 25–588 of 6,969 requests (0.4–8 %) in buckets whose P50/P99 crossed 10 ms. Script code cannot observe its own CPU time (the Workers clock is frozen during execution and advances only across I/O), so every "does it fit" answer in this change comes from platform records.
- `R2_BACKUP` is consumed by `src/backup.ts` **only** — `delete.ts` never touches the backup bucket. The binding can go with the file.
- `rclone` is not installed on the owner's Mac. No R2 S3 token exists outside the Worker's own secrets (which must not be reused: those are the Worker's identity; the snapshot is the operator's).

## Goals / Non-Goals

**Goals:**
- Every scheduled invocation of the sync Worker measured under 10 ms CPU P99 for seven consecutive days, so the owner can downgrade to Workers Free with the leaderboard, reclamation, and rollback capability intact.
- A rollback point for player cloud saves that is taken at the only moment corruption can enter — a deploy — on all four deploy paths.
- One measured answer per job, not a reasoned one.

**Non-Goals:**
- The downgrade itself (dashboard action, owner).
- The ordinary-request CPU tail. The measurement week produces the endpoint attribution; fixing it is a follow-up change if it concentrates on identifiable players.
- Relocating the note-image sweep. This change instruments and measures; the Mac `launchd` relocation is a follow-up, opened only if the sweep is measured over budget (owner: 「2 不行再 1」).
- Any change to reclamation semantics (`community-note-images` in the 二階 repo), leaderboard ranking, or sync protocol.
- Serving the leaderboard from D1 at read time. Held as the contingency for the leaderboard halves, not built now.

## Decisions

**D1 — Delete the backup job; do not shrink it.** A delta copy (only objects with `uploaded > lastRun`) plus lifecycle-rule pruning would bring the daily run to roughly 10–30 copies ≈ 15–45 ms — still over budget, and now with a "last run" state to keep. The job's value is a restore point before a deploy; a snapshot at deploy time is that value with zero Worker CPU. `src/backup.ts` and the `R2_BACKUP` binding are removed together (sole consumer). The `note-images.test.ts` case named "so the backup cron does not copy it" keeps its assertion (the key layout invariant is still true and still useful) and loses the phrase that names a cron that no longer exists.

**D2 — Snapshot tool is `rclone`, invoked from one script per repo, called explicitly by the deploy command.** `scripts/r2-snapshot.sh` in this repo; an identical copy in `study-rpg-2nd/scripts/` (the repos are independent; a 30-line script is cheaper than a cross-repo path). The script:
- reads `R2_SNAPSHOT_ACCESS_KEY_ID`, `R2_SNAPSHOT_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` from the environment, sourcing `~/.config/study-rpg/r2-snapshot.env` first when present (local), and otherwise relying on the caller (CI secrets);
- defines the remote entirely through `RCLONE_CONFIG_R2_*` environment variables (no `rclone config` state on the machine);
- runs `rclone copy r2:study-rpg-saves/users r2:study-rpg-saves-backup/backup/<UTC ISO, colon-free>/users --s3-no-check-bucket --stats-one-line` — same remote on both sides, so rclone issues server-side `CopyObject` and no bytes reach the operator;
- prints the prefix it wrote and exits non-zero on any failure, including `rclone` absent or a variable unset (`set -euo pipefail` plus explicit checks that name the missing thing).
Deploy commands call it in front: `"deploy": "bash scripts/r2-snapshot.sh && pnpm run build && …"`. Not `predeploy` (see Context). `&&`, not `;` — a failed snapshot stops the deploy, per spec.

**D3 — CI gets the same script, not a re-implementation.** Both workflows gain a step before their deploy step: `sudo apt-get install -y rclone` then `bash scripts/r2-snapshot.sh` with the two secrets and `R2_ACCOUNT_ID` from `secrets.CF_ACCOUNT_ID`. `deploy-cf-pages.yml` fires on every push, including pushes that change nothing deployable; that is an existing property and means some snapshots are taken for no-op rebuilds. Accepted — a redundant snapshot costs ~330 Class A operations against a 1 M/month allowance.

**D4 — Retention is a lifecycle rule, configured once by the owner.** `study-rpg-saves-backup`, prefix `backup/`, delete after 30 days. No code lists the backup bucket any more. The existing ~9,141 objects under date-stamped prefixes (`backup/YYYY-MM-DD/`) share the `backup/` prefix and age out under the same rule.

**D5 — Leaderboard: split by cron expression, not by handler branching.** neurons gets `CRON_NEURONS_LEADERBOARD_30MIN = "5,35 * * * *"`; the `CRON_LEADERBOARD_30MIN` case calls `runLeaderboardCron` only. `:05` is far enough from `:00` that a slow 二階 run cannot overlap, and the neurons spec already tolerates a snapshot up to 30 min old. The two specs that pinned the shared schedule are restated (`neurons-leaderboard` gains its own trigger; `hospital-leaderboard`'s dispatch requirement drops the backup constant from its example list). **Contingency**, stated in the proposal and re-evaluated at day 7: a half measured over budget moves that app's five snapshots to read-time cache-on-miss (KV with a 30-min TTL, D1 on miss). That is a spec change to the affected leaderboard capability and a separate change.

**D6 — A test pins the constant set to `wrangler.jsonc`.** `src/__tests__/cron-dispatch.test.ts` parses `wrangler.jsonc` (strip `//` and `/* */` comments, then `JSON.parse`) and the `CRON_*` constants from `src/index.ts` source, and asserts set equality both ways. Neither direction alone is enough: a constant without a trigger is a dead case (green forever), a trigger without a constant is a `default`-branch error every run. It also asserts that no `case` block in `scheduled()` references two `run*Cron` functions — the "one job per invocation" rule as a source-text check, with the usual caveat that source-text guards are weaker than behaviour.

**D7 — Sweep: measure at its own minute; break down by experiment only if needed.** The sweep already runs alone at `03:20`, so the analytics bucket for that minute *is* the invocation's CPU. Seven days of that bucket is the measurement. If it exceeds 10 ms, the split between Hyperdrive session setup and reclamation work comes from deploying a variant that connects, runs `SELECT 1`, and returns — the difference is the work — and the follow-up change chooses between shrinking the work and relocating to the Mac on that number. No instrumentation is added to the sweep in this change: it could only report wall time across awaits, which is not the quantity in question.

**D8 — The measurement is a script, committed.** `scripts/worker-cpu-gate.mjs` queries `workersInvocationsAdaptive` for the last 7 days at `datetimeMinute` granularity for `study-rpg-sync-worker`, groups by minute-of-hour, and prints (a) every bucket with `cpuTimeP99 ≥ 10 ms`, (b) the max P99 at `:00`/`:30` (二階), `:05`/`:35` (neurons), `03:20` (sweep), and (c) the ordinary-request tail as a count and share. Exit 0 only when (a) is empty over a full 7 days. Token from `~/.cf-analytics-token` (already exists, already has the scope — the wrangler OAuth token does not). The owner runs it before clicking downgrade; its output is the evidence, not a chat estimate.

## Risks / Trade-offs

- **Leaderboard halves may still exceed 10 ms.** 17–20 ms combined suggests ~8–10 ms each, with no margin. Mitigation: D5 contingency, decided on day-7 data, not now.
- **Restore point is "last deploy", not "last midnight".** A corruption that surfaces days after a deploy loses those days of *cloud* progress on rollback; local IndexedDB still holds them and re-pushes. Owner accepted 2026-09-21.
- **Snapshot coverage depends on the operator's environment.** Local deploys need `rclone` and the env file; CI needs two secrets. Both fail closed (D2), so the failure mode is "deploy refused, reason printed", not "deployed without snapshot".
- **Free plan's 10 ms enforcement has undocumented slack.** Cloudflare terminates consistently-over-budget invocations; occasional excursions are tolerated to an unstated degree. The gate treats 10 ms as hard, which is the conservative reading.
- **The ordinary-request tail is unmeasured at the endpoint level.** The week's data attributes it; if it is JWT verification on every authenticated call, it is not fixable by splitting and the downgrade decision changes. That is why the gate reads every minute, not only the cron minutes.
- **`deploy-cf-pages.yml` snapshots on no-op rebuilds.** Cost is bounded (D3) and the alternative — a path filter — would change when neurons deploys, which is out of scope.
