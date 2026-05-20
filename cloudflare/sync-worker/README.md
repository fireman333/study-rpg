# study-rpg-sync-worker

Auth-bridging Cloudflare Worker for the R2-based cloud-sync backend. Verifies Supabase JWTs, signs short-lived R2 URLs scoped to the JWT's `sub` claim, runs nightly R2-to-R2 backup. Architecture rationale lives in `openspec/changes/add-r2-cloud-sync-migration/design.md` (Decisions 3, 4, 8); this file is operational reference only.

## At a glance

| | |
|---|---|
| **Live URL** | https://study-rpg-sync-worker.tony85314.workers.dev |
| **Source** | `cloudflare/sync-worker/` |
| **Bindings** | `R2_PRIMARY` → `study-rpg-saves`, `R2_BACKUP` → `study-rpg-saves-backup` |
| **Cron** | `0 0 * * *` (00:00 UTC daily) — R2 backup with 30-day retention |
| **Free-tier headroom** | Workers 100k req/day, R2 Class A 1M/月 + Class B 10M/月, 10 GB storage |

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

Secrets are set via `wrangler secret put <NAME>` (one at a time, interactive prompt). Five secrets total:

| Name | What | Source |
|---|---|---|
| `SUPABASE_JWKS_URL` | JWT verification keys URL | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_PROJECT_REF` | Issuer/audience check | Supabase dashboard URL (`jakdyjxojokyqxeiuukx`) |
| `R2_S3_ACCESS_KEY_ID` | R2 S3-compat presign | Cloudflare dashboard → R2 → Manage API Tokens (scope both buckets, read+write) |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3-compat presign | Same token, paired secret |
| `R2_S3_ENDPOINT` | R2 endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |

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

## Cron schedule + backup

Daily cron `0 0 * * *` (00:00 UTC) runs `runBackupCron()`:

1. Lists all `users/*` keys in `R2_PRIMARY`
2. Copies each to `R2_BACKUP` under `backup/<YYYY-MM-DD>/users/<u>/<b>`
3. Prunes `R2_BACKUP` keys older than 30 days

Internal R2-to-R2 copy — zero egress, runs inside Cloudflare. 30-day retention is set by the prune step; adjust in `src/backup.ts` if owner wants longer history (zero cost to keep more, but blast radius of accidental restore-from-old grows).

To trigger manually for testing:

```bash
wrangler dev
# in another shell:
curl -X POST http://localhost:8787/__scheduled?cron=0+0+*+*+*
```

## CORS allowlist

`wrangler.jsonc` → `vars.CORS_ALLOWED_ORIGINS` is a comma-separated list:

```
https://fireman333.github.io,http://localhost:5173,http://localhost:4173
```

To add a new origin (e.g. Vite fallback port `localhost:5174`), edit `wrangler.jsonc` + `wrangler deploy`. **No need to redeploy R2 bucket CORS policy** — that's set once at bucket creation (see `cloudflare/sync-worker/cors.json` for reference).

Known gotcha: Vite auto-fallback ports outside the allowlist (`localhost:5175` etc.) get CORS-blocked at preflight, manifesting as `r2_push_exhausted: Failed to fetch` in browser console. Workaround: `pnpm exec vite --port 5173 --strictPort` to force the documented port.

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
| `src/backup.ts` | Cron job — copy + prune backup bucket |
| `src/cors.ts` | Origin allowlist + preflight response builder |
| `cors.json` | R2 bucket CORS policy reference (apply via `wrangler r2 bucket cors put`) |
| `wrangler.jsonc` | Bindings, cron, vars |
| `package.json` | Dev deps + scripts |
