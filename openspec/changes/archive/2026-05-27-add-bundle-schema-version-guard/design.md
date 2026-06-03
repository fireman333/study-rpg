# Design — add-bundle-schema-version-guard

## Context

The R2 sync engine (`packages/core/src/lib/sync/r2/` consumed by all three apps) refuses bundle PUTs whose `schema_version` is lower than what was last successfully pulled. Current implementation at [`apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts:72-86`](apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts:72):

```ts
const cachedRemoteSV = getSchemaVersion(bundle)
if (cachedRemoteSV != null && cachedRemoteSV > snapshot.meta.schema_version) {
  throw new Error(
    `r2_schema_downgrade_refused: cloud=${cachedRemoteSV} local=${snapshot.meta.schema_version} bundle=${bundle}`,
  )
}
```

The cache is populated only after a successful pull. Four bypass paths exist:

1. localStorage wiped → cache undefined → check skipped on first push
2. Modified client → removes the check entirely
3. Cross-device race → device A pulls v4 then sleeps; device B pushes v3 from stale build first; A's cache and B's blob disagree
4. New bundle types (e.g. `bookmarks` first introduction) → no prior cache for the first PUT

The AAD-v2 §13.1 follow-up tasking was: "Worker reads `x-amz-meta-schema-version` custom metadata on incoming PUT, rejects if `incoming < existing`. Second-layer defense for modified/rogue clients."

The current upload path is client-direct-to-R2 via presigned URL (Worker only signs URL, never sees PUT body). Two architectural options were considered (see proposal.md):

- **Option A**: Worker proxies upload body. Strict but high-cost (~3-4 hr, doubles request size through Worker).
- **Option B (chosen)**: Worker validates SV at `/presign` time and signs `x-amz-meta-schema-version` header into URL signature scope. Cheaper (~1-2 hr), maintains direct-to-R2 upload, sufficient against the stated threat model.

## Goals

- Server-side veto on SV downgrade that cannot be bypassed by any client-side modification
- No regression for honest, up-to-date clients
- No body proxying through Worker (preserve current direct-to-R2 throughput)
- Backward compatible: legacy R2 blobs without metadata are treated as SV=0 so first post-change PUT succeeds
- Single source of truth: R2 customMetadata `schema_version` becomes the canonical SV (JSON body envelope still carries it for client-side merge logic, but Worker enforcement uses metadata)

## Non-Goals

- Validate that presign-body SV matches gzipped JSON body SV (would require Worker to gunzip+parse — Option A territory)
- Test suite for Worker beyond ad-hoc smoke (separate concern)
- Remove client-side localStorage guard (Phase 3 of rollout, separate change)
- Race-condition-free SV transitions across devices (R2 is eventually consistent; accept)
- Worker-side enforcement on the GET path (SV mismatch on read is handled client-side already)

## Decisions

### Decision 1 — Validate SV at `/presign` time, not at PUT time

**Choice**: Worker reads existing R2 blob's metadata SV in the `/presign` handler, compares against client-declared `schema_version`, rejects with 409 if downgrade.

**Rationale**:
- Direct-to-R2 PUT (current architecture) means Worker never sees PUT request. Cannot validate at PUT time without proxying.
- Validating at presign time + signing the metadata header into URL scope means R2 itself enforces "PUT must include exactly the SV value Worker authorized" — if client omits or alters the header, R2 returns SignatureDoesNotMatch.
- Race window between presign HEAD and PUT exists but is inherent to eventually-consistent storage; the existing client-side guard has the same window. Net no worse.

**Trade-off**: Slightly off from the §13.1 literal wording ("Worker reads x-amz-meta-schema-version custom metadata on incoming PUT"). The *intent* (server-side defense against rogue clients) is met. Documented in proposal Why.

### Decision 2 — `x-amz-meta-schema-version` becomes the canonical SV (R2 metadata as source of truth)

**Choice**: After this change, R2 customMetadata `schema_version` (or whatever exact key R2 uses post-prefix-stripping) is the canonical version. Worker reads it via `R2_PRIMARY.head(key) → customMetadata`. JSON envelope's `meta.schema_version` continues to exist for client-side compatibility but is no longer authoritative.

**Rationale**:
- R2 customMetadata is readable without gunzipping (cheap)
- Single field, single semantic
- Pre-existing blobs (no metadata) → treat as SV=0, accept any incoming SV ≥ 1 → seamless backward compat

**Trade-off**: Two places hold the SV until P3 cleanup removes the client-side guard. Acceptable; both are read by different code paths (Worker reads metadata; client reads JSON envelope for merge logic). Drift between them is detectable in code review.

