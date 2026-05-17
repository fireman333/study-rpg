# cloud-sync Specification

## Purpose

Defines opt-in cross-device sync of gameplay state to Supabase Postgres. IndexedDB stays the authoritative source of truth on every device; the cloud is an additive mirror keyed on `auth.uid()` with Row-Level Security enforcing per-user isolation. Conflicts resolve by last-write-wins on `updated_at`, with explicit user-facing modals for the two ambiguous cases — first-sign-in migration and both-sides-have-data conflicts — so no row is silently overwritten in either direction. Cloud failures NEVER corrupt local data: pulls fail safely (local untouched), pushes queue and retry, and gameplay UI stays responsive throughout.

## Requirements

### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables (player, items, mastery, cosmetic_unlocks, srs_cards, streak; exact set finalized in design.md). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

#### Scenario: User cannot read another user's row
- **WHEN** authed user A queries any cloud-sync table directly (e.g., via Supabase REST) for rows belonging to user B
- **THEN** the response SHALL contain zero rows
- **AND** no error SHALL leak schema or row-existence information

#### Scenario: Insert without user_id is rejected
- **WHEN** any client attempts to INSERT a row without `user_id = auth.uid()`
- **THEN** Postgres SHALL reject the write via RLS policy

### Requirement: Last-write-wins conflict resolution by row timestamp

For every cloud-sync table row, the system SHALL resolve push and pull conflicts by comparing `updated_at`: the newer timestamp wins. Equal timestamps SHALL preserve cloud's value (deterministic tie-break).

#### Scenario: Local newer than cloud — push wins
- **WHEN** client local has row R with `updated_at = T1` and cloud has same row R with `updated_at = T0` where T1 > T0
- **THEN** the next push SHALL overwrite cloud row with local values

#### Scenario: Cloud newer than local — pull wins
- **WHEN** client local has row R with `updated_at = T0` and cloud has same row R with `updated_at = T1` where T1 > T0
- **THEN** the next pull SHALL overwrite local row with cloud values
- **AND** in-memory React state SHALL re-hydrate from updated IndexedDB

### Requirement: Debounced auto-push on local writes

Every IndexedDB mutation to a synced table SHALL enqueue a debounced cloud push. Debounce window SHALL be between 3000ms and 5000ms (configurable). Multiple writes within the window SHALL collapse into a single batch push.

#### Scenario: Single write triggers push after debounce
- **WHEN** an authed user answers one quiz question, mutating `mastery` and `player.xp`
- **AND** waits without further input
- **THEN** within 3-5 seconds the client SHALL push the mutated rows to cloud in a single batch

#### Scenario: Burst writes collapse into one batch
- **WHEN** an authed user answers 5 questions in rapid succession (< 3s between each)
- **THEN** only one push SHALL fire after the last write + debounce window
- **AND** the push payload SHALL contain the latest values of all touched rows

### Requirement: Pull on tab focus

When the browser tab transitions to visible (visibilitychange → "visible"), the app SHALL trigger a pull from cloud to detect cross-device changes.

#### Scenario: Cross-device update visible after focus
- **WHEN** device A pushes new mastery values, then user switches to device B (already authed) and brings tab to foreground
- **THEN** within 2 seconds of tab visible, device B SHALL pull and apply newer rows from cloud
- **AND** updated values SHALL be reflected in UI without page reload

### Requirement: Offline queue defers pushes without blocking gameplay

When the network is unavailable or Supabase requests fail, the app SHALL continue writing to IndexedDB and queue pending pushes locally. On reconnect, the client SHALL flush the queue in original write order.

#### Scenario: Offline writes queue and flush
- **WHEN** an authed user goes offline, answers 10 questions, then comes back online
- **THEN** during offline period IndexedDB SHALL accept all writes without error
- **AND** within 10 seconds of reconnection the client SHALL push all queued writes
- **AND** after flush, cloud row state SHALL match local row state per LWW

#### Scenario: Cloud failure does not block UI
- **WHEN** a cloud push returns 5xx error
- **THEN** the failed batch SHALL remain in the queue for retry with exponential backoff
- **AND** gameplay UI SHALL remain fully responsive

### Requirement: Migration prompt on first sign-in with local save

When a user signs in for the first time and the client detects local IndexedDB has non-default gameplay state AND cloud has no row for this user, the client SHALL show a modal asking how to proceed.

#### Scenario: Modal offers three options
- **WHEN** the migration condition is met
- **THEN** the modal SHALL offer at least: "Upload local progress to this account", "Keep local separate (don't sync)", "Decide later"
- **AND** "Decide later" SHALL re-trigger the prompt on next sign-in until user picks Upload or Keep separate
- **AND** the choice SHALL be persisted (locally) so the prompt does not nag after a definitive answer

#### Scenario: Upload writes local to cloud
- **WHEN** the user picks "Upload local progress"
- **THEN** every synced IndexedDB row SHALL be pushed to cloud with `user_id = current auth.uid()` and current `updated_at`
- **AND** subsequent sync SHALL operate normally (debounced push / focus pull)

