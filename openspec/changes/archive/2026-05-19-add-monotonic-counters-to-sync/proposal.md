## Why

User-reported friction after the just-shipped `add-reset-account-progress` + `add-reset-propagation-marker` chain: running 「重置此帳號進度」 leaves `monotonicCounters.totalStudyMinutes` (the 累積唸書 minutes shown in the home banner) at its pre-reset value because that Dexie table is **not** in the cloud-synced surface and therefore not in `wipeLocalSyncedTables` / `delete_my_data`. The mismatch between "reset wipes everything" UX expectation and the carved-out `monotonicCounters` design ("永久保留，不會因換機或重置而流失" per `HelpMenu.tsx` copy) surfaces as "I just reset, why is reading time still 7.7?". Same gap also means `fateCardBadLuckPity` (bad-luck pity counters for fate cards) is per-device — playing on phone vs. computer accumulates independent pity counts, which contradicts the cross-device sync model used by every other gameplay table.

## What Changes

- **NEW Postgres table** `public.hospital_monotonic_counters (user_id uuid PK, data jsonb, updated_at timestamptz, app_version text)` — singleton-per-user shape identical to existing `hospital_state` / `mentor_backlog`. RLS `auth.uid() = user_id` for all CRUD. Standard `updated_at` trigger.
- **UPDATED RPC** `upsert_lww` (new migration, `CREATE OR REPLACE` per convention): extend whitelist + dispatch with the new singleton branch. LWW semantic.
- **UPDATED RPC** `delete_my_data` (same migration): append `DELETE FROM public.hospital_monotonic_counters WHERE user_id = uid` so reset clears it cloud-side. The marker bump (added in `add-reset-propagation-marker`) is preserved.
- **NEW client adapter** `monotonicCounters → hospital_monotonic_counters` in `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`. Register in `HOSPITAL_ADAPTERS`. Singleton shape.
- **UPDATED wipe / snapshot paths** (二階 only):
  - `wipeLocalSyncedTables` (`lib/sync/migration.ts`) adds `db.monotonicCounters.clear()`.
  - `clearLocalSyncTables` (`lib/sync/account-switch.ts`) adds `db.monotonicCounters.clear()`.
  - `snapshotLocalToBackup` (`lib/sync/migration.ts`) snapshots monotonicCounters into `localBackup` so reset / use-cloud-overwrite has a recovery surface.
  - `HospitalLocalBackupRecord` type gains a `monotonicCounters` field.
- **UPDATED copy** `HelpMenu.tsx`: remove the sentence 「累積唸書時間（min）會永久保留，不會因換機或重置而流失。」 — the design no longer guarantees that.
- **NO** Dexie schema bump (monotonicCounters table already exists since v8). NO new client-side behaviour beyond cloud sync + reset wipe.

## Capabilities

### New Capabilities

(none — extends existing `cloud-sync` capability)

### Modified Capabilities

- `cloud-sync`: ADD `hospital_monotonic_counters` to the synced-table list; ADD it to the `upsert_lww` whitelist; note the `delete_my_data` wipe extension.

## Impact

- **Code touched (~7 files)**:
  - `supabase/migrations/0012_hospital_monotonic_counters.sql` — new table + RLS + trigger + `CREATE OR REPLACE upsert_lww` (whitelist + new dispatch branch) + `CREATE OR REPLACE delete_my_data` (added DELETE)
  - `supabase/sanity/hospital_monotonic_counters_rls.sql` — manual sanity SQL mirroring existing patterns
  - `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — new adapter + add to HOSPITAL_ADAPTERS
  - `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` — update wipeLocalSyncedTables + snapshotLocalToBackup + HospitalLocalBackupRecord type
  - `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` — update clearLocalSyncTables
  - `apps/medexam2-hospital-tw/src/db/schema.ts` — extend HospitalLocalBackupRecord type
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — copy edit
- **Schema migration**: 1 new table, 2 RPCs updated. Applied via `supabase db push`. Zero data loss on existing users; their current monotonicCounters values stay in local Dexie and push to cloud on first sync after migration applies.
- **Cross-track**: **二階 only**. 一階 has no `monotonicCounters` table (verified by Dexie schema audit; 一階 reading sessions live in `readSessions` table which is local-only, separate concern). Mirror impl not needed.
- **Forward compatibility with `add-r2-cloud-sync-migration`**: under R2 blob bundle, `monotonicCounters` becomes part of the 二階 m2-snapshot bundle. This per-row LWW approach is fully replaced when R2 ships; no separate migration burden.
- **Risks**:
  - **LWW regression on monotonic fields**: cross-device LWW means a device with older `totalStudyMinutes` value but newer `updated_at` can overwrite a device with higher value. Documented trade-off; in practice the active device usually has the newest `updated_at` AND the highest value. Future: server-side per-field MAX-merge.
  - **`freshCorrectSinceLastTicket` reset semantic preserved by LWW**: this field DOES reset to 0 when a ticket is granted; LWW is correct for it (the reset write has the newest `updated_at`).
  - **Existing user migration**: first sync after deploy will push current local value to cloud. Multi-device users will see whichever device syncs first set the cloud baseline; subsequent devices LWW-overwrite based on `updated_at`. Some users may see a one-time small regression (one session's minutes). Acceptable.
  - **Copy change**: removing 「永久保留」 from HelpMenu must be done in the same release as the wipe-list extension; otherwise UI lies about behaviour.
