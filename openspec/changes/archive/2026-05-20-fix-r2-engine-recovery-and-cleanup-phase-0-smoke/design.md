## Context

R2 cloud-sync migration's Phase 1+2 dual-write code (already shipped) follows a "snapshot-per-bundle + ETag-based LWW" model. The engine's first push to a bundle that has no local etag uses `If-None-Match: *` as a "create-only" precondition; when R2 replies 412 (blob already exists), the engine's recovery path is supposed to pull the existing blob, merge it locally, then retry with `If-Match: <etag>` to overwrite.

This recovery path was correct in theory but had two adjacent bugs surface in Phase 3 session 2 (2026-05-20):

1. The R2 bucket contained a 1-byte garbage blob left behind from the Phase 0 task 2.11 JWT smoke test. `add-r2-cloud-sync-migration/tasks.md` line 2.11 stated «Test blob deleted after verification» but the delete never actually happened — likely a missed cleanup step or a misread of the wrangler output. The orphan blob persisted in R2 for ~1 month and ETag-collided with the production m1 push path the moment dual-write was enabled.

2. The engine's recovery path crashed when the pulled "existing blob" couldn't be gunzipped (because the orphan blob was 1 byte of `0x74`, not a valid gzip stream). `gunzipBundle(blob)` threw an exception inside `pullBundle`, which was caught by `pushBundle`'s outer try/catch, classified as "recoverable" (since `isUnrecoverable` only matches `presign_*` patterns), and retried 3 times — each retry hit the same corrupt blob, same gunzip crash. The 3rd retry threw `r2_push_exhausted: Failed to fetch`. The "Failed to fetch" suffix was misleading: the fetch itself succeeded (R2 returned 200 OK with the 1-byte body); it was the in-memory gunzip that failed, but its error message happened to contain the substring "Failed to fetch" from a downstream library, so the wrapped exception read like a network failure.

Both bugs are silent: the engine ends up in `offline` status with a misleading log message, the user sees no toast or banner, and unless someone runs `__sync.getStatus()` in the console they have no signal that sync is dead.

The current state is: Bug 3 has been worked around manually (the m1 blob was overwritten with a real 2378-byte gzip during session 2), and Bug 4 is dormant because no other corrupt blobs are known. But the bug class is real — any future R2 hiccup (truncated upload, network corruption, dev test leftover, manual investigation that leaves bytes behind) will reproduce it.

Stakeholders: owner (single dogfood user today), future M4-era users post-Phase-4 (when prod cuts over to R2 reads). Both apps `medexam-tw` and `medexam2-hospital-tw` need the fix in lockstep.

## Goals / Non-Goals

**Goals:**
- Engine `pushBundle` 412 recovery path survives a corrupt-gzip pulled blob and successfully overwrites it via `If-Match:<etag>` on the next attempt.
- Error message at the recovery boundary is accurate: distinguishes "recovered via overwrite" (success), "still failing after overwrite" (real failure), and the legacy "network/CORS exhaust" (different root cause) cases.
- R2 buckets (primary + backup) are audited for leftover smoke / test blobs and cleaned up; the inventory state matches the documented expected state (only `users/<uid>/<bundle>-snapshot.json.gz` files for real owners + their gz-bundle content).
- Phase 0 cleanup discipline becomes an explicit checklist item in `add-r2-cloud-sync-migration/tasks.md` so future smoke tasks can't repeat the leak.
- `tasks.md` task 2.11 description accurately reflects what happened.

**Non-Goals:**
- No change to the LWW semantics or the `If-None-Match: *` vs `If-Match: <etag>` design (these are correct; only the corrupt-blob branch needs handling).
- No new cloud-sync capabilities, no banner UX changes, no spec deltas.
- No Phase 3 read-cutover work (`apps/*/engine pullNow → R2`) — that's blocked on Task 4.8 14-day bake separately.
- No drop of Supabase sync tables — that's a separate post-Phase-4 change.
- No automated R2 GC / quota monitor — out of scope; revisit in Phase 5+ if growth pattern justifies it.
- No new test framework setup — reuse whatever test runner the apps already have (or add minimal vitest if none).

