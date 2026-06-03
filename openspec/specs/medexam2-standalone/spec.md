# medexam2-standalone Specification

## Purpose

二階 (`medexam2-hospital-tw`) is extracted from the `study-rpg` monorepo into its own standalone repository, deployed via its own Cloudflare Pages project, with the player-facing `med-study-rpg.com/2nd/` URL preserved via an edge router Worker. The split decouples 二階's deploy cadence from 一階 / neurons while keeping backend infrastructure (sync Worker, R2, D1, Supabase Auth) and existing player saves fully intact.

## Requirements

### Requirement: 二階 SHALL ship from a standalone repository

二階 (`medexam2-hospital-tw`) SHALL live in its own git repository, separate from the `study-rpg` monorepo. The standalone repository SHALL contain the 二階 application plus its 二階-only packages `theme-pixel-hospital` and `content-medexam2-tw`. It SHALL consume `@study-rpg/core` from the npm registry (`@study-rpg/core@^<x>`), NOT via a workspace symlink — the original monorepo remains `core`'s single source of truth, and shared `core` fixes propagate into 二階 by version bump.

The standalone repository SHALL build, typecheck, and test green using only npm-resolved `@study-rpg/core` (no dependency on the original monorepo's working tree).

#### Scenario: Standalone repo builds with npm-resolved core

- **GIVEN** the standalone 二階 repository checked out fresh with no sibling monorepo present
- **WHEN** `pnpm install && pnpm build && pnpm typecheck` runs
- **THEN** `@study-rpg/core` SHALL resolve from the npm registry (not a `workspace:` symlink)
- **AND** the build, typecheck, and test steps SHALL all succeed
- **AND** `theme-pixel-hospital` and `content-medexam2-tw` SHALL resolve from within the standalone repo

#### Scenario: core is consumed as a versioned dependency, not vendored

- **WHEN** the standalone repo's `package.json` is inspected
- **THEN** the `@study-rpg/core` dependency SHALL be a semver range (`^<x>`) resolving to the published npm package
- **AND** there SHALL NOT be a vendored copy of `core` source inside the standalone repo

### Requirement: 二階 SHALL deploy via its own Cloudflare Pages project

二階 SHALL be deployed to a dedicated Cloudflare Pages project (e.g. `med-study-rpg-2nd`) by its own deploy invocation (`wrangler pages deploy`), with NO dependency on the original monorepo's `scripts/build-cf-pages-dist.mjs` combined assembly. A build failure in 一階 or neurons SHALL NOT block a 二階 deploy, and vice versa.

二階 SHALL build with `VITE_DEPLOY_BASE=/2nd/` and `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` so asset paths and sync requests remain correct under the preserved `/2nd/` URL.

#### Scenario: 二階 deploys independently of the shared assembly

- **GIVEN** the standalone repo is set up with its own CF Pages project
- **WHEN** 二階 is deployed
- **THEN** the deploy SHALL run `wrangler pages deploy` against the dedicated project
- **AND** it SHALL NOT invoke `scripts/build-cf-pages-dist.mjs` or build 一階 / neurons
- **AND** a concurrent failure in the original monorepo's deploy SHALL NOT affect the 二階 deploy outcome

#### Scenario: 二階 build pins the /2nd/ base

- **WHEN** the standalone repo builds for production
- **THEN** the build SHALL set `VITE_DEPLOY_BASE=/2nd/`
- **AND** emitted asset URLs SHALL be rooted at `/2nd/` (e.g. `/2nd/assets/index-<hash>.js`)
- **AND** the build SHALL set `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`

### Requirement: The `med-study-rpg.com/2nd/` URL SHALL be preserved via an edge router

The player-facing URL `https://med-study-rpg.com/2nd/` SHALL continue to serve 二階 after the split, with no visible URL change (no subdomain). An edge router Worker bound to `med-study-rpg.com` SHALL route `/2nd/*` requests to the dedicated 二階 Cloudflare Pages project and SHALL route all other paths to the existing combined project. The router SHALL preserve the request path so that 二階 assets and SPA deep links resolve.

#### Scenario: /2nd/ root serves 二階 unchanged

- **GIVEN** the edge router is live and the dedicated 二階 project is deployed
- **WHEN** a browser navigates to `https://med-study-rpg.com/2nd/`
- **THEN** the response status SHALL be 200
- **AND** the response body SHALL be the 二階 app shell
- **AND** the visible URL SHALL remain `https://med-study-rpg.com/2nd/` (no redirect to a subdomain)

#### Scenario: Other paths are unaffected by the router

- **WHEN** a browser navigates to `https://med-study-rpg.com/1st/` or `https://med-study-rpg.com/neurons/`
- **THEN** the edge router SHALL route the request to the existing combined project
- **AND** those apps SHALL load unchanged

#### Scenario: 二階 deep link and reload do not 404

- **GIVEN** the edge router and 二階 project are live
- **WHEN** a user opens a 二階 deep link directly (fresh navigation) and then presses F5
- **THEN** the response SHALL be 200 in both cases (served the 二階 shell, which resolves the route client-side)
- **AND** the response SHALL NOT be a Cloudflare or Pages default 404 page

### Requirement: Existing players' cloud saves SHALL carry over seamlessly

The split SHALL NOT change any backend infrastructure. 二階 SHALL continue to use the same sync Worker (`https://api.med-study-rpg.com`), the same R2 bucket and bundle keys, the same D1 leaderboard database, the same Supabase Auth project, and therefore the same `user_id` per player. Because the served origin remains `med-study-rpg.com`, browser per-origin storage (IndexedDB, Supabase session) and the OAuth redirect origin are unchanged. An existing player SHALL NOT be required to re-authenticate and SHALL NOT lose any cloud or local save as a result of the split.

#### Scenario: Existing signed-in player keeps their save after cutover

- **GIVEN** a player who was signed in and syncing on `med-study-rpg.com/2nd/` before the split
- **WHEN** the split is cut over and the player loads `med-study-rpg.com/2nd/` again
- **THEN** the player SHALL remain signed in (same Supabase session, same `user_id`)
- **AND** the sync engine SHALL target `https://api.med-study-rpg.com` and the same R2 bundle keys
- **AND** the player's cloud save SHALL restore with no data loss and no re-login prompt

#### Scenario: Backend infrastructure is untouched by the split

- **WHEN** the split is implemented
- **THEN** the sync Worker, R2 bucket, D1 database, KV namespace, and Supabase Auth project SHALL be unchanged
- **AND** no migration of `user_id`, cloud bundles, or auth records SHALL be performed by this change

### Requirement: GitHub Pages 二階 path SHALL 301-redirect to the Cloudflare domain

After the split, the GitHub Pages 二階 entry point (`https://fireman333.github.io/study-rpg/hospital/` and its sub-routes) SHALL stop serving the 二階 application and SHALL instead issue a client-side 301-equivalent redirect to `https://med-study-rpg.com/2nd/` (preserving the sub-route where feasible). GitHub Pages SHALL NOT continue to build or publish the 二階 app bundle.

The redirect flip SHALL only occur after the existing `DomainMigrationBanner` Export-JSON bake has been exposed to GitHub-Pages-origin players, because IndexedDB is per-origin: an anonymous (never-signed-in) GitHub-Pages-only player's local save does NOT exist on the `med-study-rpg.com` origin, so a hard redirect before bake exposure would orphan that local save.

#### Scenario: Old GitHub Pages hospital bookmark redirects to CF

- **GIVEN** the split is complete and the redirect is in effect
- **WHEN** a user opens `https://fireman333.github.io/study-rpg/hospital/` (or a sub-route)
- **THEN** the browser SHALL be redirected to `https://med-study-rpg.com/2nd/` (with the sub-route preserved where feasible)
- **AND** GitHub Pages SHALL NOT serve a 二階 app bundle from that path

#### Scenario: Redirect flip respects the migration bake

- **WHEN** the timing of the GitHub Pages 二階 → 301 flip is decided
- **THEN** the flip SHALL occur only after the `DomainMigrationBanner` Export-JSON CTA has been exposed to GitHub-Pages-origin anonymous players
- **AND** signed-in players (whose saves are in the cloud) SHALL be unaffected by the flip timing

### Requirement: The edge-router mechanism SHALL be validated by a spike before implementation

Before the edge-router mechanism (D2) is locked, a spike SHALL evaluate the candidate mechanisms (Worker reverse-proxy to the project's `*.pages.dev` origin, versus any config-only Cloudflare path-mapping) and SHALL confirm the chosen mechanism preserves: `/2nd/` asset resolution, SPA deep-link fallback, F5-on-deep-route returning 200, and acceptable latency overhead. The implementation SHALL NOT proceed on a mechanism that fails any of these checks.

#### Scenario: Spike validates SPA behavior before lock

- **GIVEN** a candidate edge-router mechanism
- **WHEN** the spike exercises `/2nd/`, a 二階 deep link, and F5 on that deep link
- **THEN** all three SHALL return 200 and serve the 二階 shell
- **AND** `/2nd/assets/*` requests SHALL resolve without 404
- **AND** if any check fails, that mechanism SHALL be rejected and an alternative chosen before implementation
