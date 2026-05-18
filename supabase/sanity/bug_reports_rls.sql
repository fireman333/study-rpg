-- =====================================================================
-- bug_reports_rls.sql — manual RLS sanity check for 0004_bug_reports
--
-- Run these in the Supabase dashboard SQL editor AFTER applying
-- 0004_bug_reports.sql. They are not auto-run by any pipeline; they
-- document the expected RLS behaviour.
-- =====================================================================

-- ─── 1. Unauthenticated SELECT returns zero rows ──────────────────────
-- Run while logged out / as anon role.
SET ROLE anon;
SELECT count(*) FROM public.bug_reports;
-- Expected: 0 (RLS filters everything, no rows visible)
RESET ROLE;

-- ─── 2. Authenticated INSERT of own row succeeds ─────────────────────
-- Run in dashboard SQL editor while signed in as a real user (the editor
-- uses the service_role by default — to truly test policies, use the
-- "Run as User" toggle in the editor or call the REST endpoint from a
-- real authenticated client).
--
-- Equivalent client-side call:
--   await supabase.from('bug_reports').insert({
--     user_id: auth.uid(),
--     app: 'medexam-tw',
--     category: 'app-stability',
--     severity: 'minor',
--     what_doing: 'manual RLS test',
--     what_happened: 'verifying insert policy',
--   })
-- Expected: 1 row inserted, no policy violation error.

-- ─── 3. Cross-user INSERT is rejected ────────────────────────────────
-- Attempt to INSERT with user_id ≠ auth.uid().
--
-- Equivalent malicious client-side call:
--   await supabase.from('bug_reports').insert({
--     user_id: '<some-other-uuid>',
--     app: 'medexam-tw',
--     category: 'other',
--     severity: 'minor',
--     what_doing: 'attempting impersonation',
--     what_happened: 'should fail',
--   })
-- Expected: PostgrestError — "new row violates row-level security policy for table \"bug_reports\""

-- ─── 4. SELECT returns only own rows ─────────────────────────────────
-- After step 2 succeeds, signed in as user A:
SELECT id, user_id, category, severity, submitted_at
  FROM public.bug_reports
  ORDER BY submitted_at DESC
  LIMIT 5;
-- Expected: only rows where user_id = auth.uid(); no rows from user B.

-- ─── 5. Owner / service_role can see all rows ────────────────────────
-- Run as service_role (default role in the SQL editor — service_role
-- bypasses RLS):
SELECT app, category, severity, count(*)
  FROM public.bug_reports
  GROUP BY app, category, severity
  ORDER BY count DESC;
-- Expected: aggregated counts across all users.
