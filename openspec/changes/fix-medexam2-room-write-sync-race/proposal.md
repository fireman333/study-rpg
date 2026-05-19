## Why

`fix-medexam2-doctor-room-pointer-drift` (archived 2026-05-19) closed the doctor↔room dual-pointer race. Its "Out of Scope" section explicitly flagged a **second instance of the same root-cause class** that survives that fix:

> Facility upgrade race（room.facilityLevel / roomFacility 改了但 hospital_state 等 tick 才推）— 同一個 root cause class（split-write race），但不在本 change 範圍。後果輕（最多多賺一次 facility upgrade 倍率），對使用者體驗影響遠小於 assignment drift。留 follow-up change `fix-medexam2-room-write-sync-race`。

The cause is the `HOSPITAL_STATE` cloud-sync adapter (`apps/medexam2-hospital-tw/src/lib/sync/tables.ts:144-179`). It is a singleton-shaped adapter whose snapshot collapses **five Dexie tables** (`gameCounters` + `gachaStats` + `tickets` + `rooms` + `affinity`) into one `hospital_state.data` blob — but the adapter only declares `dexieTable: 'gameCounters'`. The sync engine's `installHooks()` (`apps/medexam2-hospital-tw/src/lib/sync/engine.ts:114-150`) therefore installs Dexie `creating` / `updating` / `deleting` hooks **only on `gameCounters`**. Writes to the other four "passenger" tables never call `markDirty()` themselves; they piggy-back on the next `gameCounters` tick (every ≤5 sec while a study session is active).

The race manifests in three classes of write:

| Service | Tables written | Race window |
|---|---|---|
| `services/facility.ts:41` (manual facility upgrade) | `rooms` (`facilityLevel`, `roomFacility`) | until next `gameCounters` tick |
| `services/fate-card.ts:215/229/241` (fate card: 全院 facility / 單室 facility / 升級券) | `tickets`, `rooms` | same |
| `services/recruitment.ts:83-84` (recruit roll) | `tickets`, `gachaStats` | same |
| `services/quiz-rewards.ts:158` (ticket grant) | `tickets` | same |
| `lib/mastery.ts:97` (correct-answer increment) | `affinity` | same |

If any of the following happens during the window before the next tick:

1. Tab close / browser quit (very common — user upgrades a facility then immediately closes lid)
2. Network drop (push fails, dirty markers stay but never fire because nothing else marks `gameCounters` dirty until study session resumes)
3. Sign-out (the `pushAllNow` flush on sign-out covers `snapshotAll`, so this one is mitigated — but the in-flight debounce path is not)
4. **Visibility-pull on tab focus** (`engine.ts:163-169`): pull fires, `hospital_state.applyToLocal` runs LWW against the **local** `gameCounters._updatedAt` (`tables.ts:170-174`); if cloud's `updated_at` is newer (because another device touched `gameCounters`), cloud blob wins and silently overwrites the local `rooms[*].facilityLevel` / `tickets.available` / `gachaStats.pity` / `affinity.correctCount` — **losing the unpushed local writes**

The user-visible symptoms (in order of severity):

- **High**: facility upgrade reverts → user spent revenue + (for fate-card) a card, but `facilityLevel` is back to old value on next pull. Throughput silently drops. Hard to reproduce manually but stochastic enough to chip away at trust.
- **Medium**: gacha pity counter resets to stale cloud value → next roll's pity timing wrong → could miss the 30-roll SR / 100-roll SSR pity guarantee.
- **Medium**: ticket count rolls back → user gets one more "spend" than they should, or loses one they were owed.
- **Low**: affinity correctCount rolls back one or two quiz answers' worth of progress.

This is the same root-cause class as the doctor-room drift, but it's a **single-source-of-truth race**, not a dual-pointer race. The single source of truth (the Dexie row) is correct; the cloud blob is stale because the snapshot is only triggered by one of the five contributing tables.

## What Changes

**Approach (a) from the brief — conservative interface extension**:

