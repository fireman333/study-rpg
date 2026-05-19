-- =====================================================================
-- 0012_hospital_monotonic_counters.sql
-- Bring the 二階 `monotonicCounters` Dexie table into the cloud-sync
-- surface so 「重置此帳號進度」 (via delete_my_data) wipes it on every
-- device through the existing account_metadata.last_reset_at marker.
--
-- Per `apps/medexam-tw/CLAUDE.md` convention: every change to upsert_lww
-- ships as a new numbered migration; same applies to delete_my_data.
-- This single file bundles three operations because the table cannot be
-- written through upsert_lww until both pieces land — splitting would
-- leave a window where the schema exists but the RPC rejects writes.
--
-- Body of `upsert_lww` mirrors 0009 verbatim plus:
--   - whitelist accepts 'hospital_monotonic_counters'
--   - new ELSIF dispatch branch (singleton, pattern identical to
--     hospital_state and mentor_backlog)
--
-- Body of `delete_my_data` mirrors 0011 verbatim plus:
--   - DELETE FROM public.hospital_monotonic_counters WHERE user_id = uid
--     (placed BEFORE the account_metadata marker upsert so the marker
--     consistently records "all data including monotonic counters was
--     just wiped")
-- =====================================================================

-- ─── Table + RLS ────────────────────────────────────────────────────
CREATE TABLE public.hospital_monotonic_counters (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  app_version text
);

ALTER TABLE public.hospital_monotonic_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own hospital_monotonic_counters"
  ON public.hospital_monotonic_counters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own hospital_monotonic_counters"
  ON public.hospital_monotonic_counters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own hospital_monotonic_counters"
  ON public.hospital_monotonic_counters FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own hospital_monotonic_counters"
  ON public.hospital_monotonic_counters FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at touch trigger (same pattern as set_account_metadata_updated_at)
CREATE OR REPLACE FUNCTION public.set_hospital_monotonic_counters_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hospital_monotonic_counters_set_updated_at
  ON public.hospital_monotonic_counters;
CREATE TRIGGER trg_hospital_monotonic_counters_set_updated_at
  BEFORE UPDATE ON public.hospital_monotonic_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hospital_monotonic_counters_updated_at();

-- ─── upsert_lww — extend whitelist + new singleton dispatch ─────────
-- Body is 0009 verbatim with one new whitelist entry and one new ELSIF.
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
    'hospital_question_history', 'question_bookmarks',
    'targeted_tickets', 'targeted_ticket_history',
    'hospital_monotonic_counters'
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

    ELSIF table_name = 'targeted_tickets' THEN
      INSERT INTO public.targeted_tickets (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.targeted_tickets.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'targeted_ticket_history' THEN
      INSERT INTO public.targeted_ticket_history (user_id, ticket_id, event, data, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'ticket_id',
        row_json->>'event',
        row_json->'data',
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, ticket_id, event) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.targeted_ticket_history.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_monotonic_counters' THEN
      INSERT INTO public.hospital_monotonic_counters (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.hospital_monotonic_counters.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;
    END IF;
  END LOOP;

  RETURN written_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lww(TEXT, JSONB) TO authenticated;

-- ─── delete_my_data — extend wipe list ──────────────────────────────
-- Body is 0011 verbatim with one new DELETE statement, placed BEFORE
-- the account_metadata marker upsert so other devices' propagation
-- gate consistently sees an empty state for this user.
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

  DELETE FROM public.player_state                  WHERE user_id = uid;
  DELETE FROM public.srs_cards                     WHERE user_id = uid;
  DELETE FROM public.item_instances                WHERE user_id = uid;
  DELETE FROM public.mentor_backlog                WHERE user_id = uid;
  DELETE FROM public.hospital_state                WHERE user_id = uid;
  DELETE FROM public.hospital_doctors              WHERE user_id = uid;
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
