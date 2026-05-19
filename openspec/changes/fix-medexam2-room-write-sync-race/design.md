## Context

The cloud-sync engine for 二階 hospital app (`apps/medexam2-hospital-tw/src/lib/sync/engine.ts`) installs Dexie row-mutation hooks **per-adapter**. Each adapter declares one Dexie table name (`dexieTable: string`). The engine subscribes to `creating` / `updating` / `deleting` on that table; every callback calls `markDirty(tableName, pk)`, which schedules a debounced push and snapshots dirty rows via the adapter at flush time.

This shape works perfectly for **collection adapters** (`HOSPITAL_DOCTORS` / `HOSPITAL_MASTERY` / etc.) where one Dexie table = one Postgres table = one PK per row. It also works for **single-table singleton adapters** (`HOSPITAL_MONOTONIC_COUNTERS` → only writes to `monotonicCounters`).

It breaks for **multi-table singleton adapters**. `HOSPITAL_STATE`'s `snapshotDirty` reads from **five Dexie tables** (`gameCounters` + `gachaStats` + `tickets` + `rooms` + `affinity`) and writes a single aggregated `data` JSONB blob, but only hooks `gameCounters`. Writes to the other four passenger tables propagate to cloud only when the next `gameCounters` mutation (i.e. the next 5-sec study-session tick) happens to mark the blob dirty. This was a deliberate trade-off recorded in the inline comment at `tables.ts:147-150` ("Writes to gachaStats / tickets / rooms / affinity propagate within ~5 sec via the next gameCounters tick"), but the trade-off underestimated three failure modes:

1. Tab close / network drop / sign-out within the 5-sec window → unpushed local writes never reach cloud.
2. Cross-device visibility-pull within the window → cloud LWW (`tables.ts:170-174`) compares cloud `updated_at` against local `gameCounters._updatedAt`, sees cloud newer (because another device ticked), applies stale cloud blob over fresh local writes.
3. The `gameCounters` tick only fires during **active study session** (per `services/tick.ts`); outside of one, the race window is unbounded.

Detection has been latent because the symptoms are **silent value rollback** (facility level drops back, ticket count rolls back, pity counter resets, affinity correctCount loses one or two answers) — no error, no UI hint, just stochastic data loss. The just-archived `fix-medexam2-doctor-room-pointer-drift` flagged this as a follow-up because doctor↔room drift was 100% reproducible while these symptoms are stochastic and per-mutation.

Stakeholders: solo dogfooder + future open-source contributors of the engine. Engine API contract is observed by `@study-rpg/core@0.2.0` consumers; the `TableAdapter` interface is content-pack-extension surface.

## Goals / Non-Goals

**Goals:**

