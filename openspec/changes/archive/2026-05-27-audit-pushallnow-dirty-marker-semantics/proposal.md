# audit-pushallnow-dirty-marker-semantics

## Why

`pushAllNow` in [`apps/medexam2-hospital-tw/src/lib/sync/engine.ts:427`](apps/medexam2-hospital-tw/src/lib/sync/engine.ts:427) (and the identical pattern at [`apps/medexam-tw/src/lib/sync/engine.ts:369`](apps/medexam-tw/src/lib/sync/engine.ts:369)) clears every table's dirty markers **unconditionally** after a push attempt completes, even if individual adapters or R2 bundles inside that attempt failed:

```ts
// Clear dirty markers — pushAll covers everything pending.
for (const set of dirty.perTable.values()) set.clear()
```

If the Supabase `upsert_lww` for table T fails (network blip, R2 503, JWT expired mid-flight, `unknown table`, any RPC error), `pushAllNow` still wipes T's dirty set. The next debounced push sees no dirty marker for T → cloud silently stays stale until the user makes another local write that re-dirties T. For low-frequency tables (e.g. `retirementLog`, `leaderboardProfile`, `hospitalEquipment`), the staleness can persist for the entire session.

AAD-v2 §8 added a startup probe that detects the **`unknown table` partial-migration window** and pauses the engine before `pushAllNow` can fire. This change ships as "codex Attack 3" mitigation. But the probe only catches that one well-understood failure shape — every other normal-run transient failure (network, RPC timeout, R2 503, JWT expired, server 5xx) still hits the same unconditional clear and the same silent data-loss.

AAD-v2's tasks.md §13.2 explicitly tags this as the proper root-cause follow-up:

> Spawn `audit-pushAllNow-dirty-marker-semantics` change: investigate fixing `pushAllNow` to clear dirty markers conditionally (only for adapters whose push succeeded), instead of the current unconditional `dirty.perTable.values().clear()` at line 412-413. The startup probe is the immediate mitigation; the underlying bug pattern still affects any future `unknown table` style RPC error path.

The reference pattern for the correct conditional clear already exists in the same file: `pushNow` at lines 271–273 only clears dirty markers when `allBundlesOk`. `pushAllNow` needs equivalent per-adapter granularity for both the Supabase loop and the R2 loop.

## What Changes

