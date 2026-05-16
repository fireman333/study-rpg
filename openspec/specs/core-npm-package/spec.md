# core-npm-package Specification

## Purpose
TBD - created by archiving change prepare-core-npm-publish. Update Purpose after archive.
## Requirements
### Requirement: Published tarball composition

The `@study-rpg/core` npm tarball SHALL contain exactly the following top-level entries and nothing else: `package.json`, `README.md`, `LICENSE`, `dist/`.

The `dist/` directory SHALL contain exactly `index.js` (ESM bundle), `index.d.ts` (TypeScript declarations), and optionally `index.js.map` (sourcemap). It MUST NOT contain any `.ts` source files, any sub-directories preserving the internal `src/lib/` layout, or any test/spec/fixture files.

The `src/`, `tsconfig.json`, `tsup.config.ts`, `node_modules`, any test files (`*.test.*`, `*.spec.*`), and any editor or OS artifacts (`.DS_Store`, `.vscode`, `.idea`) MUST NOT appear in the tarball.

#### Scenario: `npm pack` produces clean tarball

- **WHEN** `cd packages/core && pnpm pack` completes successfully
- **THEN** `tar -tzf study-rpg-core-*.tgz` SHALL list only paths starting with `package/dist/`, `package/README.md`, `package/LICENSE`, `package/package.json`
- **AND** no listed path SHALL match `package/src/` or end in `.ts` (except `.d.ts` declarations inside `package/dist/`)

#### Scenario: Tarball loads under vanilla Node

- **WHEN** the tarball is installed into a fresh project (`pnpm add /path/to/study-rpg-core-0.1.0.tgz react react-dom dexie dexie-react-hooks framer-motion`)
- **AND** the project runs `node --input-type=module -e "import('@study-rpg/core').then(m => console.log(Object.keys(m).length))"`
- **THEN** the process SHALL exit zero
- **AND** the printed number SHALL be greater than zero (confirming exports resolved)

### Requirement: Single root entry exports

The `exports` field in `packages/core/package.json` SHALL contain exactly one entry, `"."`, mapping `import` to `./dist/index.js` and `types` to `./dist/index.d.ts`.

The legacy subpath entries (`"./types"`, `"./lib/*"`) MUST NOT be present in the published package. Consumers SHALL access all engine functionality through the root import `import { ... } from '@study-rpg/core'`.

#### Scenario: Subpath import is rejected

- **WHEN** a consumer attempts `import { Player } from '@study-rpg/core/types'`
- **THEN** Node SHALL throw `ERR_PACKAGE_PATH_NOT_EXPORTED`
- **AND** the same symbol imported as `import type { Player } from '@study-rpg/core'` SHALL resolve

#### Scenario: Root import resolves all engine exports

- **WHEN** a consumer imports `{ newPlayer, applyXp, rollLoot, applyCheckIn, getStreakMultiplier, sampleMiniBoss, newCard, reviewCard, dueCards, REWARD }` from `@study-rpg/core`
- **THEN** every symbol SHALL be defined (not `undefined`) at runtime

### Requirement: Pre-1.0 semver policy

While the major version of `@study-rpg/core` is `0`, the project SHALL follow this stricter-than-semver-spec versioning rule:

- A **patch bump** (`0.X.Y → 0.X.(Y+1)`) is allowed only for additive, non-breaking changes: adding a new exported symbol, adding a new optional field to an existing exported type, fixing a bug whose fix does not change any exported signature.
- A **minor bump** (`0.X.Y → 0.(X+1).0`) is required for ANY breaking change: removing or renaming an exported symbol, adding a required field to an existing exported type, changing the signature or behavior of an exported function in a way an existing fork would observe.
- The version SHALL NOT bump to `1.0.0` inside this change. The `1.0.0` boundary is reserved for a future milestone declaring the engine API stable.

Each version bump SHALL be reflected in `packages/core/package.json` `version` field as part of the change that introduces the corresponding modification.

#### Scenario: Initial publishable version

- **WHEN** this change's tasks complete
- **THEN** `packages/core/package.json` `version` SHALL equal `0.1.0`

