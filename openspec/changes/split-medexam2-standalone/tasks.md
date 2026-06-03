# Implementation Tasks

> This change is **spec-only**. The tasks below are the implementation plan for a follow-up pass (`/opsx:apply`), not executed in the proposing session. Order is by dependency; §0 and §1 are gates that must pass before later groups.

## 0. Decision gates (confirm before any code)

- [x] 0.1 Confirm `@study-rpg/core` consumption strategy with owner — **npm-core** confirmed (design D1 stands). Diligence found npm only had 0.2.0 (no publish automation; local was 0.6.0 on main / 0.5.0 on stale track-m2). Resolved by reconciling track-m2 with main (`git merge main`, 101 commits) then **publishing `@study-rpg/core@0.6.0`** (not 0.5.0 — main canonical). Standalone repo pins `^0.6.0`.
- [ ] 0.2 Confirm GitHub Pages 二階 → 301 flip timing (design R4): the `DomainMigrationBanner` Export-JSON bake must have been exposed to GH-Pages-origin anonymous players first. Owner judgment.

## 1. Edge-router spike (gate before deploy lock)

- [x] 1.1 Deployed the standalone build (base `/2nd/`) to the **real** `med-study-rpg-2nd` CF Pages project (skipped a separate throwaway scratch — the build validated cleanly). Origin `med-study-rpg-2nd.pages.dev/2nd/` serves 二階 with correct asset paths.
- [x] 1.2 Spiked mechanism A — Worker reverse-proxy (`edge-router/` in the new repo, deployed to `med-study-rpg-2nd-router.tony85314.workers.dev`, **no apex route bound**). Path-preserving proxy to `med-study-rpg-2nd.pages.dev/2nd/*` with a `/2nd/` guard. Gotcha fixed: the runtime auto-decompresses the origin body but leaves stale `content-encoding`/`content-length` → non-HTML assets came back 500/404 (correct body, bad framing) for no-Accept-Encoding clients. Fix = strip those two headers on re-emit (keeps the compressed internal hop; edge re-compresses `br` for browsers).
- [x] 1.3 Mechanism B (config-only CF path mapping) — **N/A**: CF Pages custom domains are whole-domain, there is no config-only attach of an apex path prefix to a different Pages project. Worker reverse-proxy is the mechanism. LOCKED.
- [x] 1.4 Mechanism validated + LOCKED via the workers.dev proxy: through the worker, `/2nd/` 200 html (body hash == direct pages.dev), `/2nd/assets/*.{js,css}` 200, `/2nd/content/*.json` 200, `/2nd/fonts/*.woff2` 200, `/2nd/images/…CJK….png` 200 image/png, non-hash `/2nd/hospital` 200 (SPA fallback), guard `/` + `/1st/` → 404. App is **HashRouter** so F5/deep-link reduce to `/2nd/` (always 200). Latency: doc ~250ms, browsers get `br`-compressed assets (353KB). Apex-side three-suite (on `med-study-rpg.com/2nd/`) + the route binding are §4 (cutover gate). NOTE: pre-existing cosmetic `styles.css` hardcoded `/study-rpg/hospital/fonts/` @font-face 404 (superseded by main.tsx base-aware injection; font loads fine) — out of scope, flag for tiny follow-up.

## 2. Standalone repo creation

- [x] 2.1 Create the new git repo (`~/coding-scratch/study-rpg-2nd`, fresh `git init`, branch `main`); moved `apps/medexam2-hospital-tw` + `packages/theme-pixel-hospital` + `packages/content-medexam2-tw` in (excl node_modules/dist). Initial commit `da2ac57` (885 files). History NOT preserved (original monorepo retains it).
- [x] 2.2 Switched `@study-rpg/core` `workspace:^` → npm `^0.6.0` in app + theme + content; theme/content stay `workspace:*` between themselves and the app. Verified install: core → `.pnpm/@study-rpg+core@0.6.0` (npm), theme/content → workspace symlinks.
- [x] 2.3 `pnpm install` + `pnpm typecheck` (3 pkgs) + `pnpm test` (102 vitest, 12 files) + `pnpm build` (base /2nd/) all green using only npm-resolved `@study-rpg/core`, no sibling monorepo.
- [x] 2.4 Ported build/env config: root `build` sets `VITE_DEPLOY_BASE=/2nd/` + `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`; `.env.local` carried (gitignored, holds Supabase keys + `BACKEND=dual`); `.env.example` committed. Verified bundle bakes Supabase ref + `api.med-study-rpg.com`.
- [x] 2.5 Vitest suite carried over (`mastery` / `bookmarks-filter` / `question-history-merge` / `non-reading-event-trigger` etc.) — 102 tests pass in the standalone repo.

## 3. 二階 Cloudflare Pages project + deploy

- [x] 3.1 Created CF Pages project `med-study-rpg-2nd` (Direct Upload, prod branch `main`) via `wrangler pages project create`.
- [x] 3.2 Own deploy path: `scripts/build-cf-2nd.mjs` (assembles `dist-deploy/2nd/` + `_redirects`) + root `deploy` script (`pnpm build` → assemble → `wrangler pages deploy dist-deploy --project-name med-study-rpg-2nd`). NO dependency on the original `build-cf-pages-dist.mjs`.
- [x] 3.3 First deploy done (696 files); `med-study-rpg-2nd.pages.dev/2nd/` serves 二階, assets/content under `/2nd/` resolve, build bakes Supabase ref + `api.med-study-rpg.com` (verified in bundle).

## 4. Edge router wiring + cutover smoke

- [x] 4.1 Bound the apex route `med-study-rpg.com/2nd/*` → edge-router Worker → standalone project (`wrangler deploy` with `routes` in `edge-router/wrangler.toml`). Worker added a `x-served-by: edge-router-2nd` marker for verification. All other paths (`/1st/`, `/neurons/`) still hit the combined project.
- [x] 4.2 Prod verified on `https://med-study-rpg.com/2nd/`: `x-served-by=edge-router-2nd` + asset hash flipped `Czyyq8pl`→`Y62p4tIa` (confirms route + new project); `/2nd/`, `/2nd/hospital` (SPA fallback), `/2nd/assets/*`, `/2nd/content/*.json`, `/2nd/images/…CJK….png` all 200; URL stays `/2nd/` (no subdomain). `/1st/` + `/neurons/` → 200 with NO `x-served-by` (unaffected). HashRouter ⇒ F5/deep-link reduce to `/2nd/` (200).
- [x] 4.3 Cloud-save continuity — VERIFIED seamless (Chrome MCP on `med-study-rpg.com/2nd/`, 2026-06-03): already signed in as `tony85314@gmail.com` (NO re-login), chip shows `已同步`, existing save restored (real doctor roster `精神科 Senior V` / `家醫科 主任`, hospital state, counters), network hits `api.med-study-rpg.com` ×7 + Supabase ×49 + R2/workers ×11, console clean. Origin unchanged ⇒ IndexedDB + session + sync all carried over (design D4).

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
