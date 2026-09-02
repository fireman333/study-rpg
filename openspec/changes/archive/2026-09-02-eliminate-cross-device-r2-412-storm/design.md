# Design — Eliminate the cross-device R2 412 storm (server-side)

## Context

- **Write path today:** client → `POST /presign` (sync Worker, validates Supabase JWT, returns a presigned S3 URL for `users/<sub>/<bundle>.json.gz`) → client `PUT`s the gzipped bundle **directly to R2** with `If-Match: <etag>` (or `If-None-Match: *` first time). On 412/409 the client `pullBundle`s (GET), merges, backs off, retries (`MAX_PUSH_RETRIES=3`, `BACKOFF_MS=[250,1000,4000]`); exhaustion throws `r2_blob_concurrent_writer_exhausted`. Source: `cloudflare/sync-worker/src/presign.ts`, `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts`.
- **Concurrency model:** whole-bundle optimistic concurrency on one R2 object per (user, bundle). Two writers to the same object race; the ETag loser 412s.
- **What single-flight fixed:** `navigator.locks` is **origin-wide** → serializes all tabs/workers of one browser. Verified 0×412 for a single client. So same-device contention is gone.
- **What it can't fix:** different devices = different browsers = different `navigator.locks` namespaces. Cross-device writes to the same object still race → 412 → retry storm. This scales with the number of users who are multi-device-active at once (exam season = many).
- **Evidence (2026-06-24/25):** 412 fraction 3–5% at low load, ~82% at high load (tracks GET/active-session volume); `/presign` all 200 (cross-device R2 ETag conflict, not a 409 schema fence or 401 auth). The client retry loop **amplifies** each conflicted push into up to 3 PUT-412 + 3 GET.
- **Shared infra:** the Worker serves neurons + 二階 (separate repo `study-rpg-2nd`) + `bookmarks`. Any client fix ships to both repos; any Worker fix affects both apps at once.

## Goals / Non-Goals

**Goals:**
- Cut account-wide R2 `PutObject` Class A operations (the billing pain), especially the 412 retry amplification.
- A path to *eliminate* (not just reduce) cross-device 412s.
- No data loss / preserve the monotonic merge guarantees (everWrong OR, eventLog UNION, MAX, LWW).
- Keep single-flight (it is correct and necessary).

**Non-Goals:**
- Reverting single-flight.
- Real-time multi-device sync (push/websocket) — out of scope; eventual convergence is enough.
- Changing the Supabase Auth / JWT model or the per-user R2 key layout.

## Decisions

### D0. Confirm the split before committing the expensive fix (Phase 0)
Before building anything server-side, run the **instrumented Worker diagnostic** (owner-approved): add one `console.log({op,bundle,user-prefix})` to `presign.ts`, deploy, `wrangler tail` ~90s during a storm, aggregate by bundle + count distinct user-prefixes, then revert + redeploy. Answers: (a) neurons vs 二階 share of the storm, (b) is it concentrated in a few heavy multi-device clients (which would make a targeted/cheaper fix viable) or broad. This is read-only-plus-revert and gates how much to invest.

### Options (the open architecture decision — for the owner)

