-- =====================================================================
-- 0018_neurons_desktop_bug_category.sql
-- add-neurons-guided-pdf-onboarding — add the 'desktop-app' neurons category
-- so desktop (Tauri) issue reports are filed under their own bucket.
--
-- Additive only — no data migration. The `category` CHECK is recreated as
-- migration 0017's full union PLUS 'desktop-app' (DROP + ADD in one
-- transaction so an INSERT never hits the old constraint mid-apply).
--
-- The `app` CHECK, RLS, indexes, question_id (0007) and sync_metadata (0010)
-- columns are UNCHANGED. The 二階 (standalone repo) flow never submits
-- 'desktop-app', so it is unaffected.
--
-- Canonical source for the neurons category set:
--   packages/core/src/lib/bug-report-types.ts → NEURONS_BUG_REPORT_CATEGORIES
-- (every value there MUST appear below — guarded by bug-report-canonical.test.ts).
--
-- Apply via `supabase db push` (CLI-first) or the dashboard SQL Editor. NOT
-- auto-applied. Existing rows and every prior category value stay valid.
-- =====================================================================

BEGIN;

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
    'dmn-fate-cards',
    -- desktop (0018)
    'desktop-app'
  ));

COMMIT;
