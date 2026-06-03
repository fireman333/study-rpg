## Why

After `promote-maze-to-home`, the neurons leaderboard drifted from the live game in two ways. (1) The `variant_count` cap is stale across three layers — D1 `CHECK (variant_count BETWEEN 0 AND 55)`, Worker `VARIANT_COUNT_MAX = 77`, while the catalog is now 110 (`NEURON_VARIANT_TOTAL`). Any player past 55 variants is silently or noisily dropped from **all** leaderboard tabs (latent data-loss P1, will bite the dogfood owner first). (2) The board has no axis reflecting the maze's central new progression — per-branch settles (each settle = one variant pull, and the maze is now the only pull path); the existing「AP 排名」tab ranks by a now-vestigial flat-+1-per-correct score that no longer gates anything.

## What Changes

- **FIX (P1 data loss)**: raise the `variant_count` cap to the current catalog total (110) at both enforcement layers. Worker `VARIANT_COUNT_MAX` 77 → 110; a **new D1 migration 0006** recreates `leaderboard_neurons` (SQLite cannot `ALTER` a `CHECK`) with `CHECK (variant_count BETWEEN 0 AND 110)`.
- **ADD「探索進度」(settles) leaderboard axis**: a 6th filter tab ranking by `total_settles` = sum of the four per-branch `meta['maze:<branch>:settles']` counters (already in `SYNCED_META_KEYS`, so cross-device-correct). New D1 column `total_settles INTEGER NOT NULL DEFAULT 0` + partial index, Worker filter + sanity bound + UPSERT/snapshot wiring, client payload field + computation, UI tab + grid column.
- **No change to `total_AP`** — the AP tab stays exactly as-is (still maps to a visible per-family number on the FamilyPicker card).
- **No Dexie bump, no R2 `SCHEMA_VERSION` bump, no new `SYNCED_META_KEYS`** — settles are existing synced meta; the Worker is bundle-opaque.

## Capabilities

### New Capabilities

(none — extends an existing capability)

### Modified Capabilities

- `neurons-leaderboard`: filter-tab count 5 → 6 (add settles); `variant_count` sanity bound 77 → 110; Worker upsert + cron + KV snapshots gain the settles filter and `total_settles` field; client push payload gains `total_settles`; grid renders a settles cell; a new D1 migration is now required (the prior「no new D1 migration」guarantee is superseded). `family_complete` stays vestigial; the 二階 `hospital-leaderboard` data plane stays untouched.

## Impact

- **Worker**: `cloudflare/sync-worker/src/neurons-leaderboard.ts` (FILTERS / ORDER_BY / SNAPSHOT_COLUMNS / sanity bounds / UPSERT columns / handleGetMe SELECT / `VARIANT_COUNT_MAX`).
- **D1**: new `cloudflare/sync-worker/migrations/0006_neurons_variant_cap_and_settles.sql` (table-recreate per the 0004 canonical pattern). **Owner-pending**: `wrangler d1 migrations apply study-rpg-leaderboard --remote` + Worker redeploy.
- **Client**: `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` (filter union + payload field + `total_settles` computation), `apps/neurons-tw/src/routes/LeaderboardPage.tsx` (tab + column), optional `components/LeaderboardOptInModal.tsx` + `components/HelpMenu.tsx` copy. **Owner-pending**: client deploy (`pnpm deploy:cf`).
- **Tests**: new client unit test for `total_settles` in the payload; Worker bound checks.
- **Out of scope / untouched**: `packages/core/src/lib/srs.ts`, `QuizModal.tsx`, `lib/db.ts`, `lib/sync/tables.ts`, maze economy files, the `total_AP` semantics, 二階 `leaderboard_m2`.
