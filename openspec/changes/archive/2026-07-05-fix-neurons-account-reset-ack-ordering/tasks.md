## 1. Reorder the reset flow

- [x] 1.1 In `apps/neurons-tw/src/lib/services/account-reset.ts`, move `writeAckResetAt(userId, resetAt)` to run AFTER `await clearLocalSyncedData(db)` (wipe-then-ack), keeping both inside the same `withPushLock` callback and after the cloud `pushBundle`.
- [x] 1.2 Update the ordering-discipline comment block at the top of the file so steps (3) and (4) read: (3) clear local synced data, (4) write the local reset acknowledgement — and note the ack-after-wipe rationale (a wipe failure leaves no ack → next pull re-runs the idempotent wipe).

## 2. Test the failure ordering

- [x] 2.1 In `apps/neurons-tw/src/__tests__/account-reset.test.ts`, add a test: cloud-wipe (pushBundle) resolves + `clearLocalSyncedData` throws ⇒ `resetNeuronsAccountData` rejects AND `readAckResetAt(USER_A)` stays 0 (no ack written), so a later `honorResetMarker` would still fire. Mock `clearLocalSyncedData` at the module boundary (partial mock delegating to the real impl by default; `mockRejectedValueOnce` for this case) so sibling tests keep the real wipe behavior.
- [x] 2.2 Confirm the existing "happy path" test still asserts push→wipe→ack (success path unchanged).

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw test` — account-reset suite green (new + existing).
- [x] 3.2 `pnpm -r typecheck` clean.
- [x] 3.3 `openspec validate fix-neurons-account-reset-ack-ordering --strict` passes.