**R2 metadata key naming**: S3 normalizes header `x-amz-meta-schema-version` to customMetadata key `schema-version` (dash, not underscore). R2 follows this convention. Worker code uses `customMetadata['schema-version']` (verified at implementation time; fallback path checks both `schema-version` and `schema_version` for safety against R2 quirks).

### Decision 3 — Sign required metadata header into URL via aws4fetch `headers` parameter

**Choice**: In `presign.ts`, pass `headers: { 'x-amz-meta-schema-version': String(N) }` to `aws.sign(url, { ... })`. SigV4 includes this header in canonicalization → `X-Amz-SignedHeaders` query param lists it → R2 requires the client to send it with the exact value at PUT time.

**Rationale**:
- aws4fetch v1.0.20 supports `headers` parameter on sign() (used internally for X-Amz-Date, host, etc.)
- Verified by SigV4 spec: signedHeaders semantically means "client must send these headers with values that recanonicalize to the same signature"
- If client tampering: rogue client could try to override the header but URL signature would fail
- If client omits: R2 SignatureDoesNotMatch

**Trade-off**: Browsers MUST allow setting custom `x-amz-meta-*` headers on cross-origin fetch. CORS preflight should permit it (R2's default CORS allows `*` for allowed headers in many configs — to verify at impl time; if R2 CORS blocks, need to add `x-amz-meta-schema-version` to bucket's CORS allowed headers).

### Decision 4 — Legacy blobs treated as SV=0