#### Scenario: Cloud non-empty defers to conflict chooser
- **WHEN** a user signs in and BOTH local has data AND cloud has data
- **THEN** the migration upload modal SHALL NOT appear
- **AND** the conflict chooser (see next requirement) SHALL handle resolution

### Requirement: Conflict chooser when sign-in detects data on both ends

When a user signs in and the client detects BOTH local IndexedDB has non-default gameplay state AND cloud has at least one row owned by `auth.uid()`, the client SHALL pause automatic sync and show a conflict-resolution modal before any per-row LWW resolution runs.

#### Scenario: Modal offers explicit conflict resolution
- **WHEN** sign-in detects local non-empty AND cloud non-empty
- **THEN** the modal SHALL offer at least three options: "Use cloud (overwrite local)", "Use local (overwrite cloud)", "Decide later (pause sync)"
- **AND** the modal SHALL display each side's last-modified timestamp (max `updated_at` across local rows vs across cloud rows) so the user can tell which side is newer

#### Scenario: Use cloud overwrites local
- **WHEN** the user picks "Use cloud (overwrite local)"
- **THEN** the client SHALL snapshot current local rows into a `local_backup` Dexie table (one-time, for safety)
- **AND** local rows SHALL be replaced by a full pull from cloud
- **AND** sync engine SHALL resume normal operation after the replace completes

#### Scenario: Use local overwrites cloud
- **WHEN** the user picks "Use local (overwrite cloud)"
- **THEN** the client SHALL push every local synced row to cloud with `updated_at = now()` so LWW guarantees local values win over existing cloud rows
- **AND** sync engine SHALL resume normal operation after the push completes

#### Scenario: Decide later pauses sync
- **WHEN** the user picks "Decide later"
- **THEN** sync engine SHALL pause both automatic push and automatic pull
- **AND** local IndexedDB writes SHALL continue uninterrupted during the pause
- **AND** no cloud data SHALL be modified during the pause
- **AND** the user SHALL be able to re-open the conflict modal from a settings entry to make a decision later

#### Scenario: No silent LWW when both non-empty
- **WHEN** the conflict condition is detected at sign-in
- **THEN** no per-row LWW resolution SHALL run until the user picks one of the three options
- **AND** no row SHALL be silently overwritten on either side

### Requirement: IndexedDB remains source of truth; cloud failures never corrupt local

The app SHALL treat IndexedDB as authoritative for read paths. Cloud sync SHALL be additive (mirror) and SHALL NEVER cause local data loss due to network or Supabase errors.

#### Scenario: Pull failure leaves local intact
- **WHEN** a pull request to cloud fails (network / 5xx / parse error)
- **THEN** local IndexedDB SHALL remain unchanged
- **AND** the failure SHALL be logged to `console.warn` only (no user-facing error toast unless repeated > N times — exact threshold in design.md)

### Requirement: Account deletion removes all cloud data

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all rows owned by `auth.uid()` across all cloud-sync tables, then signs the user out.

#### Scenario: Deletion clears cloud rows
- **WHEN** the user opens settings, picks "Delete account data", and confirms
- **THEN** every row in every cloud-sync table where `user_id = auth.uid()` SHALL be deleted
- **AND** the Supabase auth user record SHALL be deleted (or marked for deletion per Supabase Auth API)
- **AND** the user SHALL be signed out
- **AND** local IndexedDB SHALL remain intact (user can keep playing offline if they want)

### Requirement: Account export downloads all cloud data as JSON

The app SHALL provide an export action that bundles every row owned by `auth.uid()` across cloud-sync tables into a single JSON file and triggers a browser download.

#### Scenario: Export bundles all cloud rows
- **WHEN** the user opens settings and clicks "Export cloud data"
- **THEN** the browser SHALL download a JSON file containing all owned cloud rows grouped by table
- **AND** the file SHALL include a top-level `schema_version` field reflecting the cloud schema at export time

### Requirement: Paused-banner reopen entry visually anchored to sibling top-bar controls

WHEN the paused banner displays AND another top-bar control (e.g., AuthButton chip) is concurrently visible, THEN the paused-banner reopen entry SHALL render at a vertical position whose center is aligned with the sibling control's center (≤ 2px tolerance) so the two controls read as a single visual row.

#### Scenario: Paused banner and authed AuthButton co-present

- **WHEN** `sync.gateState === 'paused'`
- **AND** the user is signed in (AuthButton renders as the authed chip variant)
- **THEN** the vertical center of `.sync-paused-banner__btn` and the vertical center of `.auth-button` SHALL differ by no more than 2px at viewport widths ≥ 1024px
- **AND** at viewport widths < 768px (mobile), if banner stacks below the chip due to width reflow, the two SHALL maintain consistent left/right anchoring so the visual relationship remains coherent

#### Scenario: Paused banner standalone (user unauthed or AuthButton hidden)

- **WHEN** `sync.gateState === 'paused'` AND AuthButton is not visible
- **THEN** the reopen entry's position SHALL remain stable (no layout jitter) and SHALL NOT shift when the user signs in/out
