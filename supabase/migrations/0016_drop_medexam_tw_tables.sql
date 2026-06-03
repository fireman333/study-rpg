-- =====================================================================
-- 0016_drop_medexam_tw_tables.sql
-- Change: remove-medexam-tw-and-promote-neurons (2026-06-03)
--
-- 一階 (medexam-tw) is removed from the monorepo and has no remaining sync
-- surface. This migration drops its 4 Supabase tables and patches the two
-- account-lifecycle RPCs that referenced them so the RPCs keep running for
-- the surviving apps (standalone 二階 + neurons).
--
-- Owner-run via the Supabase dashboard SQL editor (or `supabase db push`).
-- 一階 has NO real players (owner-confirmed), so the dropped rows are
-- dogfood/owner data only — no export pipeline needed.
--
-- Per CLAUDE.md "every change to upsert_lww / delete_my_data adds a new
-- numbered migration; existing migrations are never edited in place."
--
-- ── What is NOT touched (deliberately) ──────────────────────────────
--   • delete_my_account()  — only PERFORMs delete_my_data() + deletes the
--     auth.users row; no direct 一階-table reference, so it needs no patch.
--   • upsert_lww()         — its whitelist never included the 4 一階 tables
--     (一階 synced them via direct table upserts, not this RPC); confirmed
--     by grep across 0003/0006/0009/0014. No dispatch branch to remove.
--   • bug_reports          — KEPT. The standalone 二階 still writes
--     app='medexam2-hospital-tw' rows; 'medexam-tw' merely freezes to a
--     legacy enum value (historical rows stay readable).
--   • All hospital_* / question_bookmarks / retirement_log /
--     account_metadata / hospital_monotonic_counters tables — KEPT
--     (consumed by the standalone 二階 via the shared backend).
--
-- ── Apply-time verification (tasks.md §6.3) ─────────────────────────
--   Whether a surviving app still invokes delete_my_data()/export_my_data()
--   after the R2 cutover is unknown but does not matter for safety: if they
--   are dead paths the DROP CASCADE is harmless; if they are live, the
--   CREATE OR REPLACE below keeps them from raising
--   "relation player_state does not exist" at call time.
-- =====================================================================

-- ─── 1. Drop the 4 一階 tables (RLS policies + indexes auto-drop via CASCADE) ───
DROP TABLE IF EXISTS public.player_state    CASCADE;
DROP TABLE IF EXISTS public.srs_cards       CASCADE;
DROP TABLE IF EXISTS public.item_instances  CASCADE;
DROP TABLE IF EXISTS public.mentor_backlog  CASCADE;

-- ─── 2. Re-create delete_my_data() without the 4 一階 DELETEs ───
-- Body is 0015 verbatim minus player_state / srs_cards / item_instances /
-- mentor_backlog. Keeps the 二階 deletes + the account_metadata reset marker.
CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'delete_my_data: not authenticated';
  END IF;

  DELETE FROM public.hospital_state                WHERE user_id = uid;
  DELETE FROM public.hospital_doctors              WHERE user_id = uid;
  DELETE FROM public.retirement_log                WHERE user_id = uid;
  DELETE FROM public.hospital_mastery              WHERE user_id = uid;
  DELETE FROM public.hospital_question_history     WHERE user_id = uid;
  DELETE FROM public.hospital_monotonic_counters   WHERE user_id = uid;

  -- Bump the reset marker so other devices wipe local on next pull gate.
  INSERT INTO public.account_metadata (user_id, last_reset_at)
  VALUES (uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_reset_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;

-- ─── 3. Re-create export_my_data() without the 4 一階 aggregates ───
-- Body is 0002 verbatim minus the 4 一階 table aggregates. (Note: 0002's
-- export_my_data was never extended to the newer 二階 tables — that pre-
-- existing gap is out of scope here; this migration only removes 一階.)
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  payload JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'export_my_data: not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'schema_version', '0016',
    'exported_at',    to_jsonb(now()),
    'user_id',        to_jsonb(uid),
    'tables', jsonb_build_object(
      'hospital_state',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.hospital_state            t WHERE t.user_id = uid),
      'hospital_doctors',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.hospital_doctors          t WHERE t.user_id = uid),
      'hospital_mastery',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.hospital_mastery          t WHERE t.user_id = uid),
      'hospital_question_history',  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.hospital_question_history t WHERE t.user_id = uid)
    )
  ) INTO payload;

  RETURN payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
