-- =====================================================================
-- 0007_bug_reports_question_id.sql
-- add-quiz-inline-bug-report change — inline 🐞 entry from QuizModal.
--
-- Adds:
--   1. `question_id text NULL` column on public.bug_reports — so the owner
--      can aggregate "which questions have ≥N reports" via standard SQL.
--      Legacy rows stay NULL; only inline-flow submissions populate it.
--   2. Partial B-tree index `bug_reports_question_id_idx` for fast
--      GROUP BY queries (only indexes non-NULL rows to save space).
--   3. Three new category enum values: question-error, image-broken,
--      explanation-error — mapped from the 4 inline target radio choices
--      (簡答 → 'other', existing).
--
-- The category check constraint is recreated atomically (DROP + ADD in
-- the same transaction) so an INSERT with one of the new values never
-- hits the old constraint.
--
-- Apply via Supabase dashboard SQL Editor (or `supabase db push`).
-- =====================================================================

BEGIN;

-- 1. Add question_id column (NULL allowed; legacy rows untouched).
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS question_id TEXT NULL;

-- 2. Partial index — only indexes inline-flow rows.
CREATE INDEX IF NOT EXISTS bug_reports_question_id_idx
  ON public.bug_reports (question_id)
  WHERE question_id IS NOT NULL;

-- 3. Recreate category check constraint with 14 values (11 existing + 3 new).
ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_category_check;

ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_category_check CHECK (category IN (
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
    'explanation-error'
  ));

COMMIT;
