# add-bundle-schema-version-guard

## Why

The R2 sync engine refuses to PUT a bundle whose `schema_version` is lower than the last-pulled blob's. Today that guard lives **client-side only** at [`apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts:72-86`](apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts:72) (and equivalent paths in `medexam-tw` + `neurons-tw`), consulting a localStorage-cached value populated after each pull. It works for the happy path but four threat models bypass it:

1. **localStorage cleared** — user wipes site data, cache resets to undefined, first push after clear can be any SV including a downgrade
2. **Modified client** — a fork or tampered build can comment out the check; nothing server-side stops the resulting PUT
3. **Cross-device race** — device A pulls at SV=4, then device B (running stale build) pushes SV=3 first. Both think they're current per their own cache
4. **First push after migration** — newly-introduced bundle types skip the guard for their first PUT (no prior cache)

[`openspec/specs/dexie-schema-guards/spec.md`](openspec/specs/dexie-schema-guards/spec.md) already owns "rules about how Dexie schemas evolve safely". This change adds a second-layer guard there: the Worker `/presign` handler validates SV before minting the PUT URL, and the resulting presigned URL bakes the `x-amz-meta-schema-version` header into the signature so the client cannot deviate from the value the Worker authorized.

## What Changes

- **EXTEND** capability `dexie-schema-guards` with three new requirements covering Worker presign validation, signed metadata header enforcement, and client write-path participation.
- **MODIFY** `cloudflare/sync-worker/src/presign.ts`:
  - Accept `schema_version` (positive integer) in the PUT-op presign body
  - For PUT ops: call `env.R2_PRIMARY.head(key)` to read existing blob's `customMetadata.schema_version` (treat missing/undefined as `0` for legacy backward compat)
  - If `incoming < existing`: return `409 { error: 'r2_schema_downgrade_refused', cloud, incoming, bundle }`
  - Else: pass `headers: { 'x-amz-meta-schema-version': String(N) }` to `aws.sign(...)` so the header is committed in SigV4 `X-Amz-SignedHeaders` scope
  - Include the required header value + name in the response so client knows what to send
- **MODIFY** R2 client adapters in all three apps (`apps/medexam-tw/`, `apps/medexam2-hospital-tw/`, `apps/neurons-tw/` under `src/lib/sync/r2/`):
  - When POSTing to `/presign` for PUT: include `schema_version: snapshot.meta.schema_version`
  - When executing the returned signed URL: include header `x-amz-meta-schema-version: <value>` matching what Worker signed
  - On 409 response: throw `r2_schema_downgrade_refused_by_server` (named differently from the existing client-side `r2_schema_downgrade_refused` so logs/telemetry can tell them apart)
- **ADD** `cloudflare/sync-worker/scripts/smoke-presign-sv.sh` — local smoke against `wrangler dev` covering: first PUT writes metadata; lower SV PUT rejected with 409; equal SV PUT accepted; higher SV PUT accepted + metadata updated; GET unaffected.
- **UPDATE** `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` (sibling guard cross-reference) to point at this guard as part of the same capability.
- **UPDATE** `CLAUDE.md` (project) — add one paragraph to "Cloud sync (M4 + R2 migration in-flight)" section documenting the new presign contract + R2 metadata convention.

## Impact

- Affected specs: EXTEND existing capability `dexie-schema-guards` (no new capability).
- Affected code:
  - `cloudflare/sync-worker/src/presign.ts` (~+60 lines: schema_version parsing, R2 head check, response shape extension, signed-headers wiring)
  - `cloudflare/sync-worker/scripts/smoke-presign-sv.sh` (NEW, ~60 lines bash)
  - `apps/medexam-tw/src/lib/sync/r2/client.ts` + `engine-r2.ts` (~+10 lines each)
  - `apps/medexam2-hospital-tw/src/lib/sync/r2/client.ts` + `engine-r2.ts` (~+10 lines each)
  - `apps/neurons-tw/src/lib/sync/r2/client.ts` + `engine-r2.ts` (~+10 lines each)
  - `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` (cross-reference paragraph)
  - `CLAUDE.md` ("Cloud sync" section paragraph)
- Affected tests: ad-hoc smoke script (no Vitest — Worker has no test suite; smoke against `wrangler dev` is the best available).
- Affected users: zero behaviour change for honest clients with up-to-date code. Old clients (pre-this-change) attempting to push will get either:
  - The old presign path (Worker doesn't sign the header, client doesn't send it) → works as before
  - The new path is **opt-in** by client behaviour: only clients that send `schema_version` in the presign body get a URL with the signed metadata header
- Threat model bypass: rogue clients cannot bypass `/presign` because R2 credentials live only in the Worker.

## Rollout sequencing (3 phases, no atomic deploy needed)

| Phase | Worker | Client (all 3 apps) | Net behaviour |
|---|---|---|---|
| **P1 (this change ships)** | Accepts optional `schema_version` in PUT body; opt-in signing if present | Always sends `schema_version` + `x-amz-meta-schema-version` header | New clients get enforcement; old clients (cached/stale prod build) work unchanged |
| **P2 (follow-up after ~1 week dogfood)** | Makes `schema_version` REQUIRED in PUT presign body; rejects 400 if absent | (no change needed if P1 deployed broadly enough) | All clients must comply; rogue/stale clients fail loudly |
| **P3 (cleanup, optional)** | (no change) | Client-side localStorage guard can be removed (server enforcement is canonical) | Simpler client; single source of truth |

This change ships P1 only. P2 + P3 are follow-up changes once telemetry confirms P1 is stable.

## Out of Scope

- Validating that the SV value declared in the presign body matches the SV inside the gzipped JSON body. That would require Worker to gunzip + parse JSON = body proxy = Option A territory. Defer.
- Race condition between HEAD and PUT (R2's eventual consistency window). If two devices race to upgrade SV simultaneously, both could pass HEAD and both could PUT — the second write wins by R2 LWW. Accept as inherent eventually-consistent behaviour.
- Removing the existing client-side localStorage guard. Phase 3 of rollout, separate change.
- Adding a Worker test suite (`miniflare` + vitest). Separate concern; tasks.md §3.4 smoke is sufficient first-line coverage.
- GET path enforcement. SV is not a downgrade risk on read; even if a stale client GETs a high-SV bundle it just falls through to local merge logic which is already SV-aware client-side.
- Worker proxy of upload body (Option A). Documented as alternative in design.md; defer until concrete demand emerges.

## Acceptance Criteria

- `wrangler dev` smoke (`scripts/smoke-presign-sv.sh`) shows all 4 SV scenarios pass: first-write metadata set; SV=lower rejected 409; SV=equal accepted; SV=higher accepted + metadata updated.
- Production smoke after deploy: existing R2 sync continues to work for both 一階 + 二階 + neurons (no regression). Easy verification: open `med-study-rpg.com/2nd/`, sign in, trigger a study session, confirm sync chip goes 🟡 → 🟢 with no console error.
- Network panel inspection during production smoke confirms PUT requests include `x-amz-meta-schema-version` header.
- Manually crafted /presign request with SV=1 against an existing user whose R2 blob already has SV=4 returns 409 `r2_schema_downgrade_refused` (curl test documented in tasks.md §4).
- `openspec validate add-bundle-schema-version-guard --strict` passes.
- `openspec validate dexie-schema-guards --strict` passes after delta sync at archive time (3 new requirements added; existing 2 unchanged).
