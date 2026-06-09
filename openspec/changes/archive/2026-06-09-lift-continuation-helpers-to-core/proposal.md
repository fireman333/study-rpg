## Why

Both neurons (15 承上題 / continuation questions) and 二階 need identical
continuation-question detection + preceding-chain resolution. Phase 1 (in
`study-rpg-2nd`) deliberately wrote these as content-agnostic pure functions so
the engine could later own them. Lifting them into `@study-rpg/core` makes the
fork contract the single source of truth and lets a single publish unblock both
consumers. That same publish also first-ships the shoutout module exports that
already live in core source but predate the last npm release (npm `0.6.0` does
not contain them).

## What Changes

- ADD `packages/core/src/lib/continuation.ts` exporting two pure functions:
  `isContinuationQuestion(question)` and `resolvePrecedingChain(question, byId)`,
  re-typed against core's own `Question` interface (relative `../types` import).
  Logic ported verbatim from `study-rpg-2nd` Phase 1 (PR #1) — no behavior change.
- ADD both symbols to `packages/core/src/index.ts` public exports.
- ADD minimal `vitest` test infrastructure to core (`vitest` devDependency + a
  `"test": "vitest run"` script) and port the existing 9 vitest cases to
  `packages/core/src/lib/__tests__/continuation.test.ts`. This is core's first
  unit test and makes `pnpm --filter @study-rpg/core test` a real fork-contract gate.
- BUMP `packages/core/package.json` version `0.6.0` → `0.6.1` (additive → **patch**
  per this project's pre-1.0 semver policy; additive symbols never bump the minor).
- ADD a CHANGELOG `0.6.1` entry covering BOTH (a) the shoutout module exports
  already in source but never published, and (b) the new continuation exports.
- This change does NOT run `npm publish`. The owner publishes `0.6.1` to the
  `latest` dist-tag after reviewing `pnpm pack`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `core-npm-package`: ADD a requirement that the package exports the
  content-agnostic continuation-question helpers (`isContinuationQuestion`,
  `resolvePrecedingChain`); MODIFY the existing shoutout "Versioned release"
  scenario so the contract ships on the `latest` dist-tag — the original
  pre-release-dist-tag provision is retired now that both consumers (二階 +
  neurons) are adopting the contract directly.

## Impact

- **Code**: new `packages/core/src/lib/continuation.ts` + `index.ts` export + new
  `__tests__/continuation.test.ts` + `vitest` devDependency + `test` script +
  `package.json` version bump + `CHANGELOG.md` entry.
- **Consumers**: 二階 declares `@study-rpg/core: ^0.6.0`, which auto-resolves
  `0.6.1` on `pnpm install` (no `package.json` edit needed for the continuation
  consume step); neurons consumes core via workspace symlink. No existing export
  signature changes → no consumer breaks; `pnpm -r typecheck` stays green.
- **Cross-track**: this is a core-engine change affecting all tracks (neurons +
  二階); the commit message flags that. The only outward, owner-gated action is
  the eventual `npm publish` (not part of this change).
- **Out of scope** (each a separate later change): the 二階 Worker `m2` shoutout
  backend, the neurons `PrecedingContext` 承上題 UI, and the 二階 swap from its
  local continuation copy to the core import.
