# Design — Reduce the R2 412 retry storm (neurons)

## Context

- R2 client sync lives in `apps/neurons-tw/src/lib/sync/`. Push/pull adapter `r2/engine-r2.ts`; ETag cache `r2/etag.ts`; orchestration `engine.ts`; presign client `r2/client.ts`; account-switch / wipe `account-guard.ts`; in-place reset `services/account-reset.ts`.
- neurons is **single-bundle**: `BUNDLE_NAME='neurons'` (`r2/client.ts`), R2 key `users/<jwt.sub>/neurons-snapshot.json.gz`. The engine uses a `pending: boolean` (`engine.ts`), not per-row dirty markers, and there is no `for (const bundle …)` push loop.
- `pushBundle` (`engine-r2.ts`): `If-Match: <getEtag()>` if present, else `If-None-Match: *`; on 412/409 → `pullBundle(conditional:false)` → backoff → retry, ≤3 attempts.
- `pullBundle`: success path calls `setEtag()` **before** `applyBundleSnapshot()` (current `engine-r2.ts:177` vs `:182`); `force` pulls bypass the cached etag (unconditional GET, `:129`).
- ETag cache (`etag.ts`, 31 lines): global key `neurons-rpg.sync.etag.neurons`, **no userId, no localStorage persistence beyond that single key, no schema_version machinery** (unlike 二階). `clearEtag` exists but is **dead code** (never imported by `engine-r2.ts`). `clearPresignCache` (`client.ts`) is likewise dead code.

This is a port of the already-shipped 二階 change (`study-rpg-2nd` commit `e14f609`), trimmed to what applies to a single-bundle pure-R2 app.

## Goals / Non-Goals

**Goals**
- Persist the R2 push etag across reloads, **user-scoped**, so warm-cache and post-switch first pushes use a correct `If-Match` (or a clean `If-None-Match: *`) instead of generating cold-start / cross-account 412s.
- Close the cross-tab "publish un-merged etag" data-overwrite hole by moving the pull-path `setEtag` after `applyBundleSnapshot`.
- Make account switch / wipe / reset actually clear the etag + presign cache.

**Non-Goals**
- D1 (push-only-dirty-bundles) and C1 (dual-mode dirty snapshot) — **N/A** for single-bundle pure-R2 neurons.
- Single-flight mutex / multi-tab leader election — deferred, gated on post-deploy measurement.
- Any Worker / presign / D1 / Dexie schema / R2 SCHEMA_VERSION / LWW change.

## Decisions

### D2. Persist the push ETag — user-scoped, apply-safe

- **User-scoped key** `neurons-rpg.sync.etag.<userId>` (single bundle → no bundle segment). A global key (the status quo) lets account A's etag gate account B's first push → 412 — the neurons-specific amplifier 二階 never had. An in-memory `Map<userId,string>` layers over localStorage (read-through `mem ?? localStorage`, write-through on set). `getEtag(userId)` / `setEtag(userId, etag|null)` / `clearEtag(userId)`; `setEtag(_, null)` clears. Add `clearAllPersistedEtags()` (prefix-scan over `neurons-rpg.sync.etag.`) for the wipe path. **Do NOT** port 二階's `schema_version` localStorage machinery — neurons' `etag.ts` has none and the bundle SCHEMA_VERSION guard already lives elsewhere.
- **Publish-after-apply (the load-bearing safety rule).** The pull path currently `setEtag` *before* `applyBundleSnapshot`. With a cross-tab-visible persisted etag, that ordering is unsafe: Tab A pulls, publishes the new server etag, but hasn't merged the snapshot into its own Dexie yet; Tab B reads that etag and PUTs its own *un-merged* snapshot with `If-Match: <that etag>` → R2 accepts it → newer cloud rows are silently overwritten. **Fix: in the pull path, persist the etag only AFTER `applyBundleSnapshot` succeeds.** The push-path `200` persistence stays immediate (the just-uploaded snapshot IS local state, so no race). The decode-fail branch keeps its `setEtag` (corrupt-blob `If-Match` overwrite recovery) but does not merge.
- **404 clears the etag.** On a pull that returns `blobMissing` (server blob deleted / reset) — **both** the HEAD-404 and GET-404 branches — clear the persisted etag so the retry uses `If-None-Match: *` instead of looping on a stale `If-Match`.

