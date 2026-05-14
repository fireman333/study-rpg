## ADDED Requirements

### Requirement: Production build does not pollute source directories

Running the app's production build script SHALL NOT leave transpiled JavaScript, declaration files, or TypeScript incremental-build artifacts inside any `src/` directory or anywhere outside the designated `dist/` output.

The TypeScript compiler invocation in any app's build script MUST be configured to typecheck without emitting (`"noEmit": true` in the app's `tsconfig.json`, or `tsc --noEmit` in the script). Bundler emit (Vite, etc.) remains the sole producer of build output.

#### Scenario: Building leaves src/ clean

- **WHEN** `pnpm --filter <app> build` completes successfully for any app under `apps/`
- **THEN** `find apps/<app>/src -name "*.js"` SHALL return zero results
- **AND** `find apps/<app>/src -name "*.d.ts"` SHALL return zero results
- **AND** no `tsconfig.tsbuildinfo` file SHALL be created at the app root or inside `src/`
- **AND** `apps/<app>/dist/` SHALL contain the Vite-emitted bundle (`index.html` + `assets/`)

#### Scenario: Type errors still fail the build

- **WHEN** an app's source file contains a TypeScript error and `pnpm --filter <app> build` is run
- **THEN** the build SHALL exit non-zero before Vite emits any bundle
- **AND** the error message SHALL identify the offending file and line
