## Why

Phase 3 session 2 Task 4.7 dogfood uncovered two real bugs in the R2 dual-write pipeline that must be fixed before Phase 4 cutover: (Bug 3) the Phase 0 task 2.11 manual smoke test left a 1-byte garbage blob at `users/<uid>/m1-snapshot.json.gz` for ~1 month — `tasks.md` claimed it was deleted but it persisted, blocking the owner's 一階 m1 dual-write for 3 days; and (Bug 4) the engine `pushBundle` 412 recovery loop has no defensive handling for corrupt R2 blobs — when the pulled blob fails to gunzip, the error gets wrapped into a misleading `r2_push_exhausted: Failed to fetch` after 3 retries, leaving sync stuck offline. Both are silent failures (engine ends in `offline` state, no user-facing surface), so they're easy to miss until a dogfood session uncovers them.

## What Changes

- **Bug 4 — Engine recovery hardening (both apps)**: in `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts` and `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts`, wrap `gunzipBundle(blob)` inside `pullBundle` with try/catch. On decode failure, still extract `ETag` from `res.headers.get('ETag')` and `setEtag(bundle, etag)` so the next push iteration can use `If-Match:<etag>` to overwrite the corrupt blob. Return a new `decodeFailed: true` field on the result so `pushBundle` can log a clearer message.
- **Bug 4 — Error message clarity**: in `pushBundle`, when the 412-recovery path overwrites a corrupt blob, replace the misleading `r2_push_exhausted: Failed to fetch` with `r2_blob_corrupt_recovered_via_overwrite` (success path) or `r2_blob_corrupt_overwrite_failed` (still failing after recovery).
- **Bug 4 — Test coverage**: add a unit / integration test that simulates a corrupt 1-byte R2 blob and asserts `pushBundle` recovers via overwrite within one attempt cycle.
- **Bug 3 — R2 inventory audit**: run `wrangler r2 object list study-rpg-saves --prefix users/` and `wrangler r2 object list study-rpg-saves-backup --prefix users/`; capture all objects < 1 KB as suspect; for each, decide retain / overwrite / delete based on inspection (suspected smoke leftovers get `wrangler r2 object delete`).
- **Bug 3 — `add-r2-cloud-sync-migration` tasks.md correction**: edit task 2.11 to remove the inaccurate «Test blob deleted after verification» claim; replace with the actual outcome and a back-reference to this change's audit + cleanup. (This is an active change folder, not archive — editing the description is acceptable per OpenSpec.)
- **Bug 3 — Phase 0 cleanup checklist**: add a new task 1.11 (or 2.13, TBD) to `add-r2-cloud-sync-migration/tasks.md` mandating «for any smoke task that creates an R2 object, the cleanup step (`wrangler r2 object delete <key>`) MUST be in the same task definition and verified via `wrangler r2 object list`». Future Phase 0-equivalent work in any change should follow this rule.

## Capabilities

### New Capabilities
<!-- none — this change is pure bug-fix / robustness; no new behavior -->

### Modified Capabilities
<!-- none — neither the cloud-sync spec semantics nor any other capability is changing.
     The fix is internal robustness: pullBundle's existing contract (apply snapshot if possible, otherwise no-op) is preserved.
     pushBundle's 412 recovery contract is preserved (retry up to N times then throw).
     Only internal error handling and inventory hygiene change. -->

## Impact

**Affected code:**
- `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts` — `pullBundle` decode-fail handling, `pushBundle` 412-recovery message clarity
- `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` — same edit (mirror file)
- `apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts` (new) — corrupt-blob recovery test
- `openspec/changes/add-r2-cloud-sync-migration/tasks.md` — task 2.11 description correction + new cleanup-discipline task

**Affected infrastructure:**
- Cloudflare R2 bucket `study-rpg-saves` — audit + delete leftover smoke blobs (one-time operation; not recurring)
- Cloudflare R2 bucket `study-rpg-saves-backup` — same

**Dependencies:**
- No new dependencies. Uses existing `wrangler` CLI (already required by Phase 0).

**Risk profile:**
- Engine change is small, well-localized, and has a unit test. Risk = low.
- R2 inventory audit + delete is destructive (cannot un-delete) but operates only on leftover smoke blobs (small files < 1 KB; owner-managed); each delete is reviewed before execution. Risk = low with manual review gate.
- Documentation correction in tasks.md of an active change folder is acceptable (not archived) and changes no behavior.

**Out of scope for this change:**
- Phase 3 read cutover (still blocked by Task 4.8 14-day bake)
- Phase 4 prod cutover
- Dropping Supabase sync tables (separate change planned for after Phase 4 soak)
- Adding new sync features or capabilities
