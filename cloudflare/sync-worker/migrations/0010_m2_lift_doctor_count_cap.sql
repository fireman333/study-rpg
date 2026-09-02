-- 0010_m2_lift_doctor_count_cap.sql
-- Removes the leaderboard_m2 doctor_count ceiling:
--   CHECK (doctor_count BETWEEN 0 AND 50)   ->   CHECK (doctor_count >= 0)
--
-- WHY: the Worker's own DOCTOR_COUNT_MAX = 50 was deleted on 2026-07-11
-- (3d4734a3) with NO accompanying migration, so this CHECK stayed live. Every
-- upsert from a save holding > 50 doctors now passes the Worker, violates the
-- CHECK, and returns 500 upsert_failed -> the client throws -> markPushed()
-- never runs -> the row is frozen. Nine rows have been stuck since 2026-05-25
-- ~ 06-26. The July fix unfroze nobody; it only changed the failure mode from
-- a silent 200-dropped to a 500.
--
-- The bound is REMOVED, not raised. leaderboard_neurons had this same defect
-- and was migrated to a bigger ceiling TWICE (0006: 55 -> 110, 0007: 110 ->
-- 220), each time after players had already crossed the previous one. The
-- roster grows without an in-game cap via recruitment gacha, so any finite
-- number here is a future freeze with a date attached. `>= 0` keeps the floor
-- (matching reputation / total_study_min / total_correct) and drops the
-- ceiling that models a game rule which does not exist.
--
-- SQLite has no ALTER TABLE DROP CONSTRAINT, so this uses the canonical
--   CREATE _new -> INSERT SELECT -> DROP -> RENAME -> recreate indexes
-- pattern (same as 0004 for this table, 0006 for leaderboard_neurons).
--
-- The column list and the index list below were read from PRODUCTION
-- sqlite_master on 2026-08-02, not copied from 0004. This matters: 0004
-- predates 0005, which added `total_correct` by ALTER TABLE. A rebuild
-- authored from 0004 would silently drop that column and every player's
-- answer count with it. (Copying a constraint forward without re-deriving it
-- is exactly how the stale CHECK survived into 0004 in the first place.)
--
-- Verified present on production at authoring time: 1 table, 5 named indexes,
-- 2 sqlite_autoindex_* entries (TEXT PRIMARY KEY + UNIQUE nickname_lower,
-- sql = NULL — SQLite regenerates these automatically after the RENAME; do
-- NOT hand-recreate them). No triggers, no views. 27 rows.
--
-- ============================================================================
-- ⚠️  TWO CORRECTIONS TO WHAT 0004 / 0006 TELL YOU. Both of their headers are
--     wrong on this database; do not follow them.
--
-- (1) "D1 wraps each migration in an implicit transaction, so a failure rolls
--     back" — that is a property of `wrangler d1 migrations apply`, which is
--     PROHIBITED here (see below). Applied any other way, this file is NOT
--     atomic. Statements sent as separate `wrangler d1 execute --command`
--     calls are separate HTTP requests and cannot share a transaction:
--       - an upsert landing between INSERT SELECT and DROP is written to the
--         old table and then vanishes with it (real data loss, no error);
--       - a failure between DROP and RENAME leaves NO leaderboard_m2 at all:
--         every upsert and the hourly cron 500 until it is fixed.
--     So: send the WHOLE FILE in one shot (`wrangler d1 execute --remote
--     --file`, or paste the entire file into the dashboard D1 console). Only
--     if forced to split, keep INSERT SELECT / DROP / RENAME in ONE --command.
--
-- (2) "Restore from the nightly R2 backup (runBackupCron)" — runBackupCron
--     copies R2 users/* save bundles between buckets. It contains no
--     reference to D1 or to any leaderboard table. THERE IS NO D1 BACKUP.
--     The restore path for this migration is, captured 2026-08-02 before
--     authoring:
--       - full table dump: ~/.claude/scratch/leaderboard-m2-predump-2026-08-02.json (27 rows)
--       - Time Travel bookmark (verified available on this DB):
--         00001b69-00000000-000050bb-28791e0834b103a74ecddb24021c9541
--         restore via `wrangler d1 time-travel restore study-rpg-leaderboard --bookmark=<above>`
-- ============================================================================
--
-- HISTORICAL NOTE — the long-standing "never run `wrangler d1 migrations
-- apply` against this database" rule was retired on 2026-08-02, together with
-- this migration. Its cause was that d1_migrations stopped at 0007 while 0008
-- and 0009 had been applied out of band and never recorded, so `apply` would
-- have replayed them. All three (0008, 0009, 0010) are now recorded and the
-- history has no gaps: 10 files, 10 rows. `apply` finds nothing to replay.
-- Note that applied_at for 0008 / 0009 is the date they were RECORDED, not the
-- date they were applied; the real dates are in this repo's git history.
--
-- The lesson is not "0008/0009 were sloppy" — it is that an unrecorded
-- migration converts a routine command into a landmine, and the landmine is
-- disarmed by writing the row, not by warning people to step around it.
--
-- APPLIED to production 2026-08-02 (this file, as a single
-- `wrangler d1 execute --remote --file` — wrangler 4.92 accepted the whole
-- multi-statement file in one call and did NOT raise "contains several
-- transactions"). Verified afterwards: 27 rows before and after, all four
-- column sums identical to the pre-migration dump, the sqlite_master object
-- set unchanged (5 named indexes + 2 regenerated sqlite_autoindex_* + the
-- table), no orphan leaderboard_m2_new. A synthetic is_public=0 probe row
-- confirmed doctor_count 85 and 219 now write and -1 is still rejected by
-- `CHECK (doctor_count >= 0)`; the probe row was then deleted and the table
-- returned to its exact pre-migration totals.
--
-- MANDATORY CHECKS:
--   before DROP:  SELECT COUNT(*) FROM leaderboard_m2_new;  -- must equal 27
--   after RENAME: SELECT COUNT(*) FROM leaderboard_m2;      -- must equal 27
--   after RENAME: SELECT type, name FROM sqlite_master WHERE tbl_name='leaderboard_m2';
--                 -- must list 5 idx_* + 2 sqlite_autoindex_* + the table
--
-- No explicit BEGIN / COMMIT — D1 rejects raw transaction statements (7500).

-- Re-runnable: a previous failed attempt must not block the retry on a name
-- collision.
DROP TABLE IF EXISTS leaderboard_m2_new;

CREATE TABLE leaderboard_m2_new (
  user_id               TEXT PRIMARY KEY,
  nickname              TEXT NOT NULL,
  nickname_lower        TEXT NOT NULL UNIQUE,
  hospital_tier         INTEGER NOT NULL,
  reputation            INTEGER NOT NULL,
  doctor_count          INTEGER NOT NULL,
  total_study_min       INTEGER NOT NULL,
  is_public             INTEGER NOT NULL DEFAULT 1,
  updated_at            INTEGER NOT NULL,
  badges_csv            TEXT NOT NULL DEFAULT '',
  subject_mastery_count INTEGER NOT NULL DEFAULT 0,
  total_correct         INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  CHECK (hospital_tier BETWEEN 1 AND 4),
  CHECK (reputation >= 0),
  CHECK (doctor_count >= 0),
  CHECK (total_study_min >= 0),
  CHECK (is_public IN (0, 1))
);

INSERT INTO leaderboard_m2_new (
  user_id,
  nickname,
  nickname_lower,
  hospital_tier,
  reputation,
  doctor_count,
  total_study_min,
  is_public,
  updated_at,
  badges_csv,
  subject_mastery_count,
  total_correct
)
SELECT
  user_id,
  nickname,
  nickname_lower,
  hospital_tier,
  reputation,
  doctor_count,
  total_study_min,
  is_public,
  updated_at,
  badges_csv,
  subject_mastery_count,
  total_correct
FROM leaderboard_m2;

DROP TABLE leaderboard_m2;

ALTER TABLE leaderboard_m2_new RENAME TO leaderboard_m2;

-- Recreate the five named indexes exactly as read from production
-- sqlite_master on 2026-08-02. The two sqlite_autoindex_* entries are NOT
-- recreated here — SQLite regenerates them from the PRIMARY KEY and the
-- UNIQUE column constraint above.

CREATE INDEX idx_leaderboard_m2_composite
  ON leaderboard_m2 (hospital_tier DESC, reputation DESC, doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_reputation
  ON leaderboard_m2 (reputation DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_doctor_count
  ON leaderboard_m2 (doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_study_min
  ON leaderboard_m2 (total_study_min DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_total_correct
  ON leaderboard_m2 (total_correct DESC)
  WHERE is_public = 1;
