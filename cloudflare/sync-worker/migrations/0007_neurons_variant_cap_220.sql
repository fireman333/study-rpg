-- 0007_neurons_variant_cap_220.sql
-- Raises the leaderboard_neurons variant_count CHECK 110 → 220
-- (change: add-neurons-maze-second-lap-variants).
--
-- WHY: the variant catalog grew from 110 (11 families × 10 first-route slots) to
-- 220 (11 × (10 first-route + 10 二回目 location slots), NEURON_VARIANT_TOTAL).
-- A 二回目 player past 110 distinct variants would violate the old
--   CHECK (variant_count BETWEEN 0 AND 110)
-- → SQLite constraint error → Worker 500 upsert_failed → the player vanishes from
-- every neurons leaderboard tab. New bound:
--   CHECK (variant_count BETWEEN 0 AND 220)
-- The Worker-side bound (VARIANT_COUNT_MAX in src/neurons-leaderboard.ts) is raised
-- to 220 in lockstep and MUST be redeployed BEFORE any client can send count > 110.
--
-- SQLite has no ALTER TABLE DROP/MODIFY CONSTRAINT, so this uses the canonical
--   CREATE _new -> INSERT SELECT -> DROP -> RENAME -> recreate indexes
-- pattern (identical to 0006_neurons_variant_cap_and_settles.sql). All columns
-- (incl. total_settles + the vestigial family_complete) are preserved.
--
-- ⚠️ wrangler 4.x APPLY LIMITATION (see ~/.claude memory wrangler4-d1-multistatement-migration):
-- `wrangler d1 migrations apply` and `wrangler d1 execute --file` REJECT this file
-- with "contains several transactions" because of the CREATE/DROP/RENAME recreate.
-- APPLY THIS MIGRATION VIA THE CLOUDFLARE DASHBOARD D1 CONSOLE (paste the body),
-- then record it in d1_migrations manually:
--   wrangler d1 execute study-rpg-leaderboard --remote \
--     --command "INSERT INTO d1_migrations (name, applied_at) VALUES ('0007_neurons_variant_cap_220.sql', CURRENT_TIMESTAMP)"
--
-- Pre/post safety check (MANDATORY):
--   wrangler d1 execute study-rpg-leaderboard --remote \
--     --command "SELECT COUNT(*) FROM leaderboard_neurons"
-- Run before AND after; counts MUST match. The leaderboard_m2 table is NOT touched.

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
  CHECK (variant_count BETWEEN 0 AND 220),
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
  total_settles,
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
  total_settles,
  badges_csv,
  is_public,
  updated_at
FROM leaderboard_neurons;

DROP TABLE leaderboard_neurons;

ALTER TABLE leaderboard_neurons_new RENAME TO leaderboard_neurons;

-- Recreate the six partial indexes (five from 0003 + settles from 0006).

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

CREATE INDEX idx_leaderboard_neurons_settles
  ON leaderboard_neurons (total_settles DESC)
  WHERE is_public = 1;
