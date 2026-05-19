# Tasks

## 1. Spec delta

- [x] 1.1 Draft `specs/cloud-sync/spec.md` delta — MODIFY schema-mirror requirement to include `hospital_monotonic_counters`; MODIFY upsert_lww whitelist requirement bumping table count; (optionally) ADD scenario verifying reset-propagation clears the new table.
- [x] 1.2 `openspec validate add-monotonic-counters-to-sync --strict` passes.
- [x] 1.3 User confirms spec wording.

## 2. Cloud migration

- [x] 2.1 Create `supabase/migrations/0012_hospital_monotonic_counters.sql`:
  - `CREATE TABLE public.hospital_monotonic_counters (user_id uuid PK REFERENCES auth.users ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), app_version text)`
  - `ENABLE ROW LEVEL SECURITY` + 4 policies (SELECT / INSERT / UPDATE / DELETE) each gated on `auth.uid() = user_id`
  - Standard `updated_at` trigger (reuse `set_updated_at_timestamp` if exists, else inline plpgsql function)
  - `CREATE OR REPLACE FUNCTION public.upsert_lww(...)` — body = 0009 verbatim + whitelist entry `'hospital_monotonic_counters'` + new `ELSIF table_name = 'hospital_monotonic_counters' THEN` branch (singleton dispatch like hospital_state)
  - `CREATE OR REPLACE FUNCTION public.delete_my_data(...)` — body = 0011 verbatim + `DELETE FROM public.hospital_monotonic_counters WHERE user_id = uid;` (BEFORE the marker upsert)
  - Re-grant EXECUTE on both functions to `authenticated`
- [x] 2.2 Create `supabase/sanity/hospital_monotonic_counters_rls.sql` mirroring `account_metadata_rls.sql` (anon blocked / own-CRUD ok / cross-user denied / cascade-delete works).
- [x] 2.3 Apply via `supabase db push`; verify with sanity SQL.

## 3. Client adapter — 二階 only

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`:
  - Add new `monotonicCountersAdapter`: `dexieTable: 'monotonicCounters'`, `postgresTable: 'hospital_monotonic_counters'`, `shape: 'singleton'`, snapshotDirty / snapshotAll / applyToLocal following the `gameCounters → hospital_state` adapter pattern.
  - Add to the `HOSPITAL_ADAPTERS` array.
- [x] 3.2 In `apps/medexam2-hospital-tw/src/db/schema.ts`:
  - Extend `HospitalLocalBackupRecord` type with `monotonicCounters: MonotonicCountersRow | null`.
- [x] 3.3 In `apps/medexam2-hospital-tw/src/lib/sync/migration.ts`:
  - `snapshotLocalToBackup` — Promise.all add `db.monotonicCounters.get('singleton')`; populate `monotonicCounters` field in the record.
  - `wipeLocalSyncedTables` — add `db.monotonicCounters` to transaction tables + `await db.monotonicCounters.clear()`.
- [x] 3.4 In `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts`:
  - `clearLocalSyncTables` — add `db.monotonicCounters` to transaction tables + `await db.monotonicCounters.clear()`.
- [x] 3.5 In `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`:
  - Line 47: remove the sentence `「累積唸書時間（min）會永久保留，不會因換機或重置而流失。」` from the 唸書 section copy. Replace with a corrected sentence acknowledging that reset / use-cloud-overwrite will clear it, OR just drop the sentence if redundant with other reset-related copy.

## 4. Verification

- [x] 4.1 `pnpm -r typecheck` — clean.
- [x] 4.2 Chrome MCP E2E:
  - (a) Preflight `list_connected_browsers`
  - (b) Sign in dev二階; verify `monotonicCounters.singleton.totalStudyMinutes` has a value > 0 (from existing data)
  - (c) Verify cloud `hospital_monotonic_counters` for this user is empty pre-mutation
  - (d) Trigger a Dexie write to `monotonicCounters` (e.g., increment via console: `db.monotonicCounters.update('singleton', { _updatedAt: Date.now(), totalStudyMinutes: prev + 0.001 })`)
  - (e) Wait > 3 sec for debounced push; verify cloud row populated with the new value
  - (f) Trigger `safeResetAccountData` via console; verify cloud `hospital_monotonic_counters` is empty AND local `monotonicCounters` was cleared (or re-seeded with default singleton at totalStudyMinutes=0 if the engine recreates it)
  - (g) Verify `account_metadata.last_reset_at` was bumped (reset-propagation marker)
- [x] 4.3 `/simplify` review on the touched files.
- [x] 4.4 `/opsx:verify` — 3-dim check.

## 5. Archive

- [x] 5.1 User reviews + nods → `/opsx:archive add-monotonic-counters-to-sync`.
- [x] 5.2 Commit on `track-m2` with explicit `git add` per multi-agent git safety. Files:
  - `supabase/migrations/0012_hospital_monotonic_counters.sql`
  - `supabase/sanity/hospital_monotonic_counters_rls.sql`
  - `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`
  - `apps/medexam2-hospital-tw/src/lib/sync/migration.ts`
  - `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts`
  - `apps/medexam2-hospital-tw/src/db/schema.ts`
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`
  - `openspec/changes/archive/<date>-add-monotonic-counters-to-sync/`
  - `openspec/specs/cloud-sync/spec.md` (synced delta)
- [x] 5.3 Commit message: `spec(archive): merge add-monotonic-counters-to-sync — bring monotonicCounters into cloud sync surface (二階)`
- [x] 5.4 Sync `track-m2 → main` (cherry-pick if R2 scaffold + other parallel commits still on track-m2; otherwise normal merge).
- [x] 5.5 Push both branches.
