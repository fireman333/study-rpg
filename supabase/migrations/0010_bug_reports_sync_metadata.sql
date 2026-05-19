-- =====================================================================
-- 0010_bug_reports_sync_metadata.sql
-- fix-sync-sign-in-lifecycle M3 — observability bundle.
--
-- Adds a nullable JSONB column for the sync engine diagnostic snapshot
-- (gateState, lastPushAt, lastPullAt, queueDepth, recentErrors,
-- dbRowCounts, consecutiveErrors, currentUserId, lastSignedInUserId).
-- Populated by services/bug-report.ts in both apps when the user leaves
-- the "同步診斷快照" checkbox checked (default on).
--
-- Legacy rows stay NULL. RLS policy unchanged (auth.uid() = user_id
-- already covers reads). Apply via Supabase dashboard SQL Editor (or
-- `supabase db push`).
-- =====================================================================

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS sync_metadata JSONB NULL;
