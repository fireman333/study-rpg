## Why

`neuron-family-mastery` defines `correct` and `total` as monotonic-increment counters and pins atomicity with the connectome AP write, but says **nothing about cross-device merge**. The R2 bundle adapter at `apps/neurons-tw/src/lib/sync/tables.ts:161` already does the right thing (per-field `Math.max(local, incoming)` on both `correct` and `total`), but the spec doesn't lock it in — a future contributor reading the spec sees「Dexie row」 and reaches for plain row-LWW, which would silently swallow concurrent device answers (the same failure family as the `everWrong` monotonic-OR and `dmnEventLog` monotonic-union carve-outs already documented in `CLAUDE.md`).

This matters because mastery counters feed at least four downstream systems: mastery tier derivation (gates achievements), the energy multiplier (real gameplay numbers), the achievement-stats builder (mastery-* category unlock predicates), and the leaderboard `subject_mastery_count` projection. Silently swallowing answers there means the same gameplay action on device A and device B produces tier / multiplier / achievement state that diverges from a single-device user's lifetime trajectory.

The implementation is already correct. The spec needs to catch up so the contract is locked.

## What Changes

- **MODIFY `neuron-family-mastery`**: the per-family tracking requirement gains explicit cross-device merge semantics: `correct` and `total` each merge by monotonic-MAX per field; plain row-LWW SHALL NOT be used; the `total ≥ correct` invariant SHALL be preserved by the merge (which it is, trivially, given MAX is applied independently and both fields are monotonic non-decreasing on every same-device write).
- The documented limitation (two concurrent same-day attempts on two devices can collapse into one, because both write `correct N+1` / `total N+1` independently and MAX collapses them) is acknowledged in spec rather than papered over. Op-log upgrade (append-only `(familyId, isCorrect, deviceId, attemptedAt)` rows merged by monotonic-union) is documented as a future option, not required now.
- Add a cross-device merge scenario to the tracking requirement.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-family-mastery`: per-family tracking requirement gains a normative「monotonic-MAX per field」merge clause and a cross-device scenario. No other requirement in the spec changes.

## Impact

- **Specs**: 1 modified (`neuron-family-mastery`). No new capability spec.
- **Code**: best-case zero — the adapter at `tables.ts:161` already matches the tightened spec. Apply phase audits the existing adapter and confirms; only edits if a divergent code path is found.
- **Persistence**: no Dexie bump, no R2 `SCHEMA_VERSION` bump. The `familyMastery` table shape is unchanged. The sync-semantics requirement documents existing intent, not a new shape.
- **Test**: a single Vitest unit test asserts the MAX-merge invariant + the documented collapse limitation (one round-trip exercising both fields, no real Dexie / no R2 round-trip — pure adapter call).
- **Validator / lint**: `pnpm lint:dexie-fixtures` not triggered (no schema bump). `openspec validate` runs against the 1 modified spec.
