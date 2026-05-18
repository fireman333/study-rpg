-- =====================================================================
-- 0005_upsert_lww_bookmarks.sql
-- add-quiz-question-id-and-bookmark — extend upsert_lww whitelist + dispatch
-- for the new `question_bookmarks` table.
--
-- Convention (recorded in docs/CLOUD_SYNC.md): every change to upsert_lww
-- adds a new numbered migration; existing migrations are never edited in
-- place. This file is a CREATE OR REPLACE of the entire RPC body — the
-- only deltas from 0003 are (a) the whitelist now accepts
-- 'question_bookmarks', and (b) a new ELSIF branch dispatches the upsert.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.upsert_lww(
  table_name TEXT,
  rows       JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid             UUID := auth.uid();
  written_count   INTEGER := 0;
  row_json        JSONB;
  row_updated_at  TIMESTAMPTZ;
  row_app_version TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'upsert_lww: not authenticated';
  END IF;

  IF table_name NOT IN (
    'player_state', 'srs_cards', 'item_instances', 'mentor_backlog',
    'hospital_state', 'hospital_doctors', 'hospital_mastery',
    'hospital_question_history', 'question_bookmarks'
  ) THEN
    RAISE EXCEPTION 'upsert_lww: unknown table %', table_name;
  END IF;

  FOR row_json IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    IF (row_json->>'user_id')::UUID <> uid THEN
      RAISE EXCEPTION 'upsert_lww: user_id mismatch in row (auth.uid()=% row.user_id=%)', uid, row_json->>'user_id';
    END IF;

    row_updated_at  := (row_json->>'updated_at')::TIMESTAMPTZ;
    row_app_version := row_json->>'app_version';

    IF table_name = 'player_state' THEN
      INSERT INTO public.player_state (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.player_state.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'mentor_backlog' THEN
      INSERT INTO public.mentor_backlog (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.mentor_backlog.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_state' THEN
      INSERT INTO public.hospital_state (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_state.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'srs_cards' THEN
      INSERT INTO public.srs_cards (user_id, question_id, data, updated_at, app_version)
      VALUES (uid, row_json->>'question_id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.srs_cards.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'item_instances' THEN
      INSERT INTO public.item_instances (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.item_instances.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_doctors' THEN
      INSERT INTO public.hospital_doctors (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_doctors.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_mastery' THEN
      INSERT INTO public.hospital_mastery (user_id, subject_id, correct, total, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'subject_id',
        COALESCE((row_json->>'correct')::REAL, 0),
        COALESCE((row_json->>'total')::INTEGER, 0),
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, subject_id) DO UPDATE
        SET correct = EXCLUDED.correct,
            total   = EXCLUDED.total,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.hospital_mastery.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_question_history' THEN
      INSERT INTO public.hospital_question_history (user_id, question_id, data, updated_at, app_version)
      VALUES (uid, row_json->>'question_id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_question_history.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'question_bookmarks' THEN
      INSERT INTO public.question_bookmarks (user_id, question_id, added_at, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'question_id',
        (row_json->>'added_at')::TIMESTAMPTZ,
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET added_at    = EXCLUDED.added_at,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.question_bookmarks.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;
    END IF;
  END LOOP;

  RETURN written_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lww(TEXT, JSONB) TO authenticated;
