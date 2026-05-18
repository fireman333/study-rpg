-- =====================================================================
-- 0008_targeted_tickets.sql
-- implement-targeted-fate-card-tickets — add 二階 collection tables for
-- epic / legendary fate-card-sourced targeted recruitment tickets and
-- their lifecycle history.
--
-- Schema mirrors existing 二階 collection-table pattern (per hospital_doctors
-- in 0001_init_cloud_sync.sql): `data JSONB` blob + `updated_at` timestamp
-- for LWW. RLS enforces `auth.uid() = user_id` across SELECT/INSERT/
-- UPDATE/DELETE. Both tables are net-new — no row backfill required.
--
-- Companion migration 0009_upsert_lww_targeted.sql extends the upsert_lww
-- RPC whitelist + dispatch to accept these two table names. As per the
-- "never edit existing migrations in place" convention (see 0006).
-- =====================================================================

-- ─── targeted_tickets (per-ticket lifecycle state) ──────────────────

CREATE TABLE IF NOT EXISTS public.targeted_tickets (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,                  -- ticket UUID (Dexie key)
  data        JSONB NOT NULL,                 -- subjectId / minRarity / status / *At timestamps / resultDoctorId / sourceFateCardTier
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_targeted_tickets_user_updated
  ON public.targeted_tickets (user_id, updated_at);

-- ─── targeted_ticket_history (append-only per-ticket events) ────────
-- Composite PK by (user_id, ticket_id, event). Each ticket fires at most
-- one of each event type (obtained / assigned / consumed) per its lifecycle.

CREATE TABLE IF NOT EXISTS public.targeted_ticket_history (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id   TEXT NOT NULL,
  event       TEXT NOT NULL,                  -- 'obtained' | 'assigned' | 'consumed'
  data        JSONB NOT NULL,                 -- at / subjectId? / doctorId? / rarity? / sourceFateCardTier?
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, ticket_id, event)
);

CREATE INDEX IF NOT EXISTS idx_targeted_ticket_history_user_updated
  ON public.targeted_ticket_history (user_id, updated_at);

-- ─── Row Level Security ─────────────────────────────────────────────

ALTER TABLE public.targeted_tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targeted_ticket_history ENABLE ROW LEVEL SECURITY;

-- targeted_tickets policies
CREATE POLICY targeted_tickets_select ON public.targeted_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY targeted_tickets_insert ON public.targeted_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY targeted_tickets_update ON public.targeted_tickets
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY targeted_tickets_delete ON public.targeted_tickets
  FOR DELETE USING (auth.uid() = user_id);

-- targeted_ticket_history policies
CREATE POLICY targeted_ticket_history_select ON public.targeted_ticket_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY targeted_ticket_history_insert ON public.targeted_ticket_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY targeted_ticket_history_update ON public.targeted_ticket_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY targeted_ticket_history_delete ON public.targeted_ticket_history
  FOR DELETE USING (auth.uid() = user_id);
