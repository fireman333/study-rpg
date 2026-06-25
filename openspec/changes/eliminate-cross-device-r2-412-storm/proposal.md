## Why

Client-side single-flight (`port-neurons-r2-single-flight-push` / 二階's `r2-single-flight-push`) serializes R2 pushes **within one browser origin** (tabs of one device) and provably eliminated the same-origin 412 storm — but it **cannot reach across devices**. Measurement after the 2026-06-23 deploy shows the account-wide R2 `PutObject` 412 fraction drops to **3–5% under low load** (06-24) yet returns to **~82% under real multi-user load** (06-25), tracking active-session count — i.e. the residual storm is **cross-device** (the *same user* pushing from phone + laptop concurrently to the same `users/<sub>/<bundle>.json.gz` key) plus the client's **×3 retry amplification** (each 412 → pull GET + up to 3 retry PUTs). Read-only `wrangler tail` (2026-06-25) confirmed every `/presign` returns 200 — so this is a downstream R2 `If-Match` ETag-precondition conflict, **not** a schema-version 409 fence or an auth failure. The account-wide R2 Class A billing problem is therefore **not solved**, and the fix must move server-side (the sync Worker) where cross-device writes can actually be serialized or merged.

## What Changes

This is a **plan / design** change. It commits one low-risk guarantee now and lays out the architecture options for the owner to choose:

- **Commit (Phase 1, low-risk):** bound the per-push R2 PUT **retry amplification** and lower collision probability — cap retries (`MAX_PUSH_RETRIES` 3 → 1, or defer to the next debounce on 412-exhaustion rather than hard-erroring), raise + **jitter** the debounce so concurrent devices de-sync, and jitter the backoff. This cuts 412 *volume* (and Class A billing) substantially with no architecture change. **Must ship to BOTH neurons and 二階** (shared Worker, near-identical clients).
- **Diagnose (Phase 0, owner-gated):** an instrumented Worker diagnostic (log `{op, bundle, user-prefix}` in `presign.ts` → deploy → `wrangler tail` ~90s during a storm → aggregate → revert) to confirm which app dominates (neurons vs 二階) and whether a few heavy multi-device clients account for most volume. (An earlier attempt was correctly blocked by the permission system as out-of-scope of read-only tail.)
- **Decide (Phase 2, open question):** evaluate the durable server-side fix — a per-user **Durable Object** that serializes and **merges** writes server-side (client POSTs its bundle/delta → Worker reads-merges-writes under the lock → no client `If-Match` / 412 / retry ever). Eliminates the storm AND the amplification, at the cost of routing blobs through the Worker and re-implementing the monotonic merge rules server-side. The architecture decision (client-mitigation-only vs server-merge vs gated-presign vs hybrid) is **deferred to the owner** pending Phase 0 data.

Single-flight is **kept** — it is correct and necessary; this change builds on it.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `cloud-sync`: adds a mechanism-agnostic guarantee that a single push intent SHALL NOT amplify into unbounded R2 PUT retries, and that cross-device concurrent writes SHALL converge without data loss. (The Phase 2 server-side-merge mechanism, if chosen, will get its own spec at decision time.)

## Impact

- **Phase 1 (client):** `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts` (`MAX_PUSH_RETRIES` / backoff / jitter / 412-exhaustion handling) + `engine.ts` debounce (`DEBOUNCE_MS`/`schedulePush`); mirrored in the 二階 repo (`study-rpg-2nd`, coordinated — out-of-tree here). Presentation/behavior of sync only; no Dexie / R2 schema / wire-format change.
- **Phase 0 (diagnostic):** temporary one-line log in `cloudflare/sync-worker/src/presign.ts`, deployed + reverted (owner-approved prod Worker deploy).
- **Phase 2 (server, IF chosen):** new Durable Object in `cloudflare/sync-worker/` + a new write endpoint + server-side merge of each bundle (must stay in lockstep with the client per-bundle merge rules); changes the write data path for both apps. Scoped + specced in a follow-up change at decision time.
- **No** change to single-flight, merge semantics, or bundle schema in this change beyond the Phase-1 retry/debounce tuning.
