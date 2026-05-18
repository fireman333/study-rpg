-- =====================================================================
-- 0005_question_bookmarks.sql
-- add-quiz-question-id-and-bookmark — 二階 quiz bookmark cloud table.
--
-- Local Dexie `bookmarks` store (HospitalDB v7) mirrors here when player
-- is authenticated. Composite PK (user_id, question_id). `added_at` is the
-- immutable display sort key (most-recent-first on /bookmarks); `updated_at`
-- is the LWW timestamp managed by the sync engine.
--
-- No `note` column by design — note-taking is an offline workflow via
-- Markdown export from /bookmarks (see design.md §2 / §5).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.question_bookmarks (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT        NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS question_bookmarks_user_added_idx
  ON public.question_bookmarks(user_id, added_at DESC);

ALTER TABLE public.question_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_select_own"
  ON public.question_bookmarks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "bookmarks_insert_own"
  ON public.question_bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_update_own"
  ON public.question_bookmarks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookmarks_delete_own"
  ON public.question_bookmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
