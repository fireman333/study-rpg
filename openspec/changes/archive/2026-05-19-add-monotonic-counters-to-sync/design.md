## Context

`monotonicCounters` (Dexie table in 二階, schema v8+) holds three fields:

| Field | Type | Semantic |
|---|---|---|
| `totalStudyMinutes` | number | Cumulative minutes in active reading sessions. Per existing UX intent (HelpMenu copy), never decreases. |
| `fateCardBadLuckPity` | `{ common, rare, epic }` | Consecutive bad-luck pity counters for fate card draws. Each sub-field increments on a non-pity-firing draw and resets to 0 when its tier-specific pity triggers. So **NOT strictly monotonic** despite the table name — a draw resetting `epic = 12 → 0` is normal. |
| `freshCorrectSinceLastTicket` | number | Per-25-fresh-correct ticket-grant counter (add-quiz-economy-redesign). Increments by 1 per fresh-correct answer; resets to 0 when `QUIZ_TICKET_GRANT_PER_N_CORRECT` is reached. Also non-monotonic. |

The table name is historical (it was originally just `totalStudyMinutes` storage; pity + ticket-grant counters were added later as "things that need to survive across game-state resets" but the name didn't change). True semantic across all three fields is **survives gameplay resets / engine restarts**, NOT strictly monotonic.

The current bug the user surfaced: 「重置此帳號進度」 wipes cloud-synced tables + auth-related local state, but `monotonicCounters` is not in either set. After reset, `totalStudyMinutes = 7.7` survived, confusing the user who expected a clean slate. The original design intent (encoded in HelpMenu copy 「永久保留，不會因換機或重置而流失」) was deliberate — but the user has revised that intent: reset SHOULD be a true clean slate, AND the value SHOULD sync across devices so a session on phone shows on computer.

Three options were considered:

**Option A — Local wipe only, no cloud sync.** Add `db.monotonicCounters.clear()` to wipe paths. Cheap (~5 lines). But cross-device asymmetric: device A resets → A's local cleared, but B's local untouched until B resets too. Doesn't match the cross-device sync model used by every other gameplay table. Rejected.

**Option B — Cloud sync + LWW + reset wipe (this change).** Bring `monotonicCounters` into the standard cloud sync surface. Reset propagates via existing `account_metadata.last_reset_at` marker. Field semantics handled by LWW. Trade-off: per-device LWW can occasionally overwrite a higher value with a lower one if the lower-value device pushes with a newer `updated_at`. In practice rare. Accepted.

**Option C — Cloud sync with server-side MAX-merge for monotonic-ish fields.** Bypass LWW for `totalStudyMinutes` (per-field GREATEST), keep LWW for pity / ticket counters. Semantically correct but adds complexity in `upsert_lww` (special branch with per-field merge logic). R2 migration replaces all this in 4-6 weeks anyway. Deferred — Option B ships now, MAX-merge can land as a follow-up if real-world data shows regressions.

## Goals / Non-Goals

**Goals:**
- `monotonicCounters` syncs across devices via the standard LWW upsert path used by every other 二階 cloud-synced table.
- `wipeLocalSyncedTables` / `clearLocalSyncTables` clear `monotonicCounters` so 「重置此帳號進度」 and 「切換帳號 → 清空本地」 both produce a true clean slate.
- `snapshotLocalToBackup` includes `monotonicCounters` so the value is recoverable from `localBackup` if a user regrets a reset.
- `delete_my_data` cloud RPC wipes the new table so reset propagates to other devices via the marker already in place from `add-reset-propagation-marker`.
- HelpMenu copy updated to remove the "永久保留" assertion that no longer matches behaviour.

**Non-Goals:**
- Server-side MAX-merge for monotonic-ish fields (Option C). Deferred until real-world regression data justifies the complexity.
- 一階 changes — 一階 has no `monotonicCounters` table; its reading-time accounting (if any) lives in `readSessions` and is a separate concern out of scope.
- Backfilling cloud values for existing users from the highest of their per-device locals. First sync writes whichever local lands first to cloud; users on multi-device may see a one-time small regression.
- Dexie schema bump. The table already exists since v8.
- Migrating any other "永久" / monotonic-flavoured carve-outs (e.g., 一階 readSessions). Single-table scope.

## Decisions

### Decision 1 — Singleton shape, `data jsonb` column, same as `hospital_state`

The Postgres table mirrors the singleton shape used by `hospital_state` and `mentor_backlog`: one row per user (`user_id PRIMARY KEY`), all gameplay fields collapsed into a `data jsonb` blob, plus `updated_at` and `app_version`. This matches the existing TableAdapter pattern (`shape: 'singleton'`) so no engine code changes are needed. The 3 client-side fields (`totalStudyMinutes`, `fateCardBadLuckPity`, `freshCorrectSinceLastTicket`) become opaque JSONB on cloud; only the client interprets the shape.

**Alternative considered**: typed columns (`total_study_minutes numeric`, `fate_card_bad_luck_pity_common int`, etc.). Rejected because: (a) `hospital_mastery` is the only typed-column singleton-ish table and even it pays the cost of having to update the upsert_lww dispatch every time fields are added; (b) `monotonicCounters` shape may evolve (we just added `freshCorrectSinceLastTicket` in v8 — and probably more later as gameplay grows). Opaque JSONB is forward-compatible.

### Decision 2 — `CREATE OR REPLACE` both `upsert_lww` and `delete_my_data` in a single migration 0012

Per `apps/medexam-tw/CLAUDE.md` convention: every change to `upsert_lww` ships as a new numbered migration. Same applies to `delete_my_data` (we re-issued it in 0011 for the marker bump). Bundling both into 0012 keeps the migration count flat and ties the table creation to the RPC updates that actually use it. Body of `upsert_lww` is the 0009 body verbatim plus the new whitelist entry + dispatch branch. Body of `delete_my_data` is the 0011 body verbatim plus the new DELETE statement.

**Alternative considered**: split into `0012_hospital_monotonic_counters_table.sql` (just DDL) + `0013_upsert_lww_with_monotonic.sql` (RPC). Rejected — table creation + RPC dispatch must roll together for the table to actually be writable through `upsert_lww`. Single migration is atomic.

### Decision 3 — LWW for all three fields, no per-field merge

Both `fateCardBadLuckPity.*` and `freshCorrectSinceLastTicket` can legitimately decrease (reset on pity / ticket grant). Per-field MAX-merge would break those resets. `totalStudyMinutes` is the only truly monotonic field. Implementing MAX only for one of three fields adds complexity that R2 will throw out shortly. LWW + accept that an occasional regression on `totalStudyMinutes` may happen across simultaneously-active multi-device usage.

In practice the regression window is narrow: any session that increments `totalStudyMinutes` also writes the field with `_updatedAt = Date.now()`, so the incrementing device usually has the freshest `updated_at` AND the highest value. Regression only happens if device B (older value) writes after device A (higher value) without itself incrementing — e.g., B reloads and the engine pushes a snapshot. The localStorage `lastAckResetAt` mechanism shouldn't trigger spurious pushes here because monotonicCounters isn't mutated by sign-in flow. Dexie hooks only mark dirty when `creating`/`updating` fires, which requires actual local mutation.

### Decision 4 — Include `monotonicCounters` in `snapshotLocalToBackup`

Without this, the existing `localBackup` snapshots (used by reset, account-switch, use-cloud-overwrite) lose the monotonic data. After this change `localBackup` already covers all sync tables; adding monotonicCounters keeps that invariant. Cost: ~20 bytes per snapshot. Trivial.

### Decision 5 — Copy update is part of this change, not a separate doc change

`HelpMenu.tsx` literally says "永久保留，不會因換機或重置而流失". Shipping the wipe-list extension without updating the copy means the UI lies for a release. Couple the copy change with the behaviour change.

### Decision 6 — No spec for the "monotonic" semantic in client-side terms

The new `monotonicCounters → hospital_monotonic_counters` mapping is just another LWW singleton from the spec's perspective. The cloud-sync spec already covers the LWW + RLS + sync chip + reset propagation generic behaviour. The only spec delta is "the table list now includes hospital_monotonic_counters". No new requirement needed for monotonic semantics because LWW is the actual semantic.

The existing `recruitment-gacha` spec mentions `monotonicCounters.singleton.freshCorrectSinceLastTicket` (line 585+) but those scenarios describe LOCAL behaviour. They remain accurate after this change — the field still lives on `monotonicCounters.singleton` Dexie row; it's just also synced to cloud. No spec edit needed there.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| LWW regression on `totalStudyMinutes` if device B pushes older value with newer `updated_at` | Documented as acceptable. Active device usually has freshest both. Future: server-side per-field MAX-merge. |
| Migration applies but a multi-device user sees cloud value lower than their per-device max on first sync | One-time event, ≤ one session worth of minutes lost. The localBackup snapshot path provides recovery if they really care. |
| `fateCardBadLuckPity` cross-device confusion: user on phone gets unlucky 12 epic draws, switches to computer, sees pity counter sync over and feels rugged | Feature, not bug. Cross-device pity is the desired UX per "everything syncs" principle. UI doesn't currently surface pity counters anyway. |
| HelpMenu copy still mentions "永久保留" after deploy if revert order is wrong | Same change touches both source files; rollback is atomic git revert. |
| R2 migration replaces this surface | Forward-compatible — `monotonicCounters` becomes part of the 二階 m2-snapshot bundle when R2 ships. Cleanup is dropping the cloud table + RPC dispatch; client adapter is replaced wholesale. |
| `freshCorrectSinceLastTicket` reset-to-0 racing with a push from another device incrementing it | LWW resolves correctly: the reset write has newer `_updatedAt`, so it wins. Existing engine + Dexie hooks already mark dirty on the reset write. |

## Migration Plan

1. Apply `0012_hospital_monotonic_counters.sql` via `supabase db push` (or dashboard SQL editor).
2. Verify with `supabase/sanity/hospital_monotonic_counters_rls.sql` — RLS denies cross-user reads, owner CRUD works.
3. Deploy client changes (single commit on `track-m2`; cherry-pick to main on confirmation per `add-reset-propagation-marker` precedent).
4. First post-deploy sign-in on each device pushes the local `monotonicCounters` snapshot to cloud via the standard dirty-marker flow (the snapshot routine of all sync tables on cold-start force-pull does NOT push — the push happens on next mutation that marks the row dirty). To ensure prompt sync, recommend touching the table once (e.g., a single reading-session tick that increments `totalStudyMinutes`) to trigger a debounced push.
5. Test the reset propagation specifically for the new table: insert account_metadata marker → reload → verify `monotonicCounters.singleton.totalStudyMinutes === 0` (or default seed value) after the auto-wipe.

Rollback: drop `public.hospital_monotonic_counters`, revert `upsert_lww` to 0009 body, revert `delete_my_data` to 0011 body, revert the 7 client-file edits. Local Dexie state stays put (we never dropped the local table); just the cloud copy disappears.

## Open Questions

- (Resolved at proposal time) Should we also sync 一階's `readSessions` for symmetry? **No** — out of scope. 一階 has different architecture (per-session records, not aggregate counter). Separate change if needed.
- (Resolved at proposal time) Should we add a one-time UI banner explaining "reset 現在會清掉累積唸書時間"? **No** — HelpMenu copy update is sufficient. Banner = feature creep.
- (Resolved at proposal time) Server-side MAX-merge for `totalStudyMinutes`? **Deferred** — Decision 3 rationale. Re-evaluate after 1-2 weeks of real-world data.
