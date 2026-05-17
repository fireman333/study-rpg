## ADDED Requirements

### Requirement: 404.html SHALL redirect 二階 sub-route URLs without hash to HashRouter equivalent

The shared `apps/medexam-tw/public/404.html` SHALL detect when a 404'd path matches the 二階 sub-app subpath pattern `/study-rpg/hospital/<sub-path>` (with `<sub-path>` non-empty) and SHALL redirect the browser to `/study-rpg/hospital/#/<sub-path>` (HashRouter equivalent). Query string and original hash fragment SHALL be dropped — typo / bookmark URLs rarely carry meaningful query state, and embedding a `?` mid-path through HashRouter introduces static-host path-parse hazards. The new hash represents the route itself.

This handles the common typo / bookmark / hash-stripped-share case where a player or external link points at a 二階 sub-route without the `#` separator. The redirect SHALL fire BEFORE the existing `pathSegmentsToKeep = 1` 一階 BrowserRouter restore logic so that 二階 paths never reach the 一階 fallback.

Non-hospital paths SHALL fall through to the existing 一階 SPA fallback logic unchanged.

#### Scenario: Hospital sub-route without hash redirects to HashRouter equivalent

- **GIVEN** the deployed site is live at `https://<owner>.github.io/study-rpg/`
- **WHEN** a user opens `https://<owner>.github.io/study-rpg/hospital/study` directly (typed URL, no hash)
- **THEN** GitHub Pages SHALL serve `apps/medexam-tw/public/404.html`
- **AND** the inline script SHALL match the `/study-rpg/hospital/(.+)$` pattern with `<sub-path>` = `study`
- **AND** the browser SHALL be redirected to `https://<owner>.github.io/study-rpg/hospital/#/study`
- **AND** the 二階 React app SHALL mount with the `/study` route active (NOT the 一階 app, NOT a 404 page)

#### Scenario: Hospital root resolves naturally without redirect logic

- **GIVEN** the deployed site is live and `apps/medexam-tw/dist/hospital/index.html` exists (merged by deploy.yml)
- **WHEN** a user opens `https://<owner>.github.io/study-rpg/hospital/` directly (root, no sub-path)
- **THEN** GitHub Pages SHALL serve `dist/hospital/index.html` directly (no 404)
- **AND** the redirect inline script SHALL NOT execute (no 404 path triggered)
- **AND** the 二階 app SHALL mount with the default home route

#### Scenario: 一階 SPA route fallback unaffected by hospital prefix detection

- **GIVEN** a 一階 SPA route exists at `/study-rpg/skills`
- **WHEN** a user opens `https://<owner>.github.io/study-rpg/skills` directly (typed URL)
- **THEN** GitHub Pages SHALL serve `apps/medexam-tw/public/404.html`
- **AND** the inline script SHALL NOT match the `/study-rpg/hospital/` prefix
- **AND** the existing `pathSegmentsToKeep = 1` redirect logic SHALL execute, redirecting to `/study-rpg/?/skills`
- **AND** the 一階 inline restore script SHALL rewrite the URL back to `/study-rpg/skills` before React Router boots

#### Scenario: Query string on hospital typo URL is dropped during redirect

- **GIVEN** the deployed site is live
- **WHEN** a user opens `https://<owner>.github.io/study-rpg/hospital/study?foo=bar` directly
- **THEN** the inline script SHALL match the hospital prefix
- **AND** the browser SHALL be redirected to `https://<owner>.github.io/study-rpg/hospital/#/study` (no query string)
- **AND** `window.location.search` SHALL be empty after redirect
- **AND** the 二階 React app SHALL still mount cleanly with the `/study` route — the dropped query state is a documented trade-off, not an error
