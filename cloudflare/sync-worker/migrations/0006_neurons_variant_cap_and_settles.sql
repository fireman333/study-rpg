-- 0006_neurons_variant_cap_and_settles.sql
-- Realigns leaderboard_neurons to the post-promote-maze-to-home world
-- (change: realign-neurons-leaderboard-to-maze).
--
-- TWO things, done in one table-recreate because both require touching the
-- table definition:
--
--   (1) RELAX the stale variant_count CHECK. Migration 0003 declared
--         CHECK (variant_count BETWEEN 0 AND 55)
--       back when the catalog was 55. The catalog has since grown to 110
--       (NEURON_VARIANT_TOTAL = 11 families × 10 slots, via
--       expand-neuron-variant-catalog). A player past 55 variants violates the
--       old CHECK → SQLite constraint error → Worker returns 500 upsert_failed
--       → the player vanishes from every leaderboard tab. New bound:
--         CHECK (variant_count BETWEEN 0 AND 110)
--
--   (2) ADD the total_settles column for the new「探索進度」(settles) ranking
--       axis. total_settles = cumulative maze settles across all four NT
--       branches (each settle = one variant pull; the maze is the only pull
--       path post-promote-maze-to-home). Client sums the four synced
--       meta['maze:<branch>:settles'] counters at push time.
--         total_settles INTEGER NOT NULL DEFAULT 0 CHECK (total_settles >= 0)
--
-- SQLite has no ALTER TABLE DROP/MODIFY CONSTRAINT, so we use the canonical
--   CREATE _new -> INSERT SELECT -> DROP -> RENAME -> recreate indexes
-- pattern (identical to 0004_bump_tier_to_4.sql for leaderboard_m2). The
-- vestigial family_complete column is PRESERVED — Worker handleGetMe still
-- SELECTs it (retired as a ranking signal, not yet dropped).
--
-- IMPORTANT: D1 rejects raw `BEGIN TRANSACTION` / `COMMIT` in migrations
-- (error 7500). Each migration file is wrapped in an atomic transaction by D1
-- automatically, so explicit BEGIN/COMMIT is both unnecessary and forbidden.
--
-- Apply via:
--   cd cloudflare/sync-worker
--   wrangler d1 migrations apply study-rpg-leaderboard --local   # smoke test
--   wrangler d1 migrations apply study-rpg-leaderboard --remote  # prod
--
-- Pre/post safety check (MANDATORY):
--   wrangler d1 execute study-rpg-leaderboard --remote \
--     --command "SELECT COUNT(*) FROM leaderboard_neurons"
-- Run before AND after; counts MUST match. The INSERT SELECT preserves every
-- row (total_settles takes the column default 0). If counts differ, restore
-- from the nightly R2 backup (runBackupCron) and investigate. The
-- leaderboard_m2 table is NOT touched by this migration.

CREATE TABLE leaderboard_neurons_new (
  user_id           TEXT PRIMARY KEY,
  nickname          TEXT NOT NULL,
  nickname_lower    TEXT NOT NULL UNIQUE,
  variant_count     INTEGER NOT NULL DEFAULT 0,
  family_complete   INTEGER NOT NULL DEFAULT 0,
  total_AP          INTEGER NOT NULL DEFAULT 0,
  synapse_strong    INTEGER NOT NULL DEFAULT 0,
  total_study_min   INTEGER NOT NULL DEFAULT 0,
  total_settles     INTEGER NOT NULL DEFAULT 0,
  badges_csv        TEXT NOT NULL DEFAULT '',
  is_public         INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL,
  CHECK (variant_count BETWEEN 0 AND 110),
  CHECK (family_complete BETWEEN 0 AND 11),
  CHECK (total_AP >= 0),
  CHECK (synapse_strong >= 0),
  CHECK (total_study_min >= 0),
  CHECK (total_settles >= 0),
  CHECK (length(badges_csv) <= 60),
  CHECK (is_public IN (0, 1))
);

INSERT INTO leaderboard_neurons_new (
  user_id,
  nickname,
  nickname_lower,
  variant_count,
  family_complete,
  total_AP,
  synapse_strong,
  total_study_min,
  badges_csv,
  is_public,
  updated_at
)
SELECT
  user_id,
  nickname,
  nickname_lower,
  variant_count,
  family_complete,
  total_AP,
  synapse_strong,
  total_study_min,
  badges_csv,
  is_public,
  updated_at
FROM leaderboard_neurons;

DROP TABLE leaderboard_neurons;

ALTER TABLE leaderboard_neurons_new RENAME TO leaderboard_neurons;

-- Recreate the five partial indexes from 0003_neurons_leaderboard.sql. The
-- nickname_lower uniqueness is enforced by the inline UNIQUE column constraint
-- above (SQLite manages the implicit sqlite_autoindex_* entry).

CREATE INDEX idx_leaderboard_neurons_composite
  ON leaderboard_neurons (variant_count DESC, family_complete DESC, total_study_min DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_neurons_variants
  ON leaderboard_neurons (variant_count DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_neurons_ap
  ON leaderboard_neurons (total_AP DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_neurons_synapse
  ON leaderboard_neurons (synapse_strong DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_neurons_study
  ON leaderboard_neurons (total_study_min DESC)
  WHERE is_public = 1;

-- New partial index for the「探索進度」(settles) ranking tab.
CREATE INDEX idx_leaderboard_neurons_settles
  ON leaderboard_neurons (total_settles DESC)
  WHERE is_public = 1;
