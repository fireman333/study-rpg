## Context

`isContinuationQuestion` + `resolvePrecedingChain` were written 二階-local in
`study-rpg-2nd` Phase 1 (PR #1, currently on agent worktree branch
`claude/exciting-faraday-979df7`, not yet merged to that repo's `main`). They are
already content-agnostic (plain `Question` data + a by-id `Map` in, plain
`Question[]` out) — written that way on purpose so the engine could own them.

Current core facts (verified this session): version `0.6.0`; npm `latest` is also
`0.6.0`; the shoutout module (`./lib/shoutout`) is exported from `src/index.ts` but
was added AFTER `0.6.0` was published, so it has never shipped to npm; core has no
test runner at all (no `.test.ts`, no vitest config, no `test` script).

## Goals / Non-Goals

**Goals:**
- One shared, fork-contract-owned implementation of 承上題 detection consumed by
  both 二階 and neurons.
- A single owner publish (`0.6.1`) that first-ships the shoutout exports AND the
  new continuation exports.
- Core gains its first real unit-test gate.

**Non-Goals:**
- No 二階 Worker `m2` shoutout backend, no neurons `PrecedingContext` UI, no 二階
  consume-swap — each is a separate later change.
- No `npm publish` here (owner-driven, outward).
- No change to any existing exported signature.

## Decisions

### D1 — Lift verbatim, re-type `Question` to core-relative
Port the function bodies unchanged from the Phase 1 source (keep the
`CONTINUATION_PREFIX = '承上題'`, `MAX_CHAIN_STEPS = 20`, `ID_PATTERN`). The only
edit: `import type { Question } from '@study-rpg/core'` → `import type { Question }
from '../types'`. Rationale: Phase 1 was written for exactly this lift; rewriting
risks regressing the empirically-validated walk.

### D2 — Add minimal vitest to core (not co-locate in an app)
Add `vitest` as a core devDependency + `"test": "vitest run"` script, and place the
9 ported cases at `packages/core/src/lib/__tests__/continuation.test.ts`. Rationale:
the helpers ARE the fork contract; testing them inside core makes
`pnpm --filter @study-rpg/core test` a real gate any forker inherits. Alternative
(co-locate in `neurons-tw`) rejected: it leaves the contract's own logic untested
in the package that ships it. Test files never reach the tarball (the `files`
allowlist already ships `dist/` only — see `core-npm-package` tarball requirement),
so this adds zero published-surface risk.

### D3 — Version `0.6.1` patch, ship on `latest`
Per the `core-npm-package` pre-1.0 semver policy, additive = **patch** (minor is
reserved for breaking). This is purely additive → `0.6.0` → `0.6.1`. Ship on the
`latest` dist-tag: the shoutout "Versioned release" scenario's original
pre-release-dist-tag provision (written when no consumer was ready) is retired now
that both 二階 + neurons adopt the contract directly. Bonus: 二階's `^0.6.0` range
auto-resolves `0.6.1`, so the continuation consume-step needs no `package.json` edit.

### D4 — Preserve the same-subject-prefix walk (do NOT "optimize")
The walk looks up `Q(n-1)` under the FULL `<year>-<sitting>-<book>-<subject>` prefix.
Exam numbering is per-BOOK (subjects interleave within one book), but 承上題 roots are
always same-subject + consecutive → empirically 72/72 chains resolve, 0 orphan.
Broadening to a book-wide cross-subject lookup would attach unrelated other-subject
questions as false preceding context. Same-subject prefix is a feature.

### D5 — Core stays content-agnostic; UI stays per-app
No React / Dexie / fetch / medical or neuron vocabulary in core. The
`PrecedingContext.tsx` React component (per-app quiz CSS) is explicitly out of scope.

## Risks / Trade-offs

- [Adding vitest changes core's toolchain] → vitest is dev-only, not a runtime or
  peer dep; `tsup` build + `prepublishOnly` (typecheck + build) are untouched; the
  tarball allowlist already excludes test files. Verify `pnpm pack` still clean.
- [二階 auto-pulls 0.6.1 via `^0.6.0` before its consume-swap lands] → harmless: the
  new exports are additive; 二階's still-local copy keeps working until Step ③ swaps it.
- [Phase 1 source drift] → lift from the verified worktree copy + run the ported 9
  cases as the regression gate; same-subject-prefix invariant covered by a dedicated case.

## Migration Plan

Pure additive engine change. Rollback = revert the change (delete `continuation.ts`,
its test, the index export line, the vitest devDep/script, restore version `0.6.0`,
drop the CHANGELOG entry). No data, no schema, no deploy in this change. The owner's
`npm publish 0.6.1` is the only outward step and happens after this change archives.

## Open Questions

- neurons by-id resolver (does `neurons-tw` already have a "load full question bank
  → byId Map" helper, or must `PrecedingContext` load it itself?) — deferred to the
  neurons UI change (Step ④), not needed for this lift.