- Extend the `TableAdapter` interface (`apps/medexam2-hospital-tw/src/lib/sync/types.ts` — note: type imported from `tables.ts:41-63` in current code; the actual interface lives in `tables.ts`) with an **optional** `extraDexieTables?: readonly string[]` field.
- Update `installHooks()` in `apps/medexam2-hospital-tw/src/lib/sync/engine.ts:114-150` to install identical `creating` / `updating` / `deleting` hooks for **each** entry in `[adapter.dexieTable, ...(adapter.extraDexieTables ?? [])]`. Every hooked table marks the **same** singleton blob dirty under the canonical `adapter.dexieTable` key — so `snapshotDirty()` still sees one dirty marker per snapshot and reads the full blob.
- Set `HOSPITAL_STATE.extraDexieTables = ['rooms', 'tickets', 'gachaStats', 'affinity']` so every passenger-table write triggers debounced push within the engine's normal 3000 ms window.
- **Scope cap**: only the `hospital_state` blob. Doctor↔room assignment race is already fixed (`fix-medexam2-doctor-room-pointer-drift`, archived 2026-05-19).
- **Detection first**: Phase 0 reproduces the race via dogfood telemetry — read cloud `hospital_state.data.rooms[*].facilityLevel` ≤ 2 sec after a local facility upgrade (before the next tick) and confirm cloud value is stale. Skipping this gives no signal that the fix actually closed the window.
- **Out of scope**: tombstone-aware multi-table singleton apply (would require comparing per-passenger-table `_updatedAt`s during apply); we keep the existing `gameCounters._updatedAt` LWW check. The fix is **push-side**: the local Dexie row is the source of truth, and we just need the dirty marker to fire when any of the five tables changes. Pull-side LWW is unchanged.
- **Backend split**: same behavior under Supabase legacy push and R2 bundle push (the dirty-marker layer is upstream of both — `engine.ts:179-247` for Supabase, `engine.ts:220-237` for R2).

### Capabilities

#### Modified Capabilities

- `cloud-sync`: New requirement — **Multi-table singleton adapters SHALL install Dexie hooks on every contributing table**. Strengthens existing "Debounced auto-push on local writes" requirement (line 69) by closing the loophole where a singleton adapter could collapse N tables into one blob but hook only one of them. Optional `extraDexieTables` field on `TableAdapter`, single dirty-marker key per adapter.
- `hospital-tycoon-engine`: New requirement — **Facility upgrades, gacha rolls, ticket grants, and affinity increments SHALL propagate to cloud within the debounce window**, not within the tick interval. Affects the `rooms` data model row (`facilityLevel` / `roomFacility`), `tickets.available`, `gachaStats.pity`, `affinity.correctCount`. Pure behavioral contract; no schema change.

### Out of Scope

- **Tombstone / per-passenger-table LWW on apply**: applies if two devices write different passenger tables of `hospital_state` concurrently. Today we already accept this trade-off for `gameCounters` LWW; not introducing per-field LWW here.
- **Other singleton adapters**: `HOSPITAL_MONOTONIC_COUNTERS` snapshots only `monotonicCounters` — already correctly hooked. `ONE_STAGE` `PLAYER_STATE` / `MENTOR_BACKLOG` are out-of-app (一階) and unaffected.
- **Backfill cloud rows whose `hospital_state.data` is stale**: the next normal push naturally overwrites the cloud blob; we don't need a one-shot migration.
- **Dexie schema change**: no migration. The fix is purely engine-side hook installation + adapter declaration.

## Impact

**Files modified**:

- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — extend `TableAdapter` interface (line 41-63) with `extraDexieTables?: readonly string[]`; declare on `HOSPITAL_STATE` (line 144-179).
- `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` — modify `installHooks()` (line 114-150) to loop over `[dexieTable, ...extraDexieTables]`. All hooked tables `markDirty(adapter.dexieTable, ...)` (canonical key).
- `apps/medexam-tw/src/lib/sync/tables.ts` — **inspect**: 一階 `TableAdapter` shape is parallel (see commit history). If 一階 has no multi-table singleton, no change needed; if it does, add `extraDexieTables` symmetrically and audit. Currently 一階 has no such adapter (only `player_state` singleton, hooked on `player`); confirm via inspection in Task 1.5.
- `apps/medexam2-hospital-tw/src/lib/sync/r2/*` — **inspect**: R2 push path (`pushBundle`) reads the same `dirty.perTable` map via the engine's loop. Verify no separate hook installation; expectation is none.

**Files NEW**: none.

**Cloud schema**: unchanged.

**Migration**:

- No Dexie migration.
- No cloud backfill — natural push overwrites stale `hospital_state.data` on next mutation.
- Existing dirty markers on `gameCounters` continue to work unchanged.

**Spec deltas**: `openspec/changes/fix-medexam2-room-write-sync-race/specs/cloud-sync/spec.md` + `openspec/changes/fix-medexam2-room-write-sync-race/specs/hospital-tycoon-engine/spec.md`.

**Risk**:

- **P3 人上人** — Adapter interface change is additive (optional field). Engine loop change adds 4 more hook subscriptions on the 二階 app only; the hook callbacks are O(1) and identical to the existing `gameCounters` hooks. Push debounce already coalesces bursts, so even high-frequency `affinity` writes during a quiz session won't spam the upsert RPC.
- Worst regression case: doubled push frequency (every `affinity` increment now triggers a push that previously waited for the next tick). Mitigated by debounce window staying at 3000 ms — bursty quiz answers collapse into one batch.
