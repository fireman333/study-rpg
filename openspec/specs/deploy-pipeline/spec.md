# deploy-pipeline Specification

## Purpose
TBD - created by archiving change add-gh-pages-deploy. Update Purpose after archive.
## Requirements
### Requirement: Deploy workflow triggers on main push and manual dispatch

The repository SHALL contain a GitHub Actions workflow at `.github/workflows/deploy.yml` that runs on:

1. Every `push` to the `main` branch
2. Manual `workflow_dispatch` from the GitHub UI

The workflow SHALL build **both** apps and deploy the merged `apps/medexam-tw/dist/` directory (containing 一階 app at root and 二階 app at `dist/hospital/`) to GitHub Pages using the official `actions/deploy-pages` action.

The workflow SHALL NOT run on PR opens, push to other branches, or scheduled cron — `main` is the only deploy gate per project policy (single-environment dogfood).

The build sequence SHALL be:

1. Build 一階 app: `pnpm --filter @study-rpg/medexam-tw build` → output at `apps/medexam-tw/dist/`
2. Build 二階 app: `pnpm --filter @study-rpg/medexam2-hospital-tw build` → output at `apps/medexam2-hospital-tw/dist/`
3. Merge 二階 dist into 一階 dist: `mkdir -p apps/medexam-tw/dist/hospital && cp -r apps/medexam2-hospital-tw/dist/* apps/medexam-tw/dist/hospital/`
4. Upload the merged `apps/medexam-tw/dist/` as the single Pages artifact

#### Scenario: Push to main triggers deploy

- **WHEN** any commit lands on `main` branch (direct push or PR merge)
- **THEN** the `deploy` workflow SHALL start within ~30 seconds (GitHub Actions normal queue latency)
- **AND** on success 一階 SHALL be live at `https://<owner>.github.io/study-rpg/`
- **AND** 二階 SHALL be live at `https://<owner>.github.io/study-rpg/hospital/`

#### Scenario: Manual dispatch is available

- **WHEN** the user opens the `Actions` tab on GitHub and selects the `deploy` workflow
- **THEN** a `Run workflow` button SHALL be available (because `workflow_dispatch` is configured)
- **AND** clicking it SHALL trigger a deploy without needing a new commit

#### Scenario: PR or non-main push does NOT deploy

- **WHEN** a commit is pushed to any non-`main` branch (including `track-m2`, `claude/*` worktree branches, or feature branches)
- **THEN** the deploy workflow SHALL NOT run
- **AND** any PR opened against `main` SHALL NOT trigger deploy (only the eventual merge to `main` triggers deploy)

#### Scenario: Both app builds succeed before artifact upload

- **WHEN** the deploy workflow runs
- **THEN** the 一階 build step SHALL complete successfully (`apps/medexam-tw/dist/index.html` exists)
- **AND** the 二階 build step SHALL complete successfully (`apps/medexam2-hospital-tw/dist/index.html` exists)
- **AND** the dist merge step SHALL produce `apps/medexam-tw/dist/hospital/index.html` (二階 entry point inside 一階 dist)
- **AND** only then SHALL `actions/upload-pages-artifact` run on `apps/medexam-tw/dist/`

#### Scenario: 二階 build failure blocks deploy

- **WHEN** 二階 `pnpm --filter @study-rpg/medexam2-hospital-tw build` exits non-zero (e.g. TypeScript error, missing content artifact)
- **THEN** the deploy job SHALL fail with the build error
- **AND** the artifact upload step SHALL NOT run
- **AND** the previously-deployed site SHALL remain live (GH Pages serves last successful deploy)

### Requirement: Deploy uses pre-built content artifacts

The CI workflow SHALL NOT attempt to re-build any content pack (`@study-rpg/content-medexam-tw` or `@study-rpg/content-medexam2-tw`) from upstream `.md` source. Content `.md` files live in the developer's local `~/Desktop/國考/.../` directory and are not committed to the repository (license + size reasons).

The CI workflow SHALL rely on the **already-committed** JSON artifacts:

