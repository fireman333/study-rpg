## 1. Core fix (`apps/medexam-tw/public/404.html`)

- [x] 1.1 Locate the inline `<script>` block in `apps/medexam-tw/public/404.html`. Confirm the existing shape: single IIFE with `var pathSegmentsToKeep = 1` + `l.replace(...)` redirect.
- [x] 1.2 Wrap the existing redirect logic in an `if/else` — `if` branch handles the new `/study-rpg/hospital/(.+)$` regex match; `else` branch is the original `pathSegmentsToKeep = 1` logic untouched.
- [x] 1.3 Hospital branch implementation:
    ```js
    var hospitalMatch = l.pathname.match(/^\/study-rpg\/hospital\/(.+)$/);
    if (hospitalMatch) {
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        '/study-rpg/hospital/#/' + hospitalMatch[1] + l.search
      );
    } else {
      // existing pathSegmentsToKeep = 1 logic unchanged
    }
    ```
- [x] 1.4 Add a 1–2 line comment above the new hospital branch explaining intent: `// Translate /study-rpg/hospital/<sub-path> typo URLs to /study-rpg/hospital/#/<sub-path> (HashRouter); 一階 BrowserRouter restore logic in else branch unchanged.`

## 2. Validation + smoke verify

- [x] 2.1 Run `pnpm -r typecheck` — sanity check no static-asset edit broke any other package (expected: green, no TS files touched).
- [x] 2.2 Run `pnpm --filter @study-rpg/medexam-tw build` and `pnpm --filter @study-rpg/medexam2-hospital-tw build` — verify both production builds still succeed. Manually verify `apps/medexam-tw/dist/404.html` contains the new hospital branch.
- [x] 2.3 Manually simulate the merge step from deploy.yml: `mkdir -p apps/medexam-tw/dist/hospital && cp -r apps/medexam2-hospital-tw/dist/. apps/medexam-tw/dist/hospital/`.
- [x] 2.4 Run `npx http-server apps/medexam-tw/dist -p 4173 -c-1 -P http://localhost:4173?/index.html` (or use Vite preview equivalent that serves 404.html for unmatched paths). Verify three URLs in Chrome MCP:
    - **T1 (hospital typo)** — open `http://localhost:4173/study-rpg/hospital/study`. Expected: redirect to `/study-rpg/hospital/#/study`, 二階 app loads with `<h1>` containing「唸書 Session」 (NOT「一階國考 RPG」).
    - **T2 (hospital root)** — open `http://localhost:4173/study-rpg/hospital/`. Expected: 二階 home page (`<h1>` = 「二階國考經營 RPG」), no redirect logic fires (asset served directly), URL bar still `/study-rpg/hospital/`.
    - **T3 (一階 SPA regression)** — open `http://localhost:4173/study-rpg/skills`. Expected: 一階 skills page renders (or 一階 home if `/skills` redirects there per current routing), URL bar `/study-rpg/skills` (cleanly restored), NOT `?/skills`.
- [x] 2.5 Run `openspec validate fix-404-hospital-redirect` — confirm spec delta still valid.
- [x] 2.6 Inline-script syntax sanity check — `node -e "$(cat apps/medexam-tw/public/404.html | sed -n '/<script>/,/<\/script>/p' | sed 's|<script>||;s|</script>||')"` should run without ReferenceError on `window`/`document` (will throw on `l.replace` because no DOM, but should at least parse without SyntaxError).

## 3. Spec sync + archive prep

- [x] 3.1 Run `/opsx:verify` to confirm coherence (proposal ↔ design ↔ specs ↔ tasks all consistent).
- [ ] 3.2 Run `/opsx:archive fix-404-hospital-redirect` — prompt for sync gate, confirm sync of delta into main `openspec/specs/deploy-pipeline/spec.md`.
- [ ] 3.3 Verify post-archive: `openspec/specs/deploy-pipeline/spec.md` contains the new requirement「404.html SHALL redirect 二階 sub-route URLs without hash to HashRouter equivalent」 with all 4 scenarios present.
- [ ] 3.4 Commit (per Curator rules — wait for user explicit confirmation before `git commit`). Two commits: code apply + spec archive sync, mirroring the previous shipping pattern.
