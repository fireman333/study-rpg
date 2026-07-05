## Why

The in-place neurons account reset writes its local reset acknowledgement (localStorage `neurons:lastAckResetAt:<userId>`) **before** the local Dexie wipe completes. If the wipe throws (a Dexie / IndexedDB storage error), the ack is already persisted while local data survives — the cloud is now empty but this device still holds the pre-reset save. On the next pull, `honorResetMarker` sees `reset_at ≤ readAckResetAt` and skips the wipe gate; the next debounced/manual push then re-uploads the un-wiped Dexie data and **silently resurrects the just-reset account to the cloud**, with no error surfaced to the user. This is a pre-existing data-integrity bug surfaced by a health-check on 2026-07-05 (NOT introduced by `fix-neurons-account-switch-prescription-wipe`); the current `neurons-cloud-sync` spec itself prescribes the unsafe ordering (steps 3 then 4).

## What Changes

- Reorder `resetNeuronsAccountData` (`apps/neurons-tw/src/lib/services/account-reset.ts`) so the local reset acknowledgement is written **after** `clearLocalSyncedData` succeeds, not before — i.e. cloud wipe → local wipe → ack, all still inside the one `withPushLock` critical section. This mirrors the already-correct wipe-then-ack order in `honorResetMarker` (`account-guard.ts`).
- Update the ordering-discipline comment block at the top of `account-reset.ts` to match (steps 3/4 swap).
- Add a Vitest asserting: cloud-wipe-ok + local-wipe-throws ⇒ ack is NOT written (so the next pull's `honorResetMarker` still fires the idempotent wipe rather than resurrecting).
- **Note (separate repo, out of scope here):** the 二階 standalone repo (`study-rpg-2nd`) `safeResetAccountData` is the pattern this mirrors; its ordering will be checked and, if the same ack-before-wipe exists, fixed as its own change in that repo.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `neurons-cloud-sync`: the **In-place account reset** requirement's ordering changes — the local reset acknowledgement moves from step (3) to step (4), after the local wipe succeeds (step 3 becomes the local wipe). Its scenarios are updated and one new failure scenario is added: cloud-wipe succeeds but local-wipe throws ⇒ no acknowledgement is written ⇒ the device's next pull re-runs the idempotent (already-empty) wipe instead of resurrecting the reset account.

## Impact

- **Code:** `apps/neurons-tw/src/lib/services/account-reset.ts` (reorder + comment). No schema change (no Dexie bump, no R2 `SCHEMA_VERSION` change, no new synced keys).
- **Tests:** `apps/neurons-tw/src/__tests__/account-reset.test.ts` (new failure-ordering test).
- **Spec:** `openspec/specs/neurons-cloud-sync/spec.md` — "In-place account reset" requirement ordering + scenarios.
- **Behavior:** strictly safer. The reset's success path is byte-identical; only the failure path changes (ack-not-written on local-wipe failure), which converts a silent cloud resurrection into a harmless idempotent re-wipe on the next pull.
- **Out of scope (tracked separately):** `study-rpg-2nd` repo `safeResetAccountData`.
