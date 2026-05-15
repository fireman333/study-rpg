## Context

`@study-rpg/core` is the engine layer of a monorepo whose other packages (themes, content packs, and the two `apps/*` SPAs in the main + `track-m2` worktrees) consume it via pnpm workspace symlinks today. The dependency graph already builds cleanly because each consumer is itself a Vite-bundled SPA: Vite reads `packages/core/src/index.ts` directly through the `"main": "./src/index.ts"` field, compiles TypeScript on the fly, and tree-shakes. This works *because every consumer happens to be a TS-aware Vite app*. The moment a third-party fork — TOEFL demo (M3 #4) or any future community fork — wants to `pnpm add @study-rpg/core@0.1.x` from npm, they get a tarball containing raw `.ts` files and the `framer-motion` / `dexie` / `dexie-react-hooks` dependencies but no compiled JavaScript and no `.d.ts` declarations. That fails immediately under plain Node, fails under Webpack without an extra ts-loader, and is awkward under Vite (consumer would need to add `"@study-rpg/core/src/*.ts"` to its `optimizeDeps.include`).

The package currently ships at `version: 0.0.1` — clearly a placeholder. There has never been a `dist/` build artifact. The `exports` map advertises `./types` and `./lib/*` subpaths that grep proves no external code uses (the monorepo always imports from the root `@study-rpg/core`), so those subpaths exist as historical accident, not API surface.

The owner is the only person who can run `npm publish` (npm registry auth lives on the owner's laptop, not in CI yet). M3 won't actually push anything to the public registry inside this change — it just makes the package *publish-ready* so the owner can run `npm publish --dry-run` to inspect the tarball, then `npm publish` when comfortable.

The two-worktree dual-track development (main + `track-m2`) currently both use `workspace:*` resolution. After this change, the main worktree's apps still use `workspace:*` (resolves through symlink to the *built* `dist/` rather than `src/`); the M_2nd worktree's hospital fork is the first test consumer that will eventually switch to `^0.1.0` once 0.1.0 is published — but that switch is **a future change**, not this one. Today both worktrees stay on `workspace:*`.

## Goals / Non-Goals

**Goals:**

- Produce a `dist/` build (`dist/index.js` ESM + `dist/index.d.ts`) that imports cleanly under vanilla Node 18+ and any modern bundler.
- Lock the public API surface to the single root entry `@study-rpg/core` (drop `./types` and `./lib/*` subpaths from `exports`).
- Make `npm pack` produce a tarball with *only* the published files (`dist/`, `README.md`, `LICENSE`, `package.json`) — no `src/`, no `tsconfig.json`, no tests.
- Set up `prepublishOnly` so publishing always rebuilds and re-typechecks; impossible to ship stale.
- Bump version from `0.0.1` → `0.1.0` to mark the first publishable cut (publishing itself is owner-driven and out of scope).
- Keep all current monorepo consumers (apps + theme + content packages in both worktrees) building and running unchanged after the rewrite.
- Establish the pre-1.0 semver convention so future changes have a clear rule for version bumps.

**Non-Goals:**

- **Running `npm publish` itself.** Anthropic prohibited-actions rules forbid Claude from executing publishing operations or modifying npm auth state. Owner runs it manually after a `npm pack` review.
- **Dual ESM + CJS output.** The project is ESM-only (`"type": "module"` in root + every workspace package). Consumers stuck on CJS can require a follow-up change; not a Day-1 need for the medical-student dogfood + TOEFL demo audience.
- **CHANGELOG.md auto-generation** (e.g. changesets, semantic-release). Manual `CHANGELOG.md` entries on each release is acceptable for the publishing cadence we're targeting (a handful per year initially).
- **CI publish automation.** GitHub Action that publishes on tag push is a separate change later. Owner-driven publish keeps the npm auth token off CI servers for now.
- **Public exports surface freeze beyond what `src/index.ts` re-exports today.** The spec locks the *distribution mechanism* and the *semver discipline*, not which symbols are exported — that's already covered by `content-pack-contract` and `theme-pack-contract`. If a future change wants to add or remove a symbol, it just follows the pre-1.0 semver rule we're establishing here.
- **Migrating the M_2nd worktree off `workspace:*` to `^0.1.0`.** That's a *consumer-side* migration that needs the registry to actually have 0.1.0 published. Out of scope.

## Decisions

### Decision 1: Use `tsup` as the bundler

**Choice**: Add `tsup@^8` (devDependency) and a `tsup.config.ts` that emits ESM + DTS from `src/index.ts`.

**Alternatives considered**:

- **Bare `tsc` with `"declaration": true, "noEmit": false`** — would emit one `.js` + `.d.ts` per source file (preserving the internal directory structure). That works but exposes our internal `lib/` filenames as part of the on-disk surface in the tarball. Forks reading the tarball could accidentally start importing `@study-rpg/core/dist/lib/streak.js` and pin themselves to internals. Single-bundle output keeps the surface honest. Rejected.
- **Rollup directly** — `tsup` is itself rollup + esbuild under the hood, with a zero-config preset that does exactly what we want (ESM + DTS + sourcemap external). Using rollup directly means writing ~30 lines of config and pulling in `@rollup/plugin-typescript` + `rollup-plugin-dts` separately. Rejected for cost.
- **unbuild** (Nuxt's bundler) — comparable to tsup but smaller ecosystem and the project is React, not Vue/Nuxt; sticking to the more idiomatic React-tooling-adjacent choice. Rejected on ecosystem fit.
- **swc / esbuild standalone** — fast, but DTS bundling is a separate problem (`esbuild` doesn't emit `.d.ts` at all). tsup handles DTS via a separate `tsc --emitDeclarationOnly` pass internally. Rejected for "two-tool" complexity.

**Rationale**: tsup is the de-facto choice for small TS-only ESM libraries in 2025–2026; its config is one file, the build is fast (~1s for our size), and the output is a single self-contained `dist/index.js` + `dist/index.d.ts` pair that hides internal layout.

### Decision 2: Drop `./types` and `./lib/*` subpath exports

**Choice**: `exports` becomes a single `"."` entry. No `./types`, no `./lib/*`.

**Alternatives considered**:

- **Keep them for backward compatibility** — but `grep -r "@study-rpg/core/" --include='*.ts' --include='*.tsx' apps packages` (across both worktrees) returns nothing. There is no caller to be backward-compatible with. Rejected.
- **Add them back later if external consumers ask** — possible at any 0.x.y bump (additive change, patch bump under our semver rule). The cost of removal today is zero; the cost of locking-in internal paths forever is high. Rejected (do later if needed).

**Rationale**: The current subpath exports are an unused historical artifact. Dropping them now while we have no external consumers is free. The single-root-entry pattern is also what we'll point new fork authors at in `docs/CONTENT_SCHEMA.md` and `docs/THEME_API.md` (the next two M3 changes).

### Decision 3: Pre-1.0 semver policy — `0.x.y` rules

**Choice**:
- **Patch bump** (`0.1.0 → 0.1.1`): additive, non-breaking (new exported symbol, new optional field on an existing type, bug fix that doesn't change types).
- **Minor bump** (`0.1.x → 0.2.0`): breaking change of any kind (removed symbol, renamed symbol, required field added to a type, function signature change, behavior change that an existing fork would notice).
- **Major bump** (`0.x.y → 1.0.0`): reserved for the moment the engine is declared "API-stable" — at minimum after M3 is closed (so the M3 docs reflect a stable surface) and probably not until M5/M6 dogfood telemetry proves the engine choices.

**Alternatives considered**:

- **Strict semver from 0.1 onward** (treat 0.x.y as 1.x.y semver) — would let consumers `^0.1.0` and get free upgrades, but pre-1.0 is conventionally where the API still shifts; consumers expect to read the changelog at every minor. Rejected as a misuse of the leading-zero convention.
- **Stay on 0.0.x forever** — npm tooling and registry searches treat `0.0.x` as "not even alpha". Rejected for credibility.

**Rationale**: This is the conventional pre-1.0 rule (semver.org §4: "Major version zero (0.y.z) is for initial development. Anything MAY change at any time."). Codifying it as "minor = breaking, patch = additive" is a stricter promise than spec demands, but matches how `tsup`, `pnpm`, `vite`, and most TS ecosystem libraries actually behave. Forks reading our README will know what `^0.1.0` vs `~0.1.0` means.

### Decision 4: `prepublishOnly` runs typecheck + build; no `--dry-run`–only path

**Choice**: `prepublishOnly: "pnpm typecheck && pnpm build"` (and that's it). No `npm pack` inside it, no version-bump enforcement, no git-clean check.

**Alternatives considered**:

- **Add `np` or `release-it`** — these tools wrap publish with interactive prompts, git tag creation, changelog bump, etc. Useful but heavy; introduces decision points (which questions to answer, which prompts to skip) that get in the way of the simple "owner reads the diff, runs `npm publish`" flow we want. Rejected for now; revisit if we publish frequently enough that the manual steps annoy.
- **Run tests in prepublishOnly** — there are no unit tests in `packages/core` today (a documented gap, not in scope for this change). Adding tests is a separate change. Skipping for now.
- **Enforce clean git state** — could `git status --porcelain` and fail if dirty. Reasonable but adds friction; owner can self-discipline. Skipping.

**Rationale**: Minimal gate that catches the most likely failure (shipping stale dist or shipping when types are broken). Heavier gates can be added later as a single-line addition to the script.

### Decision 5: `files` allowlist over `.npmignore`

**Choice**: Use the `files` field in `package.json` (allowlist `["dist", "README.md", "LICENSE"]`). Do not maintain `.npmignore`.

**Alternatives considered**:

- **`.npmignore` (denylist)** — easier to mis-configure: forget to add a new build artifact directory, and it ships. Rejected for "fail closed" reasoning.
- **Both files and `.npmignore`** — `.npmignore` takes precedence when both exist, leading to confusing behavior. Rejected to avoid the footgun.

**Rationale**: Allowlist is the industry default for libraries (`tsup`, `vite`, `framer-motion`, `dexie` all use it). It fails closed: anything not explicitly listed is excluded from the tarball.

### Decision 6: Monorepo consumers stay on `workspace:*`

**Choice**: Apps + theme + content packages keep their existing `"@study-rpg/core": "workspace:*"` dependency declaration. They start resolving to the *built* `dist/index.js` because that's what `main`/`exports` now points at.

**Alternatives considered**:

- **Pin internal consumers to `^0.1.0`** — would make the monorepo behave more like a public consumer, catching publish-readiness bugs earlier. But it also means every internal change requires bumping `packages/core` and re-installing everywhere, which is enormous friction during normal development. Rejected for cost.
- **Add a path alias in `tsconfig.base.json` so consumers see `src/` during type-checking but `dist/` at runtime** — this is the historical "best of both worlds" approach. But the project's CLAUDE.md explicitly bans path aliases in tsconfig.base.json (2026-05-14 commit history): they break pnpm workspace symlink resolution and cause rootDir conflicts. Rejected per existing project rule.

**Rationale**: pnpm workspace symlink resolution + `main` pointing at `dist/` is enough. The only friction is that `pnpm dev` from a cold checkout now requires `pnpm --filter @study-rpg/core build` first. Initial implementation added a `predev`/`prebuild` hook to do this automatically; see revision note below for why that was removed.

**Revision (post-/simplify, 2026-05-15)**: the `predev`/`prebuild` hooks were dropped. `/simplify` review flagged three issues with the hook approach: (a) `pnpm dev` paid ~700ms `tsup` tax on every start even when the developer only touched app code; (b) `pnpm -r build` already builds core first in topo order, so `prebuild` on `medexam-tw` fired a redundant second build; (c) the hook didn't actually solve HMR for core edits — once `main` points at `dist/`, Vite stops watching `src/`, so the developer must manually rebuild core after editing it regardless of any hook. The hook only ever solved the cold-checkout case, which is a one-time event better handled by a documented `pnpm --filter @study-rpg/core build` step in repo-root `CLAUDE.md`. If future-us decides to restore dev-time HMR on core, the right mechanism is a conditional `"development"` export in `packages/core/package.json` (Vite resolves it back to `src/index.ts` in dev), not a build hook.

### Decision 7: `tsup.config.ts` keeps peer deps external

**Choice**: `tsup.config.ts` sets `external: ['react', 'react-dom', 'dexie', 'dexie-react-hooks', 'framer-motion']`. Consumers bundle these themselves.

**Alternatives considered**:

- **Inline framer-motion / dexie into our bundle** — would let consumers `npm add @study-rpg/core` and get a single drop-in. But it bloats our bundle to ~600 KB and duplicates these libs in any consumer that already has them (almost certainly all of them). Rejected.
- **Externalize only peer deps** (just `react` / `react-dom`) — inconsistent. dexie and framer-motion are also reasonable "consumer brings their own" choices, especially because consumers may want different framer-motion versions for animation tuning. Rejected for inconsistency.

**Rationale**: Externalize everything that's a `dependencies` or `peerDependencies` entry. The published bundle contains only *our* code; consumer's package.json must satisfy our `peerDependencies` (the same way it satisfies React's). React/react-dom move from `peerDependencies` to stay there. dexie/dexie-react-hooks/framer-motion move from `dependencies` to **stay in `dependencies`** (consumers don't have to declare them separately, but the bundle externalizes them so npm dedupe works) — this is the standard "library bundles author, but doesn't ship dependencies" pattern.

## Risks / Trade-offs

- **Risk: Vite dev server stops resolving `@study-rpg/core` after `main` flips to `dist/` if `dist/` doesn't exist yet** → Mitigation: add a `predev` script on each consumer app (or at workspace root) that runs `pnpm --filter @study-rpg/core build` first. Document in `apps/medexam-tw/README.md` (and the M_2nd hospital app README). Verified during tasks.md step "first cold-start after rewrite".

- **Risk: tsup emits DTS that incorrectly inlines internal types and breaks consumer's `tsc` step** → Mitigation: tsup's DTS pipeline runs through rollup-plugin-dts, which preserves declarations as written. Verify with `npm pack` + extract + `tsc --noEmit` on a minimal consumer (the `tasks.md` "publish-readiness verify" step uses exactly this technique).

- **Risk: pnpm workspace resolution accidentally points to `dist/` from a prior commit (stale build)** → Mitigation: add `dist/` to `.gitignore` so it can never be committed. The "fresh dist on every install" property is enforced by `prepublishOnly` (publish path) and by `predev` / `prebuild` hooks (consumer path).

- **Risk: framer-motion or dexie major bump breaks consumers because we listed them as external** → Trade-off: accepted. By making them external, we hand version-pinning responsibility to consumers via our peerDependencies + dependencies declarations. We pin to current versions (`framer-motion: ^11.11.0`, `dexie: ^4.0.10`) and bump as a coordinated major in the engine + every consumer when needed.

- **Risk: First publish lands a bad tarball (missing file, wrong format)** → Mitigation: the verify step in tasks.md runs `npm pack`, extracts the tarball into `/tmp/`, and runs `node --input-type=module -e "import('<tarball-path>')"` to confirm it loads. Catches missing files (no dist/), wrong format (CJS instead of ESM), and most file-leak issues (.ts files in tarball).

- **Risk: Owner runs `npm publish` and the published artifact differs from what `npm pack` showed because of a `prepublishOnly` re-build between the two commands** → Mitigation: `prepublishOnly` is **deterministic** (typecheck + tsup); same inputs → same outputs. Documented as part of the publish runbook in README.md addendum.

- **Risk: Future change adds a symbol to `src/index.ts` but forgets to bump version → consumer gets new symbol on `0.1.0`, then later `0.1.1` re-publishes the same symbol** → Trade-off: accepted. The semver rule in Decision 3 is a *policy*, not a *enforced check*. Adding a CHANGELOG.md gate in a later change can enforce this; not in this change's scope.

- **Risk: Two-worktree development means a `track-m2`-side change to `packages/core` could merge back to main and find that main has bumped the version meanwhile** → Mitigation: version bumps live in `packages/core/package.json`, which is one of the documented merge-conflict-prone files (per project.md § Development Workflow / Sync protocol). Standard merge-conflict resolution applies; both worktrees are aware.

## Migration Plan

Step ordering — small, reversible commits:

1. **Add tsup + config** (`packages/core/tsup.config.ts` new, `package.json` adds `tsup` devDep). Run `pnpm --filter @study-rpg/core build` and inspect `dist/index.js` + `dist/index.d.ts`. No `main`/`exports` changes yet — internal consumers still resolve `src/`.
2. **Rewrite `packages/core/package.json`**: bump to `0.1.0`, flip `main`/`module`/`types` to `dist/`, replace `exports` with single root entry, add `files`, `publishConfig`, `prepublishOnly`, `repository`, `homepage`, `bugs`. Run `pnpm install` at repo root to refresh workspace symlinks.
3. **Add `dist/` to `packages/core/.gitignore`.**
4. **Add `predev` / `prebuild` hooks** to `apps/medexam-tw/package.json` (and `apps/medexam2-hospital-tw/package.json` in the `track-m2` worktree — done in a sibling change there, NOT here, to keep the main change atomic) so consumers auto-build core before they start.
5. **Write `packages/core/README.md`**: install snippet, usage example (the `import { newPlayer, applyXp } from '@study-rpg/core'` minimal flow), link back to monorepo repo.
6. **Add `packages/core/LICENSE`** (AGPL-3.0-or-later text, same as repo root).
7. **Verify the build is clean**:
   - Cold checkout: `rm -rf packages/core/dist node_modules` → `pnpm install` → `pnpm --filter @study-rpg/core build` → `ls packages/core/dist/` should show only `index.js` + `index.d.ts` (+ `.map` if sourcemap enabled).
   - All workspace consumers build: `pnpm -r build` exits zero.
   - Apps run: `pnpm --filter @study-rpg/medexam-tw dev` and Chrome MCP smoke confirms the live app still renders (home + skills + quiz + streak chip — same checklist as M2 production verify).
8. **Publish-readiness verify** (the smoke that catches the publish-time bugs):
   - `cd packages/core && pnpm pack` → produces `study-rpg-core-0.1.0.tgz`.
   - `mkdir /tmp/study-rpg-core-verify && cd /tmp/study-rpg-core-verify && pnpm init -y && pnpm add /Users/.../packages/core/study-rpg-core-0.1.0.tgz react react-dom dexie dexie-react-hooks framer-motion`.
   - `echo 'import { newPlayer } from "@study-rpg/core"; console.log(newPlayer("p1"))' > test.mjs && node test.mjs` → expects a Player JSON dumped, no `ERR_MODULE_NOT_FOUND`.
   - `echo '{}' > tsconfig.json && pnpm add -D typescript && pnpx tsc --noEmit --allowImportingTsExtensions=false --module nodenext --moduleResolution nodenext test.mjs` → expects "no errors".
   - If any step fails, the publish-readiness gate failed; fix and re-run.

**Rollback**:
- If `dist/` build produces incorrect output: revert step 1+2 (delete `tsup.config.ts`, restore old `package.json`). Workspace consumers keep working because they were resolving `src/` before and will resolve `src/` again.
- If a consumer breaks but `dist/` build is fine: keep the new `package.json`, add a temporary subpath export `"./src/*": "./src/*.ts"` to `exports` while debugging.
- If publish-readiness verify fails: the change can still be archived as "build-ready, publish-blocked" with a follow-up change to fix the tarball composition.

## Open Questions

- Should we add an `engines` field (`"engines": { "node": ">=20.19" }`) to match the repo's documented Node baseline? Pros: clearer failure mode for old-Node consumers. Cons: warning noise during `pnpm install` for forks that don't notice. Default: yes, add it. Confirm during tasks.md.
- Should `dist/index.js.map` (sourcemap) ship in the tarball? Pros: debuggable for forks; small (~50 KB). Cons: exposes our source filenames. Default: yes, ship it (transparency > security through obscurity for an OSS library). Confirm during tasks.md.
- The `homepage` and `bugs.url` fields point at `https://github.com/fireman333/study-rpg` (the public repo). Confirm with owner that this URL is permanent (i.e., no rename incoming).
- After this change archives, the next M3 change (`write-content-schema-doc`) will reference `@study-rpg/core@0.1.0` as the source of truth for type shapes. If we discover the export surface needs adjustment during doc writing, it bumps to `0.2.0` (per Decision 3) — accepted cost.
