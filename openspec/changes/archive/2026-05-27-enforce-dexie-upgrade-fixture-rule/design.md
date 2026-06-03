# Design — enforce-dexie-upgrade-fixture-rule

## Context

The v1 R2 sync migration (`dac4eae`, reverted) broke prod for every existing v18 user because Dexie 4.x silently rejected the pk change at runtime. Layered defenses failed:

| Layer | Why it didn't catch the v1 incident |
|---|---|
| TypeScript | No runtime IDB exec at build time |
| Vitest with `fake-indexeddb` | Tests started DB at the new version → never traversed the upgrade path |
| Local Chrome MCP smoke | `deleteDatabase()` before reopen → also skipped the upgrade path |
| codex adversarial review | Reviewed spec text, not Dexie runtime |
| `imports/dexie_pk_change_pitfall.md` | Memory file written AFTER the incident |

AAD-v2 §8.12 added a Vitest fixture that explicitly opens at v18 schema with seed data including duplicate doctorIds, then reopens with the full HospitalDB chain. This caught a second-order regression during dev (Codex Attack 1: `&doctorId` unique-index activation order → `AbortError`) before prod ship. The fixture works.

But §8.12 is a one-time discipline buried in a tasks.md checklist. The next schema bump (whoever does it, whatever app) will not know to add the fixture, and the next Dexie 4.x limit (or any other upgrade-time constraint) will be rediscovered in prod.

## Goals

- **Forward enforcement, not retroactive cleanup.** New `.version(N)` declarations require a fixture. Existing un-fixtured versions stay tolerated (would need ~30 fixtures to backfill 4 apps × ~8 versions average).
- **Diff-aware.** Only fail when a version is *added* to a file's `.version(N)` set, not on every CI run.
- **Light infrastructure.** Pure bash + grep + git. No new dependencies. No husky/lefthook installation overhead for solo dev.
- **Clear failure message.** Tell the author exactly which schema file, which version, where the fixture should live, and where the canonical pattern is.
- **Cross-track compatible.** Works on `main`, `track-m2`, `track-neurons`, hotfix branches identically.

## Non-Goals

- Validate fixture *quality* beyond presence (e.g., does it seed real edge cases, does it assert on dedup, does it cover all upgrade callback branches). Too varied to enforce structurally; relies on code review + the canonical pattern doc.
- Pre-commit hook. CI catches it before merge; `pnpm lint:dexie-fixtures` is the manual-run path.
- Auto-generate fixtures. Schema authors know the seed data they need.

## Decisions

### Decision 1 — Lint at the shell-script layer, not TypeScript

**Choice**: Shell + grep, not a TS / vitest plugin.

**Rationale**:
- Zero install cost. Bash + grep + git are always available in GH Actions and on dev machines.
- Independent of which package the schema lives in (core, app, future packages).
- Runs in CI in < 5 seconds (no pnpm install).
- Easy to read and debug (~80 lines bash vs ~200 lines of TS plugin scaffolding).

**Trade-off**: Bash is harder to unit test. Mitigated by: (a) write the script idempotent (run twice → same result), (b) include 2-3 synthetic test invocations in tasks.md acceptance, (c) keep regex patterns simple and named.

### Decision 2 — Detect schemas heuristically, not by hardcoded path list

**Choice**: `git ls-files 'apps/**/*.ts' 'packages/**/*.ts' | xargs grep -l 'this\.version('`.

**Rationale**:
- Future-proof: when a new app or package gets a Dexie schema, no script update needed.
- Avoids the `apps/*/src/db/schema.ts` glob from §13.3, which is too narrow — current schemas live at:
  - `apps/medexam2-hospital-tw/src/db/schema.ts` (HospitalDB, v1-20)
  - `apps/neurons-tw/src/lib/db.ts` (NeuronsDB, v1-5) — different filename
  - `packages/core/src/lib/db.ts` (StudyRpgDB, v1-4) — different package layer

**Trade-off**: Might falsely match non-Dexie classes if someone writes `this.version(2)` in unrelated code. Mitigated by: also requiring `.stores(` in the same file, which is Dexie-specific.

### Decision 3 — Fixture detection: grep for `.version(N-1).stores(` in nearest `__tests__/`

**Choice**: For each new version N in schema file at `<dir>/<sub>/<schema>.ts`, look for any `__tests__/*.test.ts` under `<dir>/` containing the literal `.version(N-1).stores(`.

**Rationale**:
- This is the canonical pattern from AAD-v2 §8.12 (see `retirement-tombstone.test.ts:46,112,143`).
- Other patterns (e.g., importing a constant `V18_SCHEMA` then `.version(18).stores(V18_SCHEMA)`) would not match. **This is intentional**: the explicit inline schema string is what makes the fixture self-documenting and resistant to schema string drift in the main code. Authors who want to factor it out can update the lint regex when the need arises.
- Heuristic is overshoot-tolerant: if someone writes the fixture differently (e.g., grep for `version(N-1)` without `.stores(`), the lint will fail and they can either reformat the test OR submit a follow-up to relax the regex with rationale.

**Trade-off**: Author of a future fixture must use literal `.version(N-1).stores(` syntax. Documented in `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`.

### Decision 4 — Test dir resolution: strip `db` or `lib` from schema's parent dir

