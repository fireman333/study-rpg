# Tasks — Eliminate the cross-device R2 412 storm (server-side plan)

## 0. Diagnostic — confirm the split (owner-approved)

- [ ] 0.1 Instrument `cloudflare/sync-worker/src/presign.ts` with ONE `console.log(JSON.stringify({op,bundle,u:userSub.slice(0,8)}))` after `bundleKey(...)`. **Owner-approved prod Worker deploy** (`wrangler deploy`), then `wrangler tail` ~90s during a live storm, capture, **revert the log + redeploy**.
- [ ] 0.2 Aggregate the capture: PUT presigns by `bundle` (neurons vs m2 vs bookmarks) + count distinct `u` per bundle + top-N users by PUT-presign count. Record: which app dominates + whether a few heavy multi-device clients carry most volume.
- [ ] 0.3 Write the result into design.md Open Question #2 and pick the architecture (gates §2/§3).

## 1. Phase 1 — client mitigation (low-risk, both apps)

- [x] 1.1 `engine-r2.ts`: `MAX_PUSH_RETRIES` 3 → 1; `pushBundle` return is now a discriminated union (`{status:'pushed'}` | `{status:'deferred', reason:'concurrent-writer'}`) + new `opts.deferOnConflict`. A surviving 412/409 with `deferOnConflict` returns deferred (no throw); WITHOUT it (account-reset) still throws `r2_blob_concurrent_writer_exhausted` (codex G3 confirmed). `engine.pushNow` re-arms `pending` + `schedulePush()` on deferred (codex G2), and crucially does NOT fire `onPushComplete` on deferred (codex G1 — would falsely upsert leaderboard).
- [x] 1.2 `engine-r2.ts`: `jitter()` helper (±30%) on `BACKOFF_MS` sleeps; on the LAST attempt the 412/409 path breaks WITHOUT the now-redundant sleep (Fork D — the jittered debounce is the backoff).
- [x] 1.3 `engine.ts`: `schedulePush` adds ±30% jitter to the debounce timer + clears `pushTimer` in the fired callback; `pushNow` clears a stale timer at the top. `useSync.ts`: default `DEBOUNCE_MS` 3000 → 12000 (env override kept). `beforeunload`/visibility flush unchanged. Fork C: deferred stays `idle`+`lastError=null` (light 🟢) until `MAX_CONSECUTIVE_DEFERS=5` consecutive defers → `state='error'`+marker (🔴) but still re-arms to recover; a landed push resets the streak.
- [x] 1.4 Unit tests: `r2-defer-on-conflict.test.ts` (412 & 409 → deferred after exactly 1 PUT, not 3× burst; reset path still throws; 200 → pushed) + `sync-engine-defer.test.ts` (deferred does NOT fire onPushComplete / record lastPushAt; re-arms; threshold→error; success resets streak). 676 vitest green; `pnpm --filter @study-rpg/neurons-tw typecheck` clean.
- [ ] 1.5 **Coordinate the same tuning into 二階** (`study-rpg-2nd` repo — separate; via session-bus / handoff). The Worker is shared, so neurons-only tuning leaves 二階's share of the storm. → spawned as an owner task-chip targeting that repo.
- [~] 1.6 **Deploy DONE** (2026-06-25): merged track-neurons→main `148cd8b` → CF Pages run `28159720827` green → prod bundle `index-Cntm8wtL.js` verified (carries `sync_deferred_concurrent_writer` + `concurrent-writer` markers; Supabase env `jakdyjxojokyqxeiuukx` still baked). **Measurement PENDING**: re-run the per-UTC-hour `PutObject userError` GraphQL (`~/.cf-analytics-token`) after clients reload-taper (~hours) at a **matched high-traffic window** (the handoff's busy windows were UTC 03–08h / 15–21h — NOT a quiet one), vs the 84–90% baseline + the single-flight 3–5%-low/82%-high split. Record the residual → it gates §2.1.

## 2. Phase 2 — server-side merge DO (decision-gated; only if §0/§1 residual is material)

- [ ] 2.1 **GATE:** owner picks the architecture (Option 1-only vs Option 2 server-merge vs Option 3) from design.md, informed by §0.2 + §1.6. If Option 1 suffices, STOP here and archive.
- [ ] 2.2 If Option 2: open a SEPARATE OpenSpec change (its own design/spec) for the per-user Durable Object `POST /sync` write path + server-side merge module (shared with the client merge rules) + back-compat bake with the presign path. Do NOT implement it under this plan change.

## 3. Spec + verify

- [x] 3.1 `cloud-sync` spec delta (2 ADDED mechanism-agnostic requirements: bounded retry amplification + cross-device convergence-without-loss) — `openspec validate eliminate-cross-device-r2-412-storm --strict` passes.
- [x] 3.2 Codex diff review (mirror the single-flight gate). Verdict: **SHIP AS-IS** — G1/G2/G3 confirmed in-code, no blocking issues, sync-light threshold→error still re-arms for recovery. 3 P3 test gaps noted (409 path now covered; real-jitter-timer + account-reset-call-site regression left as optional follow-ups).
- [ ] 3.3 `/verify` after the Phase-1 deploy (Chrome MCP smoke: a 412 defers-dirty instead of bursting; sync still converges). (Post-deploy; gated on the merge=deploy confirm.)
