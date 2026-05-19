# fix-account-switch-data-loss

## Why

User report 2026-05-19 ~04:35 — after switching from account A → B and back to A, A's local progress was gone. Investigation confirmed cloud was intact (54 doctors, 14 mastery rows, 97 question_history rows in `hospital_*` tables) but client failed to pull. Force-pull via SyncStatusChip popover recovered everything.

Three regressions from `fix-sync-sign-in-lifecycle` (shipped 2026-05-19 ~04:22 in commits `9bbe202` + `a510969` + merge `a5a1ef2`):

### Bug C1 (root cause of this report) — incremental pull cursor blocks cross-session same-user re-sync

`engine.start()` uses cold-start force-pull only when `lastPullAt > 1 hour ago` (M3b threshold). For shorter gaps it falls back to incremental `pullNow(sinceIso=lastPullAt)`. When a user signs out, then signs back in within an hour:

- `localStorage['study-rpg.sync.lastPullAt']` = previous successful pull time (e.g., `04:34:50`)
- Cloud rows have `updated_at = 04:34:41` (when previous user's pushes were applied)
- Incremental query `WHERE updated_at > '04:34:50'` returns 0 rows
- Local appears empty even though cloud has all data

The 1-hour threshold was an arbitrary defensive choice. Correct answer: **cold-start should ALWAYS force-pull** because the incremental cursor only makes sense within a single live engine session (tab-visibility refresh). Across sessions or after account-switch, the cursor reference is broken.

### Bug C2 — account-switch / 切換帳號 don't flush dirty + don't snapshot

- `useSync.resolveAccountSwitch('clear-local')` calls `engine.stop()` then `clearLocalSyncTables(db)`. `engine.stop()` cancels the pending debounced push timer — any writes within the last 3-5 seconds before account-switch are lost.
- `SettingsPanel.onSwitchAccount` (一階) / `AuthButton` 二階 切換帳號 button directly wipe local without `engine.pushAllNow()` first.
- Both wipe paths skip `snapshotLocalToBackup` — unlike the existing `conflict-chooser` "use-cloud" path, there's no `local_backup` safety net for cross-account wipes.

### Bug C3 — SyncStatusChip 「已同步」 misleads when never-synced

`computeVisualState` shows 🟢 已同步 whenever `status === 'idle'`, regardless of whether `lastPushAt` has any value. Right after engine cold-start (before any local writes triggered a push), the chip immediately shows green — user assumes their data is safe and triggers destructive actions like account-switch.

## What Changes

1. **C1 — engine cold-start always force-pull**:
   - Remove `COLD_START_FORCE_PULL_THRESHOLD_MS` constant and `longGap` heuristic
   - `engine.start(uid)` ALWAYS calls `pullAllNow({force:true})` when `!paused` on engine init
   - `installVisibilityListener()` keeps using incremental `pullNow()` (in-session refresh is the only place the cursor is safe)

2. **C2a — Flush dirty before sign-out + account-switch**:
   - `useSync` exposes `signOutWithFlush()`: await any pending `pushAllNow()` (best-effort, ignore errors) → then `supabase.auth.signOut()`
   - `SettingsPanel.onSignOut` (一階) + `AuthButton` 二階 sign-out button use `signOutWithFlush` instead of raw `signOut`

3. **C2b — Snapshot local before any account-switch wipe**:
   - `useSync.resolveAccountSwitch('clear-local')`: BEFORE `clearLocalSyncTables`, call `snapshotLocalToBackup(db, accountSwitch.previousUserId, 'account-switch-clear-local')`
   - 「切換帳號」 menu button (`SettingsPanel.onSwitchAccount` 一階 + `AuthButton` 二階): expose a `safeAccountSwitch` from `useSync` that does:
     1. `await pushAllNow()` (flush dirty)
     2. `await snapshotLocalToBackup(db, currentUserId, 'switch-account-menu')`
     3. `await clearLocalSyncTables(db)`
     4. `await signOut()`
     5. `signInWithGoogle()` (optional re-open)
   - Both callers use `safeAccountSwitch` instead of inline clear+signout

4. **C3 — SyncStatusChip honest display**:
   - `computeVisualState`: when `status === 'idle'` AND `lastPushAt === null AND lastPullAt === null`, return `{ icon: '⚪', label: '待同步' }` (engine started but no completed push or pull yet)
   - Only return `{ icon: '🟢', label: '已同步' }` when at least one of `lastPushAt`/`lastPullAt` > 0

## Impact

### Affected specs

- `cloud-sync`: MODIFY existing "Cold-start force-pull bypasses incremental cursor" requirement (remove 1hr threshold) + ADD "Sign-out flushes pending writes" + ADD "Account-switch snapshots local before wipe" + MODIFY existing "Sync status chip" requirement (待同步 state)
- `auth`: MODIFY existing "Sign-out clears session but preserves local data" — add scenario "Sign-out awaits in-flight push before signing out"

### Affected code (both apps)

- `apps/medexam-tw/src/lib/sync/engine.ts` — remove threshold + always force on start
- `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` — same
- `apps/medexam-tw/src/lib/sync/useSync.ts` — add `signOutWithFlush` + `safeAccountSwitch` + snapshot in resolveAccountSwitch
- `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — same
- `apps/medexam-tw/src/App.tsx` — pass `signOutWithFlush` to SettingsPanel; SettingsPanel onSwitchAccount uses `safeAccountSwitch`
- `apps/medexam2-hospital-tw/src/components/AuthButton.tsx` — use `useSync().signOutWithFlush` + `safeAccountSwitch` instead of inline
- `apps/medexam-tw/src/components/SettingsPanel.tsx` — prop signature update (signOutWithFlush callback)
- `apps/medexam-tw/src/components/SyncStatusChip.tsx` — 待同步 state
- `apps/medexam2-hospital-tw/src/components/SyncStatusChip.tsx` — same

### No schema changes

No Supabase migrations needed. `local_backup` table already exists (Dexie v4).

### Behavior changes

- **Existing user signs out, signs in again** (any device): on next sign-in, will see one extra `pullAllNow` (full cloud download) instead of empty incremental. Bandwidth: ~10-30 KB JSON per user. Latency: +200-500ms before UI hydrated.
- **Sign-out**: takes ~200ms longer if there's pending dirty writes (waits for push). Acceptable trade-off vs data loss.
- **Cross-account scenarios**: `local_backup` table grows by ~10-50 KB per account-switch event. Append-only by design (per existing cloud-sync spec).

### Out of scope (not addressed this round)

- Visibility-change pull also force? — incremental is still correct for in-session refresh; cost not worth full pull on every tab focus
- Periodic full-sync reconciliation timer — separate observability change
- Migration of existing `local_backup` snapshots to a UI for recovery — future feature

### Verification

This time: dev verify required before push (not skipped like last round). Specifically:
1. Localhost dev server, console-verify `engine.start()` triggers `pullAllNow` (force-pull) not `pullNow` on cold start (look for new console log + LAN/DB row counts after force)
2. Inject dirty writes immediately before signout via `__hospitalSync.pushNow`-triggering — confirm `pushAllNow` fires before signOut
3. Trigger 「切換帳號」 menu → inspect `db.localBackup.toArray()` in console → confirm new snapshot row created
4. Reload page when no prior pushes — chip shows ⚪ 待同步 not 🟢 已同步
