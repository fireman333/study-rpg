# Tasks — realign-neurons-leaderboard-to-maze

> Scope guard (parallel SRS session): do NOT touch `packages/core/src/lib/srs.ts`, `apps/neurons-tw/src/components/QuizModal.tsx`, `apps/neurons-tw/src/lib/db.ts`, `apps/neurons-tw/src/lib/sync/tables.ts`, or the maze economy files. No Dexie bump, no R2 `SCHEMA_VERSION` bump.

## 1. D1 migration (variant cap + total_settles)

- [x] 1.1 Create `cloudflare/sync-worker/migrations/0006_neurons_variant_cap_and_settles.sql` using the canonical table-recreate pattern from `0004_bump_tier_to_4.sql`: `CREATE leaderboard_neurons_new (...)` with `CHECK (variant_count BETWEEN 0 AND 110)`, a new `total_settles INTEGER NOT NULL DEFAULT 0 CHECK (total_settles >= 0)` column, the preserved vestigial `family_complete` column + its existing CHECK, and all other columns/CHECKs unchanged → `INSERT INTO ..._new SELECT ... FROM leaderboard_neurons` (settles defaults to 0, no source column) → `DROP TABLE leaderboard_neurons` → `ALTER TABLE ..._new RENAME TO leaderboard_neurons`.
- [x] 1.2 Recreate all 5 existing partial indexes (composite / variants / ap / synapse / study, all `WHERE is_public = 1`) + add `idx_leaderboard_neurons_settles ON leaderboard_neurons (total_settles DESC) WHERE is_public = 1`.
- [x] 1.3 Header comment: explain the SQLite-can't-ALTER-CHECK rationale, the 55→110 cap raise, the new column, the no-explicit-BEGIN/COMMIT D1 rule, and the mandatory pre/post `SELECT COUNT(*) FROM leaderboard_neurons` parity check (counts MUST match; restore from R2 nightly backup if they differ).
- [x] 1.4 Validated the 0006 SQL with `sqlite3` against a 0003-shaped table (`wrangler d1 migrations apply --local` can't be used — wrangler 4.92.0 rejects the recreate file, see §7.3): rows preserved 2→2, `variant_count=110` accepted, `111` rejected by the new `CHECK`, all 6 indexes created (incl. `idx_leaderboard_neurons_settles`). ⚠️ **wrangler ≥ 4.x cannot apply this file via `migrations apply` / `execute --file`** ("contains several transactions" on the DROP/CREATE-TABLE recreate) — apply path moved to §7.3.

## 2. Worker (`cloudflare/sync-worker/src/neurons-leaderboard.ts`)

- [x] 2.1 Bump `VARIANT_COUNT_MAX` 77 → 110 + update the stale「11 families × P0–P5 = 77」comment to reference the current `NEURON_VARIANT_TOTAL` (110, 11 × 10).
- [x] 2.2 Add `'settles'` to the `FILTERS` tuple/type, `ORDER_BY` (`settles: 'total_settles DESC'`), and `SNAPSHOT_COLUMNS` (append `, total_settles`).
- [x] 2.3 Add `total_settles` to `LeaderboardRowInternal` + `UpsertBody`; parse `const settles = Number(body.total_settles)` (undefined → 0); add sanity bound `!Number.isFinite(settles) || settles < 0 → drop with 200 {dropped:"total_settles_oob"}`.
- [x] 2.4 Extend the UPSERT `INSERT ... VALUES` + `ON CONFLICT DO UPDATE SET` to include `total_settles` (LWW via existing `updated_at` gate; no per-field ratchet needed — settles is monotonic client-side). Add `total_settles` to the `handleGetMe` SELECT + returned row.
- [x] 2.5 Update `runNeuronsLeaderboardCron` log line to include `snapshots: FILTERS.length` (now 6).

## 3. Client adapter (`apps/neurons-tw/src/lib/services/neurons-leaderboard.ts`)

- [x] 3.1 Add `'settles'` to `LeaderboardFilter` union + `LEADERBOARD_FILTERS` array.
- [x] 3.2 Add `total_settles: number` to `LeaderboardRow` + `NeuronsLeaderboardPayload`.
- [x] 3.3 In `buildLeaderboardPayload`, compute `total_settles` = sum of `meta['maze:da:settles']`, `meta['maze:5ht:settles']`, `meta['maze:gaba:settles']`, `meta['maze:glu:settles']`, each `Number(value) || 0`. Keys inlined with a comment cross-referencing `lib/maze/economy.ts` `settlesKey` (NOT imported). Included in the returned payload.

## 4. UI (`apps/neurons-tw/src/routes/LeaderboardPage.tsx`)

- [x] 4.1 `FILTER_LABELS`: add `settles: '探索進度'`. `FILTER_PRIMARY_STAT`: add `settles: 'total_settles'`.
- [x] 4.2 Grid: added a「探索」header cell + a `total_settles` data cell (integer, `statCellWithPrimary(primaryStat === 'total_settles')`) + `.neurons-lb-cell--settles` class. Updated `--neurons-lb-cols` (7th col) + ≤480px collapse re-show rule in styles.css.
- [x] 4.3 Copy: added 探索進度 to `components/LeaderboardOptInModal.tsx` public-field list + dropped the stale family_complete line; corrected the stale `components/HelpMenu.tsx` leaderboard filter list to the real 6 filters.

## 5. Tests

- [x] 5.1 Added `__tests__/leaderboard-settles.test.ts` (mirror `leaderboard-study-min.test.ts`): sum of 4 keys / 0 when absent / partial / `Number()||0` malformed / exact-lowercase-key guard. 5/5 pass.
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw exec vitest run src/__tests__/leaderboard-settles.test.ts` → 5/5 pass. neurons-tw typecheck: 0 errors in my files (the 3 errors + 5 test failures in the shared tree are the parallel SRS session's in-flight `SCHEMA_VERSION=14` / `db.ts` v15 work, not this change). Worker `pnpm typecheck` → PASS.

## 6. Verify

- [ ] 6.1 `/opsx:verify` (completeness / correctness / coherence) — expect 0 issues.
- [ ] 6.2 Worker smoke (local `wrangler dev` or unit): POST upsert with `variant_count: 110` → accepted; `variant_count: 111` → `dropped: variant_count_oob`; `total_settles: -1` → `dropped: total_settles_oob`; GET `/leaderboard/neurons/settles` returns a (possibly empty) snapshot shape. — code-reviewed; live smoke owner-pending (needs local D1/wrangler).
- [ ] 6.3 Chrome MCP smoke on neurons-tw dev: `/leaderboard` renders the 6th「探索進度」tab; switching to it sorts by settles; the 探索 column shows integers; console clean. — BLOCKED until the shared working tree is clean (parallel SRS session's incomplete `tables.ts`/`OverviewPage.tsx` edits currently break the neurons-tw dev build); run at deploy time.

## 7. Archive / deploy (owner-pending steps called out)

- [ ] 7.1 At archive/sync time, update the main `openspec/specs/neurons-leaderboard/spec.md` **Purpose** free-text: 「5 filter tabs」→「6 filter tabs」(+ settles), 「variant_count 0–77」→「0–110」(the delta only updates Requirements; Purpose is hand-edited on sync).
- [ ] 7.2 `/opsx:archive` (sync gate) → commit (explicit per-file `git add`; re-check `/inbox` for SRS-session overlap first) → push.
- [ ] 7.3 **Owner-pending (cannot self-run against prod). Order matters**: migration 0006 first → Worker → client (Worker writing `total_settles` before the column exists → 500).
  - **Step A — apply migration 0006.** ⚠️ `wrangler d1 migrations apply --remote` will FAIL under wrangler ≥ 4.x ("contains several transactions" on the recreate). Use ONE of:
    - **(recommended) Cloudflare dashboard** → D1 → `study-rpg-leaderboard` → Console → paste the full contents of `cloudflare/sync-worker/migrations/0006_neurons_variant_cap_and_settles.sql` → Run. (The dashboard console runs multi-statement SQL directly.)
    - **(CLI alt)** run each statement of 0006 individually: `wrangler d1 execute study-rpg-leaderboard --remote --command "<one statement>"`.
    - **Pre/post parity (MANDATORY)**: `wrangler d1 execute study-rpg-leaderboard --remote --command "SELECT COUNT(*) FROM leaderboard_neurons"` before AND after — counts MUST match (restore from nightly R2 backup if not).
    - **Record the migration** so future `migrations apply` won't re-attempt 0006: `wrangler d1 execute study-rpg-leaderboard --remote --command "INSERT INTO d1_migrations (name, applied_at) VALUES ('0006_neurons_variant_cap_and_settles.sql', CURRENT_TIMESTAMP)"`.
  - **Step B — redeploy Worker** (`deploy-worker.yml` or `cd cloudflare/sync-worker && wrangler deploy`).
  - **Step C — deploy client** (`pnpm deploy:cf`).
  - **Step D — re-run the §6.3 Chrome MCP smoke against prod** `med-study-rpg.com/neurons/leaderboard` once the tree is clean + deployed.
