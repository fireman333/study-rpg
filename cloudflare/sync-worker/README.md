# study-rpg-sync-worker

Auth-bridging Cloudflare Worker for the R2-based cloud-sync backend. Verifies Supabase JWTs, signs short-lived R2 URLs scoped to the JWT's `sub` claim, and runs three small scheduled jobs (two leaderboard KV refreshes, one note-image reclamation). Architecture rationale lives in `openspec/changes/add-r2-cloud-sync-migration/design.md` (Decisions 3, 4, 8); this file is operational reference only.

## At a glance

| | |
|---|---|
| **Live URL** | https://study-rpg-sync-worker.tony85314.workers.dev |
| **Source** | `cloudflare/sync-worker/` |
| **Bindings** | `R2_PRIMARY` → `study-rpg-saves` (the backup bucket is not bound — see below) |
| **Crons** | `0,30 * * * *` 二階 leaderboard · `5,35 * * * *` neurons leaderboard · `20 3 * * *` note-image sweep — **one job per invocation, each must fit 10 ms CPU** (`openspec/specs/sync-worker-cpu-budget`) |
| **Free-tier headroom** | Workers 100k req/day + **10 ms CPU per invocation**, R2 Class A 1M/月 + Class B 10M/月, 10 GB storage |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/presign` | Body `{ bundle: "m1"\|"m2"\|"bookmarks", op: "put"\|"get" }` → returns `{ url, expiresAt }`. URL is path-scoped to JWT's `sub`. TTL 5 min. |
| `POST` | `/delete-account` | Lists + deletes all objects under `users/<sub>/`. Idempotent. |
| `POST` | `/reset` | Same handler as `/delete-account`. Client-side semantic difference (reset keeps Supabase session; delete signs out). |
| `GET`  | `/health` | Liveness probe: `{ ok: true }`. No auth required. |
| `OPTIONS` | `*` | CORS preflight (allowlist from `CORS_ALLOWED_ORIGINS` var). |

All non-`/health` non-`OPTIONS` paths require `Authorization: Bearer <supabase-jwt>`. JWT is verified against Supabase JWKS; `sub` is the only source of `user_id` (request body fields are ignored to prevent forging).

## Local dev

```bash
cd cloudflare/sync-worker
pnpm install

# Create .dev.vars (gitignored) for local secrets:
cat > .dev.vars <<'EOF'
SUPABASE_JWKS_URL=https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_PROJECT_REF=jakdyjxojokyqxeiuukx
R2_S3_ACCESS_KEY_ID=<from 1Password>
R2_S3_SECRET_ACCESS_KEY=<from 1Password>
R2_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
EOF

pnpm dev   # wrangler dev — local Worker at http://localhost:8787
```

`wrangler dev` connects to **real R2 buckets** by default (not a local mock) because R2 has no useful local emulator. Operations against `study-rpg-saves` during dev are real; use a separate test prefix if you don't want to touch live owner data.

## Deploy

```bash
# Manual one-off
pnpm deploy   # → wrangler deploy

