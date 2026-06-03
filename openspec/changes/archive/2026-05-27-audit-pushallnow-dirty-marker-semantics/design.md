# Design — audit-pushallnow-dirty-marker-semantics

## Context

The `dirty` Map at `engine.ts:29-31` tracks per-table sets of locally-modified row PKs that haven't yet been pushed to cloud:

```ts
interface DirtySet {
  /** Per-table dirty PK sets. Keyed by Dexie table name. */
  perTable: Map<string, Set<string>>
}
```

`markDirty(table, pk)` is called from every Dexie write hook (line 103-110). The debounced push timer flushes by calling `pushAllNow` (or `pushBatch` per-table for incremental pushes). When `pushAllNow` finishes — regardless of per-adapter outcome — line 427 wipes every entry:

```ts
for (const set of dirty.perTable.values()) set.clear()
```

This is bug-equivalent to "commit transaction whether or not all statements succeeded." The reference correct pattern is right there in the same file (lines 271-273 in `pushNow`):

```ts
if (allBundlesOk) {
  for (const set of dirty.perTable.values()) set.clear()
}
```

`pushNow` uses an all-or-nothing test because it's a single-table fast path. `pushAllNow` is the multi-adapter batch path and needs per-adapter granularity, not all-or-nothing — otherwise a single failed adapter would block all retries indefinitely.

## Goals

- **Failed adapter retains its dirty markers** → next debounced/manual push retries
- **Succeeded adapters clear their markers** → no redundant re-push, no false 「未同步」 chip
- **Zero behaviour change on happy path** — when everything succeeds, behaviour is identical to today
- **Defense-in-depth** with AAD-v2 startup probe — probe catches one known failure shape early; conditional clear catches everything else without needing per-failure-mode special handling
- **Symmetric across m1 + m2** — same fix in both apps (neurons-tw uses a different sync architecture, no fix needed)

## Non-Goals

- Per-row failure granularity within a batch — `upsert_lww` RPC doesn't expose per-row outcome, so we can only know "this adapter's batch failed" not "row X failed but row Y succeeded"
- Removing the AAD-v2 startup probe — it gives a structured `pausedReason` for the partial-migration window that's more actionable than just retrying. Keep both layers
- Refactoring `pushNow` — it already does the right thing for its single-table case
- neurons-tw — different architecture, no bug

## Decisions

### Decision 1 — Track failures by dexieTable, not by adapter object

**Choice**: After each per-adapter `try { ... } catch { failed.add(adapter.dexieTable) }`, the failed set keys are Dexie table names (strings). The conditional clear at the end iterates `dirty.perTable` (also keyed by Dexie table name) and looks up membership in the failed set.

**Rationale**:
- The dirty Map's existing key space IS Dexie table names. Matching the key space avoids a translation layer
- Set<string> is cheaper than Set<TableAdapter> for membership checks
- Logging is more readable: `[sync] keeping dirty: hospital_doctors (push failed)` vs object refs

**Trade-off**: If two adapters ever shared the same `dexieTable` (one-to-many), they'd be merged in failure tracking. The current code has 1:1 adapter:table so this is fine. Documented as Known Limitation in case the architecture ever changes.

### Decision 2 — R2 bundle failures propagate to all adapters in the bundle

**Choice**: When `pushBundle(supabase, db, binding.adapters, binding.bundle, userId)` throws, mark **all** `binding.adapters[*].dexieTable` as failed.

**Rationale**:
- R2 pushes a bundle as a single gzipped blob. There's no per-row or per-adapter outcome within a bundle — either the blob lands or it doesn't
- If the bundle failed, none of its constituent dexie tables were committed cloud-side
- Marking all of them dirty preserves correct retry semantics

**Trade-off**: If only one of the bundle's adapters had any dirty rows, the others gain "dirty" markers unnecessarily. The next pushAllNow would still send the full bundle anyway (R2's per-bundle granularity), so the over-dirty marker is a no-op in practice. Acceptable.

### Decision 3 — Dual-write mode (writeSupabase && writeR2) requires BOTH to succeed before clearing

**Choice**:

```ts
const supabaseOk = !backendConfig.writeSupabase || !failedSupabaseDexieTables.has(dexieTable)
const r2Ok       = !backendConfig.writeR2       || !failedR2DexieTables.has(dexieTable)
if (supabaseOk && r2Ok) set.clear()
```

**Rationale**:
- During the R2 migration (current state per `add-r2-cloud-sync-migration`), dual-write is the canonical mode
- If Supabase succeeded but R2 failed for table T: keep dirty so next push retries R2 (without re-trying Supabase needlessly... actually pushAllNow always pushes to both, so the re-push will be a no-op LWW write to Supabase. Idempotent.)
- If R2 succeeded but Supabase failed: same logic
- Only clearing when BOTH succeed prevents subtle drift where Supabase has v4 but R2 has v3 (or vice versa) due to a one-sided silent failure

**Trade-off**: Slightly more conservative than strictly needed for single-backend mode. In single-backend mode (`writeSupabase=true && writeR2=false`), the formula naturally degrades to "clear iff Supabase succeeded" because the R2 branch's `!backendConfig.writeR2` short-circuits to true. So no extra waste.

### Decision 4 — Conditional clear happens at end of pushAllNow, NOT inside per-adapter loops

**Choice**: Aggregate failures in two Set<string>s during the loops, then do the single conditional-clear pass after both loops complete.

**Rationale**:
- Keeps existing loop structure intact (minimal blast radius for the diff)
- All failure decisions in one place at the end — easier to reason about
- Allows the same dexie table to be "rescued" if Supabase fails but R2 succeeds (the conditional check sees BOTH outcomes)

