-- 0009_m2_shoutout.sql
-- Ninth D1 migration for cloudflare/sync-worker.
-- Activates the shoutout board ("留言" tab) for 二階 (app_id = 'm2').
--
-- Design references:
--   openspec/changes/activate-m2-shoutout-backend/proposal.md
--   openspec/changes/activate-m2-shoutout-backend/design.md   (Decision 1 / 2)
--   openspec/changes/activate-m2-shoutout-backend/specs/shoutout-board-backend/spec.md
--
-- ADDITIVE ONLY — creates one new table + one index. Does NOT touch
-- shoutouts_neurons, leaderboard_*, sync, presign, or the shared app-scoped
-- shoutout_audit / shoutout_reports / shoutout_bans tables (created in 0008 and
-- reused here via app_id = 'm2'). Reversible by `DROP TABLE shoutouts_m2`
-- (+ its index); the shared moderation tables stay intact (neurons depends on them).
--
-- ⚠️ OWNER STEP — NOT applied by the OpenSpec change. Apply to the SAME shared D1
-- as leaderboard (database `study-rpg-leaderboard`, database_id
-- 365a3809-4960-4373-8b0f-f864b2323c65). wrangler 4.x may reject a multi-statement
-- file ("contains several transactions"); apply via the Cloudflare dashboard D1
-- console (paste this file), or run the two statements as separate
-- `wrangler d1 execute --remote --command "…"` calls, then record the row in
-- d1_migrations manually. Apply this migration BEFORE deploying the Worker that
-- adds APP_CONFIG.m2 (else /shoutouts/m2 500s on first D1 hit).
--
-- Schema mirrors shoutouts_neurons exactly (only the table + index name differ) so
-- the shared shoutout code path (parseAvatar / UPSERT / board read) works unchanged.
-- The avatar_type CHECK is permissive (neuron|doctor) like shoutouts_neurons; the
-- Worker's parseAvatar gate enforces avatarType === 'doctor' for m2 at the app layer.

CREATE TABLE IF NOT EXISTS shoutouts_m2 (
  author_key         TEXT PRIMARY KEY,            -- Supabase sub (one row per user)
  avatar_type        TEXT NOT NULL,               -- structured avatar payload (design D2)
  asset_id           TEXT NOT NULL,               -- e.g. a doctor id; rendered client-side by lookup
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

-- latest-40 board read: created_at DESC over visible rows (design Decision 5 of 0008).
CREATE INDEX IF NOT EXISTS idx_shoutouts_m2_visible
  ON shoutouts_m2 (created_at DESC)
  WHERE deleted = 0 AND hidden = 0;
