-- 0011_leaderboard_nickname_masks.sql
-- Owner-maintained list of leaderboard nicknames masked on every PUBLIC read.
--
-- Change: mask-moderated-leaderboard-nicknames (study-rpg-2nd, hospital-leaderboard).
--
-- WHY A LIST, READ ON THE WAY OUT: the upsert overwrites `nickname` /
-- `nickname_lower` on every push, so editing a player's row lasts only until
-- their next push. Masking on write instead would collide on the UNIQUE
-- `nickname_lower` (two masked players cannot both store the mask) and would be
-- seeded back into the player's local profile by `GET /leaderboard/me`, then
-- pushed back as their own name. So the stored nickname never changes; the
-- public payloads (KV snapshots built by the cron, the 留言 board) substitute a
-- fixed mask for any row an entry here applies to. See src/nickname-mask.ts.
--
-- An entry applies while the row's CURRENT `nickname_lower` equals the value
-- recorded here. Renaming lifts it; renaming back (any letter case) re-applies it.
-- The key is the player's identity, never the text: a different `user_id` with
-- the same name is not masked.
--
-- ⚠️ PERSONAL DATA. `nickname_lower` is a copy of the player's nickname. It is
-- copied inside D1 by `INSERT … SELECT … FROM leaderboard_m2` (the owner script,
-- scripts/mask-leaderboard-nickname.sh) so the text never passes through a
-- shell, a log or a file, and it is DELETED together with the player's
-- leaderboard row by `DELETE /leaderboard/me` (account deletion). `reason` is
-- free text for the owner and MUST NOT contain the masked nickname.
--
-- ADDITIVE ONLY — one new table, nothing else. Does not touch leaderboard_m2,
-- leaderboard_neurons, the shoutout tables, or any index. No rebuild, so the
-- "copy the live sqlite_master" rule does not trigger; still, read the live
-- sqlite_master first and confirm no table of this name exists.
--
-- APPLY (owner step — production database `study-rpg-leaderboard`):
--   cd cloudflare/sync-worker
--   wrangler d1 execute study-rpg-leaderboard --remote --file migrations/0011_leaderboard_nickname_masks.sql
--   then record the row by hand, as for 0008–0010:
--   wrangler d1 execute study-rpg-leaderboard --remote --command \
--     "INSERT INTO d1_migrations (name, applied_at) VALUES ('0011_leaderboard_nickname_masks.sql', CURRENT_TIMESTAMP)"
--
-- Deliberately NOT `wrangler d1 migrations apply`. The long-standing prohibition
-- was retired on 2026-08-02 (see 0010's header: 10 files, 10 recorded rows,
-- `apply` finds nothing to replay), so `apply` would be safe today. This change
-- keeps the conservative path anyway, one file sent in one call plus the
-- hand-written row, so the history stays exactly as legible as 0008–0010's.
--
-- ORDER: apply this BEFORE deploying the Worker that reads the table. A Worker
-- deployed first makes every snapshot query fail on the missing table; the cron
-- then writes nothing and the previous snapshot stays (stale, never unmasked),
-- and the 留言 board read returns 500 until the table exists.
--
-- ROLLBACK: roll the Worker back first, then (optionally)
--   DROP TABLE leaderboard_nickname_masks;
-- A table no Worker reads has no effect, so leaving it in place is also fine.

CREATE TABLE IF NOT EXISTS leaderboard_nickname_masks (
  app_id         TEXT NOT NULL,     -- 'm2' (neurons is not wired; the owner script refuses it)
  user_id        TEXT NOT NULL,     -- Supabase sub; the key, never the name
  nickname_lower TEXT NOT NULL,     -- the name masked, as stored when the entry was made (personal data)
  masked_at      INTEGER NOT NULL,  -- ms since epoch
  reason         TEXT,              -- owner note; never the nickname
  PRIMARY KEY (app_id, user_id)
);
