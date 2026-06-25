# Tasks — Eliminate the cross-device R2 412 storm (server-side plan)

## 0. Diagnostic — confirm the split (owner-approved)

- [ ] 0.1 Instrument `cloudflare/sync-worker/src/presign.ts` with ONE `console.log(JSON.stringify({op,bundle,u:userSub.slice(0,8)}))` after `bundleKey(...)`. **Owner-approved prod Worker deploy** (`wrangler deploy`), then `wrangler tail` ~90s during a live storm, capture, **revert the log + redeploy**.
- [ ] 0.2 Aggregate the capture: PUT presigns by `bundle` (neurons vs m2 vs bookmarks) + count distinct `u` per bundle + top-N users by PUT-presign count. Record: which app dominates + whether a few heavy multi-device clients carry most volume.
- [ ] 0.3 Write the result into design.md Open Question #2 and pick the architecture (gates §2/§3).

## 1. Phase 1 — client mitigation (low-risk, both apps)

- [ ] 1.1 `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts`: `MAX_PUSH_RETRIES` 3 → 1; on the retry's 412 (or first 412), do NOT throw — return a "deferred, still dirty" outcome so `engine.ts` keeps `pending` set for the next cycle.
- [ ] 1.2 `engine-r2.ts`: add jitter to `BACKOFF_MS` sleeps (e.g. ±30%).
- [ ] 1.3 `apps/neurons-tw/src/lib/sync/engine.ts` / `useSync.ts`: raise `DEBOUNCE_MS` 3s → ~10–15s + add ±jitter to `schedulePush`'s timer so concurrent devices de-sync. Keep `beforeunload`/visibility flush.
- [ ] 1.4 Unit tests: a 412 yields ≤1 retry then defers-dirty (not throw, not 3× burst); jitter applied; dirty state retained across a deferred cycle. `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` green.
- [ ] 1.5 **Coordinate the same tuning into 二階** (`study-rpg-2nd` repo — separate; via session-bus / handoff). The Worker is shared, so neurons-only tuning leaves 二階's share of the storm.
- [ ] 1.6 Deploy neurons; re-measure the 412 fraction + absolute PUT volume at a **matched high-traffic window** (not a quiet one) after taper, vs the 84–90% baseline. Record the residual.

## 2. Phase 2 — server-side merge DO (decision-gated; only if §0/§1 residual is material)

- [ ] 2.1 **GATE:** owner picks the architecture (Option 1-only vs Option 2 server-merge vs Option 3) from design.md, informed by §0.2 + §1.6. If Option 1 suffices, STOP here and archive.
- [ ] 2.2 If Option 2: open a SEPARATE OpenSpec change (its own design/spec) for the per-user Durable Object `POST /sync` write path + server-side merge module (shared with the client merge rules) + back-compat bake with the presign path. Do NOT implement it under this plan change.

## 3. Spec + verify

- [ ] 3.1 `cloud-sync` spec delta (2 ADDED mechanism-agnostic requirements: bounded retry amplification + cross-device convergence-without-loss) — `openspec validate eliminate-cross-device-r2-412-storm --strict` passes.
- [ ] 3.2 Codex review of the Phase-1 diff before archive (mirror the single-flight gate).
- [ ] 3.3 `/verify` after the Phase-1 deploy (Chrome MCP smoke: a 412 defers-dirty instead of bursting; sync still converges).
