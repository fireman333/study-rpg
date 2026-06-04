# Tasks — wire-neurons-leaderboard-auth

## 1. Wire auth into LeaderboardPage

- [ ] 1.1 In `apps/neurons-tw/src/routes/LeaderboardPage.tsx`, import `useAuth` from `../lib/auth/AuthContext`.
- [ ] 1.2 Replace the `Props` destructure with `useAuth()` derivation: `const { user, session } = useAuth()`; `const userId = user?.id ?? null`; `const accessToken = session?.access_token ?? null`; `const fallbackDisplayName = (user?.user_metadata?.name as string | undefined) ?? (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? undefined`.
- [ ] 1.3 Remove the now-unused `Props` interface (`userId? / accessToken? / fallbackDisplayName?`) and the function param. Confirm all existing internal references (loadProfile effect, handleOptedIn, opt-in modal render, settings render, my-rank chip) still compile against the derived locals.
- [ ] 1.4 Confirm `App.tsx` needs no change (`<Route path="/leaderboard" element={<LeaderboardPage />} />` stays bare).

## 2. Verify

- [ ] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` → 0 errors.
- [ ] 2.2 `pnpm --filter @study-rpg/neurons-tw test` → green (no test asserts the old props signature; fix any that do).
- [ ] 2.3 `/opsx:verify` — completeness / correctness / coherence.
- [ ] 2.4 Chrome MCP (dev or prod): anonymous `/leaderboard` still renders the 6 tabs + grid + footer, no opt-in modal, console clean (no-regression for signed-out). Signed-in opt-in path is owner-confirmed post-deploy.

## 3. Ship

- [ ] 3.1 `/opsx:archive` (sync delta → main spec) → explicit per-file `git add` (LeaderboardPage.tsx + the archived change) → `git diff --cached --name-status` confirm → commit.
- [ ] 3.2 Merge track-neurons → main + push (client-only — no Worker / D1 step this time).
- [ ] 3.3 Client deploy (CF Pages auto on main push). Verify `gh run list --branch main` shows Deploy Cloudflare Pages green.
- [ ] 3.4 **Owner-confirm post-deploy**: sign in on `med-study-rpg.com/neurons/leaderboard` → the opt-in modal appears (first visit) and the settings section is present.