**Choice**: `<schema_dir>/db/...ts` and `<schema_dir>/lib/...ts` both resolve to `<schema_dir>/__tests__/`.

**Rationale**:
- HospitalDB at `apps/medexam2-hospital-tw/src/db/schema.ts` → tests at `apps/medexam2-hospital-tw/src/__tests__/` ✓
- NeuronsDB at `apps/neurons-tw/src/lib/db.ts` → tests at `apps/neurons-tw/src/__tests__/` ✓
- core StudyRpgDB at `packages/core/src/lib/db.ts` → tests at `packages/core/src/__tests__/`. Core has no `__tests__/` yet; first schema bump after this lands will need to create one. That's fine.

**Trade-off**: If a future schema lives in a different structure (e.g., `packages/foo/src/storage/db.ts`), the strip rule needs updating. Documented as Known Limitation in `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`.

### Decision 5 — Base ref selection

**Choice**:
- On `pull_request` event: `BASE_REF = github.event.pull_request.base.sha`
- On `push` event: `BASE_REF = ${{ github.event.before }}` (commit SHA before the push). Falls back to `HEAD~1` if `before` is `0000000` (initial push).
- Manual local: default `BASE_REF=origin/main`.

**Rationale**:
- PR mode catches violations before merge.
- Push mode catches direct-to-main pushes (owner's primary workflow — no PRs).
- Local mode lets owner run `pnpm lint:dexie-fixtures` before push to catch early.

**Trade-off**: For push events, comparing against `before` means the lint runs over every push, even if no schema file changed. Mitigated by `paths:` filter in workflow YAML restricting trigger to TS files.

### Decision 6 — Capability: new `dexie-schema-guards`, not extension of `persistence`

**Choice**: Create new capability `dexie-schema-guards`. Future A1 (Worker SV enforcement) belongs here too.

**Rationale**:
- `persistence` is about runtime behaviour (what gets persisted, when, recovery on quota error). A CI lint rule about how schemas evolve is meta — different category.
- Future A1 (`add-bundle-schema-version-guard`) is also a schema-evolution guard, but at the Worker layer. Co-locating it with this CI lint makes the capability cohesive.
- Avoids spec-content mixing in `persistence`.

**Trade-off**: One more capability to track. Acceptable — capabilities are cheap, and the cluster of guards is a real domain.

### Decision 7 — Escape hatch: env var `SKIP_DEXIE_FIXTURE_LINT=1`

**Choice**: Honour `SKIP_DEXIE_FIXTURE_LINT=1` env to bypass the lint, with a banner echo'd to stderr explaining why this should be rare.

**Rationale**:
- Emergencies happen. If owner needs to ship a hotfix that touches an unrelated schema area and the lint goes sideways (false positive), having no escape hatch is worse than having one with friction.
- Banner ensures bypass is visible in CI logs / commit history.

**Trade-off**: Could be abused. Mitigated by: (a) emit banner LOUDLY, (b) recommend in docs that bypass commits be paired with a follow-up PR to either add the fixture or fix the lint regex.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| False positive: lint flags a schema file that isn't actually Dexie | P3 NPC | Heuristic requires both `this.version(` AND a `.stores(` somewhere in file; failure message clearly shows the file path; SKIP escape hatch available |
| False negative: author writes fixture in non-canonical syntax → lint passes but fixture doesn't exercise upgrade path | P2 頂級 | Documented canonical pattern in `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` and `retirement-tombstone.test.ts` as reference. Code review backstop |
| Schema file path drift (e.g., new package puts schema at `lib/storage/db.ts`) | P3 NPC | Test dir resolution rule documented as Known Limitation; future change can extend resolver |
| CI runtime increase | P5 拉完了 | Script is < 5s including git diff; well below GH Actions billable minute granularity |
| Author bypasses lint via SKIP env var to ship broken code | P3 NPC | Banner emit makes bypass loud; rule is "bypass is exceptional, follow-up PR required to restore" — code review enforces |

## Alternatives Considered

### A. Vitest plugin that auto-discovers upgrade tests

**Rejected**: Requires plugin scaffolding (~200 lines TS), runs only after pnpm install (slow CI), depends on vitest version, harder to reason about than 80-line bash.

### B. Pre-commit hook via husky/lefthook

**Rejected**: Adds devDependency, requires `pnpm prepare` discipline, can be bypassed with `--no-verify`. CI catches it before merge, which is the actual safety net.

### C. Mandate filename convention (e.g., `__tests__/schema-upgrade-vN.test.ts`)

**Rejected**: Forces fixtures into a separate file, but the §8.12 pattern co-locates with the feature test (`retirement-tombstone.test.ts` covers both retirement behaviour AND the v18→v19 fixture). Keeping fixtures co-located with the feature they upgraded for is more maintainable.

### D. Hardcode list of schema file paths

**Rejected**: Three apps + core + future packages = list will drift. Heuristic discovery is more robust.

### E. Use `git diff` content to detect new versions rather than `git show` snapshot diff

**Rejected**: `git diff` output is noisier (unified format with context lines, ± markers). Comparing snapshot version sets via `comm -23` is unambiguous.

## Open Questions

None — design is small and well-bounded by §13.3 wording + §8.12 reference pattern.
