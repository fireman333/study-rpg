## Context

Live `/skills` shipped 2026-05-15 via M2 #1, but Chrome MCP smoke on prod found:
- `https://fireman333.github.io/study-rpg/skills` direct → 404
- F5 on `/skills` → 404
- Click 技能樹 button on home → ✓ works (pushState only)

Root cause is generic to all SPAs hosted on GitHub Pages: the host doesn't know about client-side routes. Standard fix is the `rafgraph/spa-github-pages` 404→redirect→restore trick, used by Create-React-App docs, Vue-CLI gh-pages plugin, and thousands of OSS sites.

## Decisions

### Use `404.html` redirect trick (not HashRouter)

**Why**: Keeps URL clean (`/skills` not `/#/skills`), no router config change, no React Router refactor. The trick is well-documented and self-contained — both files are copied verbatim from the canonical pattern with only the `pathSegmentsToKeep` constant tuned for this site.

### `pathSegmentsToKeep = 1`

**Why**: Site is hosted at `https://fireman333.github.io/study-rpg/` — i.e. one path segment (`/study-rpg/`) is the GitHub Pages base, everything after is SPA-owned. The redirect script needs to know how many leading segments to preserve when reconstructing the URL. For a custom-domain deploy (no project subpath) this would be `0`; for nested deploys it would be higher. We hard-code `1` matching `vite.config.ts` `base: '/study-rpg/'`.

If we ever switch to a custom domain or change the GH Pages base path, this needs to change in two places (`vite.config.ts` and `404.html`). Acceptable coupling — both live in the same repo and a deploy-pipeline spec scenario codifies the expectation.

### Inline the restore script in `index.html` `<head>` (not a separate `.js` file)

**Why**: Must run before any other script (specifically before React Router reads `location.pathname`), and must be synchronous. Inline `<script>` in `<head>` is the canonical placement. ~10 lines — small enough that a separate file with module loading would be more friction than benefit.

### Don't touch CI workflow yml

**Why**: Vite's `public/` directory is already auto-copied to `dist/` by every build. The deploy workflow uploads `dist/` to GH Pages as-is. New `public/404.html` rides this existing pipeline with zero workflow changes.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `?/<path>` query string collides with a future legitimate query param | We have no query params on any route today; if M3+ introduces a `?subject=...` query, the redirect script still preserves additional `&key=val` pairs (per rafgraph script). Re-validate at that time. |
| Caching: browser caches the redirect 404.html and skips re-deploy | GH Pages serves 404.html with default 10-min cache; users who hit a stale 404.html during deploy window may see one extra reload. Acceptable. |
| The `pathSegmentsToKeep = 1` constant drifts from `vite.config.ts base: '/study-rpg/'` | Add a deploy-pipeline spec scenario that asserts both stay in sync; if a future change forks the basename, the spec catches it. |
| 404.html itself depends on referrer being same-origin (rafgraph constraint) | True for all our routes (we don't route via cross-origin redirects). Non-issue. |
| Truly invalid paths (typos, deleted routes) go through the same redirect → React renders root home (no react-router 404 element today) | Acceptable for MVP — users get something usable. Adding a real `*` 404 route is a separate UX call deferred to M5+. |

## Migration Plan

No migration needed. Pure additive infrastructure:
1. Ship 404.html + index.html script in next deploy
2. After deploy, manually verify on prod: `/skills` direct, F5 on `/skills`, share-the-URL flow all work
3. No data migration, no API changes, no breaking change

## Open Questions

(All resolved — see proposal §"Open design questions" answers.)
