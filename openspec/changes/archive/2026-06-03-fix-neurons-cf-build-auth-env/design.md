## Context

neurons-tw was promoted to the canonical app (`remove-medexam-tw-and-promote-neurons`). The neurons CI build step in `.github/workflows/deploy-cf-pages.yml` carried a stale "auth-less scaffold" env block (only `VITE_DEPLOY_BASE` + `VITE_COMMIT_SHA`) from when neurons had no auth. The old 一階/二階 build steps that DID pass the Supabase auth env were deleted along with those apps, so nothing in the workflow baked the auth env for neurons anymore.

Result in prod: `getSupabase()` (`apps/neurons-tw/src/lib/auth/client.ts`) read `import.meta.env.VITE_SUPABASE_URL` as `undefined` → returned `null` → sign-in UI never rendered, cloud sync / leaderboard / achievements dead. Diagnosed by `curl … index-*.js | grep -c jakdyjxojokyqxeiuukx` = 0 (二階 baseline = 1). The code fix shipped in commit `010905b` (deployed + prod-verified) **before** this spec change; this is the retroactive spec-sync.

## Goals / Non-Goals

**Goals:**
- Make `deploy-pipeline` require the neurons build to bake the Supabase auth env, so the spec matches the shipped workflow and the omission cannot silently recur.
- Document that the R2-only backend flags are intentionally excluded.

**Non-Goals:**
- No further code change beyond `010905b`.
- No change to the Worker, Supabase project, R2 layout, Dexie schema, or content.
- No change to how the `cloud-sync` / `neurons-leaderboard` / `neurons-achievements` capabilities themselves behave — those specs already assume a working authenticated client; only the *build env that produces that client* was under-specified.

## Decisions

- **Bake the auth env at build time (not runtime config).** Vite statically inlines `import.meta.env.VITE_*` into the bundle; there is no runtime config channel on a static CF Pages host. Mirrors how 一階/二階 (and the local `build:cf` script) already worked. Alternative — a runtime `/config.json` fetch — was rejected: adds a network round-trip + new failure mode for zero benefit, and the anon key is publishable client config anyway (ships in the bundle by design).
- **Omit `VITE_CLOUD_SYNC_BACKEND` / `VITE_CLOUD_SYNC_READ_BACKEND`.** Confirmed by grepping `apps/neurons-tw/src` — neurons reads only 5 VITE vars and is R2-only (`BUNDLE_NAME = 'neurons'` fixed in `lib/sync/r2/client.ts`). 一階/二階 needed those flags for the Supabase→R2 dual-write migration; neurons never had a Supabase data plane. Passing them would be dead config.
- **Source secrets from existing repo secrets.** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` already exist in repo Actions secrets (created 2026-05-16); no new secret provisioning needed.
- **Retroactive spec via the normal propose→archive flow** rather than a silent spec edit — keeps the `openspec/specs/` change history honest, which is the project discipline that this very bug bypassed.

## Risks / Trade-offs

- [Enabling auth/sync for all neurons prod users is a behavior change] → It restores *intended* behavior for already-shipped features (leaderboard/achievements/sync exist in the codebase); IndexedDB remains source of truth and cloud is additive, so existing local saves are unaffected. Owner explicitly approved the prod enable before push.
- [Re-deploy on archive merge] → Archiving this spec change merges to `main`, which re-triggers `deploy-cf-pages.yml`. The rebuilt bundle is functionally identical (same env, possibly new content `builtAt` churn). Harmless.
- [Local `build:cf` depends on per-worktree `.env.local`] → The spec now states the deploy worktree must carry a populated `apps/neurons-tw/.env.local`; verified present. A fresh clone / new worktree would need it re-created (per the known per-app/per-worktree `.env.local` gotcha).

## Migration Plan

Code already deployed (`010905b`). This change only syncs the spec on archive. Rollback of the *feature* is the code commit (revert `010905b`), not this spec doc; reverting the spec alone would re-open the gap and is not desirable.
