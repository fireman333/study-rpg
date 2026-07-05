## MODIFIED Requirements

### Requirement: In-place account reset wipes cloud, local, and leaderboard while preserving the signed-in identity

neurons-tw SHALL provide a signed-in-gated 「♻ 重置此帳號進度」 entry in the HelpMenu. After a Traditional-Chinese confirmation dialog that enumerates what is destroyed (cloud save, local progress, leaderboard row + nickname release) and what is preserved (device preferences, onboarding records) and states the action is irreversible, the reset SHALL execute in this order: (1) best-effort leaderboard row deletion (a Worker failure logs a warning and does NOT abort), (2) push a reset bundle — empty `data` plus envelope `meta.reset_at` timestamp — which MUST succeed or the whole reset aborts with local data untouched, (3) clear local synced data via the account-guard wipe helper, (4) write the local reset acknowledgement. The acknowledgement SHALL be written only AFTER the local wipe succeeds, so that if the wipe throws no acknowledgement is persisted and the device's next pull re-runs the idempotent (already-empty) wipe gate rather than treating the reset as complete against un-wiped data (which would let the next push resurrect the account). This mirrors the pull-side propagation gate, which likewise clears local data before writing the acknowledgement. Steps (2)–(4) SHALL run inside a single hold of the per-user push lock. The user SHALL remain signed in and the ownership marker SHALL be unchanged.

#### Scenario: Successful reset

- **WHEN** a signed-in player confirms the reset dialog
- **THEN** the cloud bundle is overwritten with an empty snapshot carrying `reset_at`, local synced tables and synced meta keys and `mockExamDrafts` are cleared, device-local meta keys survive, the acknowledgement is written after the local wipe succeeds, the leaderboard row is deleted (nickname freed), and the player stays signed in with an empty fresh state

#### Scenario: Reset-push failure aborts before local damage

- **WHEN** the reset-bundle push fails (network / presign error)
- **THEN** the reset aborts with an error message, no local data has been cleared, no acknowledgement written, and the player can retry

#### Scenario: Local-wipe failure leaves no acknowledgement

- **WHEN** the reset-bundle push succeeds but the subsequent local wipe throws (Dexie / IndexedDB storage error)
- **THEN** no acknowledgement is written, the error surfaces to the caller, and because `reset_at` still exceeds the device's acknowledgement the next pull re-runs the account-guard wipe gate — clearing the still-present local data before any push — so the reset account is NOT resurrected to the cloud

#### Scenario: Leaderboard failure does not block the reset

- **WHEN** the leaderboard deletion call fails but the reset-bundle push succeeds
- **THEN** the reset completes (cloud + local cleared) and the leaderboard残留 is surfaced as retry-able, not as a reset failure