| # | Option | Eliminates cross-device 412? | Cost / Risk | Ships to |
|---|---|---|---|---|
| 1 | **Client mitigation** — cap retries 3→1 (or defer-on-exhaust), raise+jitter debounce, jitter backoff | No (reduces *volume* + amplification only) | Low; fast; no schema/path change | both clients |
| 2 | **Server-side merge via per-user Durable Object** — client POSTs bundle/delta → Worker reads-merges-writes R2 under a per-user DO lock; no client If-Match/412/retry | **Yes** (fully) | High; blob routes through Worker (CPU+bandwidth); re-implement monotonic merge server-side per bundle, kept in lockstep; DO billing | Worker + both clients' write path |
| 3 | **Gated presign via per-user DO** — DO serializes *presign issuance* so one device pushes at a time | Partial (R2 write still races inside the lock window; weaker than #2) | Medium; keeps direct-to-R2 path | Worker + minor client |
| 4 | **Hybrid (recommended shape)** — Phase 0 → Phase 1 (#1) now → Phase 2 (#2) iff residual still material | Yes (eventually) | Staged; immediate relief then durable fix | staged |

### D1. Recommendation: Hybrid (Option 4)
- **Phase 1 = Option 1 immediately** — it is cheap, low-risk, and directly attacks the two biggest billing levers (the ×3 retry amplification and the collision *rate*). Even if Phase 2 follows, Phase 1's jitter/debounce/retry-cap are still wanted. Ship to neurons + 二階 together.
- **Phase 2 = Option 2 (server-side merge DO)** is the only option that *eliminates* cross-device 412 and the amplification, and it additionally removes the client's read-merge-retry burden. But it is a real data-path change with duplicated merge logic — only worth it if Phase 0/Phase 1 show the residual is still material and not concentrated in a handful of pathological clients.
- **Option 3 rejected as a standalone** — it adds DO complexity without the full guarantee (the R2 write still races within the lock window); if we build a per-user DO at all, do the merge (Option 2).

### D2. Phase-1 specifics (the committed, low-risk part)
- `MAX_PUSH_RETRIES` 3 → 1 in `engine-r2.ts` (kill the ×3 PUT-412 + ×3 GET amplification). On the single retry's 412 (or first 412 if retries→0): **leave the dirty marker / `pending` set and return without throwing**, so the next debounce cycle re-attempts after a fresh pull — converting a tight retry storm into a relaxed, jittered cadence.
- Debounce: neurons 3s → ~10–15s (match 二階's 10s) + add ±jitter; jitter the backoff sleeps. Concurrent devices that currently fire in lockstep then de-synchronize, lowering the collision rate.
- Keep the existing publish-after-apply ETag discipline and single-flight unchanged.

### D3. Phase-2 sketch (deferred, decision-gated)
Per-user DO keyed by `sub`. New `POST /sync` endpoint: client sends `{bundle, gzippedBundle | delta}`; DO acquires its single-threaded turn, GETs current R2 blob, runs the **same** per-bundle merge (the merge rules must be lifted into a shared, server-runnable module to avoid drift), PUTs the merged blob, returns the new state/etag. Client applies the returned merged state. No `If-Match` from the client → no 412. Open sub-questions: delta vs full-blob upload (bandwidth), merge-rule sharing between TS client and Worker, DO storage/billing, migration/rollout for both apps, and back-compat with clients still on the presign path during bake.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Phase 1 raises sync latency (longer debounce) → last writes propagate slower | Bounded (10–15s like 二階); `beforeunload`/visibility flush still fire; data not lost (stays dirty) |
| Phase 1 retry-cap leaves a write un-pushed if every cycle collides | It stays dirty → re-attempted each debounce; converges once the colliding device idles; no data loss |
| Phase 2 server merge diverges from client merge rules | Lift merge into one shared module consumed by both; lock with cross-impl tests per bundle |
| Phase 2 routes blobs through Worker → CPU/bandwidth + DO cost | Measure against the R2 Class A savings; deltas instead of full blobs if needed |
| Diagnostic logs user identifiers | Log only an 8-char `sub` prefix, ephemeral tail capture, revert immediately |

## Migration Plan
- Phase 0: instrument → deploy → tail → revert (owner-approved, ~5 min, reversible).
- Phase 1: client tuning shipped to neurons (this repo) + 二階 (coordinated), normal CF Pages deploy; re-measure the 412 fraction/volume at a matched high-traffic window after taper.
- Phase 2 (iff chosen): separate change with its own design/spec, staged Worker rollout behind back-compat with the presign path, bake, then deprecate the direct-PUT path.
- **Rollback:** Phase 1 = revert tuning constants. Phase 2 = keep the presign path live during bake; flip clients back if the DO path misbehaves.

## Open Questions
1. **Architecture (owner's call):** Option 1-only, or commit to Phase 2 server-merge? Depends on Phase 0 data + Phase 1 residual.
2. **Phase 0 result:** neurons vs 二階 dominant? Few heavy clients vs broad? (Changes whether a targeted fix suffices.)
3. **Is a usage dip confounding the 06-24 low numbers?** Re-measure Phase 1 effect at a matched busy window, not a quiet one.
4. **Phase 2 merge-rule sharing** between the TS clients and the Worker runtime — feasible without a big refactor?