- `apps/medexam-tw/public/content/medexam-tw/{questions,subjects,meta}.json` (一階)
- `apps/medexam2-hospital-tw/public/content/medexam2-tw/{questions,subjects,meta}.json` (二階)

Both produced by a developer's local content build.

Content updates SHALL flow:

1. Developer runs `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build` (or the 二階 equivalent) locally
2. Developer copies `dist/*.json` → the matching `apps/<app>/public/content/<pack>/` directory
3. Developer commits both updated JSON files and any related code in a normal change
4. Push to main → CI deploys with the committed JSON

#### Scenario: CI does not invoke content build

- **WHEN** the deploy workflow runs
- **THEN** no step SHALL invoke `pnpm --filter @study-rpg/content-medexam-tw build`
- **AND** no step SHALL invoke `pnpm --filter @study-rpg/content-medexam2-tw build`
- **AND** the workflow SHALL succeed even though `MEDEXAM_SOURCE_ROOT` is not set in the runner environment

#### Scenario: Stale committed content deploys as-is

- **WHEN** developer forgets to update either app's `public/content/.../questions.json` after editing content build behavior locally
- **THEN** CI SHALL still deploy whatever is committed (it does not retroactively build)
- **AND** this is intentional — content updates are a deliberate human gate, not an implicit CI side-effect

### Requirement: Workflow uses official actions and minimum-required permissions

The workflow SHALL use only official, audited actions:

| Action | Purpose |
|---|---|
| `actions/checkout@v4` | git clone the repo |
| `pnpm/action-setup@v4` | install pnpm (reads `packageManager` from package.json) |
| `actions/setup-node@v4` | install Node 20 with pnpm cache |
| `actions/upload-pages-artifact@v3` | upload `dist/` as Pages artifact |
| `actions/deploy-pages@v4` | deploy the artifact to Pages |

The workflow's `permissions:` block SHALL grant exactly:

- `contents: read` (for checkout)
- `pages: write` (for Pages deploy)
- `id-token: write` (required by `actions/deploy-pages` for OIDC)

The workflow SHALL NOT request `contents: write` or any broader permission than what is required.

#### Scenario: No third-party actions in workflow

- **WHEN** the deploy workflow is inspected
- **THEN** every `uses:` line SHALL reference an action under the `actions/`, `pnpm/`, or other GitHub-blessed official namespace
- **AND** no community / personal-account third-party action SHALL appear

#### Scenario: Permissions are scoped minimum

- **WHEN** the deploy workflow's `permissions:` block is inspected
- **THEN** it SHALL contain exactly `contents: read`, `pages: write`, `id-token: write` — no more, no less

### Requirement: Concurrent deploys are serialized

The workflow SHALL declare `concurrency: { group: pages, cancel-in-progress: false }` so two simultaneous deploys (e.g., manual dispatch + push to main) queue rather than overwrite each other.

`cancel-in-progress: false` is correct (not `true`) — we want each deploy to finish; the latter deploy waits for the former rather than killing it mid-upload.

#### Scenario: Two deploys triggered in quick succession both complete

- **WHEN** a push to main triggers deploy A, and 10 seconds later the user manually dispatches deploy B
- **THEN** deploy A SHALL finish before deploy B begins
- **AND** the final deployed site SHALL reflect the artifact from deploy B (latest wins)
- **AND** neither deploy SHALL be cancelled

### Requirement: Setup checklist documented for repo owner

A markdown checklist SHALL exist at `.github/workflows/README.md` (or equivalent location referenced from main README.md) that walks the repo owner through one-time GitHub repo settings required for the workflow to actually publish:

1. Settings → Pages → Source = "GitHub Actions"
2. Settings → Actions → General → Workflow permissions = "Read and write" (required so `deploy-pages` can publish)
3. (Optional) Settings → Pages → Custom domain (left for future change)

The main `README.md` SHALL link to this setup file or inline the checklist.

#### Scenario: New fork can deploy without trial-and-error

