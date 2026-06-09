-- 0008_neurons_shoutout.sql
-- Eighth D1 migration for cloudflare/sync-worker.
-- Adds the shoutout board ("留言" tab) shared backend storage.
--
-- Design references:
--   openspec/changes/add-neurons-shoutout-board/proposal.md
--   openspec/changes/add-neurons-shoutout-board/design.md   (Decision 3 / 4)
--   openspec/changes/add-neurons-shoutout-board/specs/shoutout-board-backend/spec.md
--
-- ADDITIVE ONLY — creates new tables/indexes; does NOT touch leaderboard_*,
-- sync, or any existing table. Reversible by dropping the four tables below.
--
-- ⚠️ APPLY VIA DASHBOARD D1 CONSOLE (owner step, task 5.4): wrangler 4.x rejects
-- multi-statement SQL files ("contains several transactions"). Paste this file
-- into the Cloudflare dashboard D1 console, or run each statement with
-- `wrangler d1 execute --command`, then record in d1_migrations manually.
-- Database: same D1 as leaderboard (database_id 365a3809-4960-4373-8b0f-f864b2323c65).
--
-- Per-app message table (shoutouts_neurons); audit / reports / bans are shared
-- and app-scoped via an app_id column so 二階 (app_id='m2', in its standalone repo)
-- reuses the same Worker endpoints. PK author_key = Supabase sub → one (active)
-- message per user per app (= the (app_id, user_id) uniqueness from design D3,
-- achieved here by per-app table + author_key PK).
--
-- Identity (nickname) + top-N halo are NOT stored here — joined at read time from
-- leaderboard_neurons + the composite Top-100 KV snapshot (design Decision 1 / 5),
-- so a client can never supply a forged display name.

CREATE TABLE IF NOT EXISTS shoutouts_neurons (
  author_key         TEXT PRIMARY KEY,            -- Supabase sub (one row per user)
  avatar_type        TEXT NOT NULL,               -- structured avatar payload (design D2)
  asset_id           TEXT NOT NULL,               -- e.g. a family id; rendered client-side by lookup
  cosmetic_id        TEXT,                        -- optional, reserved
  message            TEXT NOT NULL,               -- original text (≤ 40 graphemes, ≤ 2 lines)
  message_normalized TEXT NOT NULL,               -- NFKC + stripped, used for blocklist + audit
  content_hash       TEXT NOT NULL,               -- hash(avatar + normalized) for no-op edits
  created_at         INTEGER NOT NULL,            -- first-post time; preserved across edits (sort key)
  updated_at         INTEGER NOT NULL,            -- last accepted write
  last_write_at      INTEGER NOT NULL,            -- cooldown gate
  writes_day         TEXT NOT NULL DEFAULT '',    -- UTC YYYY-MM-DD for daily-cap reset
  writes_today       INTEGER NOT NULL DEFAULT 0,  -- per-day write counter (rate-limit)
  deleted            INTEGER NOT NULL DEFAULT 0,
  hidden             INTEGER NOT NULL DEFAULT 0,
  CHECK (avatar_type IN ('neuron', 'doctor')),
  CHECK (length(asset_id) BETWEEN 1 AND 64),
  CHECK (deleted IN (0, 1)),
  CHECK (hidden IN (0, 1))
);

-- latest-40 board read: created_at DESC over visible rows (design Decision 5).
CREATE INDEX IF NOT EXISTS idx_shoutouts_neurons_visible
  ON shoutouts_neurons (created_at DESC)
  WHERE deleted = 0 AND hidden = 0;

-- Append-only moderation audit log (design Decision 4 / spec "Soft-delete and audit log").
CREATE TABLE IF NOT EXISTS shoutout_audit (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id             TEXT NOT NULL,
  author_key         TEXT NOT NULL,
  action             TEXT NOT NULL,               -- create|edit|delete|hide|admin_delete|unhide|ban
  message_original   TEXT,
  message_normalized TEXT,
  avatar_json        TEXT,
  reporter_key       TEXT,
  reason             TEXT,
  ts                 INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shoutout_audit_lookup
  ON shoutout_audit (app_id, author_key, ts DESC);

-- Distinct-reporter tracking; unique(reporter,target) blocks single-user inflation.
CREATE TABLE IF NOT EXISTS shoutout_reports (
  app_id             TEXT NOT NULL,
  target_author_key  TEXT NOT NULL,
  reporter_key       TEXT NOT NULL,
  ts                 INTEGER NOT NULL,
  PRIMARY KEY (app_id, target_author_key, reporter_key)
);

-- Owner ban/mute list (back-office).
CREATE TABLE IF NOT EXISTS shoutout_bans (
  app_id             TEXT NOT NULL,
  author_key         TEXT NOT NULL,
  until_ts           INTEGER,                     -- NULL = permanent
  reason             TEXT,
  ts                 INTEGER NOT NULL,
  PRIMARY KEY (app_id, author_key)
);
