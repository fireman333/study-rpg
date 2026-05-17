## Context

`apps/medexam-tw/public/404.html` (the only 404.html in the build output) implements the [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages) pattern for 一階 BrowserRouter: any 404 → encode path into query string → redirect to `index.html` → 一階's inline `<head>` restore script rewrites URL back. Uses `pathSegmentsToKeep = 1` so `/study-rpg/<route>` → `/study-rpg/?/<route>`.

Deploy pipeline (`.github/workflows/deploy.yml`) merges 二階 `dist/` into 一階 `dist/hospital/`. So:
- `https://<owner>.github.io/study-rpg/hospital/` resolves to `apps/medexam-tw/dist/hospital/index.html` (二階's index, no 404)
- `https://<owner>.github.io/study-rpg/hospital/<anything>` → 404 → 一階's 404.html

The bug: 二階 uses HashRouter, so `/hospital/<sub-path>` is never a valid server path — the player should be at `/hospital/#/<sub-path>`. When the player types the no-hash form (typo, bookmark predating HashRouter migration, external link with hash stripped), 一階's 404.html silently captures and redirects them to 一階.

The fix is a small inline-script change in the shared 404.html: detect the hospital prefix BEFORE the existing path-segment redirect, and translate path → hash. The rest of the file stays intact (一階 routes still hit `pathSegmentsToKeep = 1` logic).

## Goals / Non-Goals

**Goals:**
- Direct-URL access to `/study-rpg/hospital/<sub-path>` (no hash) SHALL load the 二階 app, not the 一階 app.
- The redirect SHALL preserve `<sub-path>` content: `/hospital/study` → `/hospital/#/study`, not `/hospital/`.
- Query string (`?foo=bar`) on the original URL SHALL be preserved through the redirect.
- 一階 SPA route fallback (existing `/study-rpg/<route>` → `/study-rpg/?/<route>`) SHALL remain unchanged for all non-hospital paths.

**Non-Goals:**
- Hash fragment (`#section`) on the original URL — not preserved. The hash IS the route in HashRouter, so any `#`-suffix at the original URL becomes the new route after redirect. Acceptable trade-off (a player who types `/hospital/study#foo` is malforming the URL; we treat path as authoritative).
- Touching the 二階 `apps/medexam2-hospital-tw/index.html` — HashRouter doesn't need an inline restore script.
- Adding a 二階-specific 404.html — GitHub Pages serves only one 404.html per site (at repo root); a 二階-local file at `dist/hospital/404.html` would be served only for the exact path `/hospital/404.html`, useless for the bug we're fixing.
- Server-side redirect via Apache `.htaccess` / Netlify `_redirects` / etc. — GitHub Pages doesn't support these.

## Decisions

### D1: Inline-script prefix detection in 404.html

**Choice:** Add a 2-line `match` + `replace` block at the top of the existing inline `<script>` in `apps/medexam-tw/public/404.html`:

```js
var l = window.location;
var hospitalMatch = l.pathname.match(/^\/study-rpg\/hospital\/(.+)$/);
if (hospitalMatch) {
  l.replace(
    l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
    '/study-rpg/hospital/#/' + hospitalMatch[1] + l.search
  );
} else {
  // existing pathSegmentsToKeep = 1 logic unchanged
  var pathSegmentsToKeep = 1;
  // ...
}
```

**Alternative considered:** Make `pathSegmentsToKeep` dynamic (1 for non-hospital, 2 for hospital). Rejected — that path would redirect to `/study-rpg/hospital/?/<sub-path>` which assumes BrowserRouter restore at the 二階 side (it would need an inline restore script in 二階's index.html). With HashRouter, the cleaner translation is path → hash, no inline script needed.

**Alternative considered:** Match `/^\/study-rpg\/hospital(\/.*)?$/` (allow trailing slash absent). Rejected — `/hospital` (no trailing slash) typically resolves to `dist/hospital/index.html` directly via GitHub Pages without hitting 404 (GH Pages auto-adds trailing slash for directory listings). Only `/hospital/<something>` triggers 404. Matching `/.+/` requires the slash + sub-path.

**Rationale:** Minimal surgical change, single regex, predictable. Reads top-to-bottom in the existing file's mental model.

### D2: Drop both query string and original hash fragment

**Choice:** Build the redirect URL from `protocol + host + '/study-rpg/hospital/#/' + capturedSubPath` only. Do NOT include `l.search` (query string) or `l.hash` (original hash).

**Rationale:**
- Hash fragment IS the route in HashRouter — preserving the original `l.hash` would produce a malformed double-hash URL.
- Query string preservation was attempted but caused server-side path-parse hazards: a redirect to `/hospital/?foo=bar#/study` makes static hosts (including the local http-server used for verification) re-trigger 404 → recursive 一階 fallback → infinite-recursion URL (`/study-rpg/?/~and~/~and~/...`) in some symlink configurations. Putting `?` mid-path is fragile.
- Typo / bookmark URLs rarely carry meaningful query state. Players who hit this code path care about getting to the right route, not about preserving session params that probably weren't valid in the first place.
- Acceptable trade-off documented in the spec scenario「Query string on hospital typo URL is dropped during redirect」.

### D3: Use `location.protocol + hostname + port` reconstruction, not relative redirect

**Choice:** Match the existing 一階 redirect style (full URL reconstruction) rather than `l.replace('/study-rpg/hospital/#/' + sub)`.

**Rationale:** Consistency with the existing inline script. Avoids edge cases with relative URLs in iframes / preview contexts.

### D4: Regression test via local static server, not Chrome MCP

**Choice:** Build the 一階 + 二階 apps, run `npx http-server apps/medexam-tw/dist -p 4173` with the 404 fallback enabled, and curl/browse three URLs to verify behavior. Don't wait for production deploy.

**Alternative considered:** Push and test on production. Rejected — requires merge to main + deploy + ~2 min cycle time. Local static server reproduces GitHub Pages 404 behavior closely enough for verification.

**Rationale:** Verification loop should be fast. Production verification happens after merge as a follow-up sanity check.

### D5: Spec scope — add new requirement under `deploy-pipeline`

**Choice:** ADD a new requirement「404.html SHALL redirect 二階 sub-route URLs without hash to HashRouter equivalent」 with 3 scenarios. Don't MODIFY the existing「SPA route fallback works on GitHub Pages for BrowserRouter apps」 requirement.

**Rationale:** The existing requirement is specifically about BrowserRouter apps (一階). Adding hash-redirect behavior to it would muddle scope. A separate requirement cleanly captures「the same 404.html now also handles the 二階 typo-URL case」.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Regex inadvertently matches a 一階 path that happens to start with `/study-rpg/hospital` (e.g. `/study-rpg/hospitalize-me`) | Regex anchors with `\/hospital\/` (trailing slash) — `/study-rpg/hospitalize-me` doesn't match because the next char after `hospital` is `i` not `/`. Verified by manual regex trace. |
| Hash fragment is lost on the rare case where a user actually appended one | Documented in D2 as an accepted trade-off — the redirect replaces hash with the new route. Doesn't break anything; user lands on the right route, just without their hash anchor. |
| Future 一階 route that happens to be `/skills/hospital/...` could ambiguously match | Regex is anchored to `/study-rpg/hospital/` exactly. A 一階 route `/study-rpg/skills/hospital/something` would not match because path doesn't start with `/study-rpg/hospital/`. Safe. |
| Local verification doesn't fully replicate GitHub Pages | Production smoke check after merge confirms; if it fails on prod we have a quick revert path (revert single commit) |
| Test coverage gap | No browser test infra; relies on local static server smoke + spec scenarios as executable contract |

## Migration Plan

No data migration. Pure static-asset fix.

1. Land code change in `apps/medexam-tw/public/404.html`.
2. Sync delta into `openspec/specs/deploy-pipeline/spec.md`.
3. Build → push (eventually) → GitHub Pages deploy.
4. Production sanity check on three URLs: `/hospital/study` (should land on 二階 study route) / `/hospital/` (should still serve 二階 home directly) / `/skills` (一階 skills route still works).
5. Rollback: revert single commit; redeploy.

## Open Questions

None.
