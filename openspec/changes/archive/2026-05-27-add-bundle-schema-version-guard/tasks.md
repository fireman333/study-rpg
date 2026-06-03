# Tasks — add-bundle-schema-version-guard

## 1. Worker changes (cloudflare/sync-worker/)

- [x] 1.1 Read `cloudflare/sync-worker/src/presign.ts` end-to-end ✓
- [x] 1.2 Extended `PresignBody` interface to include `schema_version?: unknown`
- [x] 1.3 Extended `parseBody()` to validate `schema_version`:
  - For `op === 'put'`: positive integer required if present; throws `invalid_schema_version` on non-integer / non-positive / NaN / Infinity
  - For absence: P1 opt-in path — sign URL without metadata header (legacy compat)
  - For `op === 'get'`: ignored entirely
- [x] 1.4 Added `readExistingSchemaVersion()` helper + R2 HEAD-then-compare flow:
  - HEAD null (key absent) → existing SV = 0
  - `customMetadata['schema-version']` primary, falls back to `customMetadata['schema_version']` for naming-quirk safety
  - 409 response on downgrade with full diagnostic body: `{ error, cloud, incoming, bundle, key }`
  - 502 `r2_head_failed` fail-closed on unexpected HEAD failure (no silent bypass)
- [x] 1.5 Modified `aws.sign()` call to include `headers: { 'x-amz-meta-schema-version': String(N) }` only when PUT + SV signed
- [x] 1.6 Extended response JSON to include `requiredHeaders?: Record<string,string>` (populated only for signed PUTs)
- [x] 1.7 `pnpm --filter @study-rpg/sync-worker typecheck` → clean ✓ (one TS18049 fixed by switching from `Parameters<typeof aws.sign>[1]` to explicit `RequestInit & {aws:{...}}` type)

## 2. R2 binding sanity + CORS

- [ ] 2.1 `R2_PRIMARY` binding confirmed in `Env` interface (`cloudflare/sync-worker/src/index.ts:41`). Live verification via `wrangler dev` deferred to owner-driven §7
- [ ] 2.2 `env.R2_PRIMARY.head()` smoke deferred to §7.4 prod browser-network inspection
- [ ] 2.3 R2 bucket CORS allowlist for `x-amz-meta-schema-version` header — VERIFY in §7. If preflight blocks the header, owner runs `wrangler r2 bucket cors put <bucket>` with updated JSON allowing `x-amz-meta-*` headers in PUT. Risk flagged P1 夯 in design.md

## 3. Client adapters (3 apps)

- [x] 3.1 `apps/medexam-tw/src/lib/sync/r2/client.ts`:
  - Added `requiredHeaders?: Record<string,string>` to `PresignResult`
  - Extended cache key to include schemaVersion for PUT ops
  - Extended `requestPresign(supabase, bundle, op, schemaVersion?)` signature
  - Body includes `schema_version` field only when sv != null
  - 409 response parsed into `r2_schema_downgrade_refused_by_server: cloud=X incoming=Y bundle=Z` error
- [x] 3.2 `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts`:
  - `pushBundle` passes `snapshot.meta.schema_version` to `requestPresign`
  - `requiredHeaders` merged into PUT fetch headers
- [x] 3.3 Repeated 3.1 + 3.2 for `apps/medexam2-hospital-tw/src/lib/sync/r2/`
- [x] 3.4 Repeated 3.1 + 3.2 for `apps/neurons-tw/src/lib/sync/r2/` (neurons has single-bundle simpler shape; cacheKey lacks bundle prefix)
- [x] 3.5 `pnpm --filter @study-rpg/medexam-tw typecheck` ✓ / `medexam2-hospital-tw` ✓ / `neurons-tw` ✓ (after `pnpm install --filter @study-rpg/neurons-tw...` to restore node_modules — pre-existing main-worktree state per morning handoff)

## 4. Smoke script

- [x] 4.1 Created `cloudflare/sync-worker/scripts/smoke-presign-sv.sh`:
  - 6 scenarios: setup `/reset` + 5 enforcement scenarios (first PUT / downgrade refused / equal SV / higher SV / GET op ignores SV)
  - Scenario 1b actually PUTs body to R2 with the signed header so subsequent scenarios see real metadata state
  - Helpers: `presign()` for /presign POST + `check()` for pass/fail accounting
  - Header comment includes prereqs, TEST_JWT acquisition recipe, optional env vars
  - Exit 0 only if all checks pass
- [x] 4.2 Made executable via chmod +x
- [ ] 4.3 Run locally against `wrangler dev` — deferred to owner; script is self-contained and runnable per its header instructions
- [ ] 4.4 Pnpm script alias — SKIPPED (one-off smoke; bash invocation is the canonical entry)

## 5. Documentation

