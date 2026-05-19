## 1. Engine cold-start always force-pull (C1)

- [ ] 1.1 `apps/medexam-tw/src/lib/sync/engine.ts`: remove `COLD_START_FORCE_PULL_THRESHOLD_MS` constant + `longGap` branch inside `start(uid)`; always call `pullAllNow({force:true})` when `!paused`
- [ ] 1.2 Mirror in 二階 `engine.ts`
- [ ] 1.3 `installVisibilityListener()` left unchanged — incremental `pullNow()` on tab focus is still correct for in-session refresh
- [ ] 1.4 Update DEV log `[sync.start]` to reflect new behavior (e.g. `console.log('[sync.start]', { phase: 'force-pull-on-cold-start', userId })`)

## 2. Sign-out flushes pending writes (C2a)

- [ ] 2.1 `apps/medexam-tw/src/lib/sync/useSync.ts`: add `signOutWithFlush()` method on UseSyncReturn — best-effort `await engine.pushAllNow().catch(noop)` → then call `useAuth().signOut()`. Engine cleanup happens reactively via useEffect on authStatus change.
- [ ] 2.2 Mirror in 二階 `useSync.ts`
- [ ] 2.3 `apps/medexam-tw/src/App.tsx`: SettingsPanel `onSignOut` prop now wraps `signOutWithFlush` instead of `signOut`
- [ ] 2.4 `apps/medexam2-hospital-tw/src/components/AuthButton.tsx`: 「登出」 button onClick uses `useSync().signOutWithFlush` instead of `useAuth().signOut`

## 3. Account-switch snapshot + flush (C2b)

- [ ] 3.1 `apps/medexam-tw/src/lib/sync/useSync.ts` `resolveAccountSwitch('clear-local')`: BEFORE `clearLocalSyncTables(db)`, call `await snapshotLocalToBackup(db, accountSwitch!.previousUserId, 'account-switch-clear-local')`
- [ ] 3.2 Mirror in 二階 `useSync.ts` resolveAccountSwitch
- [ ] 3.3 Add `safeAccountSwitch()` to `useSync` return: full sequence (pushAllNow → snapshotLocalToBackup → clearLocalSyncTables → signOut → signInWithGoogle)
- [ ] 3.4 Mirror in 二階 `useSync.ts`
- [ ] 3.5 `apps/medexam-tw/src/App.tsx` SettingsPanel `onSwitchAccount`: replace inline clear+signout with `safeAccountSwitch`; keep window.confirm dialog
- [ ] 3.6 `apps/medexam2-hospital-tw/src/components/AuthButton.tsx` 切換帳號 button: same — call `useSync().safeAccountSwitch` after window.confirm

## 4. SyncStatusChip honest display (C3)

- [ ] 4.1 `apps/medexam-tw/src/components/SyncStatusChip.tsx` `computeVisualState`: when `status === 'idle'` AND `lastPushAt === null AND lastPullAt === null`, return `{ icon: '⚪', label: '待同步', color: '#888' }`; only return `{ 🟢, '已同步' }` when at least one is > 0
- [ ] 4.2 Mirror in 二階 `SyncStatusChip.tsx`
- [ ] 4.3 Remove dead branch (the `recent < 60_000` check that always fell through to green)

## 5. Spec deltas

- [ ] 5.1 `openspec/changes/fix-account-switch-data-loss/specs/cloud-sync/spec.md`: MODIFY "Cold-start force-pull bypasses incremental cursor" (drop 1hr threshold, always force); ADD "Sign-out flushes pending writes"; ADD "Account-switch snapshots local before wipe"; MODIFY "Sync status chip in app header" (待同步 state)
- [ ] 5.2 `openspec/changes/fix-account-switch-data-loss/specs/auth/spec.md`: MODIFY "Sign-out clears session but preserves local data" — add Scenario "Sign-out awaits in-flight push"

## 6. Typecheck + build

- [ ] 6.1 `pnpm --filter @study-rpg/core build` (cold-start prerequisite)
- [ ] 6.2 `pnpm -r typecheck` green
- [ ] 6.3 `pnpm --filter @study-rpg/medexam-tw build` green
- [ ] 6.4 `pnpm --filter @study-rpg/medexam2-hospital-tw build` green
- [ ] 6.5 Bundle delta < +1 KB gzipped per app (this is a small fix, not feature-add)

## 7. Dev verify (this time mandatory before push)

- [ ] 7.1 Start `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (localhost only, no LAN needed since we test PC-only)
- [ ] 7.2 PC localhost → sign in Account A → console: confirm `[sync.start]` log shows force-pull on cold start (not incremental)
- [ ] 7.3 Play one question → wait until SyncStatusChip shows 🟢 已同步 → confirm in console that `__hospitalSync.lastPushAt()` > 0
- [ ] 7.4 Console: `await __hospitalDb.localBackup.count()` → note current count N
- [ ] 7.5 Open AuthButton menu → 切換帳號 → confirm → console: `await __hospitalDb.localBackup.count()` → should be N+1 (snapshot taken)
- [ ] 7.6 Sign in same A account back → confirm data restores (incremental cursor was the bug → now force-pull always brings everything)
- [ ] 7.7 Reload page (cold start, no prior pushes in this session) → before any sign-in actions → confirm SyncStatusChip shows ⚪ 待同步 (not 🟢 已同步)
- [ ] 7.8 Sign in → after engine.start completes pull → chip should flip to 🟢

## 8. Commit (gated)

- [ ] 8.1 User explicit confirm before `git commit`
- [ ] 8.2 Explicit `git add <paths>`
- [ ] 8.3 Commit message:
      ```
      fix(sync): account-switch data-loss regressions + chip honesty (C1+C2+C3)

      Three regressions from fix-sync-sign-in-lifecycle (shipped 04:22 today):

      C1: engine.start() cold-start used 1hr-threshold heuristic for
      force-pull. Re-sign-in within an hour hit incremental pullNow which
      filtered out cloud rows older than lastPullAt cursor → user saw
      empty local even though cloud had everything (user report 04:35).
      Fix: ALWAYS force-pull on cold start. Incremental kept only for
      in-session visibility-change refresh.

      C2: account-switch + signOut wiped local without first flushing
      pending dirty writes or snapshotting local. 3-5s of writes could
      be lost. Fix: signOutWithFlush awaits pushAllNow before signing
      out; safeAccountSwitch awaits pushAllNow + snapshotLocalToBackup
      before clearLocalSyncTables.

      C3: SyncStatusChip showed 🟢 已同步 whenever engine status='idle'
      even when lastPushAt was null (just started, never pushed). User
      thought data was safe, triggered switch → C1 surfaced. Fix:
      ⚪ 待同步 when no completed push/pull; 🟢 only when at least one > 0.

      No data loss for the original reporter — cloud was intact, force-pull
      via chip popover recovered everything. This fix prevents the silent
      pull-skip from happening to others.

      OpenSpec change: fix-account-switch-data-loss
      ```

## 9. Archive + merge + push (gated)

- [ ] 9.1 `/opsx:archive` via slash (NOT raw CLI this time per CLAUDE.md curator rules)
- [ ] 9.2 Commit archive (spec sync + folder move)
- [ ] 9.3 Merge `hotfix/account-switch-data-loss` → `main` (`--no-ff`, gated)
- [ ] 9.4 Push origin main (gated)
- [ ] 9.5 GH Actions deploys (~1 min)
- [ ] 9.6 User confirms 1 live verification: force-pull works automatically on re-sign-in without manual chip tap