1. Close the **push-side** race: any write to `rooms` / `tickets` / `gachaStats` / `affinity` in the 二階 app SHALL enqueue a debounced cloud push within the engine's normal 3000 ms window (matching the `gameCounters` baseline).
2. Keep the **adapter interface change minimal** and additive — existing 一階 adapters and `HOSPITAL_MONOTONIC_COUNTERS` need zero modification.
3. Make the race **reproducible via dogfood telemetry** before claiming the fix works (per project's debugging principles import).
4. **Preserve** the existing echo-prevention (`applyingFromCloud` flag) and the canonical `gameCounters._updatedAt` LWW gate on apply — pull-side LWW semantics unchanged.
5. **Symmetric coverage** for both Supabase legacy push and R2 bundle push (the dirty-marker layer is upstream of both).

**Non-Goals:**

- Per-passenger-table LWW on apply. If two devices write different passenger tables of `hospital_state` concurrently, blob LWW still resolves by `gameCounters._updatedAt`. We accept this — same trade-off as before, just no longer aggravated by silent push loss.
- Tombstone columns on Postgres for deletes (still no delete sync).
- Removing the inline force-null on `rooms[*].assignedDoctorId` apply (`tables.ts:127-135`) — that's an unrelated defensive guard installed by the doctor-room-pointer-drift fix.
- Refactoring `HOSPITAL_STATE` into five separate adapters. Considered (see Decision 2) and rejected.
- Changing R2 bundle layout or Supabase RPC whitelist.

## Decisions

### Decision 1: Optional `extraDexieTables?: readonly string[]` field on `TableAdapter`

**Choice**: Approach (a) from the brief — add an optional field, no signature change to existing methods.

```typescript
export interface TableAdapter {
  postgresTable: string
  shape: 'singleton' | 'collection'
  dexieTable: string
  /**
   * Additional Dexie tables that should also fire dirty markers for this
   * adapter's `dexieTable` key. Used by multi-table singleton adapters
   * (e.g. HOSPITAL_STATE collapses 5 Dexie tables → 1 hospital_state blob).
   * Hooks installed for each entry are identical to the primary `dexieTable`;
   * all of them mark dirty under the canonical `dexieTable` key so
   * `snapshotDirty()` sees a single marker per debounce window.
   */
  extraDexieTables?: readonly string[]
  snapshotDirty(...)
  snapshotAll(...)
  applyToLocal(...)
}
```

**Alternative considered (b)**: Make `dexieTable: string | readonly string[]`. Rejected because every snapshot/apply call site already names `dexieTable` and expects a string; widening the type forces `Array.isArray()` branches throughout the engine. Less surgical, more churn, no benefit.

**Alternative considered (c)**: Per-table separate adapters (refactor `HOSPITAL_STATE` into `HOSPITAL_GAME_COUNTERS` / `HOSPITAL_GACHA_STATS` / `HOSPITAL_TICKETS` / `HOSPITAL_ROOMS` / `HOSPITAL_AFFINITY`, each writing to its own Postgres table). Rejected because:
- Postgres schema would gain four new tables + four new RLS policy quads + four new `upsert_lww` whitelist entries — large migration.
- R2 bundle layout would either gain four files (more S3 round-trips) or need a new "aggregate blob" wrapper anyway.
- Existing `hospital_state` cloud blob in the field would orphan, requiring a one-shot migration.
- Doesn't actually eliminate cross-table races on apply (we'd still want atomic apply across the five tables for consistency, which means re-introducing the aggregated read on pull anyway).

### Decision 2: All hooked tables mark dirty under the canonical `adapter.dexieTable` key

When `rooms.put(...)` fires the updating hook, the engine calls `markDirty('gameCounters', '<some-pk>')` — **not** `markDirty('rooms', '<roomId>')`. Reasons:

- `snapshotDirty()` for `HOSPITAL_STATE` only checks `dirtyPks.size > 0` then reads the full blob (`tables.ts:152-157`). It doesn't care which PK is dirty, just that *something* is.
- Keeping a single canonical key per adapter means the existing `clear()` path (`engine.ts:200/235/353`) doesn't need to know about extra tables.
- `pushAllNow()` (`engine.ts:310-363`) calls `snapshotAll()` and then bulk-clears dirty markers; same behavior preserved.

PK string format: for collections we use the row PK; for singletons we use the literal `'singleton'`. For `extraDexieTables` writes against a singleton adapter, we use `'singleton'` regardless of what Dexie's `primKey` arg is (the actual PK is irrelevant to the snapshot). Concretely: pass `stringifyPk(primKey, adapter.shape)` exactly as today; for a singleton-shaped adapter this already collapses to `'singleton'` regardless of the row's actual PK, so existing logic Just Works.

### Decision 3: `HOSPITAL_STATE.extraDexieTables = ['rooms', 'tickets', 'gachaStats', 'affinity']`

Explicit four-table list, ordered to match `readHospitalStateBlob()`'s read order (`tables.ts:90-96`) for readability. Excludes `gameCounters` since it's already the canonical `dexieTable`.

### Decision 4: Detection-first task ordering (Phase 0)

Task 1 of the implementation is **not the fix itself** — it's a small instrumentation script that the user runs in the dev console to confirm the race is reproducible:

