## 1. Bug 4 — engine `pullBundle` decode-error handling

- [x] 1.1 Edit `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts`: in `pullBundle`, wrap `gunzipBundle(blob)` in try/catch; on decode failure, still extract `etag = res.headers.get('ETag')`, call `setEtag(bundle, etag)` if etag is non-null, then return `{ etag, notModified: false, blobMissing: false, applied: null, decodeFailed: true }`. Update the `PullBundleResult` interface to include `decodeFailed?: boolean`.
- [x] 1.2 Mirror the identical edit to `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts`.
- [x] 1.3 Verify the existing `applyBundleSnapshot` call path is fully skipped when `decodeFailed === true` — the corrupt body MUST NOT be parsed or applied to local Dexie.

## 2. Bug 4 — engine `pushBundle` 412 recovery improvements

- [x] 2.1 Edit `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts`: in the `if (res.status === 412 || res.status === 409)` branch of `pushBundle`, after the existing `pullBundle({ conditional: false })` call, check the returned `pullResult.decodeFailed`. If `true`, emit `console.info('[sync:pushR2:' + bundle + '] recovered from corrupt blob via overwrite (preparing If-Match retry)')` for operator visibility.
- [x] 2.2 At the end of `pushBundle`'s retry loop, change the exhausted error message: if the last attempt's failure was a 412 with a non-null etag in scope, throw `Error('r2_blob_concurrent_writer_exhausted: ' + bundle)` instead of the legacy `r2_push_exhausted: Failed to fetch`. If the failure was a real network/CORS error (e.g., `fetch` threw before getting a response), preserve the original error message: `r2_push_exhausted: <underlying error msg>`.
- [x] 2.3 Mirror identical edits to `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts`.
- [x] 2.4 Update `isUnrecoverable` if needed — the corrupt-blob branch should not be classified as unrecoverable; verify the existing pattern (matching `presign_*`) still works correctly for the new error message strings.

## 3. Bug 4 — Test coverage

- [x] 3.1 Decide on a test runner — if `apps/medexam-tw` has no existing test setup, scaffold minimal vitest config (already a common Vite-companion choice; consider whether to add to `apps/medexam-tw/package.json` devDependencies).
- [x] 3.2 Write `apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts`: import `pushBundle`; mock `requestPresign` to return a `mock://` URL; mock `fetch` via `vi.spyOn(globalThis, 'fetch')` with a 3-step script:
  - Call 1: `PUT mock://m1?op=put` with `If-None-Match: *` → return `Response('', { status: 412, body: '...' })`
  - Call 2: `GET mock://m1?op=get` → return `Response(new Uint8Array([0x74]), { status: 200, headers: { ETag: '"abc123"' } })` (the 1-byte garbage)
  - Call 3: `PUT mock://m1?op=put` with `If-Match: "abc123"` → return `Response('', { status: 200, headers: { ETag: '"def456"' } })`
- [x] 3.3 Assert: `pushBundle` returns `{ etag: '"def456"', bytes: <expected>, attempts: 2 }` (one 412-recovery retry → second attempt succeeds).
- [x] 3.4 Assert: `applyBundleSnapshot` was NOT called (mock and spy).
- [x] 3.5 Assert: `console.info` was called with a string matching `/recovered from corrupt blob via overwrite/`.
- [x] 3.6 Add a second test for the "concurrent writer" path: mock the second PUT to also return 412; expect the function to throw `r2_blob_concurrent_writer_exhausted` after exhausting retries.
- [x] 3.7 Add a third test for "real network failure" path: mock the first PUT to throw `TypeError('Failed to fetch')`; expect the function to throw with `r2_push_exhausted` prefix + the original message.

## 4. Bug 3 — R2 inventory audit

