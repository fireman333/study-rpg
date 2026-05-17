-- =====================================================================
-- 0002_account_lifecycle.sql
-- M4 milestone — GDPR-light account deletion + export RPCs.
--
-- delete_my_data() — deletes all rows in sync tables for auth.uid()
--                    (single transaction).
-- delete_my_account() — deletes data + auth user record. SECURITY DEFINER
--                       so the client can invoke without service_role key.
-- export_my_data() — bundles all user-owned rows as JSON (client could also
--                    aggregate via separate SELECTs; this is a convenience).
-- =====================================================================

-- ─── delete_my_data ────────────────────────────────────────────────
-- Removes every sync row owned by the caller. Does NOT remove the auth
-- user record itself. Safe to call repeatedly (idempotent).
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

  DELETE FROM public.player_state               WHERE user_id = uid;
  DELETE FROM public.srs_cards                  WHERE user_id = uid;
  DELETE FROM public.item_instances             WHERE user_id = uid;
  DELETE FROM public.mentor_backlog             WHERE user_id = uid;
  DELETE FROM public.hospital_state             WHERE user_id = uid;
  DELETE FROM public.hospital_doctors           WHERE user_id = uid;
  DELETE FROM public.hospital_mastery           WHERE user_id = uid;
  DELETE FROM public.hospital_question_history  WHERE user_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;

-- ─── delete_my_account ─────────────────────────────────────────────
-- Calls delete_my_data() then removes the auth.users record.
-- SECURITY DEFINER so the client doesn't need service_role key.
-- ON DELETE CASCADE on every FK ensures any orphan rows go too.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'delete_my_account: not authenticated';
  END IF;

  PERFORM public.delete_my_data();
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ─── export_my_data ────────────────────────────────────────────────
-- Returns one JSONB blob containing every sync row owned by the caller.
-- Schema:
--   {
--     "schema_version": "0002",
--     "exported_at": "2026-05-16T...",
--     "user_id": "...",
--     "tables": {
--       "player_state":              [...],
--       "srs_cards":                 [...],
--       ...
--     }
--   }
-- Client converts to Blob and triggers download.
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
    'schema_version', '0002',
    'exported_at',    to_jsonb(now()),
    'user_id',        to_jsonb(uid),
    'tables', jsonb_build_object(
      'player_state',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.player_state              t WHERE t.user_id = uid),
      'srs_cards',                  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.srs_cards                 t WHERE t.user_id = uid),
      'item_instances',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.item_instances            t WHERE t.user_id = uid),
      'mentor_backlog',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.mentor_backlog            t WHERE t.user_id = uid),
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