**Choice**: If `R2_PRIMARY.head(key)` returns null (key doesn't exist yet) OR `customMetadata.schema-version` is missing/undefined, treat existing SV as `0`. Any client-declared SV ≥ 1 is accepted.

**Rationale**:
- Pre-this-change blobs have no metadata (current PUT path doesn't set it)
- First post-this-change PUT for any user must succeed without manual backfill
- After first PUT, metadata is populated forever
- Cannot regress (SV is monotonically increasing per bundle schema design)

**Trade-off**: Brief window where SV downgrade IS possible — between this change shipping and every user's first post-change PUT, their stored SV is effectively 0. Mitigated by client-side guard still being active (Phase 1 keeps it). Honest clients will see correct SV via their localStorage cache; rogue clients targeting pre-change users could theoretically downgrade by 1 step, but downgrade target SV=1 means data structures from v1 of the bundle, which would fail JSON parse on read-back. Acceptable risk.

### Decision 5 — Opt-in rollout (Phase 1)

**Choice**: Worker accepts presign requests with OR without `schema_version` in the body. If present, sign metadata header. If absent, sign URL as before (no metadata header). 400 errors only on malformed `schema_version` (e.g., string, negative number) — not on absence.

**Rationale**:
- Worker deploys before client in CI pipeline (wrangler vs GH/CF Pages async)
- During rollout window, in-flight clients (cached prod bundles, slow refresh) may not yet send `schema_version` — they should still work
- After ~1 week dogfood, Phase 2 makes `schema_version` REQUIRED via a follow-up change

**Trade-off**: P1 has a gap (clients not sending SV = no enforcement). Mitigated by short rollout window + Phase 2 follow-up.

### Decision 6 — Phased rollout via separate changes, not feature flag

**Choice**: Three changes — this one (Phase 1, opt-in Worker enforcement) + follow-up Phase 2 (make required) + Phase 3 (remove client-side guard). No env-var feature flag.

**Rationale**:
- Phase boundaries are server-side behaviour changes, not client-toggleable
- Each phase has different OpenSpec deltas and validation criteria — clean separation
- Avoids stale flag debt (KISS principle 2)

**Trade-off**: Three changes instead of one. Each change ships independently, gates the next based on dogfood telemetry. Net less risk than one big bang.

### Decision 7 — Smoke test against `wrangler dev`, not a full test suite

**Choice**: `cloudflare/sync-worker/scripts/smoke-presign-sv.sh` is a bash + curl script that starts `wrangler dev` locally, mints a fake JWT, runs 5 scenarios end-to-end.

**Rationale**:
- Worker has no existing test infrastructure (no Vitest, no miniflare)
- Adding miniflare + vitest is a separate scope (would warrant its own change with broader Worker test coverage)
- Bash + curl smoke is read-write-write-read instrumentation enough for P1 ship confidence
- Tests run during dev locally, not in CI (Worker CI is `wrangler deploy` only currently)

**Trade-off**: No CI regression guard for SV enforcement. Mitigated by P1's narrow blast radius (opt-in only affects PUT requests that send SV) + manual prod smoke against `med-study-rpg.com/2nd/` after deploy.

### Decision 8 — Capability stays `dexie-schema-guards`, extended via delta

**Choice**: Add 3 ADDED Requirements to the existing `dexie-schema-guards` capability spec. Do NOT create a new capability `r2-bundle-guards` or similar.

**Rationale**:
- `dexie-schema-guards` Purpose statement (synced at A3 archive) explicitly mentions "rules about how Dexie schemas evolve safely" — this is the same domain
- Sibling A3 (CI lint) and this change (Worker enforcement) form one cluster: "everywhere schema_version matters, enforce SV transitions are valid"
- One capability is simpler to find for future contributors

**Trade-off**: Capability is no longer narrowly about CI lint. Acceptable — Purpose statement covers both.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| R2 CORS blocks `x-amz-meta-schema-version` header from browser PUT | P1 夯 | Verify at impl time; if blocks, update R2 bucket CORS via `wrangler r2 bucket cors put` to allow the header. Document the CORS edit in tasks.md as a manual deploy step |
| aws4fetch `headers` parameter not honoured in signQuery mode (lib bug) | P3 NPC | Verify via wrangler dev smoke before shipping. If unsupported, fall back to manually constructing the canonical request (more code but doable) |
| Race: device A passes HEAD at SV=4, device B PUTs SV=5 first, then A PUTs SV=4 → A's PUT succeeds because A's signed URL allows SV=4 and R2 stores it (downgrade!) | P2 頂級 | Inherent to async storage. Client-side guard still active in P1. R2 LWW means the later-arriving PUT wins; if A's PUT arrives after B's, R2 stores SV=4. Counter-measure (defer): require Worker to use R2 conditional PUT (`If-Match` on metadata) — too complex for P1 scope; document as known limitation, revisit if telemetry shows real incidents |
| Old clients deployed before P1 ships keep working but bypass enforcement | P3 NPC | Phase 2 (separate change) makes SV required; users who don't refresh within ~1 week will fail PUT after P2 ships. CLAUDE.md note will document this |
| Worker `R2_PRIMARY.head()` call on every PUT presign adds latency | P4 NPC | Single HEAD ≈ 20ms median. Acceptable. Cached in Worker memory not worthwhile (R2 is eventually consistent + cache invalidation hard) |
| customMetadata key naming inconsistency (`schema-version` vs `schema_version`) between S3 SDK and R2 binding | P3 NPC | Implementation reads both keys (fallback chain); writes `schema-version` (S3 convention) |
| CORS preflight on browser PUT requires backend bucket-level allowlist of custom header | P1 夯 | Same as CORS risk above — verify in dev, document fix |

## Alternatives Considered

### Option A — Worker proxies upload body

Documented in proposal.md. Stronger guarantees, ~3× implementation cost, body memory pressure on Worker (R2 free tier per-request memory cap 128 MB; bundles are 1-5 MB so plenty of headroom, but still real). Defer until concrete demand (e.g., need to enforce SV from body matches metadata).

### Option B variant — Use R2 conditional PUT (`If-Match` / `If-None-Match`)

R2 supports conditional writes (etag-based). Not directly suitable: we'd want "PUT only if existing metadata.schema-version ≤ incoming". R2 has no such semantic at the metadata level. Sticking with HEAD-then-decide pattern.

### Option C — Daily Worker cron that scans all blobs and rolls back illegal downgrades

Reactive, not preventive. Wouldn't catch a window of bad data between rogue PUT and cron sweep. Rejected.

### Option D — Add `schema_version` to JWT claims and force client to declare it at sign-in

Forces client to commit to SV early. But SV changes per bundle (m1 vs m2 vs neurons) and per session (after schema upgrade). JWT is wrong layer. Rejected.

### Option E — Worker enforces SV via Workers KV / Durable Object tracking per-user-per-bundle

Maintains authoritative SV per (user, bundle) tuple separate from R2. Worker `/presign` reads KV/DO instead of HEAD-ing R2. Pros: faster than HEAD (KV is sub-ms); explicit single source of truth. Cons: extra storage layer; sync KV with R2 (writes must atomically update both); double bookkeeping. Rejected: R2 metadata already gives us the single source for free.

## Open Questions

None blocking — implementation will resolve:

- Exact R2 customMetadata key name (`schema-version` per S3 convention vs `schema_version` per JSON envelope convention) — implementation will read both, write the S3 convention
- R2 CORS allowlist behaviour for `x-amz-meta-*` headers — verify in `wrangler dev` smoke; fix bucket CORS via wrangler if needed
- Whether aws4fetch signs the `headers` argument correctly in `signQuery: true` mode — verify in smoke; fall back to manual canonicalization if not