#### Scenario: Breaking change requires minor bump

- **WHEN** a future OpenSpec change removes any symbol currently exported from `@study-rpg/core` (per `src/index.ts`)
- **THEN** that change's tasks SHALL include bumping `packages/core/package.json` `version` from `0.1.x` to `0.2.0`
- **AND** the change's proposal SHALL mark the removal with **BREAKING**

#### Scenario: Additive change requires patch bump

- **WHEN** a future OpenSpec change adds a new exported symbol to `@study-rpg/core` without altering any existing one
- **THEN** that change's tasks SHALL include bumping `packages/core/package.json` `version` from `0.1.x` to `0.1.(x+1)`

### Requirement: `prepublishOnly` build gate

The `packages/core/package.json` `scripts.prepublishOnly` SHALL run at minimum `pnpm typecheck && pnpm build` (in that order). The script MUST NOT be empty or absent.

`scripts.build` SHALL invoke the bundler (e.g. `tsup`) and produce the `dist/` artifacts described in the tarball-composition requirement. `scripts.typecheck` SHALL run `tsc --noEmit` against the source.

#### Scenario: Publish fails when types are broken

- **WHEN** `packages/core/src/types.ts` contains a syntax error
- **AND** the owner runs `npm publish` from `packages/core/`
- **THEN** `prepublishOnly` SHALL exit non-zero before any registry upload
- **AND** the error output SHALL identify the offending file and line

#### Scenario: Publish always uses a fresh dist

- **WHEN** the owner runs `npm publish` from `packages/core/`
- **AND** `dist/` exists from a stale prior build
- **THEN** `prepublishOnly` SHALL re-run `pnpm build` before publish
- **AND** the published tarball SHALL contain the fresh dist artifacts (not the stale ones)

### Requirement: Files allowlist, not denylist

The `packages/core/package.json` `files` field SHALL be a non-empty array explicitly listing every top-level entry to include in the tarball (e.g. `["dist", "README.md", "LICENSE"]`).

`packages/core/.npmignore` MUST NOT exist. If both `files` and `.npmignore` were present, npm uses `.npmignore` and silently drops the `files` allowlist — that ambiguity is forbidden.

#### Scenario: `.npmignore` does not coexist with `files`

- **WHEN** `packages/core/package.json` declares a `files` field
- **THEN** no file named `.npmignore` SHALL exist anywhere under `packages/core/`

### Requirement: Build artifacts are gitignored

The `packages/core/dist/` directory SHALL be listed in `packages/core/.gitignore` (or any ancestor `.gitignore` that effectively excludes it). No `dist/index.js`, `dist/index.d.ts`, or `dist/*.map` file SHALL be tracked by git at any point.

#### Scenario: dist is gitignored

- **WHEN** `cd packages/core && pnpm build` runs and produces `dist/index.js`
- **AND** `git status --porcelain packages/core/dist` is run
- **THEN** the output SHALL be empty (no tracked or untracked dist files visible to git)

### Requirement: README is shipped

The `packages/core/README.md` file SHALL exist and SHALL be included in the `files` allowlist. The README SHALL contain at minimum: a one-paragraph description of what the package is, an install snippet (`pnpm add @study-rpg/core`), a minimal usage example demonstrating at least `newPlayer` and one reward helper, and a link back to the main repository.

#### Scenario: README ships in the tarball

- **WHEN** `pnpm pack` produces the tarball
- **THEN** `tar -tzf study-rpg-core-*.tgz | grep '^package/README.md$'` SHALL match exactly one line

#### Scenario: README has install snippet

- **WHEN** `packages/core/README.md` is read
- **THEN** the file SHALL contain the literal string `pnpm add @study-rpg/core` somewhere in its body

### Requirement: Peer and runtime dependencies are external to the bundle

The published `dist/index.js` SHALL NOT inline the source code of `react`, `react-dom`, `dexie`, `dexie-react-hooks`, or `framer-motion`. These libraries SHALL remain declared in `peerDependencies` (for `react` / `react-dom`) or `dependencies` (for `dexie` / `dexie-react-hooks` / `framer-motion`), and the bundler SHALL be configured to treat them as external imports.

