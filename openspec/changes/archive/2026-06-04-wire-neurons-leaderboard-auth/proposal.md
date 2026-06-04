## Why

The neurons-tw leaderboard opt-in is **unreachable**. `App.tsx` renders `<Route path="/leaderboard" element={<LeaderboardPage />} />` with no props, but `LeaderboardPage` gates both the opt-in modal (`showOptInModal && userId && accessToken`) and the settings controls (`userId && accessToken`) on `userId`/`accessToken` props that are never passed. So the opt-in modal, the「公開到排行榜」toggle, the nickname editor, and the manual-push button **never render — even for signed-in users**. No one can join the leaderboard. The page's Props comment said auth would be "wired in `add-neurons-deploy`", but it never was. This pairs with the just-fixed missing-prod-D1-table issue: the neurons leaderboard shipped as non-functional scaffolding end-to-end.

## What Changes

- `LeaderboardPage` self-sources the authenticated session from the app's `AuthContext` via `useAuth()` (the same hook `useSync.ts` already uses) instead of from external props. Derives `userId = user?.id`, `accessToken = session?.access_token`, `fallbackDisplayName = user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? user?.email`.
- Removes the now-unused `userId? / accessToken? / fallbackDisplayName?` Props. The only consumer is the bare `App.tsx` route, which needs no change (the route is already inside `<AuthProvider>`, so `useAuth()` is valid).
- Anonymous (signed-out) users keep the read-only browse view (no auth → gates stay closed, as designed).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-leaderboard`: add one requirement specifying that `LeaderboardPage` SHALL source the authenticated session from the app `AuthContext` (not external props), so the opt-in / settings reachability cannot silently regress again. The existing opt-in requirements are unchanged in intent — this makes the implementation actually meet them.

## Impact

- **Client**: `apps/neurons-tw/src/routes/LeaderboardPage.tsx` only (add `useAuth()`, derive the three values, drop the Props). No `App.tsx` change.
- **No** Worker / D1 / Dexie / R2 / dependency change.
- **Deploy**: client-only (CF Pages on main push, or `pnpm deploy:cf`). No Worker redeploy, no D1 migration.
- **Verify**: typecheck + existing tests + Chrome MCP that the anonymous read-only view still renders (no regression). The signed-in opt-in path needs the owner to confirm post-deploy (Google OAuth can't be driven in automation).
- **Out of scope**: the leaderboard backend (Worker / D1) — fixed in `realign-neurons-leaderboard-to-maze`; the sign-in flow itself (`AuthGate`, already wired).