## Decisions

### Decision 1: Catch decode errors in `pullBundle`, not in `pushBundle`

Two places could handle the corrupt-blob case:

**A. Catch in `pullBundle`** (chosen) — `pullBundle` is the function that owns the decompress + apply step; it has direct access to `res.headers.get('ETag')` from the same response. Catching here keeps `pushBundle`'s 412 branch simple ("call pullBundle, then retry") and centralizes blob-decode robustness in one place. Future callers (e.g., a manual repair button) benefit automatically.

**B. Catch in `pushBundle`'s 412 branch** — would require duplicating ETag extraction logic from the pull's response, complicating the contract between pull and push.

Trade-off: `pullBundle`'s return type grows by one optional field (`decodeFailed?: boolean`). Callers that don't care can ignore it. `applied: null + decodeFailed: true` is a distinct signal from `applied: null + blobMissing: true` (404).

### Decision 2: Recovery message wording

Three distinct conditions need distinguishable error messages from the engine:

| Condition | Old message | New message |
|---|---|---|
| 3 retries all hit corrupt-gunzip → engine still wrote successfully on retry 2 (overwrite worked) | `r2_push_exhausted: Failed to fetch` (misleading) | (success path) console.info `[sync:pushR2:<bundle>] recovered from corrupt blob via overwrite` |
| Retry 2 PUT with `If-Match:<etag>` still 412 (somebody else just wrote) → exhaust retries | `r2_push_exhausted: Failed to fetch` | `r2_blob_concurrent_writer_exhausted` |
| Network actually failed at fetch (CORS, DNS, offline) | `r2_push_exhausted: Failed to fetch` | `r2_push_exhausted: <underlying network error>` (preserve original message) |
| Recovery loop hit corrupt-gunzip ALL 3 attempts (couldn't even get a valid etag to overwrite) | (would never reach this — first attempt extracts etag) | `r2_blob_corrupt_overwrite_failed` (defensive) |

Rationale: each distinct condition should produce a distinct grep-able log line so we can triage future field reports.

### Decision 3: Test harness

Two options:

**A. In-process mock** (chosen) — Build `pushBundle` test that mocks `requestPresign` to return a `mock://` URL, mocks `fetch` to return crafted responses (1-byte blob on first call, 200 OK on second). No real R2 hit. Fast, deterministic, runs in CI without secrets.

**B. Real R2 fixture** — Upload a corrupt blob to a test bucket, run the engine against it. More realistic but flaky (rate limits, network), needs CI secrets, slow.

Mock is sufficient because the bug is in the engine logic, not in any R2-specific behavior. R2 returning 412 + a 1-byte body is straightforward to simulate.

### Decision 4: R2 inventory cleanup is one-time + reviewed, not automated

`wrangler r2 object list --prefix users/` outputs a few dozen objects today; the owner can eyeball them in 5 minutes. Risk of false-positive delete (deleting a real owner's snapshot) is too high to automate now. After this change we have 1 real user (owner) with 3 expected blobs (m1, m2, bookmarks). Anything else is suspect.

Future-proofing: when user count grows past ~10, build a quota / sweep tool. For now, manual + reviewed is correct.

### Decision 5: Edit `add-r2-cloud-sync-migration/tasks.md` directly (not a delta)

Task 2.11 is in the *active* change folder, not archive. Per OpenSpec spec, edits to in-progress tasks.md are non-destructive (no main spec affected; tasks.md is operator-facing scaffolding). Correcting the inaccurate description is the right way to record what happened; alternative would be re-writing history via archive + revert + propose, which is overkill for a typo-class correction.

### Decision 6: Apply identical fix to 一階 + 二階 in one commit

The two apps have mirrored `r2/engine-r2.ts` files (Phase 2 task 4.1 copied the 一階 file as a starting point). Diverging the fix between them would create a maintenance burden and silently break one app. One commit, both files, identical semantic change.

Future cleanup (not in this scope): consider extracting `r2/engine-r2.ts` into `packages/core/src/sync/` so there's only one source of truth. Deferred to a separate refactor change.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| The decode-error-but-still-extract-etag path could mistakenly accept a partial-write blob and treat it as authoritative. | The etag value comes from the R2 server's `ETag` response header, which R2 only sets for fully-written objects. A truncated upload would have a different etag. So extracting the etag and writing over it is safe — the worst case is that we overwrite a "valid but stale" blob with our fresh snapshot, which is the LWW design intent. |
| Wrangler delete is irreversible; deleting a real user blob would lose their cloud snapshot. | (a) Inventory review is human-gated, owner inspects each candidate before delete. (b) `study-rpg-saves-backup` bucket has a daily mirror with 30-day retention — even if a delete is wrong, recovery from backup is possible. (c) Today there's only 1 user (owner), so blast radius = 0 external impact. |
| The "recovered via overwrite" log is `console.info` not an exception — easy to miss in a noisy console. | Acceptable. The previous behavior was worse (silent crash + misleading exception). Future telemetry / sentry hook can subscribe to a counter we increment on this branch if needed; out of scope for now. |
| Two apps' mirror code can drift over time even after this fix. | Documented in design.md Decision 6 as a known issue. Filed as future refactor in `add-r2-cloud-sync-migration/design.md` Open Questions section (if not already). |
| Edit to `add-r2-cloud-sync-migration/tasks.md` happens cross-change and could conflict if that change is being actively edited by another session. | Multi-agent git safety rules apply: explicit `git add`, `git diff --cached --name-status` before commit. If conflict detected at commit time, rebase and re-verify. |

## Migration Plan

This change is **non-breaking** at the user level:

1. Engine fix lands → existing code paths behave identically for the happy path (200 OK PUT) and the legitimate-412 path (concurrent writer). Only the corrupt-blob branch behaves differently — and it now succeeds where before it failed.
2. R2 inventory cleanup → manual + reviewed; no impact on real user blobs.
3. tasks.md edit → documentation only.

**Deploy order:**

a. Land engine fix in `apps/medexam-tw` + `apps/medexam2-hospital-tw` simultaneously in one PR (typecheck + new tests pass).
b. Run R2 audit + delete leftover smoke blobs locally via `wrangler` (no deploy needed).
c. Edit `add-r2-cloud-sync-migration/tasks.md` description.
d. Commit + push to track-m2 worktree → merges to main per regular sync protocol.
e. Apps deploy via GH Actions (existing pipeline; no flag flips needed since R2 dual-write is already active per `.env.local` dogfood).

**Rollback:**
- Engine fix: if a new bug emerges, revert the `engine-r2.ts` edits in both apps → reverts to pre-fix behavior (which now matches owner's recovered state since the corrupt blob is gone). No data loss; engine returns to original behavior of "crash on corrupt blob," but no known corrupt blobs remain in R2.
- R2 delete: undeletable. Mitigation = `study-rpg-saves-backup` daily mirror (30d retention).
- tasks.md edit: trivially revertable via git revert.

## Open Questions

- Should `pullBundle` also handle the case where `res.body` is non-empty but cannot be parsed as JSON after gunzip succeeds? (Today: throws in `applyBundleSnapshot`; same general class of bug but separate from gunzip-fail.) **Decision deferred**: out of scope for this change; if it becomes a real failure mode, file a follow-up.
- Should the engine emit a Sentry / telemetry event when the recovery branch triggers? **Decision deferred**: no telemetry infrastructure today; revisit in Phase 5+ when bug_reports volume justifies it.
- Should we add a `wrangler r2 object list ... | jq` script to `cloudflare/sync-worker/` for periodic inventory checks? **Decision: yes, as a Phase 8 docs/capacity revalidation deliverable**. Tracked via `add-r2-cloud-sync-migration/tasks.md` task 8.6 (`cloudflare/sync-worker/capacity_monitor.md`).
