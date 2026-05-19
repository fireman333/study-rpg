# Tasks — fix-medexam2-room-write-sync-race

Phase 0 (detection-first) gates Phase 1 (the fix). Do not skip Phase 0; without it there's no signal that the fix actually closed the race.

## Phase 0 — Reproduce the race (detection effort first)

- [ ] **0.1** In a clean dogfood session on the 二階 app (`http://localhost:5173/study-rpg/hospital/` after `pnpm --filter @study-rpg/medexam2-hospital-tw dev`), confirm cloud sync is active (`globalThis.__sync.getStatus() === 'idle'`).
  - Verify: `globalThis.__sync` exists in DEV; `getStatus()` returns `'idle'`.
- [ ] **0.2** Note the current `outpatient-1` facility level via `(await globalThis.__db.rooms.get('outpatient-1')).facilityLevel`. Call this **L0**.
  - Verify: L0 is a positive integer.
- [ ] **0.3** Read the cloud row directly from the Supabase JS client. Confirm cloud value matches L0.
  - Snippet (paste in console):
    ```js
    const c = window.__supabase ?? (await import('/@id/...')); // use authed client; cf. apps/medexam2-hospital-tw/src/lib/auth/client.ts
    const { data: row } = await c.from('hospital_state').select('data').eq('user_id', (await c.auth.getUser()).data.user.id).single();
    console.log('cloud L0 =', row.data.rooms.find(r => r.id === 'outpatient-1').facilityLevel);
    ```
  - Verify: cloud value equals L0.
- [ ] **0.4** Stop any active study session (ensure `gameCounters` ticks are paused). Trigger a facility upgrade on `outpatient-1` via the UI button.
  - Verify: local `(await __db.rooms.get('outpatient-1')).facilityLevel === L0 + 1`.
- [ ] **0.5** Within 1 second of the upgrade, re-run the cloud-row query from 0.3. Record the cloud value.
  - Expected (current/broken behavior): cloud still shows L0. **Document this in the change folder as `phase-0-detection.md` with timestamps.**
  - If cloud already shows L0+1, the race is timing-sensitive on this device; rerun with the tab in background to widen the window (close-tab-immediately variant).
- [ ] **0.6** Confirm cloud catches up only after the next `gameCounters` tick — wait > 5 sec then re-query.
  - Expected: cloud shows L0+1.

