## Why

In `apps/neurons-tw`, the cloud-sync engine already defines and fires an `onPushComplete` hook on every **successful** push ([`engine.ts:85-89`](apps/neurons-tw/src/lib/sync/engine.ts)), but [`useSync.ts:45-53`](apps/neurons-tw/src/lib/sync/useSync.ts) only wires `onPullComplete` — it never passes `onPushComplete`. As a result the player's neurons leaderboard row (`variant_count` / `total_AP` / `synapse_strong`-equivalent / `total_study_min` / `total_settles` / `badges_csv`) is upserted to the Worker **only on manual user action**: first opt-in (`LeaderboardOptInModal.tsx`) or settings re-sync / nickname change / re-enable (`LeaderboardSettingsControls.tsx`).

So after ordinary gameplay — collecting variants, answering questions, accruing reading minutes, lighting maze nodes — the server-side standing goes stale until the player happens to revisit leaderboard settings and press 手動同步. This directly undercuts the design intent that collecting / answering / reading should climb the leaderboard and drive motivation. The 二階 app already does the correct thing (project `CLAUDE.md`: "Push hook 在 sync engine `onPushComplete` 成功 callback").

This is a wiring oversight, not a design choice — the engine支援 is present and unused.

## What Changes

- Wire `onPushComplete` in `useSync.ts` so that after every successful sync push the player's leaderboard row is auto-upserted to the Worker, reusing the existing `buildLeaderboardPayload` + `pushNeuronsLeaderboardRow` helpers (the same path the manual buttons call).
- **Gate**: the auto-upsert fires only for players who have opted in (`leaderboardProfile.opted_in === true`); the payload carries the player's current `is_public` flag (mirroring the manual `handleManualPush`). Players who never opted in get no server row created.
- **Loop-safety (critical)**: the auto-push hook MUST NOT write `last_pushed_at` back to `leaderboardProfile`, because that table is a member of `SYNCED_TABLES` and a write would re-trigger `schedulePush` → push → hook → … an unbounded ~3s push loop even while idle. `last_pushed_at` only feeds the manual-push cooldown UI and is not needed on the auto path.
- **Best-effort**: the hook is wrapped so a leaderboard-upsert failure (network / 401 / Worker drop) is logged on the `[leaderboard]` channel and never breaks the sync engine. (`onPushComplete` already fires success-only, so no extra clean-push guard is needed for neurons' single-bundle push.)
- No throttle in v1 — the owner chose the direct fix over the throttled variant; the engine's upstream push debounce (`VITE_SYNC_DEBOUNCE_MS`, default 3000 ms) already bounds frequency, and the Worker upsert is a single cheap D1 UPSERT.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-leaderboard`: MODIFY the existing requirement *"Push leaderboard row SHALL be triggered on cloud sync when wired (deferred), with manual-push button as interim"* — the deferred cloud-sync wiring is now implemented: an opted-in player's row auto-upserts from the sync engine's `onPushComplete` after each successful push, with the loop-safety constraint that the auto path performs no synced-table write. The manual opt-in / settings / opt-out paths are unchanged.

## Impact

- **Code**: `apps/neurons-tw/src/lib/sync/useSync.ts` (wire `onPushComplete`); reuses `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` (`buildLeaderboardPayload`, `pushNeuronsLeaderboardRow`, `getLeaderboardProfile`) unchanged. Token sourced via `supabase.auth.getSession()` (already available in the hook's closure).
- **No schema / sync-protocol change**: no Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump, no D1 migration, no Worker change.
- **Scope**: `apps/neurons-tw` only. Does not touch 二階 (standalone repo) or the removed medexam-tw.
- **Tests**: add a unit/integration test asserting (a) the hook upserts when opted-in, (b) it no-ops when not opted-in, (c) it performs no `leaderboardProfile`/`meta` write (loop-safety).
- **Behavioral**: opted-in players' leaderboard rank refreshes automatically during play; non-opted-in players unaffected.