1. Boot 二階 app on dogfood account, ensure cloud sync is active (`globalThis.__sync.getStatus() === 'idle'`).
2. Note current `db.rooms.get('outpatient-1').facilityLevel` (call it L0).
3. Trigger facility upgrade via `services/facility.ts` (UI button or direct service call).
4. Within 1 sec, call `supabase.from('hospital_state').select('data').eq('user_id', uid)` and inspect `data.rooms[0].facilityLevel`.
5. Confirm cloud value is still L0 (i.e. push hasn't fired yet because no `gameCounters` tick has run).
6. Repeat after waiting > 5 sec; confirm cloud value caught up.

This produces concrete before/after numbers. After implementing the fix, the same script should show cloud at L0+1 within the 3000 ms debounce window.

### Decision 5: No retroactive coverage on 一階

`apps/medexam-tw/src/lib/sync/tables.ts` (一階) was inspected pre-proposal: its `PLAYER_STATE` singleton adapter hooks `player`, which is the only contributing Dexie table for the player blob. Other tables (`srs_cards` / `items` / `mentor_backlog`) are independent collection adapters with their own hooks. No analogous bug exists.

Confirm during Task 1.5 by grepping `apps/medexam-tw/src/lib/sync/tables.ts` for any adapter whose `snapshotDirty`/`snapshotAll` reads from a table other than its declared `dexieTable`. If found, file a follow-up; do not expand scope in this change.

## Risks / Trade-offs

- **Risk**: Doubled push frequency during quiz sessions (every `affinity` increment now triggers a debounce reset). → **Mitigation**: 3000 ms debounce already coalesces bursts. Worst case: a user answering 10 questions in 30 sec triggers 1 push, not 10 (same as today). Affinity writes are not on a per-keystroke path, so no pathological spam case exists.
- **Risk**: Subtle interaction with the cold-start force-pull (`engine.ts:425-432`). If the user upgrades a facility, force-quits, then reopens — the new hooks fire after `installHooks()`, but the force-pull also fires and might overwrite. → **Mitigation**: `installHooks()` runs **before** `pullAllNow({ force: true })` in `start()` (see line 422-431). But the cold-start pull uses `force: true` which bypasses LWW entirely. → **Status**: same behavior as today. The hooked-table change doesn't introduce new exposure here; whatever was true for `gameCounters` is now also true for `rooms`. The cold-start force-pull is a known data-loss vector handled by `services/snapshot.ts` per the M3 sign-in lifecycle fix.
- **Risk**: Hook installation order in `installHooks()`. Today the loop iterates adapters and installs three hooks per adapter. New behavior: 1 + 4 = 5 hook-table pairs for `HOSPITAL_STATE`. If two adapters claim the same Dexie table, hooks stack and both fire. → **Mitigation**: audit the adapter list. The four extra tables (`rooms`, `tickets`, `gachaStats`, `affinity`) are **not** primary `dexieTable` for any other adapter in `HOSPITAL_ADAPTERS`. Add an assertion in DEV mode: if any table appears in `[adapter.dexieTable, ...adapter.extraDexieTables ?? []]` twice across adapters, throw at engine construction.
- **Risk**: `applyingFromCloud` gate works as expected on the extra hooks. → **Mitigation**: the same `creatingFn` / `updatingFn` / `deletingFn` closures are used for every hooked table (just bound to a different Dexie table reference). The `applyingFromCloud` check is inside those closures and runs identically. Verify with a unit-level test: while `applyingFromCloud === true`, a `rooms.put` triggered by `writeHospitalStateBlob` should NOT call `markDirty`. (This is also where Decision 4's detection script doubles as the regression test.)
- **Trade-off**: Adapter interface gains an optional field. Engine becomes slightly more complex (loop over an array instead of a single name). Net new code: ~15 lines. Mitigated by inline JSDoc on the new field + design.md reference here.

## Migration Plan

No data migration. Deployment is engine-only code change.

1. Land the change in the `track-m2` worktree (per `openspec/project.md` workflow).
2. Run typecheck + dev server smoke (`pnpm -r typecheck` + `pnpm --filter @study-rpg/medexam2-hospital-tw dev`).
3. Run Decision 4's detection script **before** the engine change, capture stale-cloud value.
4. Apply the engine change.
5. Re-run the detection script, capture fresh-cloud value within 3000 ms.
6. Standard `/verify` Chrome MCP pass on key flows: facility upgrade button, recruit roll, single-room fate card facility upgrade.
7. Archive after merge.

**Rollback**: revert the `tables.ts` + `engine.ts` commit. No persisted artifacts (Dexie schema unchanged, cloud schema unchanged). Existing dirty markers continue to function under the old gameCounters-only behavior.

## Open Questions

None. The brief specifies approach (a); both affected capabilities are already mapped to their delta specs; detection method is concrete.
