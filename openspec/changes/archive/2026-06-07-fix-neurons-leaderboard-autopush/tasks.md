## 1. Wire onPushComplete in useSync

- [x] 1.1 In `apps/neurons-tw/src/lib/sync/useSync.ts`, add an `onPushComplete` callback to the `createSyncEngine({...})` options (alongside the existing `onPullComplete`).
- [x] 1.2 In the callback: read `getLeaderboardProfile(user.id)`; return early if `!profile || !profile.opted_in`. (Extracted to `autoPushLeaderboardOnSync` in `neurons-leaderboard.ts`.)
- [x] 1.3 Resolve the JWT via `supabase.auth.getSession()` → `data.session?.access_token`; return early if absent.
- [x] 1.4 Build payload with `buildLeaderboardPayload(profile.nickname, profile.is_public)` and push via `pushNeuronsLeaderboardRow(token, payload)`.
- [x] 1.5 **Loop-safety**: do NOT write `last_pushed_at` (or anything else) back to `leaderboardProfile`/`meta`/any synced table in this hook. Inline comment added at both the call site and the helper.
- [x] 1.6 Wrap the body in try/catch → `console.warn('[leaderboard] auto-upsert on push failed', err)`.

## 2. Test (loop-safety + gating)

- [x] 2.1 `apps/neurons-tw/src/__tests__/leaderboard-autopush.test.ts`: asserts upsert (POST + Bearer + /upsert URL) when `opted_in === true`.
- [x] 2.2 Asserts no-op when profile undefined / `opted_in === false` / no token.
- [x] 2.3 LOOP-SAFETY assertion: `last_pushed_at` unchanged (null) after the call → no synced-table write.
- [x] 2.4 Extracted testable helper `autoPushLeaderboardOnSync(opts)`; useSync wiring is a one-liner calling it.

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw test` green — 390/390 (incl. new 6).
- [x] 3.2 `pnpm -r typecheck` clean.
- [x] 3.3 `pnpm lint:dexie-fixtures` clean (no schema change).
- [x] 3.4 Chrome MCP smoke (DEV, signed in as owner): **gate + no-loop verified** — not-opted-in → 0 upserts; with a temp opted-in profile + fetch-intercept, the upsert count never climbed across idle (0/0/0 trajectory) and the auto-push wrote no synced table (`last_pushed_at` unchanged). **Positive upsert path could NOT be exercised live**: cloud push fails in local dev (`r2_push_exhausted: Failed to fetch` — R2 presign/PUT blocked from localhost, pre-existing + unrelated to this change), so `onPushComplete` never reaches the success branch in dev. The positive path (fires POST + Bearer + /upsert when opted-in) is covered deterministically by the unit test (`leaderboard-autopush.test.ts`). No console errors from the new wiring. **Will exercise end-to-end in prod where pushes succeed.**