**Phase 0 gate**: at least one repro in 0.5 must show stale cloud value, OR the cross-device variant must show local rollback (start a second tab, push from tab A, force-refresh tab B before A's debounce fires, observe whether tab B reverts to the cloud value). Without a repro, do not proceed.

## Phase 1 — Apply the fix

- [x] **1.1** Edit `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`:
  - Extend the `TableAdapter` interface (around line 41-63) with an optional `extraDexieTables?: readonly string[]` field. Add the JSDoc block per design.md Decision 1.
  - On `HOSPITAL_STATE` (around line 144-179), add:
    ```ts
    extraDexieTables: ['rooms', 'tickets', 'gachaStats', 'affinity'] as const,
    ```
    immediately after `dexieTable: 'gameCounters',`.
  - Update the inline comment block at lines 147-150 to reflect that passenger tables now self-trigger push.
- [x] **1.2** Edit `apps/medexam2-hospital-tw/src/lib/sync/engine.ts:114-150`:
  - In `installHooks()`, replace the body of the `for (const adapter of adapters)` loop. Build `const hookedTables = [adapter.dexieTable, ...(adapter.extraDexieTables ?? [])]` and iterate it, looking up each table on `db` and installing identical `creatingFn` / `updatingFn` / `deletingFn` callbacks. All callbacks still call `markDirty(adapter.dexieTable, pk)` (canonical key, not the actual hooked table name).
  - Keep `installedHooks.push(...)` for each subscription so `uninstallHooks` tears them down correctly. Push under the actual table reference so teardown finds the right `table.hook(event).unsubscribe(fn)` target.
- [x] **1.3** Add a DEV-mode overlap check at the top of `installHooks()` (per design.md Decision 1, Risk #3):
  ```ts
  if (import.meta.env.DEV) {
    const seen = new Map<string, string>() // dexieTable → postgresTable
    for (const a of adapters) {
      for (const t of [a.dexieTable, ...(a.extraDexieTables ?? [])]) {
        const prev = seen.get(t)
        if (prev) throw new Error(`[sync] Dexie table '${t}' claimed by both '${prev}' and '${a.postgresTable}' adapters`)
        seen.set(t, a.postgresTable)
      }
    }
  }
  ```
- [x] **1.4** Audit `apps/medexam-tw/src/lib/sync/tables.ts` (一階) to confirm no multi-table singleton adapter exists. Grep for any adapter whose `snapshotDirty`/`snapshotAll` reads from a Dexie table other than its declared `dexieTable`.
  - **Finding** (2026-05-19): No multi-table singleton adapters in 一階. `PLAYER_STATE` (line 73) reads only from `players` table; `SRS_CARDS`, `ITEM_INSTANCES`, `MENTOR_BACKLOG` are collection adapters with single Dexie tables each. No 一階 change required.
- [x] **1.5** Audit `apps/medexam2-hospital-tw/src/lib/sync/r2/*.ts` for any separate Dexie hook installation outside the engine's `installHooks()`. Expectation: none (R2 push reads dirty markers from the same shared `dirty.perTable` map).
  - **Finding** (2026-05-19): `grep -rn '.hook(' apps/medexam2-hospital-tw/src/lib/sync/r2/` returns zero matches. `engine-r2.ts` reads adapters via `buildBundleSnapshot` (snapshotAll-based); dirty-marker tracking remains solely in `engine.ts:installHooks`. Fix applies to both Supabase legacy push and R2 bundle push.

## Phase 2 — Verify the fix

- [x] **2.1** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` SHALL pass.
  - **Result** (2026-05-19): clean (zero diagnostics).
- [ ] **2.2** Re-run the detection script from Phase 0.4–0.5. Cloud value SHALL transition to L0+1 within 3000 ms (the debounce window).
  - If cloud still stale after debounce, the hook didn't install correctly. Diagnose via `globalThis.__sync.getDiagnosticSnapshot()` — `queueDepth` should briefly bump then return to 0.
- [ ] **2.3** Repeat Phase 0 detection for each remaining write site:
  - `services/recruitment.ts:83-84` (recruit roll → `tickets` + `gachaStats`)
  - `services/fate-card.ts:215` (fate-card consumption → `tickets`)
  - `services/fate-card.ts:229` (single-room facility upgrade → `rooms`)
  - `services/fate-card.ts:241` (全院 facility upgrade → `rooms` bulk)
  - `services/quiz-rewards.ts:158` (ticket grant → `tickets`)
  - `lib/mastery.ts:97` (correct answer → `affinity`)
  - Each SHALL trigger a push within 3000 ms; cloud row's relevant field SHALL match local.
- [ ] **2.4** Cross-device pull test (per design.md Risk #2):
  - Device A: upgrade facility, observe cloud row updates within 3000 ms.
  - Device B (already authed, tab in background): bring tab to foreground after A's push completes.
  - B's visibility-pull SHALL apply A's blob; `__db.rooms.get('outpatient-1').facilityLevel` on B SHALL equal A's post-upgrade value.
- [ ] **2.5** Echo-loop regression test:
  - Trigger a pull manually (`globalThis.__sync.pullAllNow({ force: true })`).
  - During the pull, `writeHospitalStateBlob` writes to all four passenger tables.
  - After pull resolves, check `globalThis.__sync.getDiagnosticSnapshot().queueDepth` — SHALL equal 0.
  - No echo push SHALL have fired (no entry in `recentErrors` for a spurious `push:hospital_state`).
- [ ] **2.6** DEV overlap check: temporarily add a fake duplicate `extraDexieTables: ['gameCounters']` on another adapter, reload, confirm engine construction throws. Revert.
- [ ] **2.7** Run `/verify` for the 二階 app (Chrome MCP smoke on facility upgrade button, recruit modal, and quiz answer flow).

## Phase 3 — Land + archive

- [ ] **3.1** Lint + typecheck pass.
- [ ] **3.2** `/opsx:verify` — completeness / correctness / coherence check.
- [ ] **3.3** Commit with message `fix(medexam2-hospital-tw): close hospital_state passenger-table sync race`. Commit body cites this change folder.
- [ ] **3.4** `/opsx:archive` with sync gate. Migrate delta specs into `openspec/specs/cloud-sync/spec.md` + `openspec/specs/hospital-tycoon-engine/spec.md`.
- [ ] **3.5** Merge `track-m2` → `main` after archive (per project.md Sync protocol). Push.