# Or via Wrangler CLI directly:
cd cloudflare/sync-worker
wrangler deploy
```

CI deploy is wired in `.github/workflows/deploy-worker.yml` (triggers on `cloudflare/sync-worker/**` changes on `main`). Requires repo secrets `CF_API_TOKEN` + `CF_ACCOUNT_ID` (see [GitHub Actions secrets](#github-actions-secrets) below).

## Secret rotation

Secrets are set via `wrangler secret put <NAME>` (one at a time, interactive prompt). Six secrets total (a seventh, `LEADERBOARD_PLAYER_KEY_WINDOW_SECRET`, exists only during a player-key rollout window):

| Name | What | Source |
|---|---|---|
| `SUPABASE_JWKS_URL` | JWT verification keys URL | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_PROJECT_REF` | Issuer/audience check | Supabase dashboard URL (`jakdyjxojokyqxeiuukx`) |
| `R2_S3_ACCESS_KEY_ID` | R2 S3-compat presign | Cloudflare dashboard → R2 → Manage API Tokens (scope both buckets, read+write) |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3-compat presign | Same token, paired secret |
| `R2_S3_ENDPOINT` | R2 endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |
| `LEADERBOARD_PLAYER_KEY_SECRET` | HMAC key for the public `player_key` that replaces `user_id` on the leaderboard snapshots and 留言 boards (`src/player-key.ts`, change `hash-leaderboard-user-ids`). ≥32 chars; missing → those surfaces answer 503 and the leaderboard crons write nothing (fails closed, never falls back to the raw id). | `openssl rand -base64 48`, kept ALSO in `~/.config/study-rpg/leaderboard-player-key.env` (mode 600) because `scripts/mask-leaderboard-nickname.sh` needs it and a Worker secret cannot be read back. Rotating it changes every key. Clients store none; each KV snapshot records a fingerprint of the secret it was keyed under (`key_epoch`), and a snapshot keyed under the old one keeps serving its old keys until the next cron (≤30 min — own-rows and halos unmatched meanwhile). Replace the local copy at the same time: the mask script refuses, before writing, when its copy no longer matches the snapshot. |
| `LEADERBOARD_PLAYER_KEY_WINDOW_SECRET` | Rollout window only (design D6 of `hash-leaderboard-user-ids`): the key used INSTEAD of the one above while `LEADERBOARD_RAW_ID_COMPAT_UNTIL` has not passed — the window publishes (raw id, key) pairs, and keying them with a secret that is retired at the deadline makes those pairs useless afterwards. Must differ from `LEADERBOARD_PLAYER_KEY_SECRET` (equal, missing or short → the window stays closed). | `openssl rand -base64 48`; not needed locally. `wrangler secret delete` it after the deadline. |

Rotation cadence: R2 token annual; Supabase JWKS rotates automatically (Worker handles cache miss). After rotation:

```bash
wrangler secret put R2_S3_ACCESS_KEY_ID
# paste new value at prompt
wrangler secret put R2_S3_SECRET_ACCESS_KEY
wrangler deploy   # picks up new secrets
```

**Never commit `.dev.vars`** — it's already gitignored. No service-role Supabase key on the Worker (intentional; see design.md Decision 6).

## Monitoring

```bash
pnpm tail            # wrangler tail — live log stream
pnpm tail | grep ERR # filter to error lines
```

`observability.enabled = true` in `wrangler.jsonc` sends structured logs to Workers Logs. Visible in Cloudflare dashboard → Workers & Pages → study-rpg-sync-worker → Logs.

Grep keys to know:
- `[sync:pushR2:<bundle>] recovered from corrupt blob via overwrite` — Bug-4 recovery path triggered (see [`add-r2-cloud-sync-migration` design](../../openspec/changes/add-r2-cloud-sync-migration/design.md))
- `[worker] unhandled error` — index.ts catch block; investigate immediately
- `r2_push_exhausted` — push retry exhausted; usually CORS or network, not blob corruption

## Crons, and the backup that is no longer one

Three triggers, dispatched by string equality in `scheduled()` (`src/index.ts`); `__tests__/cron-dispatch.test.ts` pins the constants to `wrangler.jsonc` and forbids two jobs in one case:

| Trigger | Job | Why it is alone |
|---|---|---|
| `0,30 * * * *` | `runLeaderboardCron` (二階 → `leaderboard:m2:*` KV) | the Free plan's 10 ms CPU limit is per invocation; 二階 + neurons in one invocation measured 17–20 ms |
| `5,35 * * * *` | `runNeuronsLeaderboardCron` (→ `leaderboard:neurons:*` KV) | same |
| `20 3 * * *` | `runNoteImageSweepCron` | its own minute, so the analytics bucket for 03:20 *is* its CPU cost |

**There is no daily R2→R2 backup any more** (change `fit-sync-worker-under-free-plan-cpu-limit`; it cost 350–500 ms CPU per run and was never restored from). Player saves are snapshotted **before every deploy** instead — the only moment corruption can enter:

- `scripts/r2-snapshot.sh` (repo root) copies `study-rpg-saves/users/*` server-side to `study-rpg-saves-backup/backup/<UTC ts>/users/*`, prints the prefix, and exits non-zero (blocking the deploy) if `rclone` or the credentials are missing. Called by `pnpm run deploy` here, `pnpm run deploy:cf` at the root, the two GitHub workflows, and `study-rpg-2nd`'s `pnpm run deploy`.
- Credentials: `~/.config/study-rpg/r2-snapshot.env` locally (written by `scripts/setup-r2-snapshot-secrets.sh`), `R2_SNAPSHOT_*` secrets in CI. An R2 S3 token scoped to the two saves buckets — not the Worker's own key.
- Retention: R2 lifecycle rule `backup-expire-30d` on the backup bucket (`backup/`, 30 days). No code prunes.
- Restore a player: `rclone copy r2:study-rpg-saves-backup/backup/<ts>/users/<sub> r2:study-rpg-saves/users/<sub>` (same env vars as the script).

Measure before believing any of the three fits: `node scripts/worker-cpu-gate.mjs` (7-day `cpuTimeP99` per minute; exit 0 = safe on Free). Script code cannot observe its own CPU time, so the platform record is the only evidence.

To trigger a cron manually for testing:

```bash
wrangler dev
# in another shell:
curl -X POST 'http://localhost:8787/__scheduled?cron=0,30+*+*+*+*'
```

## CORS allowlist

`wrangler.jsonc` → `vars.CORS_ALLOWED_ORIGINS` is a comma-separated list:

```
https://fireman333.github.io,https://med-study-rpg.com,http://localhost:5173,http://localhost:4173
```

`med-study-rpg.com` was added 2026-05-22 when the app started moving off GitHub Pages onto Cloudflare Pages (see change `add-med-study-rpg-domain-migration`). The legacy `fireman333.github.io` origin stays during the 2–4 week bake; a follow-up change removes it once GH Pages flips to redirect-only.

To add a new origin (e.g. Vite fallback port `localhost:5174`), edit `wrangler.jsonc` + `wrangler deploy`. **No need to redeploy R2 bucket CORS policy** — that's set once at bucket creation (see `cloudflare/sync-worker/cors.json` for reference).

Known gotcha: Vite auto-fallback ports outside the allowlist (`localhost:5175` etc.) get CORS-blocked at preflight, manifesting as `r2_push_exhausted: Failed to fetch` in browser console. Workaround: `pnpm exec vite --port 5173 --strictPort` to force the documented port.

## Custom Domain — `api.med-study-rpg.com`

The Worker is reachable under two URLs that hit the same Worker code (no traffic split, no version skew):

| URL | Origin |
|---|---|
| `https://study-rpg-sync-worker.tony85314.workers.dev` | Legacy `workers.dev` route (GitHub Pages clients use this) |
| `https://api.med-study-rpg.com` | Cloudflare Custom Domain binding (Cloudflare Pages clients use this) |

Binding lives in `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "api.med-study-rpg.com", "custom_domain": true }
]
```

`custom_domain: true` is the modern syntax — Cloudflare auto-provisions DNS + TLS on the matching zone (no separate `zone_name` needed since the host already pins the zone). Within ~60s of `wrangler deploy` the new URL is live with a valid cert.

**Gotcha — wrangler 4.x defaults `workers_dev: false` whenever you add `routes`.** That silently kills the legacy `workers.dev` URL, which breaks the GH Pages clients during the migration bake. The fix is explicit:

```jsonc
"workers_dev": true,
```

Without it, `https://study-rpg-sync-worker.tony85314.workers.dev` starts 404'ing immediately after deploy. (Tripped this once on 2026-05-22 — ~30s outage before the explicit flag was added and re-deployed.)

Client-side env (`VITE_SYNC_WORKER_URL`):

- GitHub Pages workflow `.github/workflows/deploy.yml` → defaults to `https://study-rpg-sync-worker.tony85314.workers.dev` (via `secrets.VITE_SYNC_WORKER_URL` or fallback in `apps/*/src/lib/sync/r2/client.ts`)
- Cloudflare Pages dashboard env → `https://api.med-study-rpg.com`

## GitHub Actions secrets

For CI deploy via `.github/workflows/deploy-worker.yml`:

| Secret | Value | How to get |
|---|---|---|
| `CF_API_TOKEN` | Cloudflare API token with `Workers Scripts:Edit` + `Workers R2 Storage:Edit` | Cloudflare dashboard → My Profile → API Tokens → Create Token (Workers template, narrow to study-rpg-sync-worker) |
| `CF_ACCOUNT_ID` | Cloudflare account ID | Cloudflare dashboard → any zone → right sidebar "Account ID" |

Owner adds these in GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

## Files

| File | Purpose |
|---|---|
| `src/index.ts` | Router + CORS + error handler |
| `src/auth.ts` | JWKS fetch + JWT verify (with module-scope 1h cache) |
| `src/presign.ts` | `aws4fetch`-based R2 S3 presign with `expires` query param |
| `src/delete.ts` | Shared handler for `/delete-account` and `/reset` |
| `src/cors.ts` | Origin allowlist + preflight response builder |
| `cors.json` | R2 bucket CORS policy reference (apply via `wrangler r2 bucket cors put`) |
| `wrangler.jsonc` | Bindings, crons, vars |
| `package.json` | Dev deps + scripts |
