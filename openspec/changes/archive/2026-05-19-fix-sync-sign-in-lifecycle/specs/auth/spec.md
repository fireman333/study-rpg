## ADDED Requirements

### Requirement: Account-switch detection on sign-in

The app SHALL track the most-recently-signed-in user identifier in local IndexedDB (`db.meta.last_signed_in_user_id`). On every successful sign-in transition (`onAuthStateChange` → `'SIGNED_IN'`), the app SHALL compare the current `auth.user.id` against the stored value. When the two differ AND local IndexedDB contains non-default gameplay state, the app SHALL pause automatic sync gate computation and render an `AccountSwitchPrompt` modal BEFORE any existing migration-upload or conflict-chooser modal evaluates.

The stored value SHALL be updated only on successful sign-in (NOT on sign-out), so that signing out and back in as the same user does not falsely trigger the prompt.

#### Scenario: Same account returning — no prompt

- **GIVEN** a user previously signed in as Account A AND `last_signed_in_user_id = A.id`
- **AND** they signed out (local state preserved per existing spec)
- **WHEN** they sign in again as Account A
- **THEN** the app SHALL NOT show `AccountSwitchPrompt`
- **AND** the existing migration / conflict gate flow SHALL run normally

#### Scenario: Different account on shared device — prompt fires

- **GIVEN** a user previously signed in as Account A AND `last_signed_in_user_id = A.id`
- **AND** local IndexedDB has non-default gameplay state from Account A's session
- **WHEN** a different user signs in as Account B (B.id ≠ A.id)
- **THEN** the app SHALL render `AccountSwitchPrompt` modal BEFORE any other sync-related modal
- **AND** the automatic gate computation SHALL NOT run until the modal is resolved
- **AND** no Supabase rows SHALL be modified during the prompt-pending state

#### Scenario: First sign-in ever — no prompt

- **GIVEN** `last_signed_in_user_id` IS NULL (user has never signed in before)
- **WHEN** the user signs in for the first time
- **THEN** the app SHALL NOT show `AccountSwitchPrompt`
- **AND** the existing first-sign-in migration flow SHALL evaluate normally

#### Scenario: Prompt offers three explicit options

- **WHEN** `AccountSwitchPrompt` is rendered
- **THEN** the modal SHALL offer at least three options:
  - 「清空本地、改用此帳號的雲端進度」 (clear local sync tables + clear migration-choice meta keys, then proceed with fresh-start gate)
  - 「保留本地進度、合併到此帳號雲端」 (proceed to existing conflict-chooser gate; LWW resolution applies)
  - 「先登出，我用回原本帳號」 (immediate sign-out, no local data touched)
- **AND** the modal SHALL display both side's last-modified timestamps (max `updated_at` from local rows + cloud row count) so the user can make an informed choice

#### Scenario: Clear-local choice resets state

- **WHEN** the user picks 「清空本地」
- **THEN** all synced IndexedDB tables SHALL be cleared (matching the table set defined in `cloud-sync` capability)
- **AND** all `db.meta` keys matching pattern `migration-choice:*` SHALL be removed
- **AND** `last_signed_in_user_id` SHALL be updated to current `user.id`
- **AND** the sync engine SHALL resume with `gateState = 'fresh-start'` (or `'silent-pull'` if Account B's cloud has rows)
- **AND** non-sync local data (cosmetic UI preferences, etc.) SHALL be preserved

#### Scenario: Cancel-sign-out preserves all data

- **WHEN** the user picks 「先登出」
- **THEN** the app SHALL call `supabase.auth.signOut()` immediately
- **AND** no local IndexedDB data SHALL be modified
- **AND** `last_signed_in_user_id` SHALL remain at its previous value (Account A's id)
- **AND** the user SHALL return to the unauthenticated UI state without further prompts

#### Scenario: Detector bypass via env flag

- **GIVEN** the env var `VITE_ACCOUNT_SWITCH_DETECTOR === 'false'`
- **WHEN** a user signs in with a different account
- **THEN** the detector SHALL NOT fire
- **AND** the existing pre-fix sign-in flow SHALL apply (rollback safety)

#### Scenario: Offline sign-in defers verification

- **GIVEN** the device is offline AND a user signs in with cached auth
- **WHEN** account-switch detection runs and cannot verify cloud row count
- **THEN** the modal SHALL show a degraded state explaining online verification is pending
- **AND** the user SHALL still be able to pick 「先登出」 immediately
- **AND** the "清空本地" / "保留本地" choices SHALL be disabled until connectivity returns

### Requirement: 「切換帳號」 settings entry

The app shell SHALL expose a 「切換帳號」 action in the authenticated user's settings surface (一階 `SettingsPanel`, 二階 `HelpMenu` 帳號 section). This action SHALL combine three operations atomically: clear local sync tables, sign out, then re-open the sign-in UI.

The existing 「登出」 action SHALL remain unchanged (per existing "Sign-out preserves local data" requirement) but SHALL gain a tooltip describing the preservation behavior and the account-switch risk.

#### Scenario: 「切換帳號」 clears and re-prompts in one tap

- **WHEN** an authed user clicks 「切換帳號」 in settings AND confirms the warning dialog
- **THEN** all synced IndexedDB tables SHALL be cleared
- **AND** all `db.meta` keys matching pattern `migration-choice:*` SHALL be removed
- **AND** the Supabase session SHALL be revoked
- **AND** the settings panel SHALL close
- **AND** the sign-in modal SHALL open within 500ms

#### Scenario: 「登出」 tooltip explains preservation

- **WHEN** the user hovers (or long-presses on touch) the 「登出」 button
- **THEN** a tooltip SHALL display 「本地進度會保留；下次若用不同帳號登入會詢問如何處理」 (or equivalent locale-correct wording)

#### Scenario: 「切換帳號」 confirmation prevents accidental data loss

- **WHEN** the user clicks 「切換帳號」
- **THEN** a confirmation dialog SHALL appear stating 「將清空本地進度並重新登入。確定？」
- **AND** clicking 「取消」 SHALL leave both auth state and local data untouched
- **AND** clicking 「確定」 SHALL proceed with the clear + sign-out + re-open flow
