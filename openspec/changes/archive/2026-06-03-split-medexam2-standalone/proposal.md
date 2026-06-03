## Why

二階 (`apps/medexam2-hospital-tw`) currently ships from the shared `study-rpg` monorepo through a single Cloudflare Pages project (`med-study-rpg`) whose `build:cf` step builds 一階 + 二階 + neurons together and `scripts/build-cf-pages-dist.mjs` assembles them into one `dist-cf/{1st,2nd,neurons}` upload. This couples 二階's release cadence to the other two apps: a build break in any app blocks the whole deploy, and the asymmetric GH-Pages vs CF-Pages pipelines have already caused silent prod outages (see `CLAUDE.md` § "CF Pages vs GH Pages deploy asymmetry"). 二階 is feature-mature and should be able to ship independently. Separately, the long-term plan is to retire 一階 and wind the original monorepo down to neurons-only — 二階 must be extracted *before* that gutting so it survives intact.

This change makes 二階 a standalone repo with its own deploy line, while keeping the player-facing URL (`med-study-rpg.com/2nd/`) and all cloud saves untouched.

## What Changes

- **二階 becomes its own git repo.** `packages/theme-pixel-hospital` + `packages/content-medexam2-tw` (二階-only) move into the new repo. `@study-rpg/core` (the only genuinely shared package) is consumed from the **npm registry** (`@study-rpg/core@^x`) instead of the `workspace:*` symlink, keeping the original repo as core's single source of truth — chosen because 二階 will still receive extensions and `core` fixes should propagate via version bump rather than fork drift.
- **二階 gets its own Cloudflare Pages project** (e.g. `med-study-rpg-2nd`) deployed by its own `wrangler pages deploy`, decoupled from `scripts/build-cf-pages-dist.mjs`.
- **An edge router Worker preserves the `/2nd/` URL.** A lightweight Worker on `med-study-rpg.com` routes `/2nd/*` to the new Pages project and everything else to the existing project, so players see no URL change. (CF Pages does not natively serve two projects under one apex path prefix; this is the standard front-door pattern.)
- **GitHub Pages 二階 path becomes 301 redirect-only.** `https://fireman333.github.io/study-rpg/hospital/` stops serving the app and 301-redirects to `https://med-study-rpg.com/2nd/`, preserving old bookmarks without keeping a second live build.
- **Backend is untouched (hard constraint).** Same sync Worker (`api.med-study-rpg.com`), same R2 bucket, same D1, same Supabase Auth project, same `user_id` — existing players' cloud saves carry over with zero re-login and zero data loss.
- **Original monorepo's combined CF assembly drops 二階.** `dist-cf/` assembly and the GH `deploy.yml` 二階 build are removed from the shared pipeline.

This change is **spec-only** (proposal + design + tasks). No code is moved or deployed in this change; implementation is a follow-up.

## Capabilities

### New Capabilities
- `medexam2-standalone`: 二階's standalone-repo composition (which packages move, npm-`core` consumption), its independent Cloudflare Pages deploy topology, the edge router Worker that preserves the `med-study-rpg.com/2nd/` URL, the GH-Pages-二階 → 301 redirect, and the backend-continuity invariant that keeps existing players' cloud saves seamless.

### Modified Capabilities
- `deploy-pipeline`: the shared monorepo pipeline stops building/assembling 二階. Specifically — `scripts/build-cf-pages-dist.mjs` `ROUTES` drops the `2nd` entry; `build:cf` / `deploy:cf` no longer build `medexam2-hospital-tw`; and the GH Pages path serving 二階 (`/study-rpg/hospital/` via `404.html` HashRouter redirect + subpath co-location) changes from "serve the app" to "301 redirect to `med-study-rpg.com/2nd/`".

## Impact

- **New repo** (created at implementation time): contains `apps/medexam2-hospital-tw` + `theme-pixel-hospital` + `content-medexam2-tw`, consuming `@study-rpg/core` from npm. Owns its own `wrangler.toml` / CF Pages project / deploy workflow.
- **Original monorepo**: `scripts/build-cf-pages-dist.mjs`, `package.json` (`build:cf` / `deploy:cf` / `dev:m2` / `build:m2`), `.github/workflows/deploy.yml`, `.github/workflows/deploy-cf-pages.yml`, and the 二階 entries in `404.html` / subpath co-location logic.
- **Cloudflare**: one new Pages project + one new edge router Worker bound to `med-study-rpg.com/2nd/*`. The existing sync Worker, R2 bucket, D1 database, and KV namespace are **not** changed.
- **Uses (not modifies)** `core-npm-package`: 二階 exercises the already-specified registry-resolution / forkability path as an external consumer.
- **Out of scope (separate downstream changes):** sync data-plane migration (R2 reads cutover + `bug_reports`→D1) = `finish-r2-cutover-medexam2` (Auth stays on Supabase permanently); `cloudflare/sync-worker/` extraction into its own shared-backend repo = `extract-sync-worker-repo`; 一階 removal = `retire-medexam1`.
- **Docs touched at implementation:** `docs/AUTH_REDIRECT_URIS.md` (verify no OAuth redirect / Supabase Site URL change is needed since origin stays `med-study-rpg.com`), root + project `CLAUDE.md` (deploy topology section).