#### Scenario: External deps not inlined

- **WHEN** `packages/core/dist/index.js` is read after a successful build
- **THEN** the file SHALL contain `import` or `require` statements referencing `react`, `dexie`, `dexie-react-hooks`, and `framer-motion` (proving they're external)
- **AND** the file SHALL NOT contain the string `function createElement` from React's source (proving react was not inlined)

### Requirement: Monorepo consumers keep working after rewrite

After this change archives, every existing `apps/*` and `packages/theme-*` and `packages/content-*` in the main worktree SHALL continue to build and run unchanged. The `pnpm -r build` command at repo root SHALL exit zero. The deployed `apps/medexam-tw` SHALL pass the same Chrome MCP smoke checklist used for M2 production verify (home renders, streak chip visible, 4 stats visible, /skills route loads via direct URL, no console errors).

#### Scenario: Full workspace build succeeds

- **WHEN** `pnpm install && pnpm -r build` runs from repo root after this change archives
- **THEN** every workspace package SHALL produce its expected build artifact
- **AND** the exit code SHALL be zero

#### Scenario: Live app smoke unchanged

- **WHEN** the post-change build of `apps/medexam-tw` deploys to GitHub Pages
- **THEN** the live URL SHALL render the home page with `🔥` streak chip, all 4 stat tiles, the skill-tree button, and the quiz pool counter
- **AND** direct navigation to `/skills` SHALL return the skills page (not a 404)
- **AND** the browser console SHALL show zero error-level messages originating from the deployed origin

### Requirement: Publishing is owner-driven, never automated

This change SHALL NOT run `npm publish`, modify any npm authentication state, write any npm token to a file, or include any CI step that would publish to the npm registry. The owner SHALL perform the actual publish manually after reviewing `pnpm pack` output.

#### Scenario: No publish executed during change implementation

- **WHEN** all tasks in `tasks.md` complete
- **THEN** `npm view @study-rpg/core` SHALL NOT show `0.1.0` listed on the registry (proving no publish was executed)
- **AND** the local `~/.npmrc` SHALL be unchanged from before the change

#### Scenario: No CI publish workflow added

- **WHEN** the change archives
- **THEN** no file under `.github/workflows/` SHALL contain `npm publish` or `pnpm publish`

### Requirement: Internal fork forkability validation via registry resolution

The project SHALL validate the published engine end-to-end by having at least one internal fork consume `@study-rpg/core` from the npm registry (rather than via pnpm workspace symlink), so that the published API surface, dist artifacts, and type definitions are exercised by a real consumer pattern.

#### Scenario: m2 hospital fork resolves engine from registry

- **WHEN** the workspace contains `@study-rpg/core` at a version `0.1.0` that does NOT satisfy the dep range declared by m2 hospital fork packages (e.g. `^0.2.0`)
- **AND** `pnpm install` runs in the m2 worktree
- **THEN** the resulting `pnpm-lock.yaml` SHALL show `@study-rpg/core` resolved from `registry.npmjs.org` (e.g. `tarball: https://registry.npmjs.org/@study-rpg/core/-/core-0.2.0.tgz`) and NOT from a `link:` workspace reference

#### Scenario: registry-resolved engine satisfies type compilation

- **WHEN** the m2 fork's apps and packages import any symbol from `@study-rpg/core` (including SRS additions like `reviewCardBinary`, `SRS_DAILY_CAP`)
- **AND** the dependency is sourced from the registry tarball per the previous scenario
- **THEN** `pnpm -r typecheck` SHALL exit zero — the registry tarball's `dist/index.d.ts` MUST cover every symbol m2 imports

#### Scenario: dev workflow detached from engine source

- **WHEN** a developer working in the m2 worktree edits `packages/core/src/`
- **THEN** changes SHALL NOT propagate live to the m2 hospital app — propagation requires publishing a new `@study-rpg/core` version and re-running `pnpm install`
- **NOTE** This is the expected forkability cost: fork-side hot reload is decoupled from engine source by design
