# Server-side PUT-presign rate limit — bound R2 Class-A cost against a stuck old-bundle client

## Why

A live re-measure (2026-06-27, Cloudflare R2 GraphQL on `study-rpg-saves`) shows account-wide R2 `PutObject` still running at **~320/min (~19,000–20,000/hr) during the Taiwan-daytime window (UTC 05–13h)** and collapsing to tens/hr overnight — a dead-flat, RTT-bound storm with a daily on/off shape that tracks one device's wake/sleep. This is **~13–14× the 1M/month free tier (~$47/month+ Class-A overage)**.

Both client-side mitigations are now deployed to prod:
- neurons `eliminate-cross-device-r2-412-storm` Phase 1 (bundle live since 2026-06-25), and
- 二階 `harden-safari-visibility-sync-throttle` (bundle `index-CYw2LAsI.js`, live 2026-06-26).

Yet the storm persists, and the owner confirms they have **no tab open** — so the source is **another user's parked iOS-Safari tab still on an OLD bundle that has never reloaded**. A client-side fix only takes effect after a client reloads to the new bundle; it can never reach a tab that never reloads. This is the residual the parent change's `§2` anticipated.

A purely server-side cap is therefore the only durable, recurrence-proof fix. The 2026-06-26 diagnosis + Codex review already named it the "next-strongest backstop": a Worker-side per-user write throttle.

**Why a naive presign rate-limit alone is insufficient (the load-bearing insight):** the client (`r2/client.ts`) caches a presigned URL while `expiresAt - 60_000 > now` and PUTs **direct to R2** for ~240s, bypassing the Worker entirely. With the current 300s PUT TTL, throttling `/presign` does nothing to the storm because the storming client mostly never calls `/presign`. The fix must first **defeat that client URL cache** by shortening the PUT presign TTL below the client's 60s cache margin, which forces a fresh presign on every PUT — only then is a rate limit enforceable.

## What Changes

Two coupled, Worker-only changes in `cloudflare/sync-worker/` (no client redeploy; works on the unreloaded old bundle because it exploits that bundle's own cache-margin logic):

- **Short PUT-presign TTL.** `PRESIGN_PUT_TTL_SECONDS` for `op === 'put'`, set to **10s** (must be < the client's 60s cache margin *minus the worst client clock skew*: an initial 45s value FAILED in prod because the storming client's clock ran ~30s+ behind, so `expiresAt − 60_000 > its_slow_now` still held → it cached and reused one held PUT URL, bypassing the limiter. 10s defeats skew up to ~50s). GET presigns keep the 300s TTL (reads are cheap Class-B and benefit from client URL caching). Effect: every PUT re-presigns through the Worker.
- **Per-(user, bundle) rate limit on PUT presigns.** A Cloudflare Rate Limiting binding `PRESIGN_PUT_LIMITER` at **10 / 60s**. Over-limit returns **429** (no presign minted → no R2 PUT → no Class-A cost), placed BEFORE the R2 HEAD so a throttled request costs no R2 op. The limiter is **fail-open** (a binding error logs and allows) so a limiter hiccup never breaks legitimate sync. The 429 path logs `{rl:'throttled', bundle, u:<sub.slice(0,8)>}`, which doubles as the `§0` attribution probe for `eliminate-cross-device-r2-412-storm` (which user + bundle storms).

## Impact

- **Affected specs:** `cloud-sync` — ADD a server-side PUT-presign rate-cap requirement + a short-PUT-TTL requirement (both mechanism-agnostic). No change to LWW/merge semantics, schema, or the GET read path.
- **Affected code:** `cloudflare/sync-worker/` only — `src/presign.ts` (TTL + limiter check), `src/index.ts` (`Env` types), `wrangler.jsonc` (`ratelimits` binding + `PRESIGN_PUT_TTL_SECONDS` var). Shared Worker → serves neurons + 二階 + bookmarks; all three benefit identically.
- **Expected effect:** R2 `PutObject` bounded to ≤ ~10/min/user/bundle regardless of client bundle → Class-A back under the free tier. Worker invocations rise (defeated PUT cache + 429'd retries from the stuck client) but Class-A ($4.50/M) is the bill-mover; Worker request cost is ~$0–6/month — a large net win. A future edge WAF rate-limit can zero even that.
- **Behavior preserved:** legitimate active sync (~6 PUT/min/bundle/device) stays under the cap; a throttled push just retries later with IndexedDB as source of truth, so no data loss. GET (cross-device pulls) is unthrottled.

## Out of Scope

- **GET-presign throttling.** The storm also drives Class-B GETs, but at 12.5× lower unit cost (~$1–2/month worst case); capping the Class-A bill-mover is the priority. A follow-up may add a looser GET cap if needed.
- **The server-side merge Durable Object (Option 2 of `eliminate-cross-device-r2-412-storm`).** That fixes 412 *convergence* (so a conflicted writer's data lands); this change only caps *cost*. They are complementary — the stuck client still won't sync until it reloads, but it stops being expensive. The DO-merge remains a separate, larger future change.
- **A client-side graceful 429 backoff.** Nice-to-have, but it can't reach the unreloaded old bundle and is unnecessary for the cost cap. Recorded as a follow-up.

## Acceptance metric

After `wrangler deploy` + ~240s (one client cache-TTL drain), at a matched high-traffic window (UTC 05–13h): account-wide R2 `PutObject` SHALL fall to the free-tier-compatible range (well under the ~1,400/hr sustained budget). Verify via `~/.cf-analytics-token` minute/hour GraphQL on `study-rpg-saves`. Workers Logs (`wrangler tail`) SHALL show the `rl:throttled` line identifying the storming `(user, bundle)`.

**RESULT (2026-06-27, PASS):** `wrangler tail` attributed the storm to one neurons player (`32c66181`), not 二階. Splitting `PutObject` by `actionStatus` revealed it was ~95% `userError` (412) FAILED PUTs (~277/min) from that client reusing a held URL — which an initial 45s PUT TTL did not stop (clock-skew cache reuse). After dropping the PUT TTL to 10s (Version `5ec7e951`), 412 PutObject fell from ~277/min to **0** and held; account-wide PutObject ~17,800/hr → ~0–720/hr (~96–100% reduction), under the free tier. Read path + legit writes intact.
