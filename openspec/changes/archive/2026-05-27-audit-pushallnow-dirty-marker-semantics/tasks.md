# Tasks — audit-pushallnow-dirty-marker-semantics

## 1. Engine fix (m2 — primary)

- [x] 1.1 Read [`apps/medexam2-hospital-tw/src/lib/sync/engine.ts`](apps/medexam2-hospital-tw/src/lib/sync/engine.ts) `pushAllNow` (lines ~384-437) end-to-end. Confirm:
  - `adapters` iterable shape (each has `dexieTable` + `postgresTable` + `snapshotAll`)
  - `r2Bundles` iterable shape (each has `bundle` + `adapters: TableAdapter[]`)
  - `dirty.perTable: Map<string, Set<string>>` is in closure scope
  - `backendConfig.writeSupabase` + `backendConfig.writeR2` flags
- [x] 1.2 Replace `pushAllNow` body to add per-adapter failure tracking:
  ```ts
  const failedSupabaseDexieTables = new Set<string>()
  const failedR2DexieTables = new Set<string>()
  
  // Supabase loop — same as today but populate failed set on catch
  for (const adapter of adapters) {
    try {
      const payloads = await adapter.snapshotAll(db, userId, updatedAt, appVersion)
      if (!payloads.length) continue
      await pushBatch(adapter.postgresTable, payloads)
    } catch (err) {
      failedSupabaseDexieTables.add(adapter.dexieTable)
      onError(err, `pushAll:${adapter.postgresTable}`)
      if (!firstError) firstError = ...
      if (isOffline(err)) anyOffline = true
    }
  }
  
  // R2 loop — same as today but propagate failure to all adapters in the bundle
  for (const binding of r2Bundles) {
    try {
      await pushBundle(supabase, db, binding.adapters, binding.bundle, userId)
    } catch (err) {
      for (const a of binding.adapters) failedR2DexieTables.add(a.dexieTable)
      onError(err, `pushAllR2:${binding.bundle}`)
      if (!firstError) firstError = ...
      if (isOffline(err)) anyOffline = true
    }
  }
  
  // Conditional clear — only tables where neither active backend failed
  for (const [dexieTable, set] of dirty.perTable.entries()) {
    const supabaseOk = !backendConfig.writeSupabase || !failedSupabaseDexieTables.has(dexieTable)
    const r2Ok       = !backendConfig.writeR2       || !failedR2DexieTables.has(dexieTable)
    if (supabaseOk && r2Ok) set.clear()
  }
  ```
