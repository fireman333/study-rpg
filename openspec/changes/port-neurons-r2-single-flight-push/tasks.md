# Tasks — Serialize neurons R2 pushes (single-flight port)

## 1. Push lock primitive (S1 + S4)

- [x] 1.1 Add `apps/neurons-tw/src/lib/sync/r2/push-lock.ts` exporting `withPushLock(userId, fn)`: use `navigator.locks.request('neurons-rpg.r2-push.' + userId, fn)` when available; else a per-`userId` promise-chain `Map<string, Promise>` fallback (errors swallowed in the chain so a failed push can't poison the next; distinct users run concurrently). Lock prefix MUST be neurons-specific (`neurons-rpg.r2-push.`), NOT `study-rpg.r2-push.`.

## 2. Within-lock fresh ETag (S2)

- [x] 2.1 Add `refreshEtagFromStore(userId)` to `apps/neurons-tw/src/lib/sync/r2/etag.ts`: re-sync the in-memory `mem` entry from `localStorage` for the user's single key (set when present, delete when the key was cleared); no-op when `localStorage` is unavailable.

## 3. Shared serialized-push helper (S1 + S2, covers BOTH PUT paths — D1/D6)

- [x] 3.1 Add `pushBundleSerialized(supabase, db, userId, opts?)` to `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts` = `withPushLock(userId, () => { refreshEtagFromStore(userId); return pushBundle(supabase, db, userId, opts) })`. `opts` passes through `snapshotOverride`. No dirty re-check (neurons has no marker model).
- [x] 3.2 `engine.ts pushNow()`: replace the bare `await pushBundle(this.supabase, this.db, this.user.id)` with `await pushBundleSerialized(this.supabase, this.db, this.user.id)`. Keep state-machine transitions and `onPushComplete` outside the lock.
- [x] 3.3 `services/account-reset.ts`: wrap the reset's PUT + `writeAckResetAt` + `clearLocalSyncedData` in ONE `withPushLock(userId, …)` critical section (calling the low-level `pushBundle` + `refreshEtagFromStore` inline, NOT `pushBundleSerialized` — nesting the same Web Lock self-deadlocks), so a push queued behind the reset can't resurrect the account (codex diff-review blocker). Reset semantics (ordering / ack / carried-forward `reset_at` / must-succeed-or-abort) unchanged.

## 4. Await cold-start force-pull before first push (S3)

- [x] 4.1 `engine.ts`: add `private startupForcePull: Promise<void> | null = null` + `beginStartupForcePull()` that runs `this.pullNow({ force: true }).catch(() => {})` and synchronously stores it; add module-level `STARTUP_PULL_AWAIT_MS = 8000` + a `sleep` helper.
- [x] 4.2 `engine.ts pushNow()`: BEFORE calling `pushBundleSerialized`, `if (this.startupForcePull) { await Promise.race([this.startupForcePull, sleep(STARTUP_PULL_AWAIT_MS)]); this.startupForcePull = null }`. `dispose()` sets `startupForcePull = null`. (Reset path does NOT await this.)
- [x] 4.3 `useSync.ts:113`: change `void engine.pullNow({ force: true })` → `engine.beginStartupForcePull()`.

## 5. Tests

- [x] 5.1 Add `apps/neurons-tw/src/__tests__/r2-single-flight-push.test.ts`: `withPushLock` serializes same-user under a `navigator.locks` mock; distinct users run concurrent; fallback (no `navigator.locks`) serializes same-tab + a throw doesn't poison the next + distinct users concurrent.
- [x] 5.2 Same test file: `refreshEtagFromStore` cross-tab fresh pickup (mem updated from localStorage); cleared-key drop (mem entry deleted → next `getEtag` returns null); no-localStorage no-op.
- [x] 5.3 Add `apps/neurons-tw/src/__tests__/r2-push-serialized.test.ts` (separate file — file-level `vi.mock` of the sibling deps can't coexist with the real-primitive tests in 5.1/5.2): `pushBundleSerialized` acquires the push lock and calls `refreshEtagFromStore` BEFORE the PUT, and passes `snapshotOverride` through — covers BOTH the engine and reset call sites by construction.
- [x] 5.4 `pnpm --filter @study-rpg/neurons-tw test` (vitest) green; `pnpm -r typecheck` green.

## 6. Verify

- [x] 6.1 Codex (`/cdx review` or `gpt-5.x` adversarial) review of the apply diff before archive (二階's codex pass caught a blocking regression — mirror that gate).
- [x] 6.2 `/verify` — built+deployed (CI Deploy Cloudflare Pages green; prod bundle `index-D7LXtueJ.js` carries the Supabase env + `neurons-rpg.r2-push` lock string). Chrome MCP live smoke on prod (owner signed in, 2026-06-23): monkeypatched `navigator.locks.request` caught the deployed code acquiring `neurons-rpg.r2-push.<uid>` (req→acq→held 493ms→rel around the real R2 PUT) and, under a self-generated push burst, granted **5 concurrent requests one-at-a-time** (1 held, 3 pending) — single-flight serialization confirmed live (Web Locks active path, not fallback). **0 push-412 across all PUTs (all 200), PUTs non-overlapping, 0 console errors.** (Behavioral instrument = the `request` monkeypatch; the `read_network_requests` PUT-blindspot + a flaky `locks.query()` poll both apply — verify via the patch / Performance timings.)
- [x] 6.3 `openspec validate port-neurons-r2-single-flight-push --strict` passes.

## 7. Measure (post-deploy, gates archive)

- [ ] 7.1 After clients reload-taper (~hours), re-run the per-UTC-hour `PutObject userError` GraphQL (`~/.cf-analytics-token`, recipe in `~/.claude/scratch/handoff-r2-single-flight-2026-06-23.md`); record the account-wide 412-fraction step-down vs the pre-fix 84–90% baseline. Only then `/opsx:archive`.
