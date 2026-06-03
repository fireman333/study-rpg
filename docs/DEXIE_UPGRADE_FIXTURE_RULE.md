# Dexie Upgrade Fixture Rule

> Spec home: [`openspec/specs/dexie-schema-guards/spec.md`](../openspec/specs/dexie-schema-guards/spec.md) (after archive)
> Originating change: `enforce-dexie-upgrade-fixture-rule`
> Canonical fixture reference: [`apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts:30`](../apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts)

## What

Any PR or push to `main` that adds a new `.version(N)` declaration to a Dexie schema file in the monorepo must also include a Vitest fixture that:

1. Opens a Dexie instance at **explicit** `v(N-1)` schema (not the full chain)
2. Seeds representative data for that version
3. Closes the v(N-1) DB
4. Reopens with the **full** schema chain (which now reaches v(N))
5. Asserts `.open()` does NOT throw and that data was migrated correctly

The CI workflow `dexie-fixture-lint` (`.github/workflows/dexie-fixture-lint.yml`) enforces this automatically. The lint also runs locally via `pnpm lint:dexie-fixtures`.

## Why

On 2026-05-26, the v1 cut of `add-r2-cloud-sync-migration` (`dac4eae`, reverted by `99eac9b`) shipped a Dexie schema that promoted `retirementLog.doctorId` from a plain secondary index to the primary key. Dexie 4.x rejects primary key changes with `UpgradeError Not yet support for changing primary key`, breaking `med-study-rpg.com/2nd/` + `fireman333.github.io/study-rpg/hospital/` for every existing v18 user.

Standard tooling did not catch it:

| Layer | Why it passed |
|---|---|
| TypeScript | No runtime IndexedDB exec at build time |
| Vitest with `fake-indexeddb` | Tests started DB at the new version → never traversed the upgrade path |
| Local Chrome MCP smoke | `deleteDatabase()` before reopen → also skipped the upgrade path |
| codex adversarial review | Reviewed spec text, not Dexie runtime |

The follow-up `fix-doctor-retire-cloud-resurrection-v2` (shipped 2026-05-27) added §8.12 — a mandatory fixture that opens at v18 with seed data (including duplicate doctorIds) and reopens with the full chain. That fixture caught a second-order regression (`AbortError` from `&doctorId` unique-index activation order) during dev BEFORE prod ship.

This rule generalises §8.12 so the discipline isn't lost between schema bumps.

Background reading: [`~/.claude/imports/dexie_pk_change_pitfall.md`](../../.claude/imports/dexie_pk_change_pitfall.md).

## How to satisfy

When you bump a schema, e.g.:

```ts
// apps/medexam2-hospital-tw/src/db/schema.ts
this.version(21).stores({
  retirementLog: '++id, retiredAt, doctorId, _updatedAt, &replayToken'
})
.upgrade(async (tx) => {
  // migration callback
})
```

Add a fixture file under the schema's sibling `__tests__/` directory. The fixture MUST contain the literal text `.version(20).stores(` so the lint regex matches.

Canonical structure (modelled on `retirement-tombstone.test.ts:30–80`):

```ts
// apps/medexam2-hospital-tw/src/__tests__/upgrade-v21.test.ts
import Dexie from 'dexie'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HospitalDB } from '../db/schema'

describe('v20 → v21 upgrade from existing data', () => {
  const TEST_DB = 'test-upgrade-v20-to-v21'

  beforeEach(async () => { await Dexie.delete(TEST_DB) })
  afterEach(async () => { await Dexie.delete(TEST_DB) })

  it('opens cleanly from v20 with existing rows', async () => {
    // 1. Open at explicit v20 schema (mirror the v20 declaration in HospitalDB)
    const dbV20 = new Dexie(TEST_DB)
    dbV20.version(20).stores({
      retirementLog: '++id, retiredAt, doctorId, _updatedAt'
    })
    await dbV20.open()
    await dbV20.table('retirementLog').bulkAdd([
      { doctorId: 'd1', retiredAt: 1000, _updatedAt: 1000, refund: 100, subjectId: 's1', rarity: 'P3' },
      { doctorId: 'd2', retiredAt: 2000, _updatedAt: 2000, refund: 200, subjectId: 's2', rarity: 'P2' },
    ])
    dbV20.close()

    // 2. Reopen with the FULL HospitalDB chain (which now declares v21)
    const dbFull = new HospitalDB(TEST_DB)
    await expect(dbFull.open()).resolves.not.toThrow()

    // 3. Assert v21 upgrade behaviour (e.g., replayToken backfilled)
    const rows = await dbFull.table('retirementLog').toArray()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // ... additional assertions specific to the v21 upgrade callback
    dbFull.close()
  })
})
```

Key requirements:

- **Open at explicit v(N-1)** — `new Dexie('test-...').version(20).stores({...})`. Do NOT import a constant or use the full class — the lint regex looks for `.version(20).stores(` literally
- **Use a test-specific DB name** — never `'hospital'` or any prod name; pollutes IDB and races with concurrent tests
- **Seed at least one realistic row** — minimum should include any field the upgrade callback touches
- **Reopen with the full class** — `new HospitalDB(TEST_DB)`; this is what triggers the upgrade callback chain
- **Cleanup** — `Dexie.delete(TEST_DB)` in `beforeEach` AND `afterEach` so the test is idempotent