### D3. Preserve existing invariants

- **Cold-start force-pull** keeps `cachedEtag = null` (unconditional GET) — the `!force` guard at `engine-r2.ts:129` is unchanged.
- **Corrupt-blob overwrite recovery** (decode-fail keeps etag → `If-Match` on next push) still applies for genuinely-corrupt or first-ever blobs. Persistence only changes which precondition the *first warm-cache* push sends.
- The push-path first-ever `If-None-Match: *` (no persisted etag) is preserved for genuinely first-ever pushes.

### D4. Account-switch / wipe / reset clears etag + presign

`clearLocalSyncedData` (`account-guard.ts`) is the single neurons wipe surface (there is **no** `migration.ts`). Extend it to call `clearAllPersistedEtags()` + `clearPresignCache()` so account A→B leaves no etag/URL bleed. Because `services/account-reset.ts` calls `clearLocalSyncedData`, the in-place reset path is covered transitively — no separate edit there.

## Threading `userId`

`pushBundle` / `pullBundle` gain a `userId` parameter (neurons has **no** bundle param — do not copy 二階's bundle-keyed signatures). `engine.ts` already exposes `getUserId()` (`this.user.id`); `pushNow` / `pullNow` pass `this.user.id` into `pushBundle` / `pullBundle`. The internal `pullBundle` calls inside `pushBundle`'s 412/428 retry also thread the same `userId`.

## Scope boundary

D2 + D4 only. **Deferred** (separate change, gated on re-measuring R2 PutObject after deploy): single-flight / await-startup-pull (push-races-pull mechanism) and multi-tab leader election (concurrent-writer serialization). A persisted etag reduces reload / cross-account / 404-first-push 412s but does NOT serialize two tabs writing at once — that needs a leader. neurons' 3s debounce (vs 二階 10s) makes the residual in-session 412 more visible, so the deferred work is relatively higher-value here.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|---|---|---|
| Persisted-after-apply ordering still races a concurrent tab writing simultaneously | Medium | Accept residual (412→merge→retry still protects, no data loss); robust fix (leader election) is the deferred follow-up |
| Stale persisted etag → first push 412 | Low impact | Same safety path as today (pull-merge-retry); strictly fewer 412s than the empty-cache status quo |
| Cross-account etag bleed | Low (was the bug) | User-scoped key + D4 clears on switch/wipe/reset |
| Threading userId touches the push retry loop | Low | userId is read-only plumbing; same value every attempt; typecheck + unit test cover the signatures |

## Verification

- **Vitest** (`r2-etag-persistence.test.ts`, mirror 二階, node env → polyfill `localStorage`): persist under user-scoped key; reload-fallback (cold map reads localStorage); user-scoping (B never sees A's etag); `clearEtag` removes mem + persisted; `setEtag(null)` clears; `clearAllPersistedEtags` removes every etag; degrade-to-in-memory when `localStorage` undefined.
- **typecheck + full neurons suite** green (new signatures wired through every caller).
- **codex code review** of the apply diff (the 二階 review caught a real blocker — do it here too).
- **Post-deploy Chrome MCP live smoke**: a synced mutation pushes with `If-Match` (not `If-None-Match: *`), 0 cold-start 412 (fetch-interceptor pattern from the 二階 session).
- **Post-deploy measurement**: re-run the per-UTC-hour `PutObject userError` Analytics query (token `~/.cf-analytics-token`); record the step-down. Expect a partial (not ~zero) drop — the in-session concurrency 412 is the deferred work's target.

## Migration Plan

1. `/opsx:apply` — implement the 5 edits; typecheck + test.
2. codex review of the diff.
3. `/opsx:archive` — sync the `neurons-cloud-sync` delta into main specs.
4. Merge `track-neurons` → `main` (in the `~/coding-scratch/study-rpg` worktree) + push → CF Pages deploy; Chrome MCP smoke + GraphQL measure.

Rollback: pure client-side, no schema/data migration — `git revert` the merge restores the prior etag behavior with zero data effect (a persisted etag just becomes unused; the next push falls back to the in-memory / If-None-Match path).
