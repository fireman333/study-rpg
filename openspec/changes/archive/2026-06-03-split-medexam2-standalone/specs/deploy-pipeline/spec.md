## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: 404.html SHALL redirect 二階 sub-route URLs without hash to HashRouter equivalent

**Reason**: After `split-medexam2-standalone`, GitHub Pages no longer serves the 二階 application — the 二階 path on GitHub Pages becomes redirect-only to `med-study-rpg.com/2nd/`. The in-page `404.html` HashRouter-restore logic for `/study-rpg/hospital/<sub-path>` is therefore obsolete: there is no 二階 app on GitHub Pages to mount.

**Migration**: Replaced by the `medexam2-standalone` requirement "GitHub Pages 二階 path SHALL 301-redirect to the Cloudflare domain". `apps/medexam-tw/public/404.html` SHALL, for `/study-rpg/hospital/...` paths, redirect to `https://med-study-rpg.com/2nd/` (sub-route preserved where feasible) instead of rewriting to a GitHub-Pages-local HashRouter URL. The 一階 (`pathSegmentsToKeep = 1`) BrowserRouter restore logic for non-hospital paths is unaffected.
