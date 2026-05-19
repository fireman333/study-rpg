## Why

Today there is no self-serve way to clear progress on the current Google account without nuking the Google identity. The two existing destructive paths — `delete_my_data()` RPC (only callable from the Supabase dashboard) and the "刪除我的雲端資料" button (forces sign-out, treats the account as gone) — neither match the "I want to start over fresh on this same login" UX. Players who finished a dogfood run or want to retry a campaign currently have to ask the developer to run SQL by hand, which is friction the M4.5 launch surfaced.

## What Changes

- Add a `useSync.safeResetAccountData()` method to both apps' sync hook. It snapshots local IndexedDB to `localBackup`, calls the existing `delete_my_data()` RPC, wipes local sync tables, and restarts the engine in-place — all four steps as one ordered, abort-on-error flow.
- Add a 「重置此帳號進度」UI entry guarded by a two-layer safety lock (Layer 1 `window.confirm` listing what gets wiped; Layer 2 `prompt('輸入 RESET')` exact-string check).
  - 一階 (`apps/medexam-tw`): new button in `SettingsPanel.tsx` 資料管理 section, between Export and 刪除雲端資料.
  - 二階 (`apps/medexam2-hospital-tw`): new entry in `HelpMenu.tsx` 帳號 accordion section.
- Reuse already-proven primitives: `snapshotLocalToBackup` (lib/sync/migration.ts), `clearLocalSyncTables` (lib/sync/account-switch.ts), `supabase.rpc('delete_my_data')` (migration 0002), `setResolveTick` pattern (useSync engine restart without auth state change).
- No new Supabase migration, no schema changes, no new RPC.

## Capabilities

### New Capabilities

(none — the capability already exists)

### Modified Capabilities

- `cloud-sync`: ADD a requirement for in-place account reset (wipe cloud + local atomically, snapshot to localBackup first, double-confirmation gate, preserve the signed-in Google identity).

## Impact

- **Code touched (5 files)**:
  - `apps/medexam-tw/src/lib/sync/useSync.ts` — add `safeResetAccountData`
  - `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — mirror impl
  - `apps/medexam-tw/src/components/SettingsPanel.tsx` — add button + `onResetProgress` prop
  - `apps/medexam-tw/src/App.tsx` — wire the prop
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — add 帳號 accordion entry
- **No schema / migration changes** — `delete_my_data()` RPC exists since `0002_account_lifecycle.sql`.
- **Cross-track**: affects both 一階 (`medexam-tw`) and 二階 (`medexam2-hospital-tw`). Develop on `track-m2`, sync back to `main` per project.md merge protocol. Commit messages tagged `affects: both`.
- **Dependencies / external systems**: depends on existing Supabase RPC + RLS already in production; no new env vars, no auth scope changes.
- **Risk**: destructive flow — `delete_my_data` is irreversible on the cloud side; the localBackup snapshot is the only recovery path. Double-confirmation gate is a hard requirement, not optional polish.
