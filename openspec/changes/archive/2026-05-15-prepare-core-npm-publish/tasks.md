## 1. Bundler setup

- [x] 1.1 Add `tsup@^8` to `packages/core/devDependencies` and run `pnpm install` to refresh the workspace lockfile.
- [x] 1.2 Create `packages/core/tsup.config.ts` — entry `src/index.ts`, format `esm`, dts true, target `node18`, sourcemap `external` (emits separate `.map`), `external: ['react', 'react-dom', 'dexie', 'dexie-react-hooks', 'framer-motion']`, clean true (wipes prior `dist/`).
- [x] 1.3 Add `packages/core/.gitignore` (or append to repo-root `.gitignore`) so `packages/core/dist/` and `packages/core/*.tsbuildinfo` are untracked.
- [x] 1.4 Run `pnpm --filter @study-rpg/core build` and confirm: `ls packages/core/dist/` shows only `index.js`, `index.d.ts`, `index.js.map` (and no other files); `git status packages/core/dist` shows nothing.

## 2. package.json rewrite

- [x] 2.1 Bump `packages/core/package.json` `version` from `0.0.1` to `0.1.0`.
- [x] 2.2 Replace `main`/`types` with `main: "./dist/index.js"`, `module: "./dist/index.js"`, `types: "./dist/index.d.ts"`. Remove any stale field that contradicts.
- [x] 2.3 Replace `exports` map with a single root entry — `{"." : { "import": "./dist/index.js", "types": "./dist/index.d.ts" }}` — and delete the existing `./types` and `./lib/*` subpath entries.
- [x] 2.4 Add `"files": ["dist", "README.md", "LICENSE"]` (allowlist).
- [x] 2.5 Add `"publishConfig": { "access": "public" }` so the scoped package publishes publicly by default.
- [x] 2.6 Add `"scripts.build": "tsup"` and `"scripts.prepublishOnly": "pnpm typecheck && pnpm build"`. Keep `scripts.typecheck` as-is.
- [x] 2.7 Add `"engines": { "node": ">=20.19" }` (matching documented baseline; see design.md Open Questions for the decision).
- [x] 2.8 Add `"repository": { "type": "git", "url": "git+https://github.com/fireman333/study-rpg.git", "directory": "packages/core" }`, `"homepage": "https://github.com/fireman333/study-rpg/tree/main/packages/core"`, `"bugs": { "url": "https://github.com/fireman333/study-rpg/issues" }`. Confirm `fireman333/study-rpg` URL with the owner before committing this step.
- [x] 2.9 Add `"keywords": ["rpg", "exam-prep", "spaced-repetition", "gacha", "study", "engine"]` for npm registry discoverability.
- [x] 2.10 Confirm there is no `packages/core/.npmignore` file — delete it if found.

## 3. README + LICENSE

- [x] 3.1 Create `packages/core/README.md` containing: one-paragraph description, `pnpm add @study-rpg/core` install snippet, a minimal usage example showing `newPlayer` + `applyXp` + `rollLoot`, and a `[main repo](https://github.com/fireman333/study-rpg)` link.
- [x] 3.2 Create `packages/core/LICENSE` containing the AGPL-3.0-or-later license text (copy from repo root `LICENSE` if it exists, otherwise paste the standard AGPL-3.0 SPDX text).

## 4. Consumer build coordination (post-/simplify revision)

> Initial implementation added `predev`/`prebuild` hooks to `apps/medexam-tw`. `/simplify` review flagged this as P1: hook re-runs ~700ms tsup on every dev start even when only app code changed, AND `pnpm -r build` topo-order already builds core first so prebuild fires a redundant 2nd run. Removed in favor of documentation: cold checkout / core source edit → `pnpm --filter @study-rpg/core build`. Workspace build (`pnpm -r build`) handles topo automatically.

- [x] 4.1 ~~Add predev/prebuild hooks~~ — reverted per /simplify review. `apps/medexam-tw/package.json` scripts unchanged from baseline.
- [x] 4.2 Update repo-root `CLAUDE.md` "Repo-specific build / dev quick reference" section: document the explicit `pnpm --filter @study-rpg/core build` cold-checkout step, since `main`/`exports` now point to `dist/`.

## 5. Verify workspace builds

- [x] 5.1 Run `pnpm install` at repo root to refresh symlinks.
- [x] 5.2 Run `pnpm -r typecheck` — every package SHALL exit zero.
- [x] 5.3 Run `pnpm -r build` — every package SHALL exit zero, in topological order (core first, then theme/content, then apps).
- [x] 5.4 Cold-start `pnpm --filter @study-rpg/medexam-tw dev` and confirm: home page renders, streak chip shows `🔥 從今天開始`, all 4 stat tiles visible, `/skills` route renders via in-app nav.
- [x] 5.5 Chrome MCP smoke against localhost — at minimum: `tabs_context_mcp` → navigate `http://localhost:5173/study-rpg/` → confirm DOM contains `streak-chip-icon` class + `<h1>一階國考 RPG</h1>` + no console errors. Then navigate `/skills` directly via `mcp__Claude_in_Chrome__navigate` → confirm skill-tree DOM renders (per `chrome_mcp_preflight.md` SPA-route 三件套, dev-side coverage).

