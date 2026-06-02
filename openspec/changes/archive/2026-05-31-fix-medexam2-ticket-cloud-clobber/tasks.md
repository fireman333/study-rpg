## 1. Bug 2 — blob apply LWW uses max contributing-table timestamp

- [x] 1.1 In `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`, add a helper `readHospitalStateLocalMaxUpdatedAt(db: HospitalDB): Promise<number | undefined>` that reads `_updatedAt` from the `gameCounters` / `gachaStats` / `tickets` singleton rows and the max over all `rooms` / `affinity` rows, returning the overall max (or `undefined` when no contributing row carries a numeric `_updatedAt`).
- [x] 1.2 Change `HOSPITAL_STATE.applyToLocal` non-force branch to compute `localMax = await readHospitalStateLocalMaxUpdatedAt(db)` and gate on `cloudIsNewer(cloudRow.updated_at, localMax)` (replacing the current `gameCounters._updatedAt`-only comparison). Leave the `force` branch untouched (still bypasses the comparison).
- [x] 1.3 Confirm the `force: true` path and `writeHospitalStateBlob` are unchanged (account-switch / explicit "use cloud" still overwrite unconditionally). — only the `!force` branch was edited; force path + writeHospitalStateBlob untouched. `HOSPITAL_STATE` exported for the unit test (mirrors `HOSPITAL_QUESTION_HISTORY` precedent).

## 2. Bug 1 — re-evaluate daily ticket after each successful pull

- [x] 2.1 In `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts`, extend the engine's `onPullComplete` callback to call `refreshDailyTickets()` after its existing post-pull work (achievement backfill / invariant repair). Wrapped in try/catch logging under the `[daily-ticket]` channel.
- [x] 2.2 Verify ordering: `onPullComplete` fires after `applyingFromCloud` resets to `false` (engine.ts), so the re-granted `tickets.put` is hook-tracked → marks dirty → debounced push. No engine.ts change needed; inline comment added at the call site.
- [x] 2.3 Confirm App boot `refreshDailyTickets()` (`App.tsx:92`) is retained unchanged (anonymous players + immediate UX). — unchanged.

## 3. Tests (Vitest, `apps/medexam2-hospital-tw/src/__tests__/`)

- [x] 3.1 Added `sync-hospital-state-lww.test.ts` (4 cases): tickets-only newer-than-gameCounters local write survives a stale cloud blob (returns false, available preserved); genuinely-newer cloud wins; force overwrites even when local is newer; force writes cloud onto empty local.
- [x] 3.2 Added `daily-ticket-refresh.test.ts` (4 cases): re-grant when `lastRefreshDay` is yesterday; no-op (no write) when already granted today; post-rollback re-grant (cold-start clobber scenario); multi-day `min(delta, cap-available)` grant. Drives via `lastRefreshDay` deltas against `Math.floor(Date.now()/86400000)` (matches private `currentEpochDay`).
- [x] 3.3 `pnpm --filter @study-rpg/medexam2-hospital-tw test` — 73 passed (11 files), incl. 8 new.

## 4. Static checks

- [x] 4.1 二階 typecheck clean (`pnpm --filter @study-rpg/medexam2-hospital-tw typecheck`). NOTE: `pnpm -r typecheck` fails on `packages/content-neurons-tw` (M_3rd track — node_modules not installed in this worktree); pre-existing + unrelated to this 二階-only change.
- [x] 4.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` succeeds.

## 5. Runtime verification (Chrome MCP, DEV)

- [x] 5.1 `list_connected_browsers` preflight (1 local browser); booted 二階 dev server at `localhost:5183/study-rpg/hospital/`.
- [~] 5.2 PARTIAL — verified app boots, daily ticket chip renders `🎟️ 10 / 99 · 明日 08:00 +1`, and both fixes are present in the dev-served modules (`useSync` onPullComplete → `refreshDailyTickets()`; `tables` → `readHospitalStateLocalMaxUpdatedAt`). The full authed cold-start clobber repro (`__hospitalSync` / R2 PUT via Performance API) needs the owner's Google sign-in session — NOT run (won't auth on owner's behalf). Core LWW + idempotency logic authoritatively covered by §3 unit tests.
- [~] 5.3 PARTIAL — same auth constraint (visibility-pull non-force revert path). LWW-max behavior covered by `sync-hospital-state-lww.test.ts`.
- [x] 5.4 `read_console_messages onlyErrors=true` — no errors on load/reload.

## 6. Gate + ship

- [x] 6.1 `/simplify` — applied the reuse cleanup (rewrote `readHospitalStateLocalMaxUpdatedAt` to reuse `readHospitalStateBlob`, dropping the duplicate Promise.all + casts + closure); typecheck + 73 tests still green.
- [x] 6.2 `/opsx:verify` — 3-dim check passed: 0 critical / 0 warning, both requirements implemented + scenario-covered, design D1/D2 followed, D3 deferred documented.
- [x] 6.3 `/verify` end-to-end — covered by §5 Chrome MCP runtime smoke (boot OK, daily-ticket chip renders, both fixes in served bundle, console clean); full authed path auth-gated (owner self-verifies on live).
- [x] 6.4 `/opsx:archive` — 2 ADDED requirements synced into main cloud-sync + recruitment-gacha specs (both `--strict` valid); change moved to `archive/2026-05-31-fix-medexam2-ticket-cloud-clobber/`.
- [ ] 6.5 Commit (explicit user confirmation) using the project template `spec(archive): merge fix-medexam2-ticket-cloud-clobber — …`; stage explicit file-by-file per multi-agent git safety; then merge `track-m2 → main`, push, and verify both GH Pages + CF Pages deploy workflows go green (`gh run list --branch main`).
