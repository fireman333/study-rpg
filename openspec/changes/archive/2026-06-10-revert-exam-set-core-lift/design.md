## Context

Change `add-neurons-exam-set-mock-mode` (①) added two modules to `@study-rpg/core`:
`lib/exam-set.ts` (normalized scoring) and `lib/exam-set-mock.ts` (full-paper mock-exam
reducer/scorer/draft helpers), plus their exports in `src/index.ts`, a `0.6.2` version bump,
and a CHANGELOG entry. The intent was a single source of truth shared by neurons and 二階.

Current state: core `0.6.2` is **unpublished** (npm `latest` = `0.6.1`); neurons consumes core
via a pnpm **workspace symlink** (not npm); 二階 is a separate standalone repo consuming core
from npm and has declined to adopt the lift. The engine therefore has exactly one real consumer.

## Goals / Non-Goals

**Goals:**
- Restore `@study-rpg/core` to its `0.6.1` public surface (content-agnostic, no single-consumer engine).
- Relocate the exam-set engine to `apps/neurons-tw/src/lib/` with zero behavior change — neurons prod must keep working identically.
- Keep core / neurons typecheck + the full vitest suite green.

**Non-Goals:**
- No logic / scoring change (the normalized `(correct/total)×100` scoring stays as-is, now app-local).
- No touch to legacy `lib/mock-exam.ts` (一階 `scoreMock` etc.) — separate pre-existing module, stays exported.
- No Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` change (none involved).
- No npm publish, no 二階 coordination (二階 keeps its own copy).

## Decisions

**D1 — Relocate, don't delete.** Move the two `.ts` modules (and the sibling `__tests__/exam-set-mock.test.ts`) into `apps/neurons-tw/src/lib/` rather than rewriting. The only edit inside the moved code is `exam-set-mock.ts`'s `Question` type import: `'../types'` → `'@study-rpg/core'` (still a core type). The `./exam-set` relative import is preserved because both files land in the same app `lib/` directory. Alternative considered: keep modules in core but stop exporting — rejected, leaves dead source in core.

**D2 — Treat as a pre-1.0 BREAKING core change but skip the MINOR bump.** Per the pre-1.0 policy a removal would bump MINOR; here we instead **revert** `0.6.2 → 0.6.1` because `0.6.2` is the very version that introduced these exports and was never published. Net effect: `0.6.1` (the last published version) regains its exact original surface. Removing the CHANGELOG `[0.6.2]` entry keeps the changelog truthful (that version never existed publicly).

**D3 — Repoint depth per consumer.** Imports are rewritten to relative paths by file location: `components/` and `routes/` → `../lib/exam-set{,-mock}`; `lib/` and `lib/services/` → `./exam-set-mock` / `../exam-set-mock`; `__tests__/` → `../lib/exam-set-mock`. `db.ts` splits its line: `ContentPack` stays from `@study-rpg/core`, `MockExamDraftRow` (type-only) moves to `./exam-set-mock`.

## Risks / Trade-offs

- **[Stale core `dist/` after removal causes phantom type resolution]** → Run `pnpm --filter @study-rpg/core build` to re-emit `dist/` without the moved modules before typecheck; neurons `prebuild`/`predev`/`pretypecheck` hooks already rebuild core, but run it explicitly in verify.
- **[A consumer import missed → typecheck red]** → `pnpm -r typecheck` is the backstop; the 7-file consumer list was grep-derived, and any miss surfaces as a TS2307/unresolved-symbol error immediately.
- **[exam-set-mock tests left in core reference a now-app-local module]** → Move the test file alongside the modules into the app `__tests__/`; core vitest count drops, neurons count rises, total stays 561.

## Migration Plan

Pure workspace relocation — no deploy/data migration. Rollback = `git revert` the change commit (restores core modules + exports + `0.6.2`); no npm/data state to unwind since nothing was published.
