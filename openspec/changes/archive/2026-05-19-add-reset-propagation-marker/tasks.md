# Tasks

## 1. Spec delta

- [x] 1.1 Draft `specs/cloud-sync/spec.md` delta — ADD requirement for cross-device reset propagation via marker; MODIFY existing account-reset requirement to note marker bump; MODIFY 「立即同步下載」 popover button scenario to gate on marker first.
- [x] 1.2 `openspec validate add-reset-propagation-marker --strict` passes.
- [x] 1.3 User confirms spec wording (curator rule: no auto-write of spec content).

## 2. Cloud migration

- [x] 2.1 Create `supabase/migrations/0011_account_reset_marker.sql`:
  - `CREATE TABLE public.account_metadata (user_id uuid PK REFERENCES auth.users ON DELETE CASCADE, last_reset_at timestamptz NOT NULL DEFAULT now(), schema_version text NOT NULL DEFAULT '1', updated_at timestamptz NOT NULL DEFAULT now())`
  - `ENABLE ROW LEVEL SECURITY` + 4 policies (SELECT / INSERT / UPDATE / DELETE) each gated on `auth.uid() = user_id`
  - `CREATE OR REPLACE FUNCTION set_account_metadata_updated_at()` + `CREATE TRIGGER` on UPDATE
  - `CREATE OR REPLACE FUNCTION public.delete_my_data()` — body preserves the existing 8-table delete list from `0002_account_lifecycle.sql` verbatim, then appends `INSERT INTO account_metadata (user_id, last_reset_at) VALUES (uid, now()) ON CONFLICT (user_id) DO UPDATE SET last_reset_at = now()`
  - `GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated` (re-grant)
- [x] 2.2 Create `supabase/sanity/account_metadata_rls.sql` mirroring the `bug_reports_rls.sql` pattern (cross-user read should fail; own-row CRUD should succeed; anon should be denied).
- [x] 2.3 Apply 0011 via Supabase dashboard SQL editor; verify with sanity SQL.

## 3. Client module — 一階 (apps/medexam-tw)

- [x] 3.1 Create `apps/medexam-tw/src/lib/sync/reset-propagation.ts`:
  - `fetchCloudResetTimestamp(supabase, userId): Promise<number | null>` — catches all errors, returns null on any failure (incl. table-not-exists)
  - `readLocalAckResetAt(userId): number` — reads `localStorage['study-rpg.sync.lastAckResetAt:' + userId]`, defaults to 0
  - `writeLocalAckResetAt(userId, ms): void` — writes to same key
  - `applyResetPropagationIfNeeded(supabase, userId, db): Promise<{propagated, cloudResetAt}>` — fetches cloud, compares with local ack, on newer: snapshotLocalToBackup(db, userId, 'auto-mirror-on-reset') → wipeLocalSyncedTables(db) → writeLocalAckResetAt
- [x] 3.2 Wire `applyResetPropagationIfNeeded` BEFORE `computeGateState` call in `apps/medexam-tw/src/lib/sync/useSync.ts` resolution effect.
- [x] 3.3 Wire `applyResetPropagationIfNeeded` at the start of `forcePull` in same file (before `engine.pullAllNow({force:true})`).
- [x] 3.4 In `safeResetAccountData`, after `supabase.rpc('delete_my_data')` succeeds, call `fetchCloudResetTimestamp` and `writeLocalAckResetAt` so the cold-start gate doesn't re-fire.

## 4. Client module — 二階 (apps/medexam2-hospital-tw)

- [x] 4.1 Mirror Task 3.1 in `apps/medexam2-hospital-tw/src/lib/sync/reset-propagation.ts` (HospitalDB type).
- [x] 4.2 Mirror Task 3.2.
- [x] 4.3 Mirror Task 3.3.
- [x] 4.4 Mirror Task 3.4.

## 5. Verification

- [x] 5.1 `pnpm -r typecheck` — both apps compile clean.
- [x] 5.2 Chrome MCP E2E smoke test:
  - (a) `mcp__Claude_in_Chrome__list_connected_browsers` preflight per chrome_mcp_preflight.md
  - (b) Sign in 二階 (tab A); answer 3+ quiz questions; verify Supabase dashboard shows `hospital_question_history` rows + `account_metadata` row absent
  - (c) Open Settings → 重置此帳號進度 → confirm both layers
  - (d) Supabase dashboard: verify all 二階 tables empty for this user AND `account_metadata.last_reset_at` present + recent
  - (e) New incognito window, sign in same Google account
  - (f) BEFORE clicking anything in the app, open DevTools → IndexedDB → verify `questionHistory` empty (cold-start gate fired during sign-in)
  - (g) IndexedDB → `localBackup` → row tagged `reason: 'auto-mirror-on-reset'` present
  - (h) `localStorage['study-rpg.sync.lastAckResetAt:<userId>']` matches `account_metadata.last_reset_at` epoch ms
- [x] 5.3 Repeat 5.2 b–h for 一階 (`apps/medexam-tw`).
- [x] 5.4 `/simplify` review on the 6 modified files.
- [x] 5.5 `/opsx:verify` — 3-dim check against spec delta.

## 6. Archive

- [x] 6.1 User reviews + nods → `/opsx:archive add-reset-propagation-marker`.
- [x] 6.2 Commit on `track-m2` with explicit `git add` per multi-agent git safety rule:
  - `supabase/migrations/0011_account_reset_marker.sql`
  - `supabase/sanity/account_metadata_rls.sql`
  - `apps/medexam-tw/src/lib/sync/reset-propagation.ts`
  - `apps/medexam-tw/src/lib/sync/useSync.ts`
  - `apps/medexam2-hospital-tw/src/lib/sync/reset-propagation.ts`
  - `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts`
  - `openspec/changes/archive/<date>-add-reset-propagation-marker/` (after archive)
- [x] 6.3 Commit message: `spec(archive): merge add-reset-propagation-marker — cross-device reset marker (affects: both)`
- [x] 6.4 Sync `track-m2 → main`.
- [x] 6.5 Push both branches.