## 6. Publish-readiness verify (the publish-time bug catcher)

- [x] 6.1 Run `cd packages/core && pnpm pack` → produces `study-rpg-core-0.1.0.tgz` in `packages/core/`.
- [x] 6.2 Inspect tarball: `tar -tzf packages/core/study-rpg-core-0.1.0.tgz` SHALL list only `package/dist/index.js`, `package/dist/index.d.ts`, `package/dist/index.js.map` (if sourcemap on), `package/README.md`, `package/LICENSE`, `package/package.json`. NO `src/` entries, NO `.ts` files (except `.d.ts` inside `dist/`).
- [x] 6.3 Create throwaway consumer dir: `mkdir -p /tmp/study-rpg-core-verify && cd /tmp/study-rpg-core-verify && pnpm init -y`. Install our tarball + peer deps: `pnpm add /Users/kangweiling/coding-scratch/study-rpg/packages/core/study-rpg-core-0.1.0.tgz react react-dom dexie dexie-react-hooks framer-motion`.
- [x] 6.4 Runtime check: `echo 'import { newPlayer } from "@study-rpg/core"; const p = newPlayer("p1"); console.log(JSON.stringify(p, null, 2))' > test.mjs && node test.mjs` → exit zero and prints a Player JSON.
- [x] 6.5 Type check: write a minimal `test.ts` importing `{ Player, newPlayer }` and using them; install `typescript`; run `pnpx tsc --noEmit --moduleResolution nodenext --module nodenext test.ts` → exit zero.
- [x] 6.6 External-deps check: `grep -E "from ['\"](react|dexie|framer-motion)['\"]" packages/core/dist/index.js` SHALL match (proving externals are imported, not inlined). `grep -c "function createElement" packages/core/dist/index.js` SHALL output `0` (proving React was not inlined).
- [x] 6.7 Clean up: `rm -rf /tmp/study-rpg-core-verify packages/core/study-rpg-core-0.1.0.tgz`.

## 7. Production smoke (post-deploy)

- [ ] 7.1 Push the change branch / merged-to-main commit and let GitHub Actions deploy.
- [ ] 7.2 Wait for `gh run watch <run-id> --exit-status` to confirm green deploy.
- [ ] 7.3 Chrome MCP smoke against `https://fireman333.github.io/study-rpg/` using the same checklist as M2 production verify: home renders, `🔥` streak chip present, all 4 stats visible, console clean (no error-level messages from `fireman333.github.io` origin).
- [ ] 7.4 SPA-route 三件套 in prod: direct URL `/skills` SHALL load the skill-tree page (not GitHub Pages 404). F5 on `/skills` SHALL re-render the same page (404.html redirect trick still working).

## 8. Spec validate + archive prep

- [x] 8.1 Run `openspec validate --all` from repo root → exit zero.
- [x] 8.2 Run `openspec validate --change prepare-core-npm-publish --strict` → exit zero.
- [x] 8.3 Confirm `npm view @study-rpg/core versions` does NOT list `0.1.0` on the public registry (proving no accidental publish happened during implementation).
- [x] 8.4 Confirm `~/.npmrc` is unchanged from baseline (proving no auth state mutation).
- [x] 8.5 Stop here. Run `/opsx:archive prepare-core-npm-publish` to merge the `core-npm-package` capability into main specs and move the change to `archive/`. **DO NOT run `npm publish` from within the change implementation** — that's a separate, owner-driven step performed manually after archive (and after a user-confirmed `npm pack` review).

## 9. Owner-driven publish (out-of-change reference)

> The following is **not part of this change's automated work**. It is the owner's manual runbook after the change archives. Listed here for reference so the owner doesn't have to re-derive it.

- The owner runs `cd packages/core && pnpm pack` and inspects `study-rpg-core-0.1.0.tgz` one more time.
- If satisfied, the owner runs `npm login` (if not already logged in) then `npm publish` from `packages/core/`. The `prepublishOnly` hook ensures fresh dist + clean typecheck.
- The owner pushes a git tag matching the publish: `git tag v0.1.0-core && git push origin v0.1.0-core`.
- A follow-up change `migrate-m2nd-to-published-core` (in the `track-m2` worktree) flips the hospital fork from `workspace:*` to `^0.1.0` once the publish is confirmed live on the registry.
