# neurons-leaderboard (delta)

## ADDED Requirements

### Requirement: LeaderboardPage SHALL source the authenticated session from the app AuthContext

The neurons-tw `LeaderboardPage` SHALL obtain the current authenticated user and access token from the app's `AuthContext` (`useAuth()`), NOT from externally-passed props. It SHALL derive `userId` from `user?.id`, `accessToken` from `session?.access_token`, and a fallback display name from `user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? user?.email`. The route element (`<Route path="/leaderboard" element={<LeaderboardPage />}>`) therefore requires no auth props.

This ensures the opt-in modal and the leaderboard settings controls — both gated on a present `userId` + `accessToken` — actually render for a signed-in player, and that this reachability cannot silently regress from an un-wired route. When no user is signed in, `userId` / `accessToken` SHALL be null and the page SHALL show only the read-only browse view (no opt-in modal, no settings controls).

#### Scenario: Signed-in player sees the opt-in / settings surfaces

- **WHEN** a player who is signed in (the app `AuthContext` reports a non-null `user` + `session`) opens the `/leaderboard` route and has not yet opted in or dismissed
- **THEN** `LeaderboardPage` SHALL derive `userId` + `accessToken` from `useAuth()` and the opt-in modal SHALL render
- **AND** the `LeaderboardSettingsControls` section SHALL render (containing the「公開到排行榜」toggle, nickname editor, and manual-push button)

#### Scenario: Signed-out visitor sees only the read-only view

- **WHEN** a visitor with no authenticated session opens the `/leaderboard` route
- **THEN** `useAuth()` yields null `user` / `session`, so `userId` and `accessToken` SHALL be null
- **AND** the opt-in modal and the settings controls SHALL NOT render
- **AND** the ranking tabs + Top-100 grid + footer disclosures SHALL still render (read-only browse)

#### Scenario: Route element passes no auth props

- **WHEN** the `/leaderboard` route is declared in `App.tsx`
- **THEN** it SHALL render `<LeaderboardPage />` with no `userId` / `accessToken` / `fallbackDisplayName` props
- **AND** `LeaderboardPage` SHALL be self-sufficient via `useAuth()` (the route is mounted within `<AuthProvider>`)
