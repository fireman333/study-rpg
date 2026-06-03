# Implementation Tasks

> This change is **spec-only**. The tasks below are the implementation plan for a follow-up pass (`/opsx:apply`), not executed in the proposing session. Order is by dependency; §0 and §1 are gates that must pass before later groups.

## 0. Decision gates (confirm before any code)

- [ ] 0.1 Confirm `@study-rpg/core` consumption strategy with owner — provisionally **npm-core** (design D1). Only blocker: whether the original repo will sustain a `@study-rpg/core` publish cadence. If owner reverts to vendoring, update design D1 + the `medexam2-standalone` spec before proceeding.
- [ ] 0.2 Confirm GitHub Pages 二階 → 301 flip timing (design R4): the `DomainMigrationBanner` Export-JSON bake must have been exposed to GH-Pages-origin anonymous players first. Owner judgment.

## 1. Edge-router spike (gate before deploy lock)

- [ ] 1.1 Deploy a throwaway 二階 test build (base `/2nd/`) to a scratch CF Pages project to get a `*.pages.dev` origin.
- [ ] 1.2 Spike mechanism A — Worker reverse-proxy: bind a Worker to `med-study-rpg.com/2nd/*`, proxy to the project's `*.pages.dev`, preserve path.
- [ ] 1.3 Spike mechanism B — any config-only Cloudflare path mapping (if one exists), as an alternative to a custom Worker.
- [ ] 1.4 Validate the chosen mechanism: `/2nd/` 200 + 二階 shell; deep link 200; F5-on-deep-route 200 (SPA three-suite); `/2nd/assets/*` resolve (no 404); latency acceptable. Lock the mechanism; reject any that fail a check (spec `medexam2-standalone` Req "edge-router … validated by a spike").

## 2. Standalone repo creation

- [ ] 2.1 Create the new git repo; move `apps/medexam2-hospital-tw` + `packages/theme-pixel-hospital` + `packages/content-medexam2-tw` into it.
- [ ] 2.2 Switch `@study-rpg/core` from `workspace:^` to npm `^<x>`; remove other `workspace:*` refs (theme/content now live in-repo).
- [ ] 2.3 `pnpm install && pnpm build && pnpm typecheck && pnpm test` green using only npm-resolved `@study-rpg/core`, with no sibling monorepo present.
- [ ] 2.4 Port per-app build/env config: `VITE_DEPLOY_BASE=/2nd/`, `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`, `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, backend-config flags — all identical to current prod (`.env.local`, gitignored; commit `.env.example`).
- [ ] 2.5 Carry over the Vitest suite (`mastery` / `bookmarks-filter` / `question-history-merge` etc.); confirm they pass in the standalone repo.

## 3. 二階 Cloudflare Pages project + deploy

- [ ] 3.1 Create production CF Pages project `med-study-rpg-2nd` in Direct Upload mode (`Git Provider: No`).
- [ ] 3.2 Add the new repo's own deploy path (local `deploy` script and/or its own GH Actions workflow) running `wrangler pages deploy` against `med-study-rpg-2nd` — with NO dependency on the original `scripts/build-cf-pages-dist.mjs`.
- [ ] 3.3 First production deploy; verify the project's `*.pages.dev` URL serves 二階 with correct `/2nd/` asset paths.

## 4. Edge router wiring + cutover smoke

- [ ] 4.1 Implement + deploy the locked edge router (from §1.4) on `med-study-rpg.com`: `/2nd/*` → `med-study-rpg-2nd`, all other paths → existing combined project.
- [ ] 4.2 Prod SPA three-suite on `https://med-study-rpg.com/2nd/`: root, a deep link, and F5 all 200; assets resolve; visible URL stays `/2nd/` (no subdomain). Also confirm `/1st/` + `/neurons/` unaffected.
- [ ] 4.3 Cloud-save continuity smoke (spec `medexam2-standalone` Req "saves … seamlessly"): sign in as an existing 二階 player; confirm same Supabase session / `user_id`, sync targets `api.med-study-rpg.com` + same R2 bundle keys, cloud save restores with no data loss and no re-login.

## 5. Original monorepo pipeline cleanup (modifies `deploy-pipeline`)

- [ ] 5.1 Remove the `{ src: 'apps/medexam2-hospital-tw/dist', dest: '2nd' }` entry from `scripts/build-cf-pages-dist.mjs` `ROUTES`.
- [ ] 5.2 Remove `medexam2-hospital-tw` from `build:cf` / `deploy:cf` (and drop `dev:m2` / `build:m2` if the app is gone from the workspace).
- [ ] 5.3 Remove the 二階 build + subpath merge from `.github/workflows/deploy.yml` and `.github/workflows/deploy-cf-pages.yml`.
- [ ] 5.4 Verify the combined CF deploy emits no `dist-cf/2nd/`; confirm 一階 (+ neurons) still deploy green — `gh run list --branch main --limit 5` shows both "Deploy to GitHub Pages" and "Deploy Cloudflare Pages" green.

## 6. GitHub Pages 二階 → 301 (modifies `deploy-pipeline`)

- [ ] 6.1 Update `apps/medexam-tw/public/404.html`: for `/study-rpg/hospital/...` paths, 301-equivalent redirect to `https://med-study-rpg.com/2nd/` (sub-route preserved where feasible) instead of the HashRouter restore. Leave the 一階 `pathSegmentsToKeep = 1` logic for non-hospital paths untouched. Gate on §0.2 bake timing.
- [ ] 6.2 Verify `https://fireman333.github.io/study-rpg/hospital/` (and a sub-route) redirect to `med-study-rpg.com/2nd/` and no longer serve a 二階 bundle.

## 7. Docs + final verification

- [ ] 7.1 Verify OAuth redirect allowlist + Supabase Site URL need NO change (origin stays `med-study-rpg.com`); reconcile against `docs/AUTH_REDIRECT_URIS.md` (design R6) — confirm, don't assume.
- [ ] 7.2 Update deploy-topology docs: root `CLAUDE.md` + `openspec/project.md` deploy table, and the new repo's README (document the npm-core publish→bump loop, design D1/R2).
- [ ] 7.3 Final invariant check: backend untouched (sync Worker / R2 / D1 / KV / Supabase Auth), saves seamless, `/2nd/` URL unchanged, old GH hospital link 301s. Rollback path (design Migration Plan) documented and reversible.
