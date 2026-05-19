## Why

The recently-shipped 「重置此帳號進度」 feature wipes cloud + local data atomically on the device that runs it, but the wipe does NOT propagate to other signed-in devices. Reproducer (real bug report, 2026-05-19): user runs reset on 電腦 → cloud + 電腦 local both empty; opens 手機 (same Google account, already signed in) → presses 「⬇ 立即同步下載」 repeatedly → 手機 local data unchanged. Worse, any subsequent local mutation on 手機 fires the debounced auto-push, **re-uploading stale 手機 rows back to cloud and silently undoing the reset** (resurrection bug). The same trap exists for the migration-upload modal: if 手機 signs out + back in after 電腦's reset, the modal offers 「上傳本機」 which would also resurrect the wiped data.

Root cause: the client-LWW sync engine has no tombstone column and no per-row deletion propagation. `pullAllNow({force:true})` issues `SELECT * FROM <table> WHERE user_id = X` — empty cloud returns 0 rows, the apply loop iterates 0 times, and local Dexie is never touched.

OSS survey across 7 mature sync projects (Anki, RxDB, Replicache, Standard Notes, Bitwarden, Joplin, CouchDB/PouchDB) shows 6/7 use per-row tombstones; the Logseq counter-example (whole-snapshot replacement) is the same architecture as our in-flight `add-r2-cloud-sync-migration` and is documented to fail on deletes ([logseq #7530](https://github.com/logseq/logseq/issues/7530)). Standard Notes and Bitwarden specifically use a per-account "revision marker" pattern for account-wide resets — same shape as this change. With R2 migration replacing the per-row layer in 4–6 weeks, full tombstone columns (~50 LOC across 9 tables + RPC rewrite) would be thrown out wholesale; a single marker row covers the one known propagation case and discards cleanly when R2 lands.

## What Changes

- **NEW Postgres table** `account_metadata`: per-user row carrying `last_reset_at` (the propagation marker) and `schema_version` (reserved for R2 cutover client gating). Standard RLS (`auth.uid() = user_id`) + standard `updated_at` trigger.
- **UPDATED RPC** `delete_my_data()`: after the existing table wipes, `INSERT ... ON CONFLICT DO UPDATE` bumps `account_metadata.last_reset_at = now()` for the calling user. RPC body preserves the existing table list verbatim (the known pre-existing scope-out — `question_bookmarks` and `targeted_tickets` are not wiped today — stays unchanged in this fix to keep the diff surgical).
- **NEW client module** `lib/sync/reset-propagation.ts` (mirror impl in both apps): exposes `fetchCloudResetTimestamp`, `readLocalAckResetAt`, `writeLocalAckResetAt`, and `applyResetPropagationIfNeeded(supabase, userId, db)`. The last one does: fetch cloud `last_reset_at` → compare with `localStorage['study-rpg.sync.lastAckResetAt:<uid>']` → if cloud newer, `snapshotLocalToBackup(db, userId, 'auto-mirror-on-reset')` → `wipeLocalSyncedTables(db)` → write ack to cloud's value.
- **WIRE-IN** at three points in each app's `useSync.ts`:
  1. **Before `computeGateState`** in the sign-in resolution effect — so post-reset sign-in lands in `fresh-start` / `silent-pull` (clean) instead of `migration-upload` (resurrection trap).
  2. **At the start of `forcePull`** (the 「立即同步下載」 button path) — covers the exact reproducer (foreground tab pressing the button manually).
  3. **Inside `safeResetAccountData`** after `delete_my_data` succeeds — read cloud's new `last_reset_at` back and write to local ack, so the resetting device's own cold-start gate doesn't re-fire.
- **NO** changes to per-row LWW, no tombstone columns added, no Dexie schema bump, no engine internal API change. Marker-only mechanism.
- **NOT FIXED IN THIS CHANGE** (deferred): visibility-change pull gate (covers the rare "two tabs same account, one resets" case) — adds engine API surface that R2 will replace anyway. Cold-start + manual force-pull cover the reproducer; same-tab catch-up needs a reload, documented in spec.

## Capabilities

### New Capabilities

(none — extends existing `cloud-sync` capability)

### Modified Capabilities

- `cloud-sync`: ADD requirement for cross-device account-reset propagation via `account_metadata.last_reset_at` marker; MODIFY the account-reset requirement to note the marker bump; MODIFY the force-pull popover button to gate on marker before pulling.

## Impact

- **Code touched (cloud + ~6 client files)**:
  - `supabase/migrations/0011_account_reset_marker.sql` — new migration: account_metadata table + RLS + trigger + `CREATE OR REPLACE delete_my_data()` adding the marker bump
  - `supabase/sanity/account_metadata_rls.sql` — new sanity SQL mirroring existing `bug_reports_rls.sql` pattern
  - `apps/medexam-tw/src/lib/sync/reset-propagation.ts` — new module
  - `apps/medexam-tw/src/lib/sync/useSync.ts` — wire-in at three points
  - `apps/medexam2-hospital-tw/src/lib/sync/reset-propagation.ts` — mirror module
  - `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — mirror wire-in
  - `docs/BUG_REPORTING.md` — no change (this isn't a bug-report pipeline)
- **Schema migration**: 1 new table, 1 RPC `CREATE OR REPLACE`. Applied via Supabase dashboard SQL editor (manual, per existing project convention in `apps/medexam-tw/CLAUDE.md`). Zero data loss on apply; existing `delete_my_data` callers see the same behaviour plus a marker write.
- **Cross-track**: affects both 一階 + 二階. Cloud migration is shared (one Supabase project services both apps). Client mirror impls are written together in this change so neither app lingers with the unfixed bug. Develop on `track-m2`, sync to `main` per project.md merge protocol. Commit tagged `affects: both`.
- **Forward compatibility with `add-r2-cloud-sync-migration`**: R2 blob-bundle LWW naturally propagates deletions (whole bundle replaced atomically). When R2 ships, `account_metadata.last_reset_at` becomes redundant; the table + RPC change can be left in place (cheap) or dropped in a follow-up migration. `schema_version` column gives R2 an in-band signal to force-eject old clients without a second migration.
- **Risk**:
  - Destructive: the new auto-gate wipes local Dexie sync tables on next sign-in / force-pull when cloud signals a newer reset. The `localBackup` snapshot is the recovery surface (same as account-reset / account-switch).
  - Race: a user offline on device B with unpushed edits, then device A resets, then B comes online — B's offline edits go to localBackup, cloud state wins. Documented in spec as expected behaviour.
  - Migration-upload trap: addressed by gating BEFORE `computeGateState` so the modal doesn't show on a reset-after path.
  - Lock-in: if the gate fetch hits a network/RLS error, we log + skip (don't block sync). Worst case: the bug remains until next successful gate fetch.
