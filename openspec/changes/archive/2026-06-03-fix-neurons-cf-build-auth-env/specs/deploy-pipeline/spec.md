## MODIFIED Requirements

### Requirement: Cloudflare Pages is the sole production deploy target

The repository SHALL produce a single Cloudflare Pages deployment of its in-repo apps. There is no GitHub Pages deploy. The combined Cloudflare Pages project (`med-study-rpg`, Direct Upload mode) SHALL serve from the custom domain `med-study-rpg.com` with the following layout:

- `https://med-study-rpg.com/` — static HTML landing page (hub) linking to the apps
- `https://med-study-rpg.com/neurons/` — neurons (`apps/neurons-tw`) entry, the canonical reference app

`https://med-study-rpg.com/2nd/` is served by the **separate** 二階 Cloudflare Pages project via the edge router Worker (per `medexam2-standalone`); it is NOT built or assembled by this repo's pipeline.

The combined Cloudflare Pages project remains in **Direct Upload** mode (`Git Provider: No`); the dashboard GitHub integration is intentionally NOT used. Production deployments are produced only by `.github/workflows/deploy-cf-pages.yml` on push to `main` (and `workflow_dispatch`), or by an owner-triggered local `pnpm run deploy:cf`.

The combined build sequence SHALL:

1. Install dependencies with `pnpm install --frozen-lockfile`
2. Build neurons with `VITE_DEPLOY_BASE=/neurons/` **and the Supabase auth env baked in**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (from the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` repo secrets), `VITE_CLOUD_SYNC_ENABLED=true`, and `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`. Because neurons is the canonical app shipping Google sign-in + R2 cloud sync + leaderboard + achievements, omitting `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` makes `getSupabase()` return `null`, the sign-in UI never renders, and all cloud features are dead in prod. The R2-only backend flags (`VITE_CLOUD_SYNC_BACKEND` / `VITE_CLOUD_SYNC_READ_BACKEND`) SHALL NOT be passed — neurons sync is R2-only (fixed `'neurons'` bundle in `apps/neurons-tw/src/lib/sync/r2/client.ts`) and never reads them.
3. Assemble the merged `dist-cf/` output via `node scripts/build-cf-pages-dist.mjs`, whose `ROUTES` SHALL NOT contain a `1st` or `2nd` entry
4. Deploy via `wrangler pages deploy dist-cf --project-name med-study-rpg`

#### Scenario: Push to main triggers the Cloudflare Pages deploy

- **WHEN** any commit lands on `main` (direct push or PR merge)
- **THEN** `deploy-cf-pages.yml` SHALL run
- **AND** on success neurons SHALL be live at `https://med-study-rpg.com/neurons/`
- **AND** no GitHub Pages workflow SHALL run (none exists)

#### Scenario: neurons production bundle bakes the Supabase auth env

- **WHEN** `deploy-cf-pages.yml` builds neurons and the deploy succeeds
- **THEN** the shipped bundle (`dist-cf/neurons/assets/index-*.js`) SHALL contain the Supabase project ref so `getSupabase()` returns a non-null client
- **AND** a user opening `https://med-study-rpg.com/neurons/` SHALL be able to sign in with Google — the sign-in UI renders, and an authenticated session enables cloud sync, leaderboard, and achievements
- **AND** the neurons build step SHALL NOT pass `VITE_CLOUD_SYNC_BACKEND` / `VITE_CLOUD_SYNC_READ_BACKEND` (neurons sync is R2-only and does not read them)

#### Scenario: Combined CF assembly excludes 一階 and 二階

- **WHEN** the combined Cloudflare Pages build runs
- **THEN** `scripts/build-cf-pages-dist.mjs` `ROUTES` SHALL NOT include a `{ dest: '1st' }` or `{ dest: '2nd' }` entry
- **AND** the assembled `dist-cf/` SHALL contain a `neurons/` directory and the root landing `index.html`, but NO `1st/` or `2nd/` directory
- **AND** the combined build SHALL NOT build `apps/medexam-tw` or `apps/medexam2-hospital-tw` (both deleted)

#### Scenario: `/1st/` is gone

- **WHEN** a user opens `https://med-study-rpg.com/1st/`
- **THEN** Cloudflare Pages SHALL return its default 404 (no `1st/` directory, no `_redirects` rule for it)

#### Scenario: Dashboard GitHub integration is NOT used

- **WHEN** `wrangler pages project list` is run against the production account
- **THEN** the `med-study-rpg` project row SHALL show `Git Provider: No`

### Requirement: Local Cloudflare Pages deploy fallback via npm scripts

The repository root `package.json` SHALL expose two npm scripts that allow the maintainer to deploy CF Pages from their local machine without going through GH Actions:

- `pnpm run build:cf` — builds neurons with `VITE_DEPLOY_BASE=/neurons/` + `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`, then runs `node scripts/build-cf-pages-dist.mjs` to assemble `dist-cf/`. The Supabase auth env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUD_SYNC_ENABLED`) is supplied from the deploy worktree's `apps/neurons-tw/.env.local` (Vite reads the build CWD's `.env.local`), so a local `deploy:cf` bakes the same auth env as CI. The deploy worktree SHALL therefore carry a populated `apps/neurons-tw/.env.local`.
- `pnpm run deploy:cf` — runs `build:cf` then `wrangler pages deploy dist-cf --project-name med-study-rpg --branch main --commit-dirty=true`

These scripts are the documented manual fallback when the GH Actions queue is backed up, when the maintainer wants to verify a build artifact locally, or when the workflow itself is broken.

The scripts SHALL use the maintainer's locally installed `wrangler`. Drift between local wrangler version and the CI version is accepted because the deploy is a static-asset upload, not a runtime contract.

#### Scenario: `pnpm run deploy:cf` produces a new CF Pages deployment

- **GIVEN** the maintainer has authenticated `wrangler` locally (`wrangler whoami` returns the production account)
- **AND** the deploy worktree's `apps/neurons-tw/.env.local` carries the Supabase keys
- **WHEN** they run `pnpm run deploy:cf` from the repo root
- **THEN** neurons SHALL build with the same auth + sync env vars as the CI workflow
- **AND** `dist-cf/` SHALL be assembled at the repo root (containing `neurons/` + root landing, no `1st/`/`2nd/`)
- **AND** `wrangler pages deploy` SHALL upload the assembled output to the production CF Pages project
- **AND** `med-study-rpg.com/neurons/` SHALL serve the freshly-built bundles with the Supabase env baked in

#### Scenario: `pnpm run build:cf` runs without authentication

- **WHEN** the maintainer runs `pnpm run build:cf` (without `deploy:`) on a machine where wrangler is not authenticated
- **THEN** the neurons build SHALL succeed
- **AND** `dist-cf/` SHALL be assembled at the repo root
- **AND** no CF API call SHALL be made
