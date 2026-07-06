-- =====================================================================
-- 0019_neurons_concept_tag_category.sql
-- add-neurons-concept-tags §5.3 — add the 'concept-tag-error' category so a
-- player can report a wrong concept label via the existing inline 🐞 report
-- sheet (QuizModal / 題庫). The new QUIZ_BUG_TARGET '概念標籤錯誤' maps to this
-- category via QUIZ_BUG_TARGET_TO_CATEGORY.
--
-- Additive only — no data migration. The `category` CHECK is recreated as
-- migration 0018's full union PLUS 'concept-tag-error' (DROP + ADD in one
-- transaction so an INSERT never hits the old constraint mid-apply).
--
-- The `app` CHECK, RLS, indexes, question_id (0007) and sync_metadata (0010)
-- columns are UNCHANGED. Reuses the existing report sheet + pipeline — no new UI.
--
-- Canonical source for the inline-flow category set:
--   packages/core/src/lib/bug-report-types.ts → QUIZ_BUG_TARGET_TO_CATEGORY
-- (every mapped value MUST appear below — guarded by bug-report-canonical.test.ts).
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
    'desktop-app',
    -- concept tags (0019)
    'concept-tag-error'
  ));

COMMIT;
