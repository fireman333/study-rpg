# Design — Server-side PUT-presign rate limit

## Context

The R2 PutObject storm survives both apps' deployed client-side fixes because the
offending client is a parked iOS-Safari tab on an **old, never-reloaded bundle**.
A client fix only lands after a reload, so the only reachable lever is the shared
Worker (`cloudflare/sync-worker/`) that mints presigned R2 URLs.

## The cache-bypass problem (why TTL is the first lever)

`apps/*/src/lib/sync/r2/client.ts` caches a presigned URL and reuses it while
`cached.expiresAt - 60_000 > Date.now()`. With the current `PRESIGN_TTL_SECONDS=300`,
a client presigns once and PUTs **direct to R2** for ~240s without touching the
Worker. So a rate limit on `/presign` alone is unenforceable against the storm —
the storming client rarely calls `/presign`.

**Lever:** set the PUT presign TTL **below (the 60s client cache margin − the
worst client clock skew)**. The client's check `expiresAt - 60_000 > now` must be
false so it re-presigns on **every** PUT. This works on the unreloaded old bundle
because the cache-margin logic is that bundle's own code; we change only the
server-issued `expiresAt`.

**Clock-skew — the prod gotcha (load-bearing).** A first cut used `PRESIGN_PUT_TTL_SECONDS=45`
and FAILED: the storming client's clock ran ~30s+ behind the server, so for a 45s
URL `expiresAt − 60_000 = mint − 15s` was still `> its_slow_now`, the cache check
passed, and it reused one held PUT URL for ~60 PUTs each (~277/min FAILED 412s),
bypassing the limiter entirely (PUTs go direct to R2). The cache window for a
client skewed by S seconds is ~`(TTL − 60 + S)` seconds, so defeating skew up to
S requires `TTL ≤ 60 − S`. **`PRESIGN_PUT_TTL_SECONDS=10`** defeats skew up to
~50s while still leaving a comfortable single-PUT window (uploads are sub-second
on a ~12 KB gzipped bundle). Confirmed in prod: 412 PutObject → 0 after the 10s
redeploy.

## Decisions

- **D1 — Rate-limit key = `${userSub}:${bundle}`, PUT only.** Cost is per-user
  write volume; per-(user,bundle) is the right granularity. GET is unthrottled
  (cheap Class-B; reads still benefit from URL caching). A legitimate single
  active device pushes ~6/min/bundle (10s debounce), so 10/60s leaves headroom;
  a user hammering one bundle from 3 simultaneous devices (itself the 412 race)
  is degraded, not broken (retries, IndexedDB is source of truth).
- **D2 — Limit = 10 / 60s** (owner-picked). Caps the ~320/min storm to ≤10/min
  (~97% reduction) with low false-throttle risk. `period` is constrained to
  {10,60} by the binding; 60s chosen for a smoother window.
- **D3 — Cloudflare native Rate Limiting binding, not a Durable Object.** The
  binding is per-colo, purpose-built, needs no migration/class. Per-colo is
  sufficient because the RTT-bound single-client storm sticks to one colo, and
  the goal is cost-capping, not security. A DO would be heavier with no benefit
  here.
- **D4 — Fail-open.** A limiter error logs and allows the presign. Rationale: a
  transient limiter fault must not break everyone's sync; the worst case is the
  storm briefly resumes (rare), which is strictly better than blocking writes.
- **D5 — Check placed before the R2 HEAD.** A throttled request returns 429
  without the SV-downgrade HEAD, so throttling itself incurs no R2 op.
- **D6 — 429 on the throttle path doubles as the §0 attribution probe.** A single
  `console.log({rl:'throttled', bundle, u})` fires only when throttling, so
  `wrangler tail` reveals which user + bundle storms — closing the open
  attribution question in `eliminate-cross-device-r2-412-storm` §0 without a
  separate instrument-then-revert deploy.

## Relationship to `eliminate-cross-device-r2-412-storm`

That change's Phase 1 (client debounce/retry tuning) is deployed; its §2 server-
side options were decision-gated. This is the simplest such option: a **cost cap**,
not a convergence fix. It deliberately does NOT resolve the 412 race (the stuck
client still won't sync until it reloads) — it only stops the race from being
expensive. The heavier server-merge Durable Object (Option 2) remains a separate
future change if cross-device convergence-without-reload is wanted.

## Risks

- **Worker invocation volume rises.** Defeating the PUT cache means every PUT
  re-presigns, and the stuck client's 429'd retries keep hitting the Worker.
  Mitigation: Class-A ($4.50/M) is the bill-mover; Worker requests are ~$0–6/mo.
  An optional edge WAF rate-limit on `api.med-study-rpg.com/presign` (runs before
  the Worker) can zero even the throttled-request Worker cost later.
- **Legitimate multi-device heavy user throttled.** A single user actively
  pushing one bundle from 3 devices simultaneously could exceed 10/60s. This is
  the same pathological pattern as the 412 race; degraded sync (retries) is
  acceptable and lossless.

## Open follow-ups

- Optional: client-side graceful 429 backoff (won't reach the old bundle).
- Optional: looser GET-presign cap if Class-B becomes material.
- Optional: edge WAF rate-limit to drop throttled-request Worker invocations.
