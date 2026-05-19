-- =====================================================================
-- hospital_monotonic_counters_rls.sql — manual RLS sanity check for
-- 0012_hospital_monotonic_counters
--
-- Run these in the Supabase dashboard SQL editor AFTER applying
-- 0012_hospital_monotonic_counters.sql. Not auto-run by any pipeline;
-- they document the expected RLS behaviour.
-- =====================================================================

-- ─── 1. Unauthenticated SELECT returns zero rows ──────────────────────
SET ROLE anon;
SELECT count(*) FROM public.hospital_monotonic_counters;
-- Expected: 0 (RLS filters everything, no rows visible)
RESET ROLE;

-- ─── 2. Authenticated own-row CRUD succeeds ──────────────────────────
-- Client-side equivalents (run from a real signed-in client, not dashboard
-- service_role context, to actually exercise RLS):
--
--   await supabase.from('hospital_monotonic_counters').select('*')
--   await supabase.from('hospital_monotonic_counters').insert({
--     user_id: auth.uid(),
--     data: { totalStudyMinutes: 0, fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 } }
--   })
--
-- Expected: own row only.

-- ─── 3. upsert_lww accepts hospital_monotonic_counters ───────────────
-- Client-side equivalent (debug console):
--   const userId = auth.uid()
--   await supabase.rpc('upsert_lww', {
--     table_name: 'hospital_monotonic_counters',
--     rows: [{
--       user_id: userId,
--       data: { totalStudyMinutes: 7.74, fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 } },
--       updated_at: new Date().toISOString(),
--       app_version: 'sanity-check'
--     }]
--   })
-- Expected: RPC returns 1 (or 0 on idempotent LWW skip); cloud row updated.

-- ─── 4. delete_my_data wipes hospital_monotonic_counters ─────────────
-- After calling the RPC:
--   await supabase.rpc('delete_my_data')
--   const { data } = await supabase
--     .from('hospital_monotonic_counters')
--     .select('*')
--     .eq('user_id', auth.uid())
-- Expected: data === [] (row gone)
-- Also: account_metadata.last_reset_at for this user SHALL be present + recent.

-- ─── 5. Cross-user SELECT denied ─────────────────────────────────────
-- Signed in as user A, query for user B's row:
--   const otherUid = '<some other user uuid>'
--   const { data } = await supabase
--     .from('hospital_monotonic_counters')
--     .select('*')
--     .eq('user_id', otherUid)
-- Expected: data === [] (RLS hides cross-user rows).

-- ─── 6. Account cascade-delete drops monotonic counter row ───────────
-- When auth.users row is removed (via delete_my_account), the
-- hospital_monotonic_counters row SHALL cascade-delete via ON DELETE CASCADE.
