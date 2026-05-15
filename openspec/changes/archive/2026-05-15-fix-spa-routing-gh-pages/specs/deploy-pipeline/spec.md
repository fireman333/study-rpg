## ADDED Requirements

### Requirement: SPA route fallback works on GitHub Pages

The deployed site SHALL serve any client-side route (e.g. `/study-rpg/skills`, future `/study-rpg/streak`) directly via URL, page refresh, or external link without GitHub Pages returning a 404. The fallback SHALL be implemented via a `404.html` redirect file (rafgraph/spa-github-pages pattern) that encodes the requested path into a query string and redirects to `index.html`, plus a small inline script in `index.html` `<head>` that restores the original URL via `history.replaceState` before React Router boots.

#### Scenario: Direct URL to SPA route resolves to React app

- **WHEN** a user opens `https://<owner>.github.io/study-rpg/skills` directly (typed URL, bookmark, or shared link)
- **THEN** the GitHub Pages 404.html SHALL be served first
- **AND** within 1 redirect the browser SHALL land on `https://<owner>.github.io/study-rpg/skills` with the React app rendered (skill tree visible, not GitHub's 404 page)
- **AND** the URL bar SHALL show the original clean path (no `?/skills` query string visible to the user)

#### Scenario: Page refresh on SPA route preserves the route

- **WHEN** a user is on `/study-rpg/skills` and presses F5 / Cmd-R / browser reload
- **THEN** the React app SHALL re-mount on `/study-rpg/skills` (NOT redirect to home, NOT show GitHub 404)
- **AND** any client-side state derived from URL params SHALL be re-derived correctly

#### Scenario: 404.html and Vite base path stay in sync

- **WHEN** the project's `vite.config.ts` declares `base: '/<project-name>/'` (currently `/study-rpg/`)
- **THEN** `apps/medexam-tw/public/404.html` `pathSegmentsToKeep` constant SHALL equal the number of leading `/`-separated segments in that base (currently `1`)
- **AND** changing one without the other SHALL be flagged in code review (the spec scenario codifies the expectation)

#### Scenario: In-app navigation continues to work unchanged

- **WHEN** a user clicks an internal `<Link>` or triggers `useNavigate()` to switch routes (e.g. home → /skills via 技能樹 button)
- **THEN** navigation SHALL continue to use `pushState` and SHALL NOT trigger a full page reload
- **AND** SHALL NOT touch the 404.html redirect path