## Where the fixture lives

The lint resolves the test directory by stripping `/db` or `/lib` from the schema file's parent:

| Schema path | Expected test dir |
|---|---|
| `apps/medexam2-hospital-tw/src/db/schema.ts` | `apps/medexam2-hospital-tw/src/__tests__/` |
| `apps/neurons-tw/src/lib/db.ts` | `apps/neurons-tw/src/__tests__/` |
| `packages/core/src/lib/db.ts` | `packages/core/src/__tests__/` |
| `apps/medexam-tw/...` (uses core DB) | tested via `packages/core/src/__tests__/` |

If a future schema lives in a different structure (e.g., `packages/foo/src/storage/db.ts`), the strip rule will resolve to `packages/foo/src/storage/__tests__/`. Either move the test or extend the lint regex.

## Local invocation

```bash
pnpm lint:dexie-fixtures           # default: BASE_REF=origin/main HEAD_REF=HEAD
BASE_REF=HEAD~3 pnpm lint:dexie-fixtures   # check last 3 commits
```

## CI behaviour

The workflow `.github/workflows/dexie-fixture-lint.yml` runs on every push to `main` and every PR targeting `main`, filtered to changes under `apps/**/*.ts`, `packages/**/*.ts`, the lint script itself, or the workflow file.

Base ref resolution:

- **Pull request**: `github.event.pull_request.base.sha` vs `github.event.pull_request.head.sha`
- **Push**: `github.event.before` vs `github.sha` (falls back to `HEAD~1` if `before` is all-zeros, e.g., first push to a branch)

## Escape hatch

`SKIP_DEXIE_FIXTURE_LINT=1` bypasses the check and exits 0 after emitting a banner to stderr. **Use rarely**:

- Emergency hotfix where the lint hits a false positive
- Refactor that drops a schema file entirely (no upgrade to fixture)
- Migration tool that handles its own validation differently

Any bypass commit SHOULD be paired with a follow-up PR that either:

1. Adds the missing fixture (preferred), OR
2. Extends the lint regex / resolution rules to handle the new pattern

## Known limitations

- **Literal `.version(N-1).stores(` regex** — fixtures that factor out the schema string into a constant (e.g., `.version(20).stores(V20_SCHEMA)`) will not match. Intentional: inline schema strings make fixtures self-documenting and resistant to drift in the main code path
- **Strip rule only handles `/db` and `/lib`** — schemas at other paths require either restructuring or a lint regex extension
- **Forward-only** — historical schema versions (e.g., HospitalDB v1–v20 at the time this rule lands) have NO fixture and the lint will not retroactively flag them. Adding a fixture for a historical version is allowed but not required
- **No check for fixture quality** — the lint only verifies a fixture exists, not that it covers realistic edge cases. Author judgment + code review are the backstop

## Cross-references

- Originating change: `openspec/changes/archive/2026-05-27-enforce-dexie-upgrade-fixture-rule/` (after archive)
- Canonical fixture: [`apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts:30`](../apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts)
- v1 incident archive: [`openspec/changes/archive/2026-05-27-fix-doctor-retire-cloud-resurrection-v2/`](../openspec/changes/archive/2026-05-27-fix-doctor-retire-cloud-resurrection-v2/) (esp. tasks.md §8.12)
- Pitfall doc: [`~/.claude/imports/dexie_pk_change_pitfall.md`](../../.claude/imports/dexie_pk_change_pitfall.md)
- Worker-side SV enforcement + runtime push-failure resilience are the two sibling guards completing the schema-evolution cluster. Together with this rule (compile-time), they form three layers of defense: **A3 = this CI lint (compile-time)** → catches missing fixture for `.version(N)` bumps; **A1 = Worker presign SV enforcement (transport-time)** → rejects downgrade PUTs before R2 commits; **A2 = `pushAllNow` conditional dirty-clear (runtime push-failure resilience)** → prevents silent data loss on transient adapter failure. All three live under different specs (`dexie-schema-guards` for A1+A3, `cloud-sync` for A2) but together cover the lifecycle from "developer changes schema" through "client pushes data" through "transient failure recovery".
- Worker-side SV enforcement (sibling guard, shipped 2026-05-27): `add-bundle-schema-version-guard` — Phase 1 opt-in. Worker `/presign` validates client-declared `schema_version` against R2 `customMetadata['schema-version']`, refuses 409 on downgrade, and signs `x-amz-meta-schema-version` into the presigned PUT URL via SigV4 SignedHeaders so the client cannot tamper. Lives in the same `dexie-schema-guards` capability as this lint. See [`cloudflare/sync-worker/src/presign.ts`](../cloudflare/sync-worker/src/presign.ts) + smoke script [`cloudflare/sync-worker/scripts/smoke-presign-sv.sh`](../cloudflare/sync-worker/scripts/smoke-presign-sv.sh). Phase 2 (make `schema_version` REQUIRED) + Phase 3 (remove client-side localStorage guard) are tracked as follow-up changes.