**Trade-off**: Slight memory overhead (two Sets per pushAllNow call). Negligible — typical worst-case is 10-15 tables.

### Decision 5 — Vitest mocking strategy: stub `pushBatch` / `pushBundle` at module level

**Choice**: Use Vitest `vi.mock()` to swap `pushBatch` and `pushBundle` for stubs that can be configured per-test to throw on specific tables/bundles. Keep the real Dexie + dirty-marker code paths in scope so the test verifies the actual conditional-clear logic.

**Rationale**:
- `pushBatch` and `pushBundle` are the network boundary — easy to stub without standing up fake-Supabase or miniflare-R2
- Tests run fast (no async network), deterministic (no race conditions), and exercise the real engine state machine
- Mirrors the canonical test pattern in `retirement-tombstone.test.ts` (Vitest + fake-indexeddb)

**Trade-off**: Doesn't test the real Supabase RPC client error shapes. Acceptable — engine.ts only inspects `err.message` for routing; behaviour is identical for any throw.

### Decision 6 — Don't change `pushNow` (single-adapter path)

**Choice**: `pushNow` at lines 271-273 already has the right `if (allBundlesOk)` gate. Leave it alone.

**Rationale**:
- It's already correct
- Refactoring touches it adds unnecessary diff
- `pushNow` covers the per-debounce-tick fast path; `pushAllNow` covers the all-tables batch path. Different code paths, both need conditional clear, only one is currently buggy.

**Trade-off**: Slight code duplication (same conditional pattern in two places). Acceptable — the two paths have different inputs (single bundle vs all adapters) and a shared helper would introduce more complexity than it saves.

### Decision 7 — Capability: extend existing `cloud-sync`, not new

**Choice**: Add ONE new Requirement to `openspec/specs/cloud-sync/spec.md`. Don't create `cloud-sync-failures` or `dirty-marker-semantics` as a sibling capability.

**Rationale**:
- `cloud-sync` already owns the push/pull lifecycle (13 requirements covering debounced push, offline queue, sign-out flush, etc.)
- Conditional clear is a refinement of existing push semantics, not a new domain
- Closest existing requirement is "Offline queue defers pushes without blocking gameplay" (handles total network unavailability); this change handles **partial** failures

**Trade-off**: `cloud-sync` capability becomes 14 requirements. Acceptable — capability size isn't a metric we optimize for.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Conditional clear has subtle bug → SOME table's marker stays dirty forever even after success → 「同步中」 chip never goes idle | P2 頂級 | Vitest scenarios explicitly cover the "retry after fix" case. Manual prod smoke: confirm sync chip transitions 🟢 → 🟡 → 🟢 across a few normal pushes |
| `dirty.perTable.entries()` iteration vs `dirty.perTable.values()` performance regression | P5 拉完了 | Both are O(n) where n = number of tables (~10-15). Negligible difference |
| Adapter signature changes (e.g., add `dexieTable` field where it doesn't currently exist) | P3 NPC | Audit confirmed TableAdapter already has `dexieTable: string` per `services/tables.ts`. Verify at impl time |
| Tests pass via fake-indexeddb but real prod hits a different error shape | P3 NPC | Engine only inspects `err.message` substring; any throw triggers the catch block. Real-world: AAD-v2 already validated this pattern in §8.12 fixture |
| Dual-write subtle: Supabase succeeds + R2 fails for a table → marker stays → next push re-uploads same data to Supabase | P4 NPC | Documented in Decision 3 trade-off. LWW makes re-uploads idempotent. Acceptable |
| Future contributor copies the unconditional clear pattern back when adding a third backend | P3 NPC | CLAUDE.md "Known sharp edges" entry warns explicitly; the new spec requirement is enforceable in code review |

## Alternatives Considered

### A — Per-row failure tracking inside `upsert_lww` batch

Would require: `upsert_lww` RPC returns array of `{ pk, success }` results, client iterates and marks per-row failures. Strict but requires SQL function change and breaks the current "atomic batch" semantic. **Rejected** — not worth the SQL surface change for hypothetical per-row partial failures (Supabase batch failures in practice are all-or-nothing).

### B — Move dirty-marker clearing into each adapter's success callback

Push the responsibility into individual adapter implementations. Each adapter would call back to engine on success. **Rejected** — spreads logic across files; current centralized clear pattern is easier to reason about + matches the centralized failure-aggregation pattern in this design.

### C — Wrap `pushAllNow` in a transaction-style retry loop

Auto-retry failed adapters N times before giving up. **Rejected** — retries should happen at the debounce-timer / user-triggered level, not inside pushAllNow itself. The debounce timer already re-runs pushAllNow within seconds; explicit auto-retry would multiply load on transient failure. The natural retry mechanism is "next push tick fires, sees still-dirty markers, retries."

### D — Use Promise.allSettled() instead of sequential per-adapter loops

Could parallelize push attempts. **Rejected** — current sequential pattern is intentional (avoids overloading Supabase with concurrent RPCs during sync; preserves stable error ordering for `firstError` reporting). Conditional clear works the same regardless of parallel vs sequential.

### E — Just delete `pushAllNow` and rely on per-table `pushNow` calls

Drastic simplification. **Rejected** — pushAllNow is the migration path for "first sync after sign-in" and the sign-out flush path. It legitimately needs the batch semantics; the bug is the unconditional clear, not the existence of the function.

## Open Questions

None — design fully bounded by:
1. Audit findings (file:line for every touchpoint)
2. Reference pattern (`pushNow:271-273` already shows the correct conditional shape)
3. Existing `TableAdapter.dexieTable` field already available in scope of both loops
