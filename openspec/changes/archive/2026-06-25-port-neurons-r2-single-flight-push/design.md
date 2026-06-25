# Design — Serialize neurons R2 pushes (single-flight port)

## Context

- neurons client sync lives in `apps/neurons-tw/src/lib/sync/`. Orchestration is the `SyncEngine` class in `engine.ts`; the single push/pull adapter is `r2/engine-r2.ts`; the user-scoped ETag cache is `r2/etag.ts` (from `reduce-r2-412-storm` D2/D4, already merged at `0540478`/`c33e3f7`). React mounting + triggers are in `useSync.ts`.
- **neurons is R2-only and single-bundle** (`users/<sub>/neurons-snapshot.json.gz`). There is **no Supabase dual-write path** and **no `dirty.perTable` marker model** — `SyncEngine` tracks a single `pending: boolean` and `pushBundle` rebuilds a *full* snapshot from Dexie on every push. This is materially simpler than 二階's per-bundle / per-table-dirty engine.
- `pushNow()` (`engine.ts:75`) currently has only a weak in-tab guard (`if (!this.pending && this.state === 'pushing') return`) and then calls `await pushBundle(...)` with **no single-flight serialization** — two concurrent `pushNow()` calls (or two tabs) run the PUT at once.
- Push triggers that can overlap: the debounced timer (`schedulePush` → `pushNow` after 3s), the `beforeunload` flush (`useSync.ts:130`), the manual `syncNow()` status-light click (`useSync.ts:191`), and **other tabs of the same user** (separate JS heaps, separate in-memory ETag Maps).
- `pushBundle` (`engine-r2.ts:40`) sends `If-Match: <getEtag>` when an ETag is cached, else `If-None-Match: *`; on 412/409 it pulls (`conditional:false`), backs off, and retries ≤3; exhaustion throws `r2_blob_concurrent_writer_exhausted` — the storm signature. **This internal 412-retry pull runs inside `pushBundle`**, so it is inside the push critical section once we add the lock — but it does NOT acquire the push lock itself, so there is no pull↔push self-deadlock.
- **Second R2 PUT path:** `resetNeuronsAccountData` (`services/account-reset.ts:48`) calls `pushBundle(... { snapshotOverride })` **directly** (not via `engine.pushNow`) to overwrite the cloud bundle with an empty `reset_at` snapshot. This is neurons' equivalent of 二階's `pushAllNow` reset path — which 二階 also serializes under the lock. The port MUST cover it too, or the reset PUT stays an unserialized 412 source.
- `getEtag(userId)` (`etag.ts:23`) is **mem-first** (`mem ?? localStorage`). A tab whose in-memory Map holds a stale ETag will not see another tab's newer persisted ETag.
- Cold-start force-pull is currently **fire-and-forget**: `useSync.ts:113` does `void engine.pullNow({ force: true })` — nothing retains or awaits it before pushes are allowed.
- **This is a faithful port of `r2-single-flight-push` (study-rpg-2nd)**, whose `design.md` / `tasks.md` / `specs/cloud-sync/spec.md` are the source-of-truth template. Decisions below note where neurons diverges from 二階.

## Goals / Non-Goals

**Goals:**
- At most one R2 push in flight per user, across same-tab overlapping triggers AND concurrent tabs of the same origin.
- A serialized writer uses the previous writer's freshest persisted ETag → no cross-tab `If-Match` 412.
- The first push after cold start uses a warm ETag (no guaranteed empty-cache 412).
- Measurably lower account-wide R2 412 fraction (the leverage on neurons is higher than 二階 because of its 3s debounce vs 10s).

