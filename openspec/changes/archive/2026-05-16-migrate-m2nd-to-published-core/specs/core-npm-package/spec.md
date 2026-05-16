## ADDED Requirements

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
