## Context

`LeaderboardPage` was authored pre-`add-neurons-deploy` with optional `userId / accessToken / fallbackDisplayName` props and a comment that they'd be wired when Supabase auth landed. Auth did land (`lib/auth/AuthContext.tsx` + `<AuthGate/>` mounted in `App.tsx`, consumed by `useSync.ts`), but the `/leaderboard` route was never updated to pass the props — it still renders `<LeaderboardPage />` bare. Every opt-in / settings surface is gated on those props, so they never render. The leaderboard has only ever shown its anonymous read-only view.

## Goals / Non-Goals

**Goals:**
- Make the opt-in modal + settings controls render for signed-in users, by sourcing auth inside `LeaderboardPage` from the same `AuthContext` the rest of the app uses.
- Prevent silent regression by writing the auth-sourcing contract into the spec.

**Non-Goals:**
- Changing any opt-in / nickname / push behaviour (those requirements are correct; only their reachability was broken).
- Touching the sign-in flow (`AuthGate`), the Worker, D1, Dexie, or R2.
- Adding a leaderboard-specific sign-in CTA (signed-out users use the existing app sign-in; the leaderboard stays read-only when anonymous).

## Decisions

**D1 — Self-source via `useAuth()`, drop the props.** `LeaderboardPage` calls `useAuth()` (valid: the route is inside `<AuthProvider>`) and derives `userId = user?.id ?? null`, `accessToken = session?.access_token ?? null`. This mirrors `useSync.ts` (`const { status, user } = useAuth()`) — one consistent auth source. The props are removed rather than kept as optional overrides: the sole consumer is the bare `App.tsx` route (no props passed), so overrides would be dead configurability (simplicity principle). `App.tsx` needs no edit.

**D2 — `fallbackDisplayName` from Supabase user metadata.** Google OAuth populates `user.user_metadata`. Derive `user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? user?.email ?? undefined` — used by the opt-in modal as the nickname placeholder / blank-nickname fallback. `user_metadata` values are typed `any` on the Supabase `User` type, so a `String(...)`-safe read (or `as string | undefined`) keeps TypeScript happy.

**D3 — Anonymous path unchanged.** When signed out, `user`/`session` are null → `userId`/`accessToken` null → the existing `userId && accessToken` gates stay closed → read-only browse view, exactly as today. No new behaviour for anonymous users.

## Risks / Trade-offs

- **Can't fully verify the signed-in path in automation.** Driving Google OAuth headlessly is out of scope. Mitigation: verify the anonymous view has no regression via Chrome MCP + typecheck + tests; the owner confirms the opt-in modal/settings appear once signed in post-deploy. The wiring is mechanically simple (mirror of `useSync.ts`), so confidence is high.
- **`user_metadata` shape varies by provider.** Only Google OAuth is configured; the `name ?? full_name ?? email` chain covers Google's fields and degrades to `undefined` (the modal then just shows its default placeholder) — no crash.
- Low blast radius: one file, no schema/transport/dependency change, client-only deploy.
