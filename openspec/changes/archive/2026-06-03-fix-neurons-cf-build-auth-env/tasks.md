# Tasks

> Implementation already shipped in commit `010905b` on `main` (deployed + prod-verified) ahead of this retroactive spec change. Tasks are pre-checked with the evidence that closed each one.

## 1. CI workflow fix (already shipped in `010905b`)

- [x] 1.1 Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (from repo secrets) to the "Build neurons-tw for /neurons/" step's `env:` block in `.github/workflows/deploy-cf-pages.yml`
- [x] 1.2 Add `VITE_CLOUD_SYNC_ENABLED: 'true'` + `VITE_SYNC_WORKER_URL: https://api.med-study-rpg.com` to the same step
- [x] 1.3 Confirm `VITE_CLOUD_SYNC_BACKEND` / `VITE_CLOUD_SYNC_READ_BACKEND` are NOT added (verified by grep that neurons reads neither; R2-only `'neurons'` bundle)
- [x] 1.4 Refresh the stale "auth-less / sync-less scaffold" comment on that step

## 2. Local deploy path (already satisfied)

- [x] 2.1 Confirm the deploy worktree `~/coding-scratch/study-rpg/apps/neurons-tw/.env.local` carries `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` so `pnpm deploy:cf` bakes the same auth env (verified present — no edit needed)

## 3. Verification (done)

- [x] 3.1 `gh secret list` confirms `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` repo secrets exist
- [x] 3.2 Workflow YAML parses; secret refs + quoted strings correct
- [x] 3.3 CF Pages deploy run green (`deploy-cf-pages.yml`, 42s) on the fix commit
- [x] 3.4 Prod bundle grep: `curl … /neurons/assets/index-*.js | grep -c jakdyjxojokyqxeiuukx` = 1 (Supabase URL baked) + `api.med-study-rpg.com` = 2 (Worker URL baked)
- [x] 3.5 Chrome MCP on live `/neurons/`: sign-in/auth UI renders (登出 + 排名 nav), `neurons-rpg.auth` localStorage holds an authenticated session, console clean, old `[auth] Supabase env vars missing` warning gone

## 4. Spec sync

- [x] 4.1 Author this retroactive `deploy-pipeline` delta (MODIFY both deploy requirements + add the auth-env scenario)
- [x] 4.2 `/opsx:verify` (no critical/warning) then `/opsx:archive` to sync the delta into `openspec/specs/deploy-pipeline/spec.md`