- [x] 1.3 Update the inline comment block above the original `for (const set of dirty.perTable.values()) set.clear()` to explain conditional clear semantics + reference `pushNow:271-273` as the matching pattern + link this change spec
- [x] 1.4 Preserve all existing onError + firstError + anyOffline + endOp behaviour — diff should ONLY be: 2 new Set declarations + 2 new lines in each catch block + replace 1-line clear loop with 5-line conditional clear loop. **No other behaviour changes.**
- [x] 1.5 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` → clean

## 2. Engine fix (m1 — symmetric)

- [x] 2.1 Read (NOTE: m1 ALSO has R2 branch, applied symmetric fix) [`apps/medexam-tw/src/lib/sync/engine.ts`](apps/medexam-tw/src/lib/sync/engine.ts) `pushAllNow` (lines ~326-379). Confirm shape (Supabase-only, no R2 branch)
- [x] 2.2 Apply (incl. R2 branch) equivalent fix — Supabase-only version:
  ```ts
  const failedSupabaseDexieTables = new Set<string>()
  for (const adapter of adapters) {
    try { ... } catch (err) { failedSupabaseDexieTables.add(adapter.dexieTable); ... }
  }
  for (const [dexieTable, set] of dirty.perTable.entries()) {
    if (!failedSupabaseDexieTables.has(dexieTable)) set.clear()
  }
  ```
  No R2 branch needed (m1 doesn't have R2 wired up)
- [x] 2.3 `pnpm --filter @study-rpg/medexam-tw typecheck` → clean

## 3. neurons-tw — verify no fix needed

- [x] 3.1 Confirm `apps/neurons-tw/src/lib/sync/engine.ts` uses class-based `SyncEngine` with `pending: boolean` (not `dirty.perTable` Map). No change required (audit Finding 6 confirms this)

## 4. Vitest unit test — DEFERRED to follow-up change

**Decision (2026-05-27 apply session)**: The 4 BDD scenarios documented in `specs/cloud-sync/spec.md` define test policy, but a clean Vitest implementation requires ~150 lines of fakes/mocks because:
- The engine factory has heavy dependencies (Supabase client, real Dexie hooks, R2 push, startup probe)
- `dirty.perTable` is closure-private (only `queueDepth` exposed via `getDiagnosticSnapshot`); per-table-marker assertions need either a refactor that violates Karpathy principle 2 or behavioural-via-queueDepth that only partially exercises the conditional logic
- Scaffolding cost is disproportionate to the 25-line code fix

Trade-off accepted: ship engine fix + docs now (the fix itself is small + low-blast-radius + only changes behaviour in the rare failure path), and spawn a dedicated follow-up change [`add-sync-engine-partial-failure-tests`](openspec/changes/) that owns the test scaffolding scope on its own merits.

- [ ] 4.1 ~~Create `apps/medexam2-hospital-tw/src/__tests__/sync-engine-partial-push-failure.test.ts`~~ — deferred per above
  - Header comment explaining the bug this guards against + the 4 scenarios + reference to the spec + a3 §8.12 canonical pattern
  - Setup: `vi.mock('../sync/tables', () => ({ ... }))` and `vi.mock('../sync/r2/engine-r2', () => ({ pushBundle: vi.fn() }))` to stub the network boundary
  - Use `fake-indexeddb` Dexie (same pattern as `retirement-tombstone.test.ts`)
  - Spin up a real engine via the engine factory, with stubbed `pushBatch`/`pushBundle`
  - **Scenario A**: 2 dirty tables (e.g. `gameCounters` + `hospitalDoctors`). Mock `pushBatch` to fail when called with `gameCounters` postgresTable. Call `pushAllNow`. Assert: `gameCounters` dirty set still has entries; `hospitalDoctors` dirty set empty
  - **Scenario B**: Same as A. Reset mock to succeed. Call `pushAllNow` again. Assert: `gameCounters` dirty set is now empty (retry succeeded)
  - **Scenario C** (R2 path): 2 R2 bundles dirty. Mock `pushBundle` to throw on `m2` bundle only. Call `pushAllNow`. Assert: all `m2` bundle adapters' dexie tables remain dirty; `bookmarks` adapters' tables clear
  - **Scenario D** (dual-write): backendConfig with both writeSupabase + writeR2. 1 dirty table whose adapter is in BOTH the Supabase adapter list AND an R2 bundle. Mock R2 push to fail, Supabase succeed. Assert: marker stays dirty (need BOTH to succeed)
  - Cleanup: `Dexie.delete(TEST_DB)` in afterEach
- [ ] 4.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test -- sync-engine-partial-push-failure` → expect 4/4 green
- [ ] 4.3 (Optional) Run full Vitest suite for m2 to confirm no regression: `pnpm --filter @study-rpg/medexam2-hospital-tw test` → all green

## 5. Documentation

- [x] 5.1 Add one paragraph to project `CLAUDE.md` "Known sharp edges" section:
  - One-sentence summary: `pushAllNow` clears dirty markers conditionally (per-adapter outcome, NOT unconditional)
  - Pointer to spec requirement: `openspec/specs/cloud-sync/spec.md` (after archive)
  - Reference pattern: `pushNow:271-273` already does conditional; `pushAllNow:427` was the buggy outlier (now fixed)
  - Cross-reference: neurons-tw uses different architecture, doesn't share the bug
  - Why context: "Per AAD-v2 §13.2 root-cause analysis; the unconditional clear silently lost data on any transient adapter failure"
- [x] 5.2 Update `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` cross-references section to add A2 as the third member of the schema-evolution-guards cluster:
  - A3 = CI lint (compile-time)
  - A1 = Worker presign (transport-time)
  - A2 = conditional dirty-clear (runtime push-failure resilience)
  - All three live under different specs but together form a coherent defense

