## Why

M3 roadmap requires `@study-rpg/core` to be publishable on npm so third-party content/theme forks (TOEFL demo, plus the in-house M_2nd hospital fork dogfooding it) can `pnpm add @study-rpg/core@0.1.x` instead of cloning the whole monorepo. Today `packages/core/package.json` points `main` and `exports` directly at `./src/*.ts` — that works inside the monorepo (pnpm workspace symlink + each leaf app's Vite bundler compiles TS on the fly), but npm-installed consumers without TypeScript get raw `.ts` they can't import, and consumers with TypeScript would still inherit our `tsconfig` choices through textual source rather than typed declarations. This change rebuilds the package so a vanilla `npm pack` produces a tarball that imports cleanly via both ESM `import` and `import type` in any TS or modern Node project, and locks the API surface at `0.1.0` to start the public semver clock — which is also the two-track merge point per `project.md` (M_2nd hospital fork will switch from workspace symlink to npm dependency at this milestone).

## What Changes

- Add `tsup` (or equivalent zero-config bundler) as devDependency of `packages/core` and a `build` script that emits `dist/index.js` (ESM) + `dist/index.d.ts` (declarations) — no CJS (project is ESM-only, see `"type": "module"`).
- Rewrite `packages/core/package.json` so npm consumers resolve dist artifacts:
  - `main`, `module`, `types` point at `./dist/index.js` / `./dist/index.d.ts`
  - `exports` is a single root entry `"."` mapping `import` to `./dist/index.js` and `types` to `./dist/index.d.ts` (drop the current `./types` and `./lib/*` subpath entries — keeping them would require shipping every internal file and freeze our private layout)
  - `files` includes `dist`, `README.md`, `LICENSE`; excludes `src`, `tsconfig.json`, tests
  - `publishConfig.access: "public"` (npm scoped packages default to private)
  - `prepublishOnly` script runs `pnpm typecheck && pnpm build` so publish never ships stale dist
  - `version` bumps `0.0.1 → 0.1.0` to mark the first publishable cut
- Add `packages/core/README.md` (npm consumers see this on registry page): a one-paragraph "what this is" + minimal install/usage snippet + link back to the main repo.
- Add `packages/core/.npmignore` (or rely on `files` allowlist) so tests / build configs do not leak into the tarball.
- Add a verify step in `tasks.md` that runs `npm pack` on the built package, extracts the tarball into a throwaway dir, and confirms a vanilla Node `import('@study-rpg/core')` resolves without `.ts` files in the bundle — catches the most common publish-readiness bug (forgetting to add `files`, accidental `src` shipping).
- Pin the **monorepo consumers** (apps + theme + content packages) at this same workspace version so a future `0.2.x` bump can land here first and propagate to consumers in lockstep. No path-alias changes; pnpm workspace `link:` semantics continue to resolve `@study-rpg/core@workspace:*` from the local `packages/core/` build output rather than `src/` once `main`/`exports` change.
- **NOT in scope (handed to user)**: running `npm publish` itself (requires `npm login` + scoped-package auth that this skill must never automate per Anthropic prohibited-actions rules), CHANGELOG.md auto-generation, CI publish automation, and changes to the `content-pack-contract` / `theme-pack-contract` exported type shapes (those are already locked).

## Capabilities

### New Capabilities

- `core-npm-package`: defines the npm distribution contract for `@study-rpg/core` — what the published tarball SHALL contain, how `exports`/`main`/`types` resolve for external consumers, the pre-1.0 semver policy (breaking changes bump minor, additive bumps patch), and the build/prepublishOnly gate that prevents shipping uncompiled TypeScript.

### Modified Capabilities

(none — `content-pack-contract` and `theme-pack-contract` already pin the exported type shapes, which is the *what*; this change adds the *how-distributed* without changing any type signature. `build-tooling` covers app/content build hygiene, not library publish — kept separate to avoid mixing app and library build concerns.)

## Impact

- **Code**:
  - `packages/core/package.json` — rewrite scripts, exports, files, publishConfig; bump version
  - `packages/core/tsup.config.ts` (new) — bundler config: entry `src/index.ts`, format esm, dts true, target node18+, sourcemap external
  - `packages/core/README.md` (new) — npm registry page content
  - `packages/core/.gitignore` — add `dist/`
  - `packages/core/dist/` — generated, gitignored
- **APIs**: external consumers will import `from '@study-rpg/core'` (root). The `./types` and `./lib/*` subpaths exposed today disappear from the public surface — confirmed not used by any current monorepo consumer (`grep -r "@study-rpg/core/" apps packages` should be empty before this change ships; tasks.md verifies). Internal monorepo code keeps working because the same exports are re-exported from `src/index.ts` and `dist/index.js`.
- **Save files / save migration**: untouched. This change is build/packaging only.
- **Dependencies**: adds `tsup ^8` to `packages/core/devDependencies`. No runtime dependency change.
- **No theme-pack-contract change. No content-pack-contract change. No Player schema change.**
- **Workspace consumers** (apps/medexam-tw, theme-pixel-medical, content-medexam-tw, and the M_2nd worktree's theme-pixel-hospital / content-medexam2-tw / apps/medexam2-hospital-tw) MUST be re-tested after the change because their resolution path changes from `src/index.ts` to `dist/index.js`. Vite handles this transparently if `dist/` exists at build time; the monorepo `build` order in CI / dev needs `packages/core` built before app build. CI workflow already runs `pnpm -r build` which honors workspace topological order, so this is a non-event there — but `pnpm dev` cold-start now requires one `pnpm --filter @study-rpg/core build` first (or running `pnpm dev` with `--watch` on core).
- **Roadmap**: after archive, M3 item #1 (`prepare-core-npm-publish`) flips ✓. Unblocks `write-content-schema-doc` and `write-theme-api-doc` (both reference the now-stable npm package as the source of truth for the API).
