-- =====================================================================
-- 0001_init_cloud_sync.sql
-- M4 milestone — cloud-sync mirror schema for study-rpg
--
-- Mirrors Dexie tables 1:1 (per design.md D1).
-- Every row carries user_id + updated_at + app_version.
-- RLS enforces auth.uid() = user_id on every CRUD path.
-- 4 一階 tables + 4 二階 tables = 8 sync tables total.
--
-- Apply via Supabase dashboard SQL Editor (or `supabase db push` if using CLI).
-- =====================================================================

-- ─── 一階 (medexam-tw) tables ────────────────────────────────────────

-- Singleton: full Player object (level / xp / stats / equipment / streak /
-- cosmetic / badges / unlocks / lootStats / todayProgress). 1 row per user.
CREATE TABLE IF NOT EXISTS public.player_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT
);

-- Per-question SRS cards (questionId, ease, interval, dueAt, etc.).
CREATE TABLE IF NOT EXISTS public.srs_cards (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, question_id)
);

-- Owned item instances (loot drops, equipped gear).
CREATE TABLE IF NOT EXISTS public.item_instances (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, id)
);

-- Singleton: mentor-daily backlog state (cross-day skipped/missed days).
CREATE TABLE IF NOT EXISTS public.mentor_backlog (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT
);

-- ─── 二階 (medexam2-hospital-tw) tables ─────────────────────────────

-- Singleton: hospital state collapsed (gachaStats + tickets + gameCounters +
-- rooms array + affinity per-subject). One JSON blob per user — these are all
-- tightly coupled "current hospital state" snapshots.
CREATE TABLE IF NOT EXISTS public.hospital_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT
);

-- Doctor roster (gacha-pulled doctors, assignedRoom, rarity, etc.).
CREATE TABLE IF NOT EXISTS public.hospital_doctors (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, id)
);

-- Per-subject mastery progress (correct / total, fractional via specialty bonus).
CREATE TABLE IF NOT EXISTS public.hospital_mastery (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id  TEXT NOT NULL,
  correct     REAL NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, subject_id)
);

-- Per-question history (SRS state, attempt counts, lastAnsweredAt).
CREATE TABLE IF NOT EXISTS public.hospital_question_history (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, question_id)
);

-- ─── Indexes for sync queries (filter by updated_at) ────────────────

CREATE INDEX IF NOT EXISTS idx_srs_cards_user_updated
  ON public.srs_cards (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_item_instances_user_updated
  ON public.item_instances (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_hospital_doctors_user_updated
  ON public.hospital_doctors (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_hospital_mastery_user_updated
  ON public.hospital_mastery (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_hospital_question_history_user_updated
  ON public.hospital_question_history (user_id, updated_at);

-- ─── Enable Row Level Security on all sync tables ───────────────────

ALTER TABLE public.player_state               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.srs_cards                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_instances             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_backlog             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_state             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_doctors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_mastery           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_question_history  ENABLE ROW LEVEL SECURITY;

-- ─── RLS policies: auth.uid() = user_id for SELECT/INSERT/UPDATE/DELETE ─

-- player_state
CREATE POLICY player_state_select ON public.player_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY player_state_insert ON public.player_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY player_state_update ON public.player_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY player_state_delete ON public.player_state
  FOR DELETE USING (auth.uid() = user_id);

-- srs_cards
CREATE POLICY srs_cards_select ON public.srs_cards
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY srs_cards_insert ON public.srs_cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY srs_cards_update ON public.srs_cards
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY srs_cards_delete ON public.srs_cards
  FOR DELETE USING (auth.uid() = user_id);

-- item_instances
CREATE POLICY item_instances_select ON public.item_instances
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY item_instances_insert ON public.item_instances
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY item_instances_update ON public.item_instances
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY item_instances_delete ON public.item_instances
  FOR DELETE USING (auth.uid() = user_id);

-- mentor_backlog
CREATE POLICY mentor_backlog_select ON public.mentor_backlog
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mentor_backlog_insert ON public.mentor_backlog
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY mentor_backlog_update ON public.mentor_backlog
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY mentor_backlog_delete ON public.mentor_backlog
  FOR DELETE USING (auth.uid() = user_id);

-- hospital_state
CREATE POLICY hospital_state_select ON public.hospital_state
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY hospital_state_insert ON public.hospital_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_state_update ON public.hospital_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_state_delete ON public.hospital_state
  FOR DELETE USING (auth.uid() = user_id);

-- hospital_doctors
CREATE POLICY hospital_doctors_select ON public.hospital_doctors
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY hospital_doctors_insert ON public.hospital_doctors
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_doctors_update ON public.hospital_doctors
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_doctors_delete ON public.hospital_doctors
  FOR DELETE USING (auth.uid() = user_id);

-- hospital_mastery
CREATE POLICY hospital_mastery_select ON public.hospital_mastery
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY hospital_mastery_insert ON public.hospital_mastery
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_mastery_update ON public.hospital_mastery
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_mastery_delete ON public.hospital_mastery
  FOR DELETE USING (auth.uid() = user_id);

-- hospital_question_history
CREATE POLICY hospital_question_history_select ON public.hospital_question_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY hospital_question_history_insert ON public.hospital_question_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_question_history_update ON public.hospital_question_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY hospital_question_history_delete ON public.hospital_question_history
  FOR DELETE USING (auth.uid() = user_id);
