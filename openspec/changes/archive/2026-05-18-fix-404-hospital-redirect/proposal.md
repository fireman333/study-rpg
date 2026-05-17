## Why

Session C dogfood (2026-05-18) surfaced as F1 finding: direct-URL access to `https://fireman333.github.io/study-rpg/hospital/<sub-path>` without a hash (e.g., `/hospital/study` from a bookmark, typo, hash-stripping share, or external link) silently loads the 一階 app instead of the 二階 hospital app. The URL bar still shows `/hospital/<sub-path>`, making the failure visually confusing — the player sees「一階國考 RPG」content under a URL they thought pointed at 二階.

Root cause chain:
1. GitHub Pages 404 → serves `apps/medexam-tw/public/404.html` (一階's, the only 404.html in the build output).
2. 一階's 404 script encodes the path with `pathSegmentsToKeep = 1` and redirects to `/study-rpg/?/hospital/<sub-path>`.
3. The 一階 `index.html` inline restore script rewrites the URL back to `/study-rpg/hospital/<sub-path>`.
4. 一階 React Router (BrowserRouter) has no `/hospital/*` route → falls through to 一階 home.

Severity is MEDIUM — 二階 uses HashRouter so all in-app navigation produces `#/`-prefixed URLs that the server never sees; the bug only fires for external direct-URL access without a hash. But it's still a real UX defect for bookmarks / shares / future BrowserRouter migration.

## What Changes

- Modify `apps/medexam-tw/public/404.html` to add a `/study-rpg/hospital/` prefix detection BEFORE the existing `pathSegmentsToKeep = 1` redirect logic. When the prefix matches, redirect to the HashRouter equivalent `/study-rpg/hospital/#/<sub-path>` so the browser loads `apps/medexam-tw/dist/hospital/index.html` (the 二階 `index.html` placed there by deploy.yml's merge step) and React Router resolves the sub-path client-side via hash.
- Non-hospital paths fall through to the existing `pathSegmentsToKeep = 1` behavior unchanged (一階 BrowserRouter SPA restore remains intact).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `deploy-pipeline`: add a normative requirement that the shared `404.html` redirect SHALL detect `/study-rpg/hospital/<sub-path>` (no hash) and rewrite to `/study-rpg/hospital/#/<sub-path>`, preventing the 二階 sub-app from being silently absorbed by 一階's fallback.

## Impact

- **Affected code** (1 file): `apps/medexam-tw/public/404.html` (~10 LOC of inline script).
- **Affected specs** (1 file): `openspec/specs/deploy-pipeline/spec.md` delta — ADDED requirement with 3 scenarios (hospital sub-path redirects to hash form / hospital root still resolves naturally / 一階 SPA routes unaffected).
- **No DB schema change** — pure static-asset fix.
- **No build pipeline change** — `deploy.yml` already merges 二階 `dist/` into 一階 `dist/hospital/`, which means `dist/hospital/index.html` already exists at the redirect target.
- **No cloud sync impact** — purely client-side static asset.
- **HashRouter compatibility** — the 二階 `apps/medexam2-hospital-tw/index.html` does NOT need an inline restore script because HashRouter parses the route from `location.hash` client-side after the initial request.
- **Out of scope** (separate changes / already shipped):
  - 二階 inline restore script (not needed; HashRouter eliminates the requirement)
  - 一階 BrowserRouter SPA fallback existing behavior (lines 149–178 of current `deploy-pipeline` spec) remains unchanged
  - Future migration of 二階 to BrowserRouter (would need a separate change adding the inline restore script + path-segment-aware 404 logic)
  - Server-side 308 redirect (out of scope — we're on GitHub Pages, only static fallback available)
