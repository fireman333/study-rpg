## ADDED Requirements

### Requirement: Google OAuth sign-in flow

The app SHALL provide a "Sign in with Google" action that initiates Supabase OAuth, redirects to Google for consent, and returns to the app with an authenticated Supabase session persisted in browser storage.

#### Scenario: Successful sign-in
- **WHEN** the user clicks "Sign in with Google" and completes Google consent
- **THEN** the app SHALL receive a Supabase session, store it via the Supabase client default storage, and update the UI to reflect the authed state (display user email or avatar, replace sign-in button with sign-out)

#### Scenario: User cancels Google consent
- **WHEN** the user closes the Google consent window before granting permission
- **THEN** the app SHALL remain in the unauthenticated state with no error toast and no broken UI

### Requirement: Session hydration on app load

On every app mount, the app SHALL ask Supabase for the current session before any user interaction, and reflect the result in UI within 500ms of first paint.

#### Scenario: Returning authed user
- **WHEN** the app loads and Supabase reports an active session
- **THEN** the UI SHALL show authed state on first paint (no flash of unauthed UI)
- **AND** sync engine MAY begin background pull

#### Scenario: Returning unauthed user
- **WHEN** the app loads and Supabase reports no session
- **THEN** the UI SHALL show unauthed state with sign-in entry visible
- **AND** sync engine SHALL remain dormant

### Requirement: Sign-out clears session but preserves local data

The app SHALL provide a "Sign out" action that revokes the Supabase session and clears auth-only client state, while leaving IndexedDB gameplay state intact.

#### Scenario: Sign-out preserves local save
- **WHEN** the user signs out
- **THEN** the Supabase client SHALL clear its session
- **AND** the IndexedDB `Player` and `ItemInstance[]` records SHALL remain unchanged
- **AND** the user SHALL be able to continue playing offline immediately

### Requirement: Authentication is opt-in

The app SHALL be fully playable without any sign-in. Cloud sync SHALL be enabled only after successful sign-in, and SHALL NOT block any gameplay flow when offline or unauthed.

#### Scenario: Fresh browser, never signed in
- **WHEN** a user opens the app for the first time without signing in
- **THEN** all gameplay (reading, quiz, loot, equip, SRS review) SHALL work using IndexedDB only
- **AND** no Supabase network call SHALL be attempted

#### Scenario: Signed-in user goes offline
- **WHEN** a signed-in user loses network connectivity
- **THEN** gameplay SHALL continue uninterrupted using IndexedDB
- **AND** unsynced writes SHALL be queued for later (per cloud-sync offline queue requirement)

### Requirement: Sign-in surface is discoverable but unobtrusive

The app shell SHALL expose the sign-in entry point in a consistent location (e.g., header or settings panel) that is visible without obstructing primary gameplay.

#### Scenario: Sign-in button on app shell
- **WHEN** an unauthed user is on any primary route (home, reading, quiz, dorm)
- **THEN** a "Sign in" entry SHALL be reachable within at most one click from the current view
- **AND** the entry SHALL NOT overlap or obstruct the active gameplay area
