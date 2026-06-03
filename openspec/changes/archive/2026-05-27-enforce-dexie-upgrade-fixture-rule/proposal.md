# enforce-dexie-upgrade-fixture-rule

## Why

The `add-r2-cloud-sync-migration` v1 incident (2026-05-26, commit `dac4eae` / `3de5888` reverted) shipped a Dexie schema change that promoted a secondary field to primary key. Dexie 4.x rejects pk changes with `UpgradeError Not yet support for changing primary key`, breaking `med-study-rpg.com/2nd/` + `fireman333.github.io/study-rpg/hospital/` for every existing v18 user. Recovery required emergency revert + SQL parity backfill.

The follow-up `fix-doctor-retire-cloud-resurrection-v2` (shipped 2026-05-27) instituted §8.12 — a MANDATORY Vitest fixture that opens at explicit v(N-1) with representative seed data, then reopens at v(N) and asserts `.open()` does NOT throw. That fixture caught a second-order regression (`AbortError` on `&doctorId` unique-index activation order) during fixture-first dev, BEFORE prod ship.

But §8.12 is just a tasks.md checklist item in one archived change. **There is no automated enforcement.** Any future schema bump can ship without an upgrade fixture, and the next person to discover a Dexie 4.x limit (or any other upgrade-time constraint) will rediscover it in prod.

This change generalises §8.12 into a repeatable, automation-enforced rule: any PR / push that bumps `.version(N)` in a Dexie schema file MUST be accompanied by a Vitest fixture under `__tests__/` that exercises the v(N-1) → v(N) upgrade path.

## What Changes

- **ADD** capability `dexie-schema-guards` — owns rules about how Dexie schemas evolve safely (this CI lint, plus future Worker-side SV enforcement from A1, plus any future guard).
- **ADD** automated lint `scripts/lint-dexie-fixtures.sh` — diff-aware shell script that:
  1. Finds all Dexie schema files in monorepo (heuristic: TypeScript files containing `this.version(`)
  2. Compares head vs base (PR base or `HEAD~1` on push) to compute newly-added `.version(N)` numbers
  3. For each new version N, requires a sibling `__tests__/*.test.ts` file containing a `.version(N-1).stores(` declaration (the canonical fixture pattern)
  4. Exits 1 with actionable error message on violation
- **ADD** CI workflow `.github/workflows/dexie-fixture-lint.yml` — runs the script on every push to `main` and on every PR. Lightweight (no pnpm install needed, just git + grep).
- **ADD** root `package.json` script alias `lint:dexie-fixtures` for local invocation.
- **ADD** `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` documenting the rule, escape hatches, and pattern reference.
- **UPDATE** project root `CLAUDE.md` "Known sharp edges" section with a one-paragraph pointer to the rule.

## Impact

- Affected specs: NEW capability `dexie-schema-guards`.
- Affected code:
  - `scripts/lint-dexie-fixtures.sh` (new file, ~80 lines bash)
  - `.github/workflows/dexie-fixture-lint.yml` (new file, ~30 lines)
  - `package.json` (one new script entry)
  - `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` (new file)
  - `CLAUDE.md` (one new sharp-edges paragraph)
- Affected tests: NONE directly. This is a meta-guard — it enforces tests exist in **future** schema-bumping PRs but does not add runtime tests itself.
- Affected users: zero runtime impact. Only impacts dev workflow.

## Out of Scope

- Backfilling fixtures for existing un-fixtured schema versions (v1 through v20 of `HospitalDB`, v1-5 of `NeuronsDB`, v1-4 of core `StudyRpgDB`). This change enforces forward only — historical absences are tolerated.
- Pre-commit hook installation (e.g., husky / lefthook). Solo-dev workflow doesn't have the infrastructure; `pnpm lint:dexie-fixtures` + CI is sufficient.
- Worker-side `x-amz-meta-schema-version` enforcement on R2 PUT (= A1 / `add-bundle-schema-version-guard`). Separate follow-up change.
- Lint refinement beyond presence check (e.g., assert the fixture seeds duplicate rows, or exercises specific edge cases). Pattern is too varied to enforce structurally; relies on author judgment + code review.

## Acceptance Criteria

- Running `pnpm lint:dexie-fixtures` on `main` HEAD (with no schema bumps) exits 0.
- Synthetic local test: stage a fake `.version(21)` bump in `apps/medexam2-hospital-tw/src/db/schema.ts` WITHOUT adding a `.version(20).stores(` fixture → script exits 1 with clear violation message.
- Synthetic local test: same `.version(21)` bump + add a test file containing `.version(20).stores(` → script exits 0.
- CI workflow runs successfully on a no-schema-change PR (no false positive).
- `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` exists, links to `imports/dexie_pk_change_pitfall.md` + `retirement-tombstone.test.ts:30` as canonical pattern reference.