- **EXTEND** capability `cloud-sync` with one new requirement that explicitly mandates conditional dirty-marker clearing in `pushAllNow` (per-adapter / per-bundle outcome tracking).
- **MODIFY** [`apps/medexam2-hospital-tw/src/lib/sync/engine.ts`](apps/medexam2-hospital-tw/src/lib/sync/engine.ts) `pushAllNow`:
  - Track `failedSupabaseDexieTables: Set<string>` populated when a per-adapter Supabase push throws
  - Track `failedR2DexieTables: Set<string>` populated when a per-bundle R2 push throws (map bundle → its `adapters: TableAdapter[]` → each adapter's `dexieTable`)
  - Replace the unconditional `for (const set of dirty.perTable.values()) set.clear()` with a per-key loop that only clears tables where neither active write backend failed:
    ```ts
    for (const [dexieTable, set] of dirty.perTable.entries()) {
      const supabaseOk = !backendConfig.writeSupabase || !failedSupabaseDexieTables.has(dexieTable)
      const r2Ok       = !backendConfig.writeR2       || !failedR2DexieTables.has(dexieTable)
      if (supabaseOk && r2Ok) set.clear()
    }
    ```
- **MODIFY** [`apps/medexam-tw/src/lib/sync/engine.ts`](apps/medexam-tw/src/lib/sync/engine.ts) `pushAllNow`: identical fix at line 369. (m1 only has Supabase, so the R2 branch is no-op for it.)
- **ADD** Vitest unit test `apps/medexam2-hospital-tw/src/__tests__/sync-engine-partial-push-failure.test.ts` covering:
  - Two dirty tables, mock Supabase to fail one of them → assert failed table's marker remains, succeeded table's marker is cleared
  - Same setup, then mock Supabase to succeed → assert previously-failed table's marker now clears on the second pushAllNow
  - R2 path equivalent: two bundles, mock R2 push to fail one bundle → assert the failed bundle's adapters' dexie tables keep their dirty markers
  - Dual-write path: same dexie table dirty, Supabase succeeds + R2 fails → marker stays (need BOTH to succeed to clear)
- **UPDATE** project `CLAUDE.md` "Known sharp edges" section with a one-paragraph entry documenting the conditional clear semantics and the reference pattern in `pushNow:271-273`. Also note neurons-tw uses a different (simpler) sync engine architecture (`pending: boolean`) that doesn't share this bug.
- **UPDATE** `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` cross-references section to point at this change as the third member of the schema-evolution-guards cluster (A3 CI lint + A1 Worker presign + A2 dirty-marker correctness — together they cover compile-time, transport-time, and runtime push-failure resilience).

## Impact

- **Affected specs**: EXTEND existing capability `cloud-sync` (1 new requirement, 5 BDD scenarios).
- **Affected code** (3 files):
  - `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` (~+25 lines: 2 Set<string> trackers, populated in each per-adapter / per-bundle catch block, replace unconditional clear with conditional loop)
  - `apps/medexam-tw/src/lib/sync/engine.ts` (~+15 lines: same shape, Supabase-only)
  - `apps/medexam2-hospital-tw/src/__tests__/sync-engine-partial-push-failure.test.ts` (NEW, ~120 lines Vitest)
- **Affected docs**: `CLAUDE.md` + `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` (small additions)
- **Affected users**:
  - **Honest happy path** (no push failures): zero behaviour change
  - **Transient-failure path** (network blip / R2 503 / JWT mid-flight): no longer silently loses data; failed-table markers persist and retry succeeds on next push
  - **Partial-migration path** (covered by AAD-v2 startup probe): still covered by probe; this fix is defense-in-depth for any failure case the probe doesn't catch
- **Affected tests**: NEW Vitest (4 scenarios). No existing test changes — there's currently zero test coverage for `pushAllNow` failure modes (the audit confirmed this).

## Out of Scope

- **neurons-tw sync engine refactor** — it uses a completely different architecture (`pending: boolean` flag, no `dirty` Map) and does NOT have this bug. No change needed there.
- **Removing the startup probe** (AAD-v2 §8) — keep as belt-and-suspenders; the probe gives a structured `pausedReason` for the partial-migration window which is more actionable than just retrying. Both layers complement each other.
- **Per-row failure granularity** — current proposal tracks per-adapter (and for R2, per-bundle which collapses to per-adapter). Per-row granularity would mean partial success within a single `upsert_lww` batch which the RPC doesn't currently expose. Defer until concrete need.
- **Adding miniflare / Worker test infrastructure** — Vitest is for the engine code path only. Worker presign smoke is separately covered by `add-bundle-schema-version-guard` (A1).
- **Documenting all 13 cloud-sync existing requirements** — only the new requirement is added; existing requirements stay as written.

## Acceptance Criteria

- `pnpm --filter @study-rpg/medexam2-hospital-tw test sync-engine-partial-push-failure` exits 0 with 4/4 scenarios green.
- Manual regression: trigger a partial failure in a dev environment (mock Supabase to 500 on a specific table) → confirm the failed table's dirty marker persists across the failed `pushAllNow` → trigger a second `pushAllNow` after un-mocking → confirm the marker clears (push retried + succeeded).
- `openspec validate audit-pushallnow-dirty-marker-semantics --strict` passes.
- `openspec validate cloud-sync --strict` passes after delta sync at archive time (1 new requirement / 5 scenarios added; existing 13 unchanged).
- `pnpm typecheck` clean for both `medexam-tw` and `medexam2-hospital-tw` apps.
- `pnpm lint:dexie-fixtures` (A3 lint) — exit 0 (no Dexie schema bumps in this change).
- CI workflows green after push: lint + deploy.yml + deploy-cf-pages.yml + deploy-worker.yml all pass.
- Production smoke: no console error spam in any of the three prod URLs after deploy; sync chip stays 🟢 for steady-state operation.
