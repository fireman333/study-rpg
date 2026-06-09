## Context

The shoutout backend (`cloudflare/sync-worker/src/shoutout.ts`, migration 0008) is
hard-isolated from sync/leaderboard/presign and routes by `/shoutouts/:app`, keyed off
`APP_CONFIG`. Today `APP_CONFIG` has only `neurons`. Adding an app = one config entry +
one per-app message table; the audit/reports/bans tables are already shared and
`app_id`-scoped (created in 0008 for exactly this reuse).

Verified this session against `cloudflare/sync-worker/src/leaderboard.ts`:
- `FILTERS = ["composite", "reputation", "doctor", "study", "correct"]` → `composite`
  is a real m2 filter; `snapshotKvKey(f) = leaderboard:m2:top100:${f}` → the key
  `leaderboard:m2:top100:composite` is cron-written, so the top-N halo will resolve.
- `leaderboard_m2` is a live table (UPSERT + nickname-uniqueness paths reference it).
- The shoutout avatar `CHECK (avatar_type IN ('neuron','doctor'))` already admits `doctor`.

## Goals / Non-Goals

**Goals:**
- `/shoutouts/m2` becomes a fully functional board (post / list / edit / delete / report
  / admin), sharing the neurons backend code path with zero neurons-side change.
- Keep the change additive and owner-gated for the outward steps (D1 write, deploy).

**Non-Goals:**
- No `wrangler deploy`, no `wrangler d1 execute` (remote D1 write) in this change.
- No 二階 UI (that's a `study-rpg-2nd` change) and no edge-router change (unaffected).
- No change to neurons, leaderboard, sync, or presign behavior.

## Decisions

### D1 — `shoutouts_m2` mirrors `shoutouts_neurons` exactly
Same columns, same CHECKs, only the table name and index name differ
(`idx_shoutouts_m2_visible`). Rationale: identical schema keeps the shared code path
(`parseAvatar`, UPSERT, board read) working unchanged; the app-layer `parseAvatar` gate
already enforces `avatarType === cfg.avatarType` (= `doctor`), so the permissive
`CHECK (… IN ('neuron','doctor'))` is harmless and avoids schema divergence.

### D2 — Reuse the shared app-scoped moderation tables
`shoutout_audit` / `shoutout_reports` / `shoutout_bans` (created in 0008) carry an
`app_id` column and are already keyed `(app_id, …)`. 0009 does NOT recreate them; m2
rows simply use `app_id = 'm2'`. This is the design's intended reuse.

### D3 — `APP_CONFIG.m2` values are verified, not guessed
`{ table:'shoutouts_m2', leaderboardTable:'leaderboard_m2',
compositeKvKey:'leaderboard:m2:top100:composite', avatarType:'doctor' }` — each value
checked against leaderboard.ts (see Context). A wrong `compositeKvKey` would silently
disable the halo (no crash), so this was verified rather than copied on faith.

### D4 — Fix the stale source comment
`shoutout.ts:28-31` says m2 "adds its own entry there [study-rpg-2nd]" — false; the
shoutout Worker is single-source here. Replace with a comment stating m2 is activated
in this monorepo (the standalone repo only hosts the edge-router + UI).

### D5 — Code-only; document the owner-gated outward steps, don't run them
The migration apply (remote D1 write) and `wrangler deploy` are outward, owner-driven.
Migration apply path: prefer the **dashboard D1 console** (paste the file) per the 0008
precedent (wrangler 4.x's multi-statement guard), or run the two statements as separate
`--command` calls; then record the row in `d1_migrations` manually. The migration header
documents this.

## Risks / Trade-offs

- [Touching the shared Worker could break 二階 / neurons] → change is strictly additive
  (new table + new `APP_CONFIG` key); the route guard already 404s unknown apps, so no
  existing path changes. Owner post-deploy smoke: neurons `/shoutouts/neurons` GET,
  a leaderboard filter, a cloud-sync round-trip, a presign — all unchanged.
- [`shoutouts_m2` absent when the Worker ships with `APP_CONFIG.m2`] → `/shoutouts/m2`
  would 500 on first D1 hit. Mitigation: apply migration 0009 BEFORE (or together with)
  the deploy; the owner-handoff note orders it migration-first.

## Migration Plan

Additive, reversible. Rollback of the code = revert this change (drop `APP_CONFIG.m2`
+ comment + 0009 file). Rollback of the DB = `DROP TABLE shoutouts_m2` (+ its index);
the shared audit/reports/bans are left intact (other apps depend on them). Deploy/apply
are the owner's outward steps, not part of this change's archive.

## Open Questions

- None blocking. (The 二階 UI's exact doctor-sprite `assetId` scheme is decided in the
  `study-rpg-2nd` UI change; the backend only stores the opaque `assetId` string.)