## 6. Validation

- [x] 6.1 `openspec validate audit-pushallnow-dirty-marker-semantics --strict` → expect pass
- [x] 6.2 `openspec validate --all --strict` → expect only dormant `remove-medexam-tw-and-promote-neurons` failure (unchanged from A1 archive baseline)
- [x] 6.3 `pnpm typecheck` per affected app (`medexam-tw` + `medexam2-hospital-tw`) → clean
- [x] 6.4 `pnpm --filter @study-rpg/medexam2-hospital-tw test` → 94/94 existing tests pass (new partial-failure test deferred per §4) (existing tests + new partial-failure test)
- [x] 6.5 `pnpm lint:dexie-fixtures` (A3) → exit 0 (no schema bumps in this change)

## 7. Production verify

- [ ] 7.1 With user confirm: push commit → CI auto-deploys CF Pages + GH Pages + Worker (Worker isn't touched but auto-deploy is fine)
- [ ] 7.2 Open `https://med-study-rpg.com/2nd/`, sign in, trigger a study session, confirm sync chip 🟡 → 🟢 normal flow (no regression)
- [ ] 7.3 Open Chrome devtools → Network → Throttling → Offline. Trigger a state mutation (answer a quiz / start study session). Wait debounce. Re-enable network. Confirm:
  - sync chip went 🟡 during offline period (per existing "offline queue" req)
  - sync chip returns to 🟢 once back online (new behaviour: retry succeeded because marker stayed dirty)
  - No console errors beyond the expected offline log
- [ ] 7.4 (Optional, more invasive) Use Chrome devtools "Local Overrides" or similar to mock just the `/presign` endpoint to return 503 for one bundle. Trigger a state mutation. Confirm the failed bundle's local rows remain dirty + chip stays 🟡 until next push attempt succeeds

## 8. Composing commit + archive

- [x] 8.1 With user confirm: stage 7 explicit files (per Multi-Agent Git Safety):
  - `apps/medexam2-hospital-tw/src/lib/sync/engine.ts`
  - `apps/medexam-tw/src/lib/sync/engine.ts`
  - `apps/medexam2-hospital-tw/src/__tests__/sync-engine-partial-push-failure.test.ts`
  - `CLAUDE.md`
  - `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`
  - `openspec/changes/audit-pushallnow-dirty-marker-semantics/{proposal,design,tasks}.md` + `specs/cloud-sync/spec.md`
- [x] 8.2 With user confirm: `git commit -m "spec(propose+impl): audit-pushallnow-dirty-marker-semantics — conditional dirty-clear per adapter outcome"`
- [ ] 8.3 With user confirm: `/opsx:archive audit-pushallnow-dirty-marker-semantics` (delta sync adds 1 requirement to cloud-sync)
- [ ] 8.4 With user confirm: `git commit -m "spec(archive): merge audit-pushallnow-dirty-marker-semantics — conditional dirty-clear per adapter outcome"`
- [ ] 8.5 With user confirm: `git push origin main`
- [ ] 8.6 Watch CI: lint + 3 deploys all green

## 9. Follow-ups (DO NOT include in this change)

- [ ] 9.1 **`add-sync-engine-partial-failure-tests`** — owns the Vitest test scaffolding deferred from §4 of this change. 4 BDD scenarios from `specs/cloud-sync/spec.md` (single fail / retry succeeds / R2 bundle fail / dual-write requires both). Likely needs either (a) minimal fake-supabase + fake-Dexie setup ~150 lines, OR (b) targeted refactor exposing a small testable surface
- [ ] 9.2 (Lower priority) Add miniflare/vitest Worker test suite — would also enable testing `pushAllNow` + Worker presign + R2 round-trip together. Already noted as follow-up in A1 §9.3
- [ ] 9.2 (Defer) Per-row failure tracking inside `upsert_lww` batch — requires SQL function change to return per-row status. Defer until evidence of partial-row failures emerges
- [ ] 9.3 (Optional cleanup) Once dogfood confirms A2 stable for ~1 week, consider whether the AAD-v2 startup probe can be simplified or its `pausedReason` extended to cover other failure modes. Keep both layers for now (defense-in-depth)