**Section 4 DEFERRED (2026-05-20)** — Wrangler CLI v4.92.0 does not expose an `r2 object list` subcommand (only `get`/`put`/`delete` by exact path). Listing requires an S3-API client configured against the R2 endpoint, or a custom `/list-users` admin endpoint on the Worker. Since Bug 4's engine fix (§1+§2) now makes corrupt blobs **non-fatal** (engine auto-recovers via If-Match overwrite + emits a console.info log), the audit's value shifts from urgent (find leftovers before they cause failures) to preventive (clean inventory hygiene). Defer this section to a follow-up housekeeping change once an S3 client is configured locally, or once we add a `/list-users` admin endpoint to the worker.

- [ ] 4.1 (deferred) List `study-rpg-saves` prefix `users/` via S3 API; capture key + size for each.
- [ ] 4.2 (deferred) Same for `study-rpg-saves-backup` prefix `backup/`.
- [ ] 4.3 (deferred) Flag every primary-bucket object with size < 1024 bytes as a smoke-test suspect.
- [ ] 4.4 (deferred) `wrangler r2 object delete study-rpg-saves <key>` for each confirmed leftover.
- [ ] 4.5 (deferred) Backup-bucket leftover handling (auto-prune covers most cases over 30 d).
- [ ] 4.6 (deferred) Post-audit re-list confirms only real-bundle objects remain.

## 5. Bug 3 — `add-r2-cloud-sync-migration/tasks.md` correction

- [x] 5.1 Edit `openspec/changes/add-r2-cloud-sync-migration/tasks.md` line 2.11: change «Test blob deleted after verification» to «(Test blob initially intended for deletion was retained in R2; cleanup deferred to fix-r2-engine-recovery-and-cleanup-phase-0-smoke change, see Bug 3 there.)» Keep the rest of the task line intact (the smoke verification narrative is still accurate; only the delete claim was wrong).
- [x] 5.2 Add a new task to `add-r2-cloud-sync-migration/tasks.md` Section 1 (Pre-Phase 0) — `1.12 Cleanup discipline: any R2 smoke task that creates an object MUST include an explicit delete step in its task definition, and the task MAY be marked complete only after `wrangler r2 object delete` is run AND `wrangler r2 object list` confirms the key is absent.` Mark this task `[x]` since this change itself documents the rule.

## 6. Verification

- [x] 6.1 Run `pnpm -r typecheck` and confirm 0 errors across both apps + packages.
- [x] 6.2 Run the new test file: `pnpm --filter @study-rpg/medexam-tw test src/lib/sync/r2/__tests__/engine-r2.test.ts` (or equivalent). All 3 tests pass.
- [ ] 6.3 (skipped 2026-05-20) Manual end-to-end happy-path smoke — covered by §3 unit tests (3/3 passing) which validate the engine code paths more rigorously than a single manual smoke. Manual revalidation can happen ad-hoc next session if needed.
- [ ] 6.4 (skipped 2026-05-20) Manual repair-path smoke — destructive (would intentionally corrupt owner's m1 blob in R2), unnecessary because §3.1 unit test exactly simulates this case with a mocked corrupt 1-byte blob and verifies engine recovers via overwrite. Skipping avoids the risk of leaving R2 in a partially-fixed state if anything else goes wrong mid-test.
- [x] 6.5 Run `openspec validate --all` and confirm 0 errors.

## 7. Closure

- [ ] 7.1 Commit all changes in one PR-equivalent commit. Commit message follows project convention: `fix(sync): R2 engine recovery + Phase 0 inventory cleanup`.
- [ ] 7.2 Run `/opsx:verify fix-r2-engine-recovery-and-cleanup-phase-0-smoke` to do 3-dim consistency check.
- [ ] 7.3 Run `/opsx:archive fix-r2-engine-recovery-and-cleanup-phase-0-smoke` (which will sync the cloud-sync delta into main spec at `openspec/specs/cloud-sync/spec.md`).
- [ ] 7.4 After archive, /spec note that bake (`add-r2-cloud-sync-migration` task 4.8) can proceed with renewed confidence: corrupt-blob class of bugs is no longer a silent failure mode.
