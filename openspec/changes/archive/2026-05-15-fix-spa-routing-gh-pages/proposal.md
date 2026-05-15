## Why

M2 #1 shipped `/skills` route live but direct URL access and page refresh on `/study-rpg/skills` return GitHub Pages 404 ([reproduced post-deploy 2026-05-15](https://fireman333.github.io/study-rpg/skills)). Root cause: GitHub Pages serves static files only — when the browser requests `/study-rpg/skills`, GH looks for that file path and 404s instead of falling back to `index.html` for the SPA to handle. Vite dev server auto-fallbacks (`historyApiFallback`); GH Pages does not.

Will compound as more routes land (M2 daily streak, M3 multi-page UI), so fix infra now before the broken set grows. Currently affected: page refresh on `/skills`, bookmarking `/skills`, sharing the URL with others.

## What Changes

- New `apps/medexam-tw/public/404.html` containing the standard `rafgraph/spa-github-pages` redirect script: when GH Pages serves it for any unknown path, the script encodes the requested path into a `?/<path>` query string and `location.replace`s to `index.html`
- Update `apps/medexam-tw/index.html` `<head>` with a tiny inline script that, before React mounts, reads `?/<path>` from the URL and `history.replaceState`s back to the original clean URL — so React Router sees `/skills` (not `/?/skills`) when it boots
- Both files live in `public/` so Vite's existing build pipeline copies them to the deploy artifact unchanged

## Capabilities

### Modified Capabilities

- `deploy-pipeline`: add a new requirement codifying the SPA fallback behavior so future deploys / forks don't regress (e.g., a fork that runs `pnpm build` from scratch must keep both files present and wired)

## Impact

- **New files**
  - `apps/medexam-tw/public/404.html` (~30 lines, mostly the rafgraph redirect script)
- **Modified files**
  - `apps/medexam-tw/index.html` (add ~10-line `<script>` to `<head>` before any other script)
- **No changes**
  - `vite.config.ts` (public/ already copied as-is)
  - `.github/workflows/*.yml` (artifact path unchanged)
  - `BrowserRouter basename` in `main.tsx` (unchanged)
  - Any route definitions or component code
- **Dependencies**: none added
- **Bundle size**: 404.html ≈ 1 KB (only served on 404, doesn't affect main bundle); index.html script ≈ 0.5 KB
- **Out of scope**
  - Not switching to HashRouter (URLs stay clean)
  - Not adding SSR
  - Not redesigning the actual user-facing 404 UX for truly invalid paths (this change keeps existing React Router default for non-matching paths after the redirect)