**Non-Goals:**
- No `storage`-event live ETag propagation between tabs (marginal once the within-lock re-read lands; deferred).
- No pull/push epoch fence (二階 codex F1) — pre-existing, low practical risk, separate concern.
- No dual-mode marker-clear gating (二階 codex F3) — **N/A: neurons has no dual mode**.
- No snapshot→clear TOCTOU **lost-write** fix (二階 codex F2) — **N/A by construction: neurons clears no per-row dirty markers**. A write that lands mid-push is not *lost*: it is persisted in IndexedDB and, because every push rebuilds a full snapshot, the next push (this session via `pending`/debounce, or — in the tab-close corner where `beforeunload` early-returns on `state==='pushing'` and there is no hidden-flush — the next session's cold-start push) always re-includes it. The only residual is *delayed propagation* in that tab-close corner, which is **pre-existing and not worsened by this change**; tightening it (a hidden-tab pending flush, see Non-Goals) is deferred.
- No change to merge semantics, bundle schema, or the Worker.
- No rework of the engine's single-`state` machine to fix the cosmetic clobber where a slow startup force-pull that resolves *after* the 8s await-timeout can set `state='idle'` over an in-flight push's `'pushing'` (codex diff-review nice-to-have). Accepted: it only flickers the status chip / may trigger one extra `beforeunload` push, which the lock serializes into a harmless redundant 200 — no data effect. A token/`activePushCount` refactor of the shared `pullNow` state writes is riskier than the flicker it removes; deferred.

## Decisions

### D1. Web Locks as the single serialization primitive (S1), via one shared helper
Introduce a single shared `pushBundleSerialized(supabase, db, userId, opts?)` (in `r2/engine-r2.ts`) = `withPushLock(userId, () => { refreshEtagFromStore(userId); return pushBundle(supabase, db, userId, opts) })`. The engine's debounced/manual push (`engine.ts pushNow()`) routes through it. The account-reset path uses the **same primitives** (`withPushLock` + `refreshEtagFromStore` + low-level `pushBundle`) **inline**, because it needs a *wider* critical section than a single PUT — see D6. Either way, every R2 PUT for the user runs under the same per-user lock with a fresh ETag.
- One lock name per user serializes same-tab overlaps AND cross-tab concurrent pushes — Web Locks are origin-wide.
- Auto-released when the callback settles or the holding tab is killed (no manual leader / heartbeat / stuck-lock risk).
- The state-machine transitions (`state = 'pushing'` etc.) and `onPushComplete` stay in `pushNow`; only the R2 write goes through the helper. The S3 startup-pull await (D4) happens in `pushNow` **before** calling the helper (so the lock is never held across the warm-up pull).
- `opts` carries `snapshotOverride` so the reset path keeps its empty-bundle override while still getting lock + fresh ETag.
- **Only `pushBundle`'s own 412-retry pull runs inside the lock** (by being inside `pushBundle`); the normal/external pull path (`engine.pullNow`, visibility pull, cold-start force-pull) is NOT lock-gated.
- **Alternative considered:** wrap the lock inline at each call site — rejected (duplicates the lock+refresh boilerplate; the two sites would drift, which is exactly how 二階's `pushAllNow` first shipped missing `refreshEtagFromStore`, codex F4).
- **Alternative considered:** a `BroadcastChannel` leader election — rejected (more code, manual heartbeat, stuck-leader risk; Web Locks gives auto-release for free).

### D2. neurons-specific lock prefix (S1, divergence from 二階)
Lock name = `'neurons-rpg.r2-push.' + userId`, **not** 二階's `'study-rpg.r2-push.'`.
- `med-study-rpg.com/neurons/` and `med-study-rpg.com/2nd/` share the **same browser origin** (Web Locks are keyed by scheme+host+port, not path). The same signed-in `userId` could have both apps open.
- The two apps push to **different R2 bundles** (neurons vs m2) — they never actually conflict — so sharing a lock name would only introduce needless cross-app serialization. Distinct prefixes keep them independent.
- **Alternative considered:** reuse `'study-rpg.r2-push.'` for symmetry — rejected for the coupling reason above.

### D3. Within-lock fresh ETag, no dirty re-check (S2, divergence from 二階)
Add `refreshEtagFromStore(userId)` to `etag.ts`: re-sync the in-memory `mem` entry from `localStorage` (set when present, delete when the key was cleared → next push uses `If-None-Match:*`). Call it **inside the lock, immediately before `pushBundle`**, so a serialized writer #2 (esp. cross-tab) picks up writer #1's just-persisted ETag and sends `If-Match: <fresh>`.
- This is what makes the lock actually *eliminate* cross-tab 412 rather than merely serialize the 412s.
- **Divergence:** 二階 also re-checks `dirty.perTable` inside the lock to no-op a queued push whose markers were already cleared. **neurons does NOT do this** — it has no marker model; it always builds a full snapshot. A queued second push is therefore never *wrong* (it re-uploads current-or-newer state and, thanks to D3, with the fresh ETag → a 200, not a 412). Adding a fake dirty re-check would be inventing state neurons doesn't have. The debounce already coalesces timer-driven pushes; the residual redundant-PUT case (a non-timer trigger overlapping a timer push) settles as a single extra 200, not a 412.

### D4. Await cold-start force-pull before the first dirty push (S3)
- Retain the startup promise on the engine: add `private startupForcePull: Promise<void> | null` and a `beginStartupForcePull()` method that runs `this.pullNow({ force: true }).catch(() => {})` (never-rejecting) and stores it. `useSync.ts:113` changes from `void engine.pullNow({ force: true })` to `engine.beginStartupForcePull()`.
- In `pushNow`, **before acquiring the lock**: `if (this.startupForcePull) { await Promise.race([this.startupForcePull, sleep(STARTUP_PULL_AWAIT_MS)]); this.startupForcePull = null }` with `STARTUP_PULL_AWAIT_MS = 8000`. The promise resolves once and stays resolved, so only the first push waits; the 8s timeout guard ensures a hung/slow pull never blocks pushes permanently.
- `dispose()` nulls `startupForcePull`.
- Invariant preserved: the force-pull itself still issues an unconditional GET that bypasses the cached ETag (the neurons-cloud-sync "Cold-start force-pull bypasses cached ETag" invariant stays true) — D4 only changes *when the first push runs relative to it*.
- The await happens **before** the lock so a tab never holds the lock while waiting on a pull.

### D5. Web Locks fallback (S4, codex-F5-hardened)
When `typeof navigator === 'undefined' || !navigator.locks` (old Safari < 15.4, non-browser test env), `withPushLock` degrades to a **per-`userId` promise-chain** `Map<string, Promise>` — each queued push waits for the previous push for the *same* user, distinct users run concurrently (mirrors the per-user Web Locks contract). Errors are swallowed in the chain so one failed push cannot poison subsequent pushes. (This is the version 二階 arrived at after its codex review flagged a single global chain serializing unrelated users.)

### D6. Serialize the account-reset critical section (codex plan-review + diff-review catch)
`resetNeuronsAccountData` (`services/account-reset.ts`) is the second R2 PUT path. It MUST be serialized under the same per-user lock and use the freshest persisted ETag — otherwise a reset PUT racing a concurrent-tab debounced push would still 412-churn (the very thing this change removes) and would push with a stale in-memory ETag.

**The lock MUST span the reset's PUT + ack + local wipe as one critical section** (codex diff-review blocker), not just the PUT. If only the PUT were locked, a debounced push queued behind the reset could acquire the lock immediately after the empty bundle lands, read the **still-unwiped** Dexie data, and PUT it back — resurrecting the just-reset account in cloud (single-flight makes that interleaving more deterministic than the pre-change race). Holding the lock through `clearLocalSyncedData` guarantees that any queued push only runs after the local wipe, so it can only ever push the empty post-reset state.

Implemented inline with the **low-level** `pushBundle` (NOT `pushBundleSerialized`): `await withPushLock(userId, async () => { refreshEtagFromStore(userId); await pushBundle(..., { snapshotOverride }); writeAckResetAt(...); await clearLocalSyncedData(db) })`. Using `pushBundleSerialized` here would acquire the same Web Lock name from inside an already-held lock → self-deadlock.

The reset path does NOT need the S3 startup-pull await (D4) — that is a cold-start first-push warmth optimization owned by the engine; the reset's own 412-retry loop already handles a cold ETag, and reset is user-initiated well after mount. **Error semantics unchanged:** if the PUT throws, the throw propagates out of the lock before ack/wipe run → reset aborts with local data untouched (the spec's "must-succeed-or-abort" ordering). The convergence design (best-effort leaderboard delete → must-succeed reset push → ack `reset_at` → local wipe; carried-forward `reset_at` on later pushes) is preserved.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Web Lock held across a slow/hung network push blocks a same-user tab's pushes | Low | `pushBundle` uses `fetch` with a finite retry budget (≤3 + backoff); the lock auto-releases when the callback settles or the tab dies. Pulls / gameplay are NOT under the lock |
| Startup-pull await delays the first push noticeably | Low | Bounded by the 8s `Promise.race` timeout; only the FIRST push waits; the force-pull blob is ~10–30 KB |
| Fallback path (no Web Locks) leaves cross-tab races | Low | Affects only Safari < 15.4 (~1% of a modern-device med-student audience); behaviour = today's unserialized baseline |
| Within-lock localStorage ETag read still races a concurrent cross-DEVICE writer | Accepted | 412 → pull-merge-retry (publish-after-apply, D2 of reduce-r2-412-storm) still protects — no data loss, just a residual 412 between *devices* (not tabs) |
| Redundant second PUT when a non-timer trigger overlaps a timer push | Accepted | Lands as a single extra 200 (fresh ETag via D3), not a 412 — strictly better than today's overlapping-412 storm |

## Migration Plan

1. Pure client-side change — ship via the normal neurons CF Pages pipeline (`pnpm deploy:cf` from the deploy worktree `~/coding-scratch/study-rpg`, or the `deploy-cf-pages.yml` main-push workflow). No Worker / D1 / R2 / Supabase migration.
2. **Rollback** = revert the change and redeploy; no persisted state shape changed (no Dexie bump, no `SCHEMA_VERSION` bump), so old and new clients interoperate on the same bundle wire-format. A reverted client simply returns to the unserialized push path.
3. **Post-deploy measurement** gates archive: re-run the per-UTC-hour `PutObject userError` GraphQL (`~/.cf-analytics-token`, recipe in `~/.claude/scratch/handoff-r2-single-flight-2026-06-23.md`) after clients reload-taper (~hours); expect a real account-wide 412-fraction step-down beyond what 二階 alone delivered.

## Open Questions

- None blocking. (Whether any residual cross-*tab* 412 remains after this lands — which would justify the deferred `storage`-event propagation — is an empirical post-deploy question, not a design unknown.)
