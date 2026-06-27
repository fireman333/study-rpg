# Tasks — Server-side PUT-presign rate limit

## 1. Worker implementation (`cloudflare/sync-worker/`)

- [x] 1.1 `presign.ts`: op-dependent TTL — PUT uses `PRESIGN_PUT_TTL_SECONDS` (default 45s, < client 60s cache margin), GET keeps `PRESIGN_TTL_SECONDS` (300s).
- [x] 1.2 `presign.ts`: per-`(user,bundle)` PUT rate-limit via `env.PRESIGN_PUT_LIMITER.limit({key})`, placed BEFORE the SV-downgrade R2 HEAD; over-limit → 429 `{error:'rate_limited'}` + `Retry-After: 10`; fail-open on limiter error; optional-binding guard for local dev.
- [x] 1.3 `presign.ts`: 429 path logs `{rl:'throttled', bundle, u:sub.slice(0,8)}` (doubles as §0 attribution probe).
- [x] 1.4 `index.ts`: `RateLimiter` interface + `PRESIGN_PUT_LIMITER?` + `PRESIGN_PUT_TTL_SECONDS?` on `Env`.
- [x] 1.5 `wrangler.jsonc`: `ratelimits` binding `PRESIGN_PUT_LIMITER` (limit 10 / period 60) + `PRESIGN_PUT_TTL_SECONDS: "45"` var.
- [x] 1.6 `npx tsc --noEmit` clean; `npx wrangler deploy --dry-run` validates config + shows `PRESIGN_PUT_LIMITER (10 requests/60s) Rate Limit` binding recognized.

## 2. Deploy (owner-approved prod Worker change)

- [x] 2.1 Deployed 2026-06-27 — v1 Version `077381de` (TTL 45s) then **v2 Version `5ec7e951` (TTL 10s — see 3.1 tuning)**; `PRESIGN_PUT_LIMITER (10 requests/60s)` live; `/health` 200 both URLs; presign up (no-auth → 401).
- [x] 2.2 `wrangler tail` 200s → **517 `rl:throttled` events, ALL `bundle=neurons` user `32c66181`** (one stuck old-bundle neurons tab) + 15×200, 0 fail-open errors. **§0 attribution CLOSED: the storm is one neurons player, NOT 二階/m2.**

## 3. Verify (post-deploy acceptance — gates archive)

- [x] 3.1 **TTL tuning (45s → 10s) — load-bearing.** Splitting `PutObject` by `actionStatus` showed v1 (TTL 45s) only throttled presigns but the storm persisted at **~277/min `userError` (412) + ~13/min success** — 95% FAILED PUTs, which R2 still bills as Class-A. Root cause: the storming client's clock runs **~30s+ behind**, so `expiresAt − 60_000 > its_slow_now` held even for a 45s URL → it cached and reused one held PUT URL for ~60 PUTs each, **bypassing the limiter** (PUTs go direct to R2). Fix: `PRESIGN_PUT_TTL_SECONDS 45 → 10` (defeats skew up to ~50s → no cache → every PUT re-presigns → throttled). Redeployed `5ec7e951`.
- [x] 3.2 **Verdict PASS.** Post-`5ec7e951` re-measure: 412 `userError` PutObject dropped from ~277/min to **0** by 10:18 UTC and stayed 0 (10:18–10:40 window); only legit `success` writes remain (~0–12/min). Account-wide PutObject ~17,800/hr → ~0–720/hr (**~96–100% reduction**), under the ~1,400/hr free-tier budget. GET read path unthrottled (TTL 300s unchanged); successful writes still flow = legit sync intact.
- [x] 3.3 Before/after recorded above. **Follow-up:** update `eliminate-cross-device-r2-412-storm` §0/§2 — attribution resolved (neurons user `32c66181`, not 二階); server-side cost cap shipped, so its Option-2 DO-merge is no longer cost-gated (only a future convergence nicety).
- [ ] 3.4 Owner dogfood smoke (optional): sign in on prod neurons, confirm 🟢 sync chip + state persists cross-reload (no false 429 on normal play).

## 4. Follow-ups (out of scope, recorded)

- [ ] 4.1 Optional edge WAF rate-limit on `api.med-study-rpg.com/presign` to drop throttled-request Worker invocations to ~0.
- [ ] 4.2 Optional client-side graceful 429 backoff (ships only to reloaded clients).
- [ ] 4.3 Optional looser GET-presign cap if Class-B GET cost becomes material.
