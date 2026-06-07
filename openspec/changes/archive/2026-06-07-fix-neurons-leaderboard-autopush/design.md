## Context

`apps/neurons-tw` mirrors gameplay state to the cloud via an opt-in sync engine. The engine ([`engine.ts`](apps/neurons-tw/src/lib/sync/engine.ts)) exposes two completion hooks: `onPullComplete(result)` (fires only when a pull actually changed local state) and `onPushComplete()` (fires after a successful push, no args). `pushNow()` (`engine.ts:75-95`) runs `pushBundle`, and on success sets `state='idle'`, clears `lastError`, then `await this.onPushComplete?.()` inside its own try/catch — so **`onPushComplete` is success-only** for neurons' single bundle (no per-bundle partial-failure case like 二階's three bundles).

`useSync.ts` wires `onPullComplete` (→ `runOnPullComplete` backfill) but **omits `onPushComplete`**. The leaderboard client adapter ([`neurons-leaderboard.ts`](apps/neurons-tw/src/lib/services/neurons-leaderboard.ts)) already exposes everything needed: `buildLeaderboardPayload(nickname, isPublic)` (pure Dexie reads), `pushNeuronsLeaderboardRow(token, payload)` (POST upsert), `getLeaderboardProfile(userId)` (returns `{ opted_in, is_public, nickname, last_pushed_at, ... }`). The manual paths (`LeaderboardSettingsControls.handleManualPush`, `LeaderboardOptInModal`) call exactly these.

## Goals / Non-Goals

**Goals:**
- After each successful sync push, an opted-in player's leaderboard row auto-upserts to the Worker — no manual 同步 needed for rank to track gameplay.
- Reuse existing helpers; zero new Worker / schema / migration surface.
- Be loop-safe and best-effort: never spin the push engine, never break sync on a leaderboard error.

**Non-Goals:**
- Throttling / coalescing leaderboard upserts beyond the engine's existing push debounce (owner chose the direct fix). Revisit only if telemetry shows Worker/D1 load.
- Pushing for non-opted-in players or auto-creating a row for someone who never opted in.
- Any change to the manual opt-in / settings-resync / nickname paths (they stay as-is).
- Surfacing leaderboard-push errors in the UI (silent `console.warn` is sufficient — the manual path remains the user-visible sync surface).

## Decisions

**D1 — Wire `onPushComplete` in `useSync.ts` with an opted-in gate.**
```ts
onPushComplete: async () => {
  try {
    const profile = await getLeaderboardProfile(user.id)
    if (!profile || !profile.opted_in) return            // gate: opted-in only
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    const payload = await buildLeaderboardPayload(profile.nickname, profile.is_public)
    await pushNeuronsLeaderboardRow(token, payload)
  } catch (err) {
    console.warn('[leaderboard] auto-upsert on push failed', err)
  }
},
```
Token comes from `supabase.auth.getSession()` (the `supabase` client + `user` are already in the hook closure) — the manual components receive `accessToken` as a prop, but the hook resolves it itself. Gate on `opted_in` (mirrors `LeaderboardSettingsControls.tsx:63`); payload carries `profile.is_public` (mirrors `handleManualPush`, so an opted-out-but-still-opted-in player keeps `is_public=0` server-side).

**D2 — The auto-push hook performs NO synced-table write (loop-safety).** `leaderboardProfile` and `meta` are in `SYNCED_TABLES` (`useSync.ts:20-28`); `attachTableHooks` calls `engine.schedulePush()` on any create/update/delete to them. The manual `handleManualPush` writes `last_pushed_at` back to the profile — harmless for a user-initiated one-shot, but on the auto path it would re-trigger `schedulePush` → (debounce) → `pushNow` → `onPushComplete` → write → … an unbounded push loop firing every `debounceMs` even when the player is idle. Therefore the auto hook deliberately **drops the `last_pushed_at` write**. `buildLeaderboardPayload` is read-only and `pushNeuronsLeaderboardRow` only does a `fetch`, so with the profile write removed the hook touches no Dexie synced table → no re-trigger. (`last_pushed_at` only feeds the manual-push cooldown timer, which the auto path doesn't use.)

**D3 — Rely on engine's success-only firing; no extra clean-push guard.** Unlike 二階's `firstError === null && !anyOffline` (three bundles), neurons pushes one bundle; `onPushComplete` is already inside the `pushNow` success branch, so reaching the hook means the push succeeded.

## Risks / Trade-offs

- **Upsert frequency during active play**: a leaderboard upsert can fire as often as the push debounce allows (~every 3 s of continuous Dexie activity). At ~1k-player scale a single cheap D1 UPSERT per few seconds per active player is acceptable; if load ever matters, add a client-side min-interval (e.g. 30–60 s) in the hook — explicitly deferred (Non-Goal). Documented so a future reader doesn't mistake the absence of throttle for an oversight.
- **`buildLeaderboardPayload` cost per push**: several small Dexie `toArray()`/`get()` reads + badges derivation each push. Tables are small; cost is negligible. Acceptable.
- **Regression guard**: the loop-safety property (no synced-table write on the auto path) is subtle and easy to reintroduce by "helpfully" adding `last_pushed_at`. Locked by a unit test (T-test below) + an inline comment at the call site.
