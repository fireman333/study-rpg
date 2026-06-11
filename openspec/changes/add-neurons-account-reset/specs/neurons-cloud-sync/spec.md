# neurons-cloud-sync — Delta Spec (add-neurons-account-reset)

> Note: this capability is introduced by `fix-neurons-account-switch-guard` (not yet archived). The requirements below are additive to that change's delta; archive that change first (or bulk-archive together).

## ADDED Requirements

### Requirement: In-place account reset wipes cloud, local, and leaderboard while preserving the signed-in identity

neurons-tw SHALL provide a signed-in-gated 「♻ 重置此帳號進度」 entry in the HelpMenu. After a Traditional-Chinese confirmation dialog that enumerates what is destroyed (cloud save, local progress, leaderboard row + nickname release) and what is preserved (device preferences, onboarding records) and states the action is irreversible, the reset SHALL execute in this order: (1) best-effort leaderboard row deletion (a Worker failure logs a warning and does NOT abort), (2) push a reset bundle — empty `data` plus envelope `meta.reset_at` timestamp — which MUST succeed or the whole reset aborts with local data untouched, (3) write the local reset acknowledgement, (4) clear local synced data via the account-guard wipe helper. The user SHALL remain signed in and the ownership marker SHALL be unchanged.

#### Scenario: Successful reset

- **WHEN** a signed-in player confirms the reset dialog
- **THEN** the cloud bundle is overwritten with an empty snapshot carrying `reset_at`, local synced tables and synced meta keys and `mockExamDrafts` are cleared, device-local meta keys survive, the leaderboard row is deleted (nickname freed), and the player stays signed in with an empty fresh state

#### Scenario: Reset-push failure aborts before local damage

- **WHEN** the reset-bundle push fails (network / presign error)
- **THEN** the reset aborts with an error message, no local data has been cleared, no acknowledgement written, and the player can retry

#### Scenario: Leaderboard failure does not block the reset

- **WHEN** the leaderboard deletion call fails but the reset-bundle push succeeds
- **THEN** the reset completes (cloud + local cleared) and the leaderboard残留 is surfaced as retry-able, not as a reset failure

### Requirement: Cross-device reset propagation via bundle reset marker

The bundle envelope SHALL support an optional `meta.reset_at` (epoch ms). WHEN a pull decodes a bundle whose `reset_at` is greater than the device's local acknowledgement for the signed-in user (localStorage `neurons:lastAckResetAt:<userId>`), the client SHALL clear local synced data and write the acknowledgement BEFORE applying the bundle's adapter rows. A bundle without `reset_at`, or with `reset_at` ≤ the local acknowledgement, SHALL apply normally with no wipe.

#### Scenario: Stale device converges on next pull

- **WHEN** device B holds pre-reset local data and pulls after device A performed a reset
- **THEN** device B wipes its local synced data before applying the (empty) bundle, acknowledges `reset_at`, and does not resurrect pre-reset data on its subsequent pushes

#### Scenario: Acknowledged device does not re-wipe

- **WHEN** a device whose acknowledgement already equals the bundle's `reset_at` pulls again
- **THEN** the bundle applies normally with no additional wipe (including the resetting device's own first post-reset pull)

### Requirement: Reset marker carry-forward and schema-version fence

Every bundle push SHALL carry forward the device's acknowledged `reset_at` (when non-zero) in the envelope, so post-reset gameplay pushes never erase the propagation marker. The bundle `SCHEMA_VERSION` SHALL be bumped to 22 alongside the `reset_at` introduction, so the existing Worker schema-version guard (409 on lower-version push presign) fences pre-reset clients: a stale client that has not loaded the new code can still pull (forward tolerance) but cannot push data that would resurrect the account or strip the marker.

#### Scenario: Post-reset gameplay keeps the marker

- **WHEN** the resetting device answers new questions after the reset and a debounced push fires
- **THEN** the pushed bundle contains the new gameplay rows AND the same `reset_at`, so later-syncing devices still receive the reset signal

#### Scenario: Stale-version client cannot resurrect

- **WHEN** a client running the previous bundle schema version attempts a push after any v22 bundle has landed
- **THEN** the push presign is refused by the existing Worker guard and no pre-reset data reaches the cloud; the client recovers by reloading the app
