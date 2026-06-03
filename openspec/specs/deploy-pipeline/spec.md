# deploy-pipeline Specification

## Purpose
TBD - created by archiving change add-gh-pages-deploy. Update Purpose after archive.
## Requirements
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

### Requirement: Deploy uses pre-built content artifacts

The CI workflow SHALL NOT attempt to re-build any content pack (e.g. `@study-rpg/content-neurons-tw`) from upstream `.md` source. Content `.md` files live in the developer's local `~/Desktop/國考/.../` directory and are not committed to the repository (license + size reasons).

The CI workflow SHALL rely on the **already-committed** JSON artifacts:

- `apps/neurons-tw/public/content/.../{questions,subjects,meta}.json` (neurons)

produced by a developer's local content build.

Content updates SHALL flow:

1. Developer runs the content build locally (e.g. `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-neurons-tw build`)
2. Developer copies `dist/*.json` → the matching `apps/<app>/public/content/<pack>/` directory
3. Developer commits both updated JSON files and any related code in a normal change
4. Push to main → CI deploys with the committed JSON

#### Scenario: CI does not invoke content build

- **WHEN** the Cloudflare Pages deploy workflow runs
- **THEN** no step SHALL invoke a `pnpm --filter @study-rpg/content-* build` content-ingest command
- **AND** the workflow SHALL succeed even though `MEDEXAM_SOURCE_ROOT` is not set in the runner environment

#### Scenario: Stale committed content deploys as-is

- **WHEN** a developer forgets to update an app's `public/content/.../questions.json` after editing content build behavior locally
- **THEN** CI SHALL still deploy whatever is committed (it does not retroactively build)
- **AND** this is intentional — content updates are a deliberate human gate, not an implicit CI side-effect

### Requirement: Subpath co-location for multi-app deployment

The repository SHALL host its in-repo production-deployed app shells at subpaths of the single Cloudflare Pages deploy site (no sister repositories, no subdomain-per-app split). 二階 is the documented exception — after `split-medexam2-standalone` it lives in its own standalone repository and Cloudflare Pages project, reachable at `med-study-rpg.com/2nd/` via the edge router Worker (see `medexam2-standalone`); it is NOT governed by in-repo co-location.

This architectural decision SHALL be reflected in:

1. Each in-repo app's `vite.config.ts` `base` switched to its Cloudflare Pages path at build time via `VITE_DEPLOY_BASE` (e.g. `/neurons/` for neurons)
2. The build script (`scripts/build-cf-pages-dist.mjs`) merging each in-repo app's `dist/` into `dist-cf/<mode>/`
3. No sister repository being created for additional in-repo apps (this does not constrain 二階, which is intentionally externalized)

#### Scenario: Adding a third in-repo app follows the subpath convention

- **GIVEN** a future change introduces another in-repo app, e.g. `apps/surgery-sim-tw/`
- **WHEN** the change designs its deploy path
- **THEN** the chosen Cloudflare Pages URL SHALL be `https://med-study-rpg.com/<mode-cf>/`
- **AND** the Cloudflare Pages build SHALL set `VITE_DEPLOY_BASE=/<mode-cf>/` for the new app
- **AND** `scripts/build-cf-pages-dist.mjs` `ROUTES` SHALL gain a `{ src: 'apps/<app>/dist', dest: '<mode-cf>' }` entry
- **AND** `deploy-cf-pages.yml` SHALL gain a build step for the new app

#### Scenario: 二階 is not co-located in-repo

- **WHEN** the monorepo deploy pipeline assembles its Cloudflare Pages output
- **THEN** it SHALL NOT include a `dist-cf/2nd/` directory built from this repo
- **AND** `med-study-rpg.com/2nd/` SHALL be served by the dedicated 二階 Cloudflare Pages project via the edge router (per `medexam2-standalone`), not by this repo's assembly

#### Scenario: neurons URL stability on Cloudflare Pages

