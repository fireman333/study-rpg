# Reduce the R2 PutObject 412 retry storm (neurons share of the account-wide R2 bill)

## Why

The Cloudflare R2 bucket is **shared account-wide** across neurons + 二階 (same Worker `api.med-study-rpg.com`, `users/<sub>/...` key layout, same R2 account). Cloudflare R2 analytics (verified 2026-06-22) showed a **PutObject 412 retry storm** billing R2 Class A **~$67.50/cycle** (the base account plan is otherwise free; R2 Class A operations bill past the 1M/month free tier).

二階 was already fixed (`study-rpg-2nd` commit `e14f609`, change `reduce-r2-412-storm`, live + smoke-green). Its task list closes with §6.3 **「Port D1+D2+D4 to the neurons app — account-wide R2 bill needs both apps fixed」**. This change is that port: **the bill is account-wide, so neurons must be fixed too**, even though 二階's client-side fix already shipped.

Two mechanisms drove the storm; only one applies to neurons (recon-verified this session, file:line confirmed against `apps/neurons-tw/src/lib/sync/`):

1. **The R2 push ETag is process-lifetime only.** `r2/etag.ts` persists nothing across reloads, and its single global key (`neurons-rpg.sync.etag.neurons`) is **not user-scoped**. Consequences:
   - A push after a page reload (cold in-memory etag) sends `If-None-Match: *` against an already-existing blob → guaranteed **412** → pull → retry.
   - The pull path publishes the server ETag **before** `applyBundleSnapshot` merges it, so a second tab can PUT with an un-merged etag (a cross-tab data-overwrite hole, not just a 412).
   - A `404`/`blobMissing` after a server reset leaves a stale `If-Match` cached → the retry loops 412 instead of falling back to `If-None-Match: *`.
   - **neurons-specific amplifier (worse than 二階 had):** the single *global* etag key means after an account switch, account B's first push reuses **account A's etag** → `If-Match` mismatch → 412. 二階 was already user-scoped, so it never had this. The user-scope fix is the highest-value part for neurons.

2. **The R2 push loop pushes ALL bundles on ANY dirty marker** (二階 D1) — **N/A for neurons.** neurons is **single-bundle** (`BUNDLE_NAME='neurons'`) and uses a `pending: boolean` flag, not per-row dirty markers, so there is no bundle loop and no doubling bug. Likewise 二階's dual-mode dirty-snapshot trap (C1) cannot exist — neurons is pure-R2 with no Supabase write loop.

So the neurons change = **trimmed D2 + D4 only**.

## What Changes

Scope = the cheap, low-risk, high-leverage subset that applies to neurons; measure post-deploy, then decide on the heavier concurrency work (deferred).

- **Persist the R2 push ETag across reloads — user-scoped and apply-safe (D2):**
  - Persist to `localStorage` under a **user-scoped** key `neurons-rpg.sync.etag.<userId>` (no bundle segment — neurons is single-bundle). `getEtag` / `setEtag` / `clearEtag` take `userId`; an in-memory layer reads through / writes through for speed.
  - **Publish the pull-path ETag only AFTER `applyBundleSnapshot` succeeds** (today it is set before), so a second tab can never PUT using an etag whose snapshot this tab hasn't merged yet.
  - **Clear the persisted ETag on a 412→pull→`blobMissing` (404)** (both the HEAD-404 and GET-404 branches) so the retry falls back to `If-None-Match: *` instead of looping on a stale `If-Match`.
  - **Preserve invariants:** the push-path `200` still persists immediately (the just-uploaded snapshot IS local truth); the decode-fail path still keeps its etag (corrupt-blob overwrite recovery); cold-start force-pull still bypasses the cached etag (unconditional GET).
- **Clear the persisted ETag + presign cache on account switch / wipe / reset (D4):** `clearLocalSyncedData` (the neurons wipe surface — there is no `migration.ts`) calls `clearAllPersistedEtags()` + `clearPresignCache()`. This transitively covers the in-place reset flow too (`services/account-reset.ts` calls `clearLocalSyncedData`). Today both `clearEtag` and `clearPresignCache` are **dead code, never called**.

## Impact

- **Affected specs:** `neurons-cloud-sync` (+2 ADDED requirements: ETag persistence + account-switch/wipe clears etag & presign).
- **Affected code:** `apps/neurons-tw/src/lib/sync/{r2/etag.ts, r2/engine-r2.ts, engine.ts, account-guard.ts}` + new test `apps/neurons-tw/src/__tests__/r2-etag-persistence.test.ts`. **No Worker / presign / D1 change. No Dexie schema bump. No R2 `SCHEMA_VERSION` bump. No LWW merge-semantics change.**
- **Expected effect:** a drop in R2 Class A PutObject (success + 412) and the lockstep GetObject reads — the neurons share of the account-wide bill. Verify post-deploy by re-running the per-UTC-hour `PutObject userError` Analytics GraphQL query and watching the step-down as clients reload.
- **Residual (expected, not a regression):** neurons' debounce is **3s** (vs 二階 10s), so an in-session push-vs-push 412 from two near-simultaneous mutations stays visible. The storm share that drops here is the **cold-start / cross-account / 404-first-push** 412s (no D1 component for neurons). The remaining concurrency 412 is the deferred follow-up's target.

## Out of Scope (deferred — gate on post-deploy measurement)

- **Sync single-flight / startup-force-pull-before-push mutex** (kills the push-races-pull 412 mechanism). neurons' 3s debounce makes this relatively more impactful than in 二階.
- **Multi-tab leader election (Web Locks / BroadcastChannel)** so only one tab pushes — the robust fix for concurrent multi-tab writers (a persisted etag reduces reload/cross-account 412 but does not serialize two tabs writing at once).
- Any change to the R2 bundle schema, Worker presign path, or the LWW / monotonic merge semantics.
