-- =====================================================================
-- account_metadata_rls.sql — manual RLS sanity check for
-- 0011_account_reset_marker
--
-- Run these in the Supabase dashboard SQL editor AFTER applying
-- 0011_account_reset_marker.sql. Not auto-run by any pipeline; they
-- document the expected RLS behaviour.
-- =====================================================================

-- ─── 1. Unauthenticated SELECT returns zero rows ──────────────────────
SET ROLE anon;
SELECT count(*) FROM public.account_metadata;
-- Expected: 0 (RLS filters everything, no rows visible)
RESET ROLE;

-- ─── 2. Authenticated own-row CRUD succeeds ──────────────────────────
-- Equivalent client-side calls (run from a real signed-in client, not
-- the dashboard service_role context, to actually exercise RLS):
--
--   await supabase.from('account_metadata').select('*')
--   await supabase.from('account_metadata').insert({ user_id: auth.uid() })
--   await supabase.from('account_metadata').update({ schema_version: '1' })
--                                          .eq('user_id', auth.uid())
--
-- Expected: own row is the only one returned; mutations succeed only
-- when WHERE user_id = auth.uid() matches.

-- ─── 3. Authenticated cross-user SELECT returns zero rows ────────────
-- A signed-in user trying to read another user's row should see 0.
-- Equivalent client-side check:
--
--   const otherUid = '<some other user uuid>'
--   const { data } = await supabase
--     .from('account_metadata')
--     .select('*')
--     .eq('user_id', otherUid)
--   // Expected: data === []

-- ─── 4. delete_my_data() bumps last_reset_at ─────────────────────────
-- After calling the RPC, the calling user's row should be present with
-- last_reset_at ≈ now().
--
--   await supabase.rpc('delete_my_data')
--   const { data } = await supabase.from('account_metadata').select('*')
--   // Expected: data[0].user_id === auth.uid(),
--   //           data[0].last_reset_at within seconds of now

-- ─── 5. Account cascade-delete drops metadata row ────────────────────
-- When auth.users row is removed (via delete_my_account), the
-- account_metadata row SHALL cascade-delete via ON DELETE CASCADE.
-- Verify by checking the row is gone after account deletion.