- **WHEN** any new in-repo app is added under subpath co-location
- **THEN** the neurons `https://med-study-rpg.com/neurons/` URL SHALL remain unchanged
- **AND** the `VITE_DEPLOY_BASE=/neurons/` build invocation for neurons SHALL remain unchanged

### Requirement: Cloudflare Pages workflow uses minimum-required permissions and scoped CF API token

The `deploy-cf-pages.yml` workflow SHALL declare the same `permissions:` and `concurrency:` blocks as `deploy-worker.yml`:

- `permissions: { contents: read }` (for checkout only)
- `concurrency: { group: deploy-cf-pages, cancel-in-progress: false }` (serializes deploys, doesn't kill mid-upload)

The `CF_API_TOKEN` repo secret SHALL carry exactly the following Cloudflare API token permissions, shared with `deploy-worker.yml`:

| Resource type | Resource | Permission | Used by |
|---|---|---|---|
| Account | Cloudflare Pages | Edit | `deploy-cf-pages.yml` (pages deploy) |
| Account | Workers Scripts | Edit | `deploy-worker.yml` |
| Account | Workers R2 Storage | Edit | `deploy-worker.yml` (R2 bucket bindings) |
| User | User Details | Read | wrangler auth check (suppresses warnings) |
| User | Memberships | Read | wrangler auth check (suppresses warnings) |

The `CF_ACCOUNT_ID` repo secret SHALL be the same Cloudflare account ID used by `deploy-worker.yml`.

If `CF_API_TOKEN` is regenerated, the maintainer SHALL re-create the token with the full permission set above. A token missing `Cloudflare Pages:Edit` SHALL fail the workflow with `Authentication error [code: 10000]` at the wrangler deploy step.

#### Scenario: Token missing Pages:Edit fails the deploy step

- **GIVEN** `CF_API_TOKEN` is set to a token without `Cloudflare Pages:Edit` permission
- **WHEN** the `Deploy via Wrangler` step runs
- **THEN** the wrangler API call to `/accounts/<id>/pages/projects/med-study-rpg` SHALL respond with HTTP error code 10000 (Authentication error)
- **AND** the workflow run SHALL fail
- **AND** earlier steps in the same job (build neurons, assemble dist-cf) SHALL be unaffected — they do not call the CF API

#### Scenario: Successful run after token rotation with correct scope

- **GIVEN** the maintainer has regenerated `CF_API_TOKEN` with the full permission set above
- **WHEN** the workflow is re-run (via `Re-run all jobs` or a fresh push)
- **THEN** the neurons build step SHALL pass
- **AND** the wrangler deploy step SHALL succeed
- **AND** the new deployment SHALL appear in `wrangler pages deployment list --project-name med-study-rpg` with the latest commit SHA in the `Source` column

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

### Requirement: SPA fallback via `_redirects` for Cloudflare Pages

The merged `dist-cf/` output SHALL contain a `_redirects` file at its root with rules that route any sub-path of each in-repo app's base (e.g. `/neurons/`) to the corresponding `index.html` with HTTP 200, enabling react-router BrowserRouter to handle client-side navigation. Asset directories (e.g. `assets`, `content`, `fonts`) under each base SHALL be passed through first so real static files are not rewritten.

The root `/` SHALL serve the landing HTML directly (CF Pages serves `dist-cf/index.html` as the default root document).

#### Scenario: Direct URL to nested route resolves on new domain

- **WHEN** a user opens `https://med-study-rpg.com/neurons/connectome` directly in a new tab
- **THEN** Cloudflare Pages SHALL serve `dist-cf/neurons/index.html` with HTTP 200
- **AND** react-router SHALL render the target route
- **AND** the browser console SHALL NOT show any 404 errors for the page itself

#### Scenario: F5 reload on nested route does not 404

- **WHEN** a user navigates in-app to a nested neurons route and presses F5
- **THEN** the same `index.html` SHALL be served and the route SHALL re-render
- **AND** the user SHALL NOT see Cloudflare Pages' default 404 page

#### Scenario: Unknown top-level path returns Cloudflare 404

- **WHEN** a user opens `https://med-study-rpg.com/admin` (no match in `_redirects`)
- **THEN** Cloudflare Pages SHALL return its default 404 response
- **AND** the SPA fallback SHALL NOT inadvertently catch the request

### Requirement: Vite `base` switches per deploy target via `VITE_DEPLOY_BASE`

Each in-repo app's `vite.config.ts` SHALL read `process.env.VITE_DEPLOY_BASE` and fall back to a sensible default if the env var is unset:

- `apps/neurons-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/neurons/'`

This SHALL allow the same source tree to produce the Cloudflare Pages build without git-branch divergence.

#### Scenario: Cloudflare Pages build switches to /neurons/

- **WHEN** the Cloudflare Pages build command sets `VITE_DEPLOY_BASE=/neurons/` for the neurons build
- **THEN** the neurons dist SHALL reference assets under `/neurons/`
- **AND** the resulting dist SHALL serve correctly when assembled into `dist-cf/neurons/`

#### Scenario: Hard-coded asset references are base-aware

- **WHEN** the source tree contains a hard-coded asset path used at runtime
- **THEN** that reference SHALL use a Vite-base-aware pattern (`import.meta.env.BASE_URL + 'sprites/x.png'` or a `?url` import) OR be paired with a base-aware runtime override
- **AND** the app SHALL load the asset correctly when served under `/neurons/`

### Requirement: `VITE_SYNC_WORKER_URL` switches per deploy target

The Cloudflare Pages build SHALL set `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` so clients on `med-study-rpg.com` reach the Worker via its Custom Domain binding. When the env var is unset, the client falls back to the workers.dev URL (per the `cloud-sync` capability's Worker-URL requirement). Both URLs resolve to the same Worker.

#### Scenario: Clients on the new domain talk to api.med-study-rpg.com

- **GIVEN** a user is on `https://med-study-rpg.com/neurons/` and authenticated
- **WHEN** the sync engine pushes a bundle to R2
- **THEN** the network request URL SHALL begin with `https://api.med-study-rpg.com/`
- **AND** the Worker SHALL respond with HTTP 200 (or appropriate sync status)

### Requirement: Root landing page at `med-study-rpg.com/`

The Cloudflare Pages site SHALL serve a minimal HTML landing page (hub) at the root (`dist-cf/index.html`). The page SHALL contain:

- The project name / display name
- A one-sentence description of the project
- Prominent links/buttons to the live apps: "二階國考經營" → `/2nd/` and the neurons app → `/neurons/` (the 一階 `/1st/` card is removed — 一階 no longer exists)
- A footer link to the project's source repository

The landing page SHALL be plain HTML/CSS only — no React, no JavaScript framework, no build-time bundling beyond a file copy. The landing template SHALL live at `scripts/cf-landing-template.html` so its copy can be edited without rebuilding the apps.

#### Scenario: Root URL serves the landing page

- **WHEN** a user opens `https://med-study-rpg.com/` directly
- **THEN** the Cloudflare Pages site SHALL respond with the static landing HTML
- **AND** the browser SHALL NOT issue any failed asset requests (no missing CSS/images)

#### Scenario: Landing page omits the removed 一階 card and links to surviving apps

- **WHEN** a user views the landing page
- **THEN** there SHALL be no link/card pointing at `/1st/`
- **AND** clicking the 二階 card SHALL navigate to `https://med-study-rpg.com/2nd/`
- **AND** clicking the neurons card SHALL navigate to `https://med-study-rpg.com/neurons/`

#### Scenario: Landing edit does not require app rebuild

- **WHEN** an owner edits `scripts/cf-landing-template.html` to update copy
- **THEN** the next Cloudflare Pages build SHALL pick up the new copy via `scripts/build-cf-pages-dist.mjs`
- **AND** no change to any app source SHALL be required
