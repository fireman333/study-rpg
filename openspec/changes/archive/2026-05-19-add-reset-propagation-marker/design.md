## Context

Today the sync engine treats local IndexedDB as authoritative and the cloud as an additive mirror. Per-row LWW means every successful pull writes the cloud row's `updated_at` over the local row when newer; deletes are not synced because there is no tombstone column. The cloud-sync spec design (`design.md` Decision 2 of the original M4 milestone) assumed "next pull tick converges" after a delete, but a `SELECT * WHERE user_id = X` returning 0 rows after a wipe causes the apply loop to iterate 0 times — local Dexie is never reconciled to the empty cloud state.

The 2026-05-19 「重置此帳號進度」 feature `safeResetAccountData` exposed this gap as a P1 user-facing dataloss vector. It nukes cloud + local on device A but device B's local Dexie keeps the pre-reset rows; B's debounced auto-push (or migration-upload modal on next sign-in) then re-uploads them to cloud, silently undoing A's reset.

Three patterns are available in the wild for this problem:

| Pattern | Survey example | Fit for our stack |
|---|---|---|
| Per-row tombstones with TTL purge | Anki `graves`, RxDB `_deleted`, Joplin `deleted_items`, CouchDB `_deleted` rev | Most correct, but `add-r2-cloud-sync-migration` replaces the per-row layer in 4–6 weeks. ~50 LOC across 9 tables + RPC rewrite, all thrown away. |
| Per-account revision marker | Standard Notes account-wide sign-out, Bitwarden vault `revisionDate` | Covers the one known propagation case (account reset), tiny diff, throws away cleanly when R2 lands. |
| Whole-bundle replacement | Logseq Sync (documented to fail [#7530](https://github.com/logseq/logseq/issues/7530)), our future R2 plan | Naturally propagates deletions but requires the R2 architecture rewrite. |

R2 is already on the roadmap; that change is the right home for general deletion propagation. This hotfix is the bridge that keeps the just-shipped reset feature trustworthy until R2 lands.

## Goals / Non-Goals

**Goals:**
- Cloud reset bumps a per-user marker (`account_metadata.last_reset_at`) that all other devices honour on next pull-gate evaluation.
- Other devices auto-detect the marker on sign-in cold-start AND on the existing 「⬇ 立即同步下載」 manual button (covers the reproducer where the user repeatedly pressed the button).
- The resetting device's own ack is updated immediately after the RPC, so its own cold-start gate doesn't re-fire and re-wipe (already-empty) local.
- Recovery surface: every wipe writes a `localBackup` snapshot tagged `auto-mirror-on-reset` (same Dexie table the existing reset feature uses).
- `schema_version` column on the same row, reserved for the upcoming R2 cutover, lets the server force-eject old clients later without a second migration.

**Non-Goals:**
- General per-row tombstones / deletion propagation for non-reset cases (covered by R2).
- Visibility-change auto-gate (would require engine API surface that R2 will replace; cold-start + manual button cover the documented reproducer).
- Real-time push notifications to other devices (would need Supabase Realtime or external service; out of scope).
- Telemetry on propagation events beyond `console.log` (low-frequency, no pipeline justified).
- Fixing the pre-existing `delete_my_data` scope-out (`question_bookmarks`, `targeted_tickets` not wiped — separate issue, surgical fix only).

## Decisions

### Decision 1 — Single `account_metadata` table, not nine `deleted_at` columns

A marker row covers the only deletion-propagation case the app actually performs today (account reset is the only user-driven cloud-wide delete; per-row deletes don't exist in the UI). Tombstone columns would address phantom future cases at the cost of code thrown away in 4–6 weeks when R2 ships.

**Alternative considered**: per-row `deleted_at` on all 9 tables + `upsert_lww` query rewrite. Rejected — every line gets removed when R2 lands. The schema cost is also non-trivial (9 ALTER TABLE + RLS policy updates + index for `WHERE deleted_at IS NULL`).

### Decision 2 — Gate BEFORE `computeGateState`, not inside it

If the gate ran inside `computeGateState`, the function would gain a destructive side effect (wiping local) while still being called from places that just want a state read. Keeping the gate as an explicit pre-step in the resolution effect makes the destruction visible at the call site and lets us reuse the function elsewhere (force-pull button) without re-entering migration logic.

**Alternative considered**: bundle into `computeGateState`. Rejected — violates command-query separation and makes test surface harder to reason about.

### Decision 3 — Gate on cold-start + manual force-pull, NOT on visibility-change

The reproducer is "tab is foreground, user presses 立即同步下載". Visibility-change handler doesn't fire for a foreground tab; the force-pull button is the right hook. Cold-start covers sign-out + sign-in cycle.

The remaining uncovered case — foreground tab idle while another device resets, no button press — would need a visibility-change hook OR a polling timer. Both add engine API surface (`onBeforePullHook` option, or moving the visibility listener up to useSync) that R2 will replace. Out of scope. Workaround: reload the page or press the button.

**Alternative considered**: poll `account_metadata` every 60 s. Rejected — battery / Supabase egress cost vs. low-frequency benefit. R2 migration timeline makes the polling code wasted.

### Decision 4 — Read the marker back AFTER `delete_my_data` and write to local ack

Without this, the resetting device runs its own cold-start gate immediately (via `setResolveTick` → resolution effect → applyResetPropagationIfNeeded) and detects `cloud.last_reset_at > local.lastAckResetAt = 0`. It then wipes (already empty) local + writes ack. Functionally a no-op but wasteful — and the wipe creates a second `localBackup` row tagged `auto-mirror-on-reset` on top of the `reset-account-data` row the user just explicitly created. Reading the cloud value back and writing to local ack first lets the cold-start gate see `cloudResetAt == localAck` → no-op cleanly.

If the read-back fails (network blip after successful RPC), we log + continue. The next cold-start gate will fire once but write the correct ack, eventually converging. No correctness issue, just one extra localBackup row in the rare failure window.

### Decision 5 — Failures in the gate are non-fatal: log + skip

If `fetchCloudResetTimestamp` throws (network, RLS misconfig, table doesn't exist yet for pre-migration clients), we log a warning and treat it as "no marker present". Sync proceeds with current behaviour. Worst case: the bug persists for that session.

Hard rule: gate failures MUST NOT block sync engine start. The user signing in with a transient network blip getting stuck on the migration screen would be a worse bug than the one this fix addresses.

### Decision 6 — Migration is `CREATE OR REPLACE FUNCTION` in a new numbered file

Per `apps/medexam-tw/CLAUDE.md` convention: 「every future `upsert_lww` change ships as a new numbered migration; never edit existing migrations in place」. Same applies to `delete_my_data`. New file `0011_account_reset_marker.sql` issues `CREATE OR REPLACE FUNCTION public.delete_my_data` with the marker bump appended; the function body otherwise matches `0002_account_lifecycle.sql` verbatim.

The `question_bookmarks` and `targeted_tickets` missing-from-delete-list issue is pre-existing and out of scope. Documenting in proposal but not patching here.

### Decision 7 — Mirror impl across apps, not shared module

Same rationale as `safeResetAccountData` precedent: each app has its own Dexie schema (`StudyRpgDB` vs `HospitalDB`), own `wipeLocalSyncedTables` signature, own `snapshotLocalToBackup` row shape. Two ~50-line modules with identical structure but app-specific types beat a parameterized factory in `@study-rpg/core` (sync code is app-layer by contract).

Both impls go in this single change; reviewed together; drift risk mitigated by future changes targeting both apps when behaviour changes.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| User has unpushed offline edits on device B; device A resets; B's auto-gate wipes B's offline edits on next sign-in | `localBackup` snapshot tagged `auto-mirror-on-reset` is the recovery surface. Spec scenario documents the trade-off. Acceptable: account reset is a destructive user gesture; resurrection-via-stale-data is the worse failure mode. |
| Gate fetch fails (network / RLS / pre-migration client) → bug persists for this session | Non-fatal log + skip. Next successful gate fetch propagates. Documented in spec. |
| Two devices simultaneously call `delete_my_data` in close succession → marker bumps twice, both timestamps OK | LWW on the marker handles this naturally (`ON CONFLICT DO UPDATE SET last_reset_at = now()`). Race window irrelevant — both end states are "cloud empty + marker set". |
| Foreground-tab catch-up case (tab open, no sign-out, no button press) | Documented as known gap. Workaround: reload page or press 立即同步下載. R2 migration eliminates this whole class. |
| R2 migration retires `account_metadata` — what stays? | `schema_version` column transitions to a force-eject signal. `last_reset_at` becomes redundant but harmless. Optional cleanup migration when R2 lands. |
| Both apps' implementations drift over time | Mirror impls reviewed in same change; spec scenarios are app-agnostic so future divergence targets one app's deviation without spec churn. |

## Migration Plan

1. Apply `0011_account_reset_marker.sql` via Supabase dashboard SQL editor (manual deploy per existing project convention).
2. Verify with `supabase/sanity/account_metadata_rls.sql` — RLS denies cross-user reads and grants own-row CRUD.
3. Ship client changes (both apps in one commit on `track-m2`).
4. `/verify` smoke test (Chrome MCP): sign in 二階 → answer questions → reset → sign in same account on incognito → verify auto-wipe fires + localBackup entry written.
5. Per `auto-git` policy + project.md merge protocol: `/opsx:archive` after `/verify` passes; merge `track-m2 → main`; push both branches.

Rollback: drop the new table + revert the function (run `CREATE OR REPLACE FUNCTION public.delete_my_data` from `0002_account_lifecycle.sql` verbatim) + revert the 6 client-file edits. Local ack keys in `localStorage` are harmless if left behind.

## Open Questions

- (Resolved at proposal time) Should the gate also fire on every visibility-change pull? **No** — adds engine API surface that R2 will replace. Cold-start + manual button cover the reproducer; same-tab idle catch-up needs a reload (documented).
- (Resolved at proposal time) Should this change also fix the pre-existing `delete_my_data` missing-tables scope-out (`question_bookmarks`, `targeted_tickets`)? **No** — out of scope; should be a separate small change. Mentioned in proposal for visibility.
- (Resolved at proposal time) Use a different column name than `last_reset_at` to leave room for future events (last_export, last_purge, etc.)? **No** — YAGNI. Add columns as needs arise. `account_metadata` table is the namespace; new event = new column or new row.