- **WHEN** a third-party fork clones the repo, pushes to their fork's main, and Pages doesn't publish
- **THEN** they SHALL find the setup checklist via README in under 30 seconds (top-level link or inline section)
- **AND** completing the checklist SHALL make the next deploy succeed

### Requirement: SPA route fallback works on GitHub Pages for BrowserRouter apps

The deployed site SHALL serve any client-side route of a **BrowserRouter-based app** (e.g. one階 `/study-rpg/skills`, future `/study-rpg/streak`) directly via URL, page refresh, or external link without GitHub Pages returning a 404. The fallback SHALL be implemented via a `404.html` redirect file (rafgraph/spa-github-pages pattern) that encodes the requested path into a query string and redirects to `index.html`, plus a small inline script in `index.html` `<head>` that restores the original URL via `history.replaceState` before React Router boots.

Apps that use **HashRouter** (e.g. 二階 medexam2-hospital-tw) SHALL NOT require this fallback — the `#`-prefixed route portion is never sent to the server, so GitHub Pages always serves `index.html` at the asset path and the browser handles routing client-side without any 404 risk.

#### Scenario: Direct URL to 一階 SPA route resolves to React app

- **WHEN** a user opens `https://<owner>.github.io/study-rpg/skills` directly (typed URL, bookmark, or shared link)
- **THEN** the GitHub Pages 404.html SHALL be served first
- **AND** within 1 redirect the browser SHALL land on `https://<owner>.github.io/study-rpg/skills` with the React app rendered (skill tree visible, not GitHub's 404 page)
- **AND** the URL bar SHALL show the original clean path (no `?/skills` query string visible to the user)

#### Scenario: Page refresh on 一階 SPA route preserves the route

- **WHEN** a user is on `/study-rpg/skills` and presses F5 / Cmd-R / browser reload
- **THEN** the React app SHALL re-mount on `/study-rpg/skills` (NOT redirect to home, NOT show GitHub 404)
- **AND** any client-side state derived from URL params SHALL be re-derived correctly

#### Scenario: 一階 404.html and Vite base path stay in sync

- **WHEN** the 一階 `apps/medexam-tw/vite.config.ts` declares `base: '/<project-name>/'` (currently `/study-rpg/`)
- **THEN** `apps/medexam-tw/public/404.html` `pathSegmentsToKeep` constant SHALL equal the number of leading `/`-separated segments in that base (currently `1`)
- **AND** changing one without the other SHALL be flagged in code review (the spec scenario codifies the expectation)

#### Scenario: In-app navigation continues to work unchanged

- **WHEN** a user clicks an internal `<Link>` or triggers `useNavigate()` to switch routes (e.g. 一階 home → /skills via 技能樹 button)
- **THEN** navigation SHALL continue to use `pushState` and SHALL NOT trigger a full page reload
- **AND** SHALL NOT touch the 404.html redirect path

#### Scenario: 二階 HashRouter does not need 404 fallback

- **GIVEN** 二階 `apps/medexam2-hospital-tw` uses `HashRouter` (per `src/App.tsx`)
- **WHEN** a user opens `https://<owner>.github.io/study-rpg/hospital/#/<sub-route>` directly (typed URL or shared link)
- **THEN** GitHub Pages SHALL serve `apps/medexam-tw/dist/hospital/index.html` (no 404)
- **AND** the browser SHALL parse the `#`-prefixed route portion client-side
- **AND** React Router SHALL mount the correct sub-route component
- **AND** `apps/medexam2-hospital-tw/public/404.html` SHALL NOT exist (its presence would imply a BrowserRouter migration not authorized by this change)

#### Scenario: F5 on 二階 sub-route preserves the route

- **WHEN** a user is on `https://<owner>.github.io/study-rpg/hospital/#/banner` and presses F5
- **THEN** the browser SHALL re-request `https://<owner>.github.io/study-rpg/hospital/` (the path before `#`)
- **AND** GitHub Pages SHALL serve `index.html` (no 404 fallback involved)
- **AND** React Router SHALL re-mount on the `#/banner` route after hash parsing

### Requirement: Subpath co-location for multi-app deployment

The repository SHALL host its production-deployed app shells under a **single deploy site per deploy target**, with the documented exception of 二階 (`medexam2-hospital-tw`), which after `split-medexam2-standalone` lives in its own standalone repository and its own Cloudflare Pages project, reachable at `med-study-rpg.com/2nd/` via an edge router Worker (see `medexam2-standalone`).

For the apps that remain in this monorepo, additional apps beyond the primary SHALL be served at subpaths of the deploy site (no sister repositories, no subdomain-per-app split). 二階 is NOT governed by co-location anymore; it is an external standalone deploy whose `/2nd/` URL is preserved by routing, not by in-repo dist assembly.

This architectural decision SHALL be reflected in:

1. The deploying app's `vite.config.ts` `base` defaults to its GitHub Pages path; the same app uses `VITE_DEPLOY_BASE` to switch to the Cloudflare Pages path at build time (e.g. `/1st/` for 一階)
2. The deploy workflow / build script merging each in-repo app's `dist/` into the deploy artifact's appropriate subdirectory (`dist/<mode>/` for GitHub Pages, `dist-cf/<mode>/` for Cloudflare Pages)
3. No sister repository being created for additional **in-repo** apps (this does not constrain 二階, which is intentionally externalized)

#### Scenario: Adding a third in-repo app follows the subpath convention

- **GIVEN** a future change introduces a third in-repo app, e.g. `apps/surgery-sim-tw/`
- **WHEN** the change designs its deploy path
- **THEN** the chosen GitHub Pages URL SHALL be `https://<owner>.github.io/study-rpg/<mode>/` (where `<mode>` is e.g. `surgery`)
- **AND** the chosen Cloudflare Pages URL SHALL be `https://med-study-rpg.com/<mode-cf>/`
- **AND** the app's `vite.config.ts` `base` default SHALL be `'/study-rpg/<mode>/'`
- **AND** the Cloudflare Pages build SHALL set `VITE_DEPLOY_BASE=/<mode-cf>/` for the new app
- **AND** the deploy workflow SHALL gain a build step + a dist merge step for both targets

#### Scenario: 二階 is no longer co-located in-repo

- **WHEN** the monorepo deploy pipeline assembles its Cloudflare Pages output
- **THEN** it SHALL NOT include a `dist-cf/2nd/` directory built from this repo
- **AND** `med-study-rpg.com/2nd/` SHALL be served by the dedicated 二階 Cloudflare Pages project via the edge router (per `medexam2-standalone`), not by this repo's assembly

#### Scenario: 一階 URL stability on GitHub Pages

- **WHEN** any new in-repo app is added under subpath co-location
- **THEN** the 一階 `https://<owner>.github.io/study-rpg/` URL SHALL remain unchanged
- **AND** the 一階 app's `vite.config.ts` `base` default `'/study-rpg/'` SHALL remain unchanged
- **AND** existing bookmarks / external links to 一階 routes on GitHub Pages SHALL continue to resolve

#### Scenario: 一階 URL on Cloudflare Pages is stable at /1st/

- **WHEN** any new in-repo app is added under subpath co-location on Cloudflare Pages
- **THEN** the 一階 `https://med-study-rpg.com/1st/` URL SHALL remain unchanged
- **AND** the `VITE_DEPLOY_BASE=/1st/` build invocation for 一階 SHALL remain unchanged

### Requirement: Cloudflare Pages deploy target alongside GitHub Pages

The repository SHALL produce a Cloudflare Pages deployment of its **in-repo** apps. The combined Cloudflare Pages project (`med-study-rpg`, Direct Upload mode) SHALL serve from the custom domain `med-study-rpg.com` with the following layout:

- `https://med-study-rpg.com/` — minimal HTML landing page linking to the apps
- `https://med-study-rpg.com/1st/` — 一階 (`apps/medexam-tw`) entry

`https://med-study-rpg.com/2nd/` is served by the **separate** 二階 Cloudflare Pages project via the edge router Worker (per `medexam2-standalone`); it is NOT built or assembled by this repo's pipeline. (Other co-located in-repo apps such as neurons are governed by their own specs.)

The combined Cloudflare Pages project remains in **Direct Upload** mode (`Git Provider: No`); the dashboard GitHub integration is intentionally NOT used.

The combined build sequence SHALL:

1. Install dependencies with `pnpm install --frozen-lockfile`
2. Build 一階 with `VITE_DEPLOY_BASE=/1st/`
3. Assemble the merged `dist-cf/` output via `node scripts/build-cf-pages-dist.mjs`, whose `ROUTES` SHALL NOT contain a `2nd` entry
4. Deploy via `wrangler pages deploy ... --project-name med-study-rpg`

During any remaining bake period, the GitHub Pages deploy SHALL continue to serve 一階 unchanged; the GitHub Pages 二階 path is redirect-only (see `medexam2-standalone`).

#### Scenario: Combined CF assembly excludes 二階

- **WHEN** the combined Cloudflare Pages build runs
- **THEN** `scripts/build-cf-pages-dist.mjs` `ROUTES` SHALL NOT include `{ src: 'apps/medexam2-hospital-tw/dist', dest: '2nd' }`
- **AND** the assembled `dist-cf/` SHALL NOT contain a `2nd/` directory
- **AND** the combined build SHALL NOT build `apps/medexam2-hospital-tw`

#### Scenario: 一階 still serves at /1st/ from the combined project

- **GIVEN** the combined Cloudflare Pages project has deployed for the latest `main`
- **WHEN** a user opens `https://med-study-rpg.com/1st/`
- **THEN** the 一階 app SHALL load and function identically to its GitHub Pages deploy

#### Scenario: Dashboard GitHub integration is NOT used

- **WHEN** `wrangler pages project list` is run against the production account
- **THEN** the `med-study-rpg` project row SHALL show `Git Provider: No`
- **AND** the only mechanism that produces production deployments for the combined project SHALL be the GH Actions workflow OR an owner-triggered local `pnpm run deploy:cf` invocation

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

The `CF_ACCOUNT_ID` repo secret SHALL be the same Cloudflare account ID used by `deploy-worker.yml` (a single Cloudflare account owns the Worker + the Pages project).

If `CF_API_TOKEN` is regenerated, the maintainer SHALL re-create the token with the full permission set above. A token missing `Cloudflare Pages:Edit` SHALL fail the workflow with `Authentication error [code: 10000]` at the wrangler deploy step.

#### Scenario: Token missing Pages:Edit fails the deploy step

- **GIVEN** `CF_API_TOKEN` is set to a token without `Cloudflare Pages:Edit` permission
- **WHEN** the `Deploy via Wrangler` step runs
- **THEN** the wrangler API call to `/accounts/<id>/pages/projects/med-study-rpg` SHALL respond with HTTP error code 10000 (Authentication error)
- **AND** the workflow run SHALL fail with `Action failed`
- **AND** earlier steps in the same job (build 一階, build 二階, assemble dist-cf) SHALL be unaffected — they do not call the CF API

#### Scenario: Successful run after token rotation with correct scope

- **GIVEN** the maintainer has regenerated `CF_API_TOKEN` with the full permission set above
- **WHEN** the workflow is re-run (via `Re-run all jobs` or a fresh push)
- **THEN** all build steps SHALL pass
- **AND** the wrangler deploy step SHALL succeed
- **AND** the new deployment SHALL appear in `wrangler pages deployment list --project-name med-study-rpg` with the latest commit SHA in the `Source` column

### Requirement: Local Cloudflare Pages deploy fallback via npm scripts

The repository root `package.json` SHALL expose two npm scripts that allow the maintainer to deploy CF Pages from their local machine without going through GH Actions:

- `pnpm run build:cf` — builds 一階 with `VITE_DEPLOY_BASE=/1st/`, builds 二階 with `VITE_DEPLOY_BASE=/2nd/` + `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`, then runs `node scripts/build-cf-pages-dist.mjs` to assemble `dist-cf/`
- `pnpm run deploy:cf` — runs `build:cf` then `wrangler pages deploy dist-cf --project-name med-study-rpg --branch main --commit-dirty=true`

These scripts are the documented manual fallback for the following situations:

1. GH Actions queue is backed up and a deploy is time-sensitive
2. The maintainer wants to verify a build artifact locally before pushing
3. The workflow itself is broken (e.g., during workflow refactor)

The scripts SHALL use the maintainer's locally installed `wrangler` (typically via Homebrew). Drift between local wrangler version and the CI version (`cloudflare/sync-worker/package.json` devDep) is accepted because the deploy is a static-asset upload, not a runtime contract.

#### Scenario: `pnpm run deploy:cf` produces a new CF Pages deployment

- **GIVEN** the maintainer has authenticated `wrangler` locally (`wrangler whoami` returns the production account)
- **WHEN** they run `pnpm run deploy:cf` from the repo root
- **THEN** both apps SHALL build with the same env vars as the CI workflow
- **AND** `dist-cf/` SHALL be assembled at the repo root
- **AND** `wrangler pages deploy` SHALL upload the assembled output to the production CF Pages project
- **AND** the new deployment SHALL appear in `wrangler pages deployment list` and `med-study-rpg.com/1st/` SHALL serve the freshly-built bundles

#### Scenario: `pnpm run build:cf` runs without authentication

- **WHEN** the maintainer runs `pnpm run build:cf` (without `deploy:`) on a machine where wrangler is not authenticated
- **THEN** both app builds SHALL succeed
- **AND** `dist-cf/` SHALL be assembled at the repo root
- **AND** no CF API call SHALL be made

### Requirement: SPA fallback via `_redirects` for Cloudflare Pages

The merged `dist-cf/` output SHALL contain a `_redirects` file at its root with rules that route any sub-path of `/1st/` and `/2nd/` to the corresponding `index.html` with HTTP 200, enabling react-router BrowserRouter to handle client-side navigation.

The minimum required rules:

```
/1st/*    /1st/index.html   200
/2nd/*    /2nd/index.html   200
```

The root `/` SHALL serve the landing HTML directly (no rewrite needed; CF Pages serves `dist-cf/index.html` as the default root document).

#### Scenario: Direct URL to nested route resolves on new domain

- **WHEN** a user opens `https://med-study-rpg.com/1st/skills` directly in a new tab
- **THEN** Cloudflare Pages SHALL serve `dist-cf/1st/index.html` with HTTP 200
- **AND** react-router SHALL render the `Skills` route
- **AND** the browser console SHALL NOT show any 404 errors for the page itself

#### Scenario: F5 reload on nested route does not 404

- **WHEN** a user navigates in-app to `https://med-study-rpg.com/2nd/dorm` and presses F5
- **THEN** the same `index.html` SHALL be served and the `Dorm` route SHALL re-render
- **AND** the user SHALL NOT see Cloudflare Pages' default 404 page

#### Scenario: Unknown top-level path returns Cloudflare 404

- **WHEN** a user opens `https://med-study-rpg.com/admin` (no match in `_redirects`)
- **THEN** Cloudflare Pages SHALL return its default 404 response
- **AND** the SPA fallback SHALL NOT inadvertently catch the request

### Requirement: Vite `base` switches per deploy target via `VITE_DEPLOY_BASE`

Each app's `vite.config.ts` SHALL read `process.env.VITE_DEPLOY_BASE` and fall back to its GitHub Pages default if the env var is unset:

- `apps/medexam-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/'`
- `apps/medexam2-hospital-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/hospital/'`

This SHALL allow the same source tree to produce GitHub Pages and Cloudflare Pages builds without git-branch divergence.

#### Scenario: GitHub Pages build keeps existing base

- **WHEN** GitHub Pages workflow (`deploy.yml`) builds without setting `VITE_DEPLOY_BASE`
- **THEN** 一階 SHALL build with `base: '/study-rpg/'`
- **AND** 二階 SHALL build with `base: '/study-rpg/hospital/'`
- **AND** the resulting dist SHALL deploy unchanged to GitHub Pages

#### Scenario: Cloudflare Pages build switches to /1st/ and /2nd/

- **WHEN** the Cloudflare Pages build command sets `VITE_DEPLOY_BASE=/1st/` for the 一階 build and `VITE_DEPLOY_BASE=/2nd/` for the 二階 build
- **THEN** 一階 dist SHALL reference assets under `/1st/`
- **AND** 二階 dist SHALL reference assets under `/2nd/`
- **AND** the resulting dist SHALL serve correctly when assembled into `dist-cf/`

#### Scenario: Hard-coded /study-rpg/ asset references replaced

- **WHEN** the source tree contains any `<img src="/study-rpg/...">` or hard-coded `/study-rpg/` asset path used at runtime
- **THEN** that reference SHALL be replaced with a Vite-base-aware pattern (`import.meta.env.BASE_URL + 'sprites/x.png'` or a `?url` import) OR paired with a base-aware runtime override (e.g. a runtime-injected `@font-face` block that ships alongside a kept-for-fallback static `@font-face` so browsers try both URLs and use whichever loads)
- **AND** running `grep -r '"/study-rpg/' apps/*/src/` SHALL return only: (a) doc comments / strings used in comments, and (b) intentional fallback URLs that are paired with a base-aware override at runtime AND documented as such in code comments

#### Scenario: Runtime base-aware override covers new deploy targets

- **GIVEN** the source tree retains a hard-coded `/study-rpg/...` static asset URL paired with a runtime base-aware override
- **WHEN** the app is built and served under a non-default base (e.g. `/1st/` or `/2nd/`)
- **THEN** the runtime override SHALL inject the correct base-prefixed URL (e.g. via `import.meta.env.BASE_URL`)
- **AND** the browser SHALL successfully load the asset from the new base path
- **AND** the static fallback URL MAY 404 silently on the new domain; the runtime path is the source of truth

### Requirement: `VITE_SYNC_WORKER_URL` switches per deploy target

The Cloudflare Pages build SHALL set `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` so clients on the new domain reach the Worker via its Custom Domain binding.

The GitHub Pages workflow SHALL continue to set (or default to) `VITE_SYNC_WORKER_URL=https://study-rpg-sync-worker.tony85314.workers.dev` during the bake period. Both URLs resolve to the same Worker; this is purely a client-side origin/branding choice.

#### Scenario: Clients on new domain talk to api.med-study-rpg.com

- **GIVEN** a user is on `https://med-study-rpg.com/1st/` and authenticated
- **WHEN** the sync engine pushes a bundle to R2
- **THEN** the network request URL SHALL begin with `https://api.med-study-rpg.com/`
- **AND** the Worker SHALL respond with HTTP 200 (or appropriate sync status)

#### Scenario: Clients on GitHub Pages keep talking to workers.dev

- **GIVEN** a user is on `https://fireman333.github.io/study-rpg/` and authenticated
- **WHEN** the sync engine pushes a bundle to R2
- **THEN** the network request URL SHALL begin with `https://study-rpg-sync-worker.tony85314.workers.dev/`
- **AND** the Worker SHALL respond identically (same backend)

### Requirement: Migration banner on GitHub Pages during bake

Both apps SHALL render a migration banner only on GitHub Pages deploys, gated by `import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages'`. The banner SHALL display:

- A one-line announcement that the site is moving to `med-study-rpg.com`
- A primary CTA linking to the corresponding new-domain URL (`https://med-study-rpg.com/1st/` for 一階, `/2nd/` for 二階)
- A secondary CTA to export the user's data as JSON. Because the existing cloud Export hook from the `cloud-sync` capability's Export Account Data requirement requires sign-in and the migration banner must serve anonymous local-only users too, the banner SHALL ship a self-contained local Dexie snapshot exporter that works regardless of sign-in state. Authed users retain access to the cleaner cloud Export inside `SettingsPanel`; the banner CTA does not replace that path
- A dismiss button persisting a versioned key in localStorage (e.g. `domain-migration-banner-dismissed-v1`; the key SHALL be distinct from other banner dismissal keys in the app — notably the R2 backend `migration-banner-dismiss-log` — to avoid collision)

The GitHub Pages workflow (`.github/workflows/deploy.yml`) SHALL set `VITE_DEPLOY_TARGET=gh-pages` as a build-time env var. The Cloudflare Pages build SHALL NOT set this env var, so the banner SHALL be hidden on `med-study-rpg.com`.

The banner component SHALL be named to avoid collision with the existing R2 backend `MigrationBanner` component (e.g. `DomainMigrationBanner`). Two banners SHALL coexist gracefully — both render top-of-viewport, both dismissible independently.

#### Scenario: Banner appears on GitHub Pages 一階

- **GIVEN** the GitHub Pages workflow built with `VITE_DEPLOY_TARGET=gh-pages`
- **WHEN** a user opens `https://fireman333.github.io/study-rpg/`
- **THEN** the migration banner SHALL render at the top of the layout
- **AND** the primary CTA SHALL link to `https://med-study-rpg.com/1st/`
- **AND** the secondary CTA SHALL trigger a JSON export of the user's local Dexie snapshot (works regardless of sign-in state)

#### Scenario: Banner export CTA works for anonymous user

- **GIVEN** a user opens GitHub Pages 一階 without signing in (anonymous play with only local Dexie data)
- **WHEN** the user clicks the banner's "匯出本機 JSON" / Export CTA
- **THEN** the app SHALL produce a downloadable JSON file containing the local Dexie snapshot (cloud-synced tables) tagged with `app: 'medexam-tw'` and the current `origin`
- **AND** the export SHALL succeed without requiring sign-in
- **AND** the user SHALL be able to import this JSON on the new domain (manual step; future bake-end change may add an in-app importer)

#### Scenario: Banner hidden on Cloudflare Pages

- **GIVEN** the Cloudflare Pages build did not set `VITE_DEPLOY_TARGET`
- **WHEN** a user opens `https://med-study-rpg.com/1st/`
- **THEN** no migration banner SHALL render
- **AND** the app SHALL render its normal layout

#### Scenario: Dismissed banner stays dismissed across reloads

- **GIVEN** a user on GitHub Pages has clicked dismiss
- **WHEN** the same user reloads the GitHub Pages URL within the same browser profile
- **THEN** the banner SHALL NOT re-render
- **AND** a localStorage flag SHALL be present at a versioned, banner-scoped key (e.g. `domain-migration-banner-dismissed-v1=true`); the exact key SHALL be distinct from other banner keys in the app to avoid collision

### Requirement: Root landing page at `med-study-rpg.com/`

The Cloudflare Pages site SHALL serve a minimal HTML landing page at the root (`dist-cf/index.html`). The page SHALL contain:

- The project name (`med-study-rpg` or equivalent display name)
- A one-sentence description of the project
- Two prominent links/buttons: "一階國考" → `/1st/` and "二階國考經營" → `/2nd/`
- A footer link to the project's source repository

The landing page SHALL be plain HTML/CSS only — no React, no JavaScript framework, no build-time bundling beyond a file copy.

The landing template SHALL live at `scripts/cf-landing-template.html` in the repository so its copy can be edited without rebuilding the apps.

#### Scenario: Root URL serves the landing page

- **WHEN** a user opens `https://med-study-rpg.com/` directly
- **THEN** the Cloudflare Pages site SHALL respond with the static landing HTML
- **AND** the browser SHALL NOT issue any failed asset requests (no missing CSS/images)

#### Scenario: Landing page links go to /1st/ and /2nd/

- **WHEN** a user clicks "一階國考" on the landing page
- **THEN** the browser SHALL navigate to `https://med-study-rpg.com/1st/`
- **AND** the 一階 app SHALL load normally

#### Scenario: Landing edit does not require app rebuild

- **WHEN** an owner edits `scripts/cf-landing-template.html` to update copy
- **THEN** the next Cloudflare Pages build SHALL pick up the new copy via `scripts/build-cf-pages-dist.mjs`
- **AND** no change to either `apps/medexam-tw/` or `apps/medexam2-hospital-tw/` SHALL be required

