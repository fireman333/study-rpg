## Context

`decouple-neurons-subjects-from-nt-branches` (archived 2026-06-06) replaced the 4-neurotransmitter-branch maze economy with an 11-per-family economy. The change touched `lib/maze/economy.ts` (the writer side) and `lib/services/neurons-leaderboard.ts` (one of two reader sides for settles aggregation), but the **leaderboard spec** at `openspec/specs/neurons-leaderboard/spec.md` was not synchronized — it still enumerates the four legacy `maze:da/5ht/gaba/glu:settles` keys in the「Push leaderboard row」 Requirement.

This is the classic「spec drift」 failure mode the dexie-fixture-lint rule was added to prevent for Dexie schema, but there's no equivalent lint for spec-vs-code drift. The audit caught it manually.

The fix is the smallest possible: rewrite the build expression. Code is already correct, so apply is read-only confirmation + regression test.

## Goals / Non-Goals

**Goals:**
- Realign the spec with the per-family settles schema that has been the reality since 2026-06-06.
- Explicitly document the 4-branch legacy keys as retired so a future reader doesn't have to dig through 2026-06-06 archive prose to figure out why they're not listed.
- Add a regression-guard test that pins the per-family aggregation contract.

**Non-Goals:**
- Worker / D1 / KV changes. None needed; the value range and column type are unchanged.
- Touching other settles-related requirements (filter tab definition, KV snapshot, UI cell). They all just consume `total_settles` as an integer; the source of the integer is what changes here.
- Reintroducing the 4-branch keys in any read path. They're retired, full stop.

## Decisions

**Decision 1 — Sum across `FAMILY_IDS` rather than enumerate every family name in spec.** `FAMILY_IDS` is the canonical content-pack-declared list (currently 11 families). Spec language uses the symbol; the actual list lives in `content-neurons-tw`. If a future content pack ships 12 families, the spec reads correctly without edit. *Alternative considered:* enumerate the 11 current families — rejected, brittle, and the symbol-reference matches `lib/maze/economy.ts` and `lib/services/neurons-leaderboard.ts` already.

**Decision 2 — Legacy 4-branch keys are leave-and-ignore, not purge.** Pre-`decouple` saves still physically have these keys in their meta tables; the maze economy already doesn't read them, and removing them would require a new Dexie writer + a migration shape we don't want. *Alternative considered:* purge in the next Dexie bump — rejected, scope creep, no functional benefit; the keys are harmless dead weight.

**Decision 3 — Bundle the `variant_count` source change from change 3 into this MODIFIED text.** Both changes touch the same Requirement; OpenSpec MODIFIED replaces full requirement text on archive. To make archive-order safe, the later-archiving delta must contain a superset of all earlier-archiving deltas to that Requirement. The proposal flags this as an ordering constraint: change 3 archives first, then this change. *Alternative considered:* merge changes 3 and 5 into one — rejected, the gaps are independent and the scope boundaries are cleaner separate.

**Decision 4 — Scenario covers the「legacy keys physically present but not contributing」 edge.** The most informative scenario for a future reader is one that explicitly seeds the legacy keys and asserts they're not added to the sum. *Alternative considered:* test only the happy path — rejected, the whole point of this change is the legacy-key trap.

## Risks / Trade-offs

- **[Archive-order violation: this change archives before change 3] →** Change 3's `variant_count → ownedSlotCount(db)` fix would be overwritten back to `db.neuronVariants` count by this change's MODIFIED text if it archived first AND change 3 hadn't run yet. Mitigation: tasks.md gates archive on confirming change 3 has archived (or rebasing this change's MODIFIED text against the post-change-3 spec). The check is mechanical (`grep ownedSlotCount openspec/specs/neurons-leaderboard/spec.md`).
- **[A future spec edit also touches this Requirement before this change archives] →** Same archive-order issue, more sources. Mitigation: keep the propose batch tight and archive in sequence; if a fresh edit lands first, rebase this change's MODIFIED text.
- **[The implementation already reads per-family keys correctly, so spec edit is purely cosmetic] →** Acknowledged. The value is in catching the regression on the next contributor who reads the spec to implement / refactor.

## Migration Plan

No data migration. No version bump. The spec edit shipping aligns the contract with reality; runtime behavior is unchanged.

Rollback: pure spec revert.
