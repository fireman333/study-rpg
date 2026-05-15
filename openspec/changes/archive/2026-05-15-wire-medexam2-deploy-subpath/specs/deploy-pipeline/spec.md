## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Subpath co-location for multi-app deployment

The repository SHALL host all production-deployed app shells under a **single GitHub Pages site** for the repository. Additional apps beyond the primary (一階) SHALL be served at subpaths of the form `https://<owner>.github.io/study-rpg/<mode>/` where `<mode>` is a lowercase, kebab-case identifier reflecting the game mode (e.g. `hospital`).

This architectural decision SHALL be reflected in:

1. The deploying app's `vite.config.ts` `base` matching `'/study-rpg/<mode>/'`
2. The deploy workflow merging the app's `dist/` into the primary app's `dist/<mode>/` subdirectory before upload
3. No sister repository being created for the additional app

Apps SHALL NOT be served from sister repositories (`fireman333/study-rpg-<mode>`) or from a different GitHub Pages site within the same repo (GitHub Pages supports only one site per repo, so this is enforced architecturally regardless).

#### Scenario: Adding a third app follows the subpath convention

- **GIVEN** a future change introduces a third app, e.g. `apps/surgery-sim-tw/`
- **WHEN** the change designs its deploy path
- **THEN** the chosen URL SHALL be `https://<owner>.github.io/study-rpg/<mode>/` (where `<mode>` is e.g. `surgery`)
- **AND** the app's `vite.config.ts` `base` SHALL be `'/study-rpg/<mode>/'`
- **AND** the deploy workflow SHALL gain a build step + a dist merge step (`cp -r apps/surgery-sim-tw/dist/* apps/medexam-tw/dist/surgery/`)
- **AND** the upload artifact path SHALL remain `apps/medexam-tw/dist` (primary app's dist as the artifact root)

#### Scenario: Sister repo is not used for additional apps

- **WHEN** a contributor proposes hosting a new game mode at `fireman333.github.io/study-rpg-<mode>/` via a sister repo
- **THEN** the proposal SHALL be rejected per this requirement
- **AND** the proposal SHALL be redirected to subpath co-location under the existing repo

#### Scenario: Deploy.yml `cp` source path stays aligned with sub-app vite base

- **GIVEN** a sub-app's `vite.config.ts` declares `base: '/study-rpg/<mode>/'`
- **WHEN** the deploy workflow merges its dist
- **THEN** the `cp -r` destination SHALL be `apps/medexam-tw/dist/<mode>/` (matching the `<mode>` segment in vite base)
- **AND** mismatched paths (e.g. vite base `/study-rpg/hospital/` but cp into `apps/medexam-tw/dist/medexam2/`) SHALL be flagged as a deploy contract violation

#### Scenario: 一階 URL stability across deploys

- **WHEN** any new app is added under subpath co-location
- **THEN** the 一階 `https://<owner>.github.io/study-rpg/` URL SHALL remain unchanged
- **AND** the 一階 app's `vite.config.ts` `base: '/study-rpg/'` SHALL remain unchanged
- **AND** existing bookmarks / external links to 一階 routes SHALL continue to resolve
