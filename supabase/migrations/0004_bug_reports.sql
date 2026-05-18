-- =====================================================================
-- 0004_bug_reports.sql
-- M4.5 milestone — in-app bug report submission
--
-- Single table backing the BugReportModal in both apps (一階 medexam-tw
-- and 二階 medexam2-hospital-tw). Rows are immutable once submitted; only
-- INSERT and SELECT policies. Owner reads everyone's reports via
-- service_role (which bypasses RLS).
--
-- Apply via Supabase dashboard SQL Editor (or `supabase db push` if using
-- the CLI). One-time manual step — see docs/BUG_REPORTING.md § Schema
-- migration.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source app (literal, not user-controllable from client UI).
  app                    TEXT NOT NULL CHECK (app IN ('medexam-tw', 'medexam2-hospital-tw')),

  -- Closed enums — kebab-case canonical; UI displays emoji + Chinese label.
  category               TEXT NOT NULL CHECK (category IN (
                           'app-stability',
                           'hospital-management',
                           'doctors',
                           'study-session',
                           'events-fate-cards',
                           'numbers-wrong',
                           'visual-glitch',
                           'cloud-sync',
                           'corpus',
                           'feature-request',
                           'other'
                         )),
  severity               TEXT NOT NULL CHECK (severity IN (
                           'blocker',
                           'annoying',
                           'minor',
                           'suggestion'
                         )),

  -- User-filled (textareas + optional radios + optional contact).
  what_doing             TEXT NOT NULL,
  what_happened          TEXT NOT NULL,
  what_expected          TEXT,
  reproducibility        TEXT CHECK (reproducibility IN ('always', 'sometimes', 'once', 'unsure')),
  contact_info           TEXT,
  allow_followup         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Auto-attached (nullable; each is opted-out per submit via client checkbox).
  app_version            TEXT,
  commit_sha             TEXT,
  route                  TEXT,
  game_state             JSONB,
  user_agent             TEXT,
  viewport               TEXT,
  recent_console_errors  JSONB,

  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for owner triage queries.
CREATE INDEX IF NOT EXISTS bug_reports_user_id_idx
  ON public.bug_reports (user_id);
CREATE INDEX IF NOT EXISTS bug_reports_submitted_at_desc_idx
  ON public.bug_reports (submitted_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_severity_idx
  ON public.bug_reports (severity);

-- ─── RLS: only the row's user_id can INSERT/SELECT it ──────────────────
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users may INSERT their own reports only.
CREATE POLICY bug_reports_insert_own ON public.bug_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users may SELECT only their own reports. Owner uses service_role to read all.
CREATE POLICY bug_reports_select_own ON public.bug_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE / DELETE policies — reports are immutable. service_role bypasses RLS.
