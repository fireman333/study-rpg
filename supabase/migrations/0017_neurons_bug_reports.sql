-- =====================================================================
-- 0017_neurons_bug_reports.sql
-- add-neurons-bug-report change — extend the shared bug_reports table so
-- apps/neurons-tw can submit in-app reports.
--
-- Additive only — no data migration. Two CHECK constraints are recreated
-- atomically (DROP + ADD in one transaction) so an INSERT with a new value
-- never hits the old constraint mid-apply:
--   1. `app` CHECK gains 'neurons-tw' (medexam values retained).
--   2. `category` CHECK gains the four neurons-unique categories
--      (maze-exploration / variant-collection / synapse / dmn-fate-cards),
--      unioned with the existing 14 medexam + inline-flow categories.
--
-- Canonical source for the neurons category set:
--   packages/core/src/lib/bug-report-types.ts → NEURONS_BUG_REPORT_CATEGORIES.
-- Every value there MUST appear in the `category` CHECK below (guarded by a
-- unit test). The inline QuizModal 🐞 flow reuses question-error / image-broken
-- / explanation-error / other (already added by migration 0007).
--
-- RLS, indexes, the question_id column (0007), and the sync_metadata column
-- (0010) are UNCHANGED.
--
-- Apply via Supabase dashboard SQL Editor (or `supabase db push`). NOT
-- auto-applied. Existing medexam rows and values stay valid.
-- =====================================================================

BEGIN;

-- 1. Recreate the `app` CHECK with neurons-tw added (medexam values retained).
ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_app_check;

ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_app_check CHECK (app IN (
    'medexam-tw',
    'medexam2-hospital-tw',
    'neurons-tw'
  ));

-- 2. Recreate the `category` CHECK as the union of the existing 14 values
--    (11 base + 3 inline from 0007) and the 4 neurons-unique categories.
ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_category_check;

ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_category_check CHECK (category IN (
    -- base (0004)
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
    'other',
    -- inline flow (0007)
    'question-error',
    'image-broken',
    'explanation-error',
    -- neurons-unique (0017)
    'maze-exploration',
    'variant-collection',
    'synapse',
    'dmn-fate-cards'
  ));

COMMIT;
