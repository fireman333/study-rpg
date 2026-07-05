## Context

`resetNeuronsAccountData` (`apps/neurons-tw/src/lib/services/account-reset.ts`) performs an in-place reset while keeping the player signed in. Under one `withPushLock` critical section it does: (2) push an empty reset bundle (must succeed), (3) `writeAckResetAt`, (4) `await clearLocalSyncedData`. The acknowledgement (localStorage `neurons:lastAckResetAt:<userId>`) is this device's promise that it has already honoured `reset_at`, so its own next pull skips the wipe gate (`honorResetMarker`).

The failure that matters: neurons merges are monotonic (MAX / UNION / first-write-wins), so any pre-reset row that survives locally will be re-uploaded and re-merged — irreversibly. The reset's whole job is to guarantee the local pre-reset data is gone before the ack claims completion.

## Goals / Non-Goals

**Goals:**
- Make the local reset acknowledgement causally depend on the local wipe having succeeded.
- No behavior change on the success path; no schema/sync change.
- Keep the same single `withPushLock` critical section.

**Non-Goals:**
- No change to the pull-side gate (`honorResetMarker`) — it already clears local data before writing the ack (wipe-then-ack).
- No new retry/rollback machinery, no user-facing copy change.
- The 二階 `study-rpg-2nd` `safeResetAccountData` audit/fix is a separate change in that repo.

## Decisions

**Decision: write the ack after the local wipe (wipe-then-ack), not before.**
The ack is a claim of "local is clean for this `reset_at`." A claim must not be persisted before the fact it asserts is true. Reordering to (2) cloud wipe → (3) local wipe → (4) ack makes the two possible post-cloud-wipe failure points both safe:
- **Local wipe throws** → ack not written → `reset_at` still exceeds the device ack → next pull's `honorResetMarker` clears the still-present local data before any push. Idempotent, no resurrection.
- **Ack write throws** (after a successful wipe) → local is already empty → next pull re-runs the wipe against already-empty tables. Harmless.

Under the old order, a local-wipe throw left the ack persisted while data survived → the gate is silently disarmed → the next push resurrects the account with no error surfaced. That is the bug.

*Alternative considered — try/catch the wipe and roll back the ack on failure.* Rejected: strictly more code and state than simply not writing the ack until the wipe returns; the reorder achieves the same guarantee with zero added branches.

*Alternative considered — leave code, only fix the spec.* Rejected: the code is the defect; the spec merely documents the same unsafe order and must be corrected in lockstep.

**Decision: mirror the already-correct `honorResetMarker`.** That function (the pull-side gate) does `clearLocalSyncedData` then `writeAckResetAt`. Making the reset path match removes the last wipe-vs-ack ordering outlier in the codebase, so the invariant "ack is never persisted ahead of a successful wipe" holds on both the push (reset) and pull (propagation) sides.

## Risks / Trade-offs

- [The success path must stay byte-identical] → Covered by the existing "happy path" test asserting push→ack→wiped state; only the relative order of two already-in-lock operations changes.
- [A test that forces the local wipe to throw must not corrupt the shared fake-indexeddb `db` for sibling tests] → Mock `clearLocalSyncedData` at the module boundary (partial mock delegating to the real implementation by default; `mockRejectedValueOnce` for the failure case), so no test relies on closing/deleting the singleton `db`.

## Migration Plan

Pure code + spec edit. No data migration, no Dexie version bump, no R2 `SCHEMA_VERSION` change, no deploy-config change. Rollback = revert the commit; already-reset accounts are unaffected either way (the change only alters the local-wipe-failure path).
