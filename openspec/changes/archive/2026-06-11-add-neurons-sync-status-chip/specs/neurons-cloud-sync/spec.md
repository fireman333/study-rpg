# neurons-cloud-sync — Delta Spec (add-neurons-sync-status-chip)

## ADDED Requirements

### Requirement: Sync status light with one-click manual sync

WHEN a user is signed in and the sync engine is mounted, the header auth pill SHALL display a three-state sync light: 🟢 synced (idle, no error — tooltip shows last successful push time, or 「尚未同步」 when never pushed), 🟡 syncing (a push or pull in flight — clicks are no-ops), 🔴 sync failed (tooltip carries the error message and invites retry). Clicking the light SHALL trigger a manual sync (force pull, then push). The light SHALL NOT render when signed out, when auth is disabled, or while the account-switch gate is pending. The light SHALL add no more than a single emoji's width to the pill (RWD constraint — no second pill, no header overflow at 375px).

#### Scenario: Push failure becomes visible

- **WHEN** a debounced push fails (network error / Worker outage) while the player keeps playing
- **THEN** the header light turns 🔴 with the error in its tooltip, instead of the failure being visible only in the developer console

#### Scenario: Manual sync round-trip

- **WHEN** the player clicks the 🟢/🔴 light
- **THEN** the client force-pulls the cloud bundle and then pushes local state, the light shows 🟡 while in flight, and returns to 🟢 on success

#### Scenario: Hidden when not applicable

- **WHEN** the user is signed out, auth is disabled, or the account-switch confirmation dialog is pending
- **THEN** no sync light renders in the header
