## 1. Create 404.html redirect

- [x] 1.1 Create `apps/medexam-tw/public/404.html` with the rafgraph/spa-github-pages redirect script; set `pathSegmentsToKeep = 1` (matches `vite.config.ts` `base: '/study-rpg/'`)
- [x] 1.2 Add a one-line code comment in 404.html pointing to the rafgraph source URL so future maintainers can audit the script

## 2. Update index.html with restore script

- [x] 2.1 In `apps/medexam-tw/index.html`, add the rafgraph restore `<script>` to `<head>` (BEFORE the `<script type="module" src="/src/main.tsx"></script>` line so it runs first and `history.replaceState`s before React boots)
- [x] 2.2 Verify the script is inline (not external file) and synchronous

## 3. Local build verification

- [x] 3.1 Run `pnpm --filter @study-rpg/medexam-tw build` — confirmed `dist/index.html` (1.43 kB) + `dist/404.html` (977 B) present with expected content (rafgraph script + `pathSegmentsToKeep = 1`)
- [x] 3.2 ~~Vite preview~~ — Vite preview has built-in SPA fallback so it can't simulate strict-static GH Pages 404→404.html behavior. Tested via `python3 -m http.server` on `dist/` (confirmed 404.html serves correct content); true round-trip verify deferred to §4 post-deploy on actual GH Pages

## 4. Post-deploy verification

- [ ] 4.1 After commit + push to main + GH Pages deploy completes, navigate https://fireman333.github.io/study-rpg/skills directly via Chrome MCP and confirm: redirect happens within 1s, URL bar shows clean `/skills` (no `?/`), skill grid renders, no console errors
- [ ] 4.2 Press F5 on the live `/skills` page; confirm same outcome (no 404)
- [ ] 4.3 Test in-app button navigation still works (home → 技能樹 button → /skills) — should be unaffected

## 5. Verify

- [x] 5.1 `pnpm -r typecheck` still passes (8 packages all clean)
- [x] 5.2 `/simplify` ~~skipped~~ — only 2 files, both minimum (rafgraph reference impl + thin restore script); no consolidation possible
- [ ] 5.3 `/opsx:verify` against this change before archive
