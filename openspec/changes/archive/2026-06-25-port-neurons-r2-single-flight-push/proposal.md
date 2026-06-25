## Why

The account-wide Cloudflare R2 `PutObject` 412 retry storm — measured at **84–90% of all PUTs being userError(412)** (~840k/day, baseline in `~/.claude/scratch/r2-412-taper-2026-06-22.csv`) — is driven by overlapping, unserialized R2 pushes racing on the bundle ETag. The fix landed for 二階 as `r2-single-flight-push` (study-rpg-2nd) and is prod-verified there. R2 billing is **account-wide across both apps**, so neurons (which shares the same Cloudflare account and the same sync engine shape, with a *shorter* 3s debounce → more frequent pushes → higher leverage) must get the same single-flight serialization or the 412 fraction cannot be brought down.

## What Changes

- **Serialize R2 pushes per user (single-flight)** via a new `withPushLock(userId, fn)` helper backed by `navigator.locks` (origin-wide → serializes same-tab overlaps AND concurrent tabs), with a per-user promise-chain fallback for environments without the Web Locks API. neurons uses a **neurons-specific lock prefix** (`neurons-rpg.r2-push.`) so it does not couple with 二階 on the shared `med-study-rpg.com` origin.
- **Within the lock, refresh the ETag from `localStorage`** before the PUT so a serialized writer (especially a second tab) uses the previous writer's just-persisted ETag (`If-Match: <fresh>`) instead of a stale in-memory copy — this is what actually eliminates the cross-tab 412 rather than merely serializing it.
- **The first dirty push after cold start awaits the startup force-pull** (bounded by an 8s timeout guard) so it sends `If-Match: <warm etag>` instead of the guaranteed empty-cache `If-None-Match: *` cold-start 412. Subsequent pushes do not wait; the force-pull keeps its unconditional-GET semantics.
- **Serialize BOTH R2 PUT paths.** The engine's debounced/manual push routes through a shared `pushBundleSerialized` helper (lock + fresh ETag + `pushBundle`). The account-reset path (`resetNeuronsAccountData`) wraps its **whole critical section — PUT + ack + local wipe — in one hold of the same per-user lock** (using the low-level `pushBundle` to avoid nesting the same Web Lock), so a push queued behind the reset cannot slot in after the empty bundle lands, read still-unwiped local data, and resurrect the account. 二階 already serializes its equivalent reset path.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-cloud-sync`: adds two requirements — (1) R2 pushes serialized per user across tabs (single-flight), and (2) the first post-cold-start dirty push awaits the startup force-pull.

## Impact

- **New file**: `apps/neurons-tw/src/lib/sync/r2/push-lock.ts` (`withPushLock` + fallback).
- **Modified**: `apps/neurons-tw/src/lib/sync/r2/etag.ts` (add `refreshEtagFromStore`); `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts` (add `pushBundleSerialized` = lock + fresh ETag + `pushBundle`); `apps/neurons-tw/src/lib/sync/engine.ts` (route `pushNow` through `pushBundleSerialized`; retain + await the startup force-pull); `apps/neurons-tw/src/lib/sync/useSync.ts` (kick the retained startup force-pull instead of fire-and-forget); `apps/neurons-tw/src/lib/services/account-reset.ts` (wrap PUT + ack + local wipe in one `withPushLock` critical section).
- **Tests**: new `apps/neurons-tw/src/__tests__/r2-single-flight-push.test.ts`.
- **No** Dexie schema bump, **no** R2 `SCHEMA_VERSION` bump, **no** Worker change, **no** sync wire-format change — purely client-side push scheduling. neurons is R2-only (no dual mode), so the 二階 dual-mode carve-outs do not apply.
- **Not** in scope: the three pre-existing dispositions from 二階's codex review — F1 (pull/push epoch fence) and F3 (dual-mode marker clear) do not affect neurons; **F2 (snapshot→clear TOCTOU) does not exist in neurons at all** because neurons builds a full snapshot every push and clears no per-row dirty markers.
