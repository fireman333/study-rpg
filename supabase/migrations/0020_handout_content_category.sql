-- =====================================================================
-- 0020_handout_content_category.sql
-- add-medexam2-handout-keypoint-iteration §2.3 — extend the shared
-- bug_reports `category` CHECK so the medexam2 講義 reader can submit
-- per-考點 Debug reports under the coarse top-level category
-- 'handout-content' (the 8 fine subtypes ride in game_state->'handout_report').
--
-- Additive only — no data migration. The `category` CHECK is recreated
-- atomically (DROP + ADD in one transaction) so an INSERT with the new
-- value never hits the old constraint mid-apply. Every existing value is
-- retained (union of the 14 medexam + inline-flow + 6 neurons values that
-- were live as of migration 0019).
--
-- Canonical source for the medexam category set:
--   packages/core/src/lib/bug-report-types.ts → BUG_REPORT_CATEGORIES
--   (guarded by the shared-type contract; 'handout-content' added there in
--   @study-rpg/core 0.6.5).
--
-- RLS, indexes, the question_id column (0007), the sync_metadata column
-- (0010), and the `app` CHECK are UNCHANGED.
--
-- Apply via Supabase dashboard SQL Editor (or `supabase db query --linked`).
-- NOT auto-applied. Existing rows and values stay valid.
-- =====================================================================

BEGIN;

ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_category_check;

ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_category_check CHECK (category IN (
    -- medexam + inline-flow categories (live through 0019)
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
    'question-error',
    'image-broken',
    'explanation-error',
    'concept-tag-error',
    -- neurons-tw categories (0017 / 0018)
    'maze-exploration',
    'variant-collection',
    'synapse',
    'dmn-fate-cards',
    'desktop-app',
    -- NEW: medexam2 講義 考點 Debug report (this migration)
    'handout-content'
  ));

COMMIT;