- [x] 5.1 Updated `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` cross-references — flipped "planned" entry into shipped sibling guard with file paths to presign.ts + smoke script
- [x] 5.2 Added paragraph to project `CLAUDE.md` "Cloud sync" section covering: P1 opt-in mechanism, requiredHeaders contract, R2 customMetadata as server-authoritative SV, smoke script invocation, follow-up phase pointers
- [ ] 5.3 `cloudflare/sync-worker/README.md` update — SKIPPED (README does not exist in `cloudflare/sync-worker/`; CLAUDE.md paragraph is the canonical entry)

## 6. Validation

- [x] 6.1 `openspec validate add-bundle-schema-version-guard --strict` → pass ✓
- [x] 6.2 `openspec validate --all --strict` → only dormant `remove-medexam-tw-and-promote-neurons` fails (unchanged from A3 archive baseline) ✓
- [x] 6.3 `pnpm typecheck` — all 4 affected packages (sync-worker + 3 apps) clean. `content-neurons-tw` failure is pre-existing main-worktree node_modules gap, not from this change
- [x] 6.4 `pnpm lint:dexie-fixtures` (A3) → exit 0 — no Dexie schema bumps in this change ✓

## 7. Production deploy smoke (owner-driven, post-commit)

- [ ] 7.1 With user confirm: `cd cloudflare/sync-worker && wrangler deploy` (Worker change; OPT-IN safe: legacy clients without `schema_version` in body still get URLs signed as before)
- [ ] 7.2 Tail Worker logs in a separate terminal: `wrangler tail`
- [ ] 7.3 Open `https://med-study-rpg.com/2nd/`, sign in, trigger a study session that produces a sync push
- [ ] 7.4 In Chrome devtools Network tab inspect the R2 PUT request: confirm `x-amz-meta-schema-version` header is present with value matching m2 SV (currently 4)
- [ ] 7.5 Confirm sync chip 🟡 → 🟢 + no console error
- [ ] 7.6 Worker tail shows /presign request with `schema_version: 4` in body and 200 response
- [ ] 7.7 Repeat 7.3-7.6 for `https://med-study-rpg.com/1st/` (m1 SV=1) and `https://med-study-rpg.com/neurons/` (neurons SV=1)
- [ ] 7.8 Synthetic downgrade test: use `curl` with valid JWT to call `/presign` with `schema_version: 0` against an existing-blob user. Expect 409 `r2_schema_downgrade_refused`. Owner can use the JWT acquired in 7.3 from Chrome devtools

## 8. Composing commit + archive

- [ ] 8.1 With user confirm: stage 10 explicit files (per Multi-Agent Git Safety):
  - `cloudflare/sync-worker/src/presign.ts`
  - `cloudflare/sync-worker/scripts/smoke-presign-sv.sh`
  - `apps/medexam-tw/src/lib/sync/r2/{client,engine-r2}.ts`
  - `apps/medexam2-hospital-tw/src/lib/sync/r2/{client,engine-r2}.ts`
  - `apps/neurons-tw/src/lib/sync/r2/{client,engine-r2}.ts`
  - `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`
  - `CLAUDE.md`
  - `openspec/changes/add-bundle-schema-version-guard/{proposal,design,tasks}.md` + `specs/dexie-schema-guards/spec.md`
- [ ] 8.2 With user confirm: `git commit -m "spec(propose+impl): add-bundle-schema-version-guard — Worker-side SV downgrade enforcement (P1 opt-in)"` (auto-git skill)
- [ ] 8.3 With user confirm: `/opsx:archive add-bundle-schema-version-guard` (delta sync extends dexie-schema-guards spec)
- [ ] 8.4 With user confirm: `git commit -m "spec(archive): merge add-bundle-schema-version-guard — Worker-side SV downgrade enforcement (P1 opt-in)"`
- [ ] 8.5 With user confirm: `git push origin main`
- [ ] 8.6 With user confirm: `cd cloudflare/sync-worker && wrangler deploy` (Worker prod deploy — separate from CI; CI does NOT deploy Worker)
- [ ] 8.7 Verify CI green (deploy.yml + deploy-cf-pages.yml + dexie-fixture-lint.yml). Worker tail for 1+ hour to catch unexpected 409s

## 9. Follow-ups (DO NOT include in this change)

- [ ] 9.1 Spawn `require-bundle-schema-version-in-presign` (P2) — after ~1 week dogfood, make `schema_version` REQUIRED in PUT presign body
- [ ] 9.2 Spawn `remove-client-side-sv-downgrade-guard` (P3) — once P2 ships, the client-side localStorage SV cache check becomes redundant
- [ ] 9.3 (Lower priority) Add Worker test suite via `miniflare` + vitest — would let A1/P2/P3 ship with proper unit tests instead of bash smoke
- [ ] 9.4 (Defer) Worker-side body inspection (Option A) if telemetry shows JSON envelope SV diverging from signed metadata header
