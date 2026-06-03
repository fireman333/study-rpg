## Why

When neurons-tw became the canonical app (`remove-medexam-tw-and-promote-neurons`, 2026-06-03), its production Cloudflare Pages build shipped **without** the Supabase auth env baked in — so `getSupabase()` returned `null`, the Google sign-in UI never rendered, and cloud sync / leaderboard / achievements were all dead in prod. The root cause is a spec gap: `deploy-pipeline` documents the neurons build env as only `VITE_DEPLOY_BASE` (a stale "auth-less scaffold" remnant), yet the same spec already assumes an *authenticated* neurons user (`VITE_SYNC_WORKER_URL switches per deploy target`). The spec never required the build to bake the Supabase auth env, so the CI workflow could silently omit it without violating any requirement. This change closes that gap so the bug cannot recur unnoticed.

The code fix already shipped (commit `010905b` on `main`, deployed + prod-verified: bundle contains the Supabase project ref, live `/neurons/` renders an authenticated session, console clean). This is a **retroactive** spec update bringing `deploy-pipeline` into line with the shipped CI workflow.

## What Changes

- The `deploy-pipeline` spec requirement covering the **Cloudflare Pages CI build** of neurons SHALL state that the build bakes the Supabase auth env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUD_SYNC_ENABLED`) **and** `VITE_SYNC_WORKER_URL`, not just `VITE_DEPLOY_BASE`.
- The **`build:cf` local-deploy** requirement SHALL likewise document the Supabase auth env so the local `pnpm deploy:cf` path is held to the same contract as CI.
- A new scenario SHALL assert that, after deploy, a user can sign in on prod neurons — operationalized as: the shipped bundle contains the Supabase project ref and `getSupabase()` is non-null.
- The spec SHALL note that the R2-only backend flags (`VITE_CLOUD_SYNC_BACKEND` / `VITE_CLOUD_SYNC_READ_BACKEND`) are **intentionally not passed** to the neurons build, because neurons sync is R2-only (fixed `'neurons'` bundle) and never reads them.
- No code change beyond what already shipped in `010905b`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `deploy-pipeline`: the neurons Cloudflare Pages build (CI) and the `build:cf` local path requirements gain the Supabase auth env as part of the required build env; a new scenario asserts authenticated sign-in works on prod after deploy.

## Impact

- Spec: `openspec/specs/deploy-pipeline/spec.md` (delta applied on archive).
- Code (already shipped, no further change): `.github/workflows/deploy-cf-pages.yml` neurons build step `env:` block.
- Adjacent (unchanged, referenced): root `package.json` `build:cf`/`deploy:cf` scripts already set `VITE_DEPLOY_BASE` + `VITE_SYNC_WORKER_URL`; the deploy-worktree `apps/neurons-tw/.env.local` already carries the Supabase keys for the local path.
- No backend, schema, Dexie, R2, or Worker change.
