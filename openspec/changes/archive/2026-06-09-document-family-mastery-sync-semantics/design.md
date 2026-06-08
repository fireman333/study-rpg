## Context

The neurons-tw R2 bundle adapter family (`apps/neurons-tw/src/lib/sync/tables.ts`) carries several explicit「don't LWW this」carve-outs already documented in project CLAUDE.md:

- `everWrong` on `questionHistory` — monotonic-OR (locked by `question-history-merge.test.ts`)
- `dmnEventLog` — monotonic-union (locked by `dmn-event-idempotency.test.ts`)
- `equipment` ownership — monotonic-presence (acceleration system)
- `neuronVariants.copies` — per-(familyId, slotIndex) MAX-merge with cross-version tolerance

`familyMastery` belongs to the same family of「accumulator that LWW would corrupt」, and the adapter at `tables.ts:161` already implements per-field MAX. But the capability spec (`openspec/specs/neuron-family-mastery/spec.md`) only describes the on-device write rules — it doesn't lock the merge contract. So the existing correct behavior is **load-bearing but undocumented**: a refactor / port to a new adapter shape could silently regress it without any spec scenario catching the regression.

The 2026-06-08 mechanics audit flagged this as a P2 gap. P1 (DMN entitlement) is being addressed by `tighten-neurons-dmn-entitlement-semantics`; this change handles the next-priority sync-semantic gap.

## Goals / Non-Goals

**Goals:**
- Lock the per-field MAX merge contract in spec so the adapter shape cannot regress to row-LWW unnoticed.
- Document the collapse limitation honestly rather than papering over it.
- Add a Vitest test that pins the merge invariant + the documented collapse, joining the `question-history-merge.test.ts` family of「sync semantics regression guard」 tests.

**Non-Goals:**
- Op-log upgrade. Permitted as a future option in spec, but not required and not implemented here. The collapse limitation is rare (requires two-device simultaneous play with one correct + one incorrect on the same family) and the failure mode is player-favoring (under-counts total attempts, never produces an impossible state).
- Touching other mastery requirements (tier derivation, energy multiplier, chip UI). Those don't have sync-semantic gaps.
- Cross-spec coordination with `neurons-achievements` mastery-* category predicates or the leaderboard `subject_mastery_count` projection. They read the merged state by design and inherit its semantics; no delta needed.

## Decisions

**Decision 1 — MAX per field, not row-LWW or op-log.** The adapter already does this; the spec catches up. Per-field MAX is the lattice join over the monotonic-non-decreasing counter pair `(correct, total)`. *Alternative considered:* row-LWW — rejected, silently swallows the loser's increments. *Alternative considered:* op-log from day one — rejected as scope creep; the projection covers single-device plays correctly (the dominant case) and the worst-case multi-device race under-counts attempts by 1 per simultaneous pair, which is player-favoring (a missed `total` increment lowers the denominator and slightly inflates accuracy in the player's favor).

**Decision 2 — Document the collapse limitation explicitly in spec.** Better to surface the trade-off than to pretend perfection. The collapse cannot regress either counter and cannot violate `total >= correct`; it only collapses two concurrent attempts into one。 *Alternative considered:* hide the limitation, document only the invariants — rejected, future readers should know the failure mode so they can choose to upgrade to op-log if telemetry shows it matters.

**Decision 3 — Cross-device scenario uses asymmetric correct/total values to prove per-field merge, not row-pick.** A symmetric case (both rows numerically identical) would pass under either merge strategy. The chosen scenario `(12, 17)` vs `(11, 19)` can only produce `(12, 19)` under per-field MAX; row-LWW would pick one whole side. *Alternative considered:* a series-of-attempts replay scenario — rejected, harder to read as a single WHEN/THEN; the static round-trip is enough to pin the contract.

**Decision 4 — No Dexie or R2 bump.** The shape of the persisted row is unchanged; only the merge contract is documented. Existing saves work unchanged on both sides of the spec edit.

## Risks / Trade-offs

- **[Apply phase finds the adapter at `tables.ts:161` already matches the tightened spec exactly] →** Best case. Add only the regression-guard Vitest test; no adapter edit.
- **[Future contributor reads spec and assumes op-log is required] →** Spec wording explicitly says「permitted but not required」 and labels the simpler MAX projection as canonical; design notes the failure mode is player-favoring.
- **[Telemetry someday shows the collapse limitation matters enough to justify op-log] →** That's a future change. The spec wording already pre-blesses it; no contract break needed to upgrade.

## Migration Plan

No data migration. The merge already runs as MAX in production code; the spec edit only locks it. No banner, no Dexie bump, no R2 bump, no client-version coordination.
