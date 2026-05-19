-- =====================================================================
-- 0011_account_reset_marker.sql
-- Adds a per-user marker so an account reset on device A propagates to
-- device B on B's next pull-gate evaluation. Without this, the per-row
-- LWW sync engine has no way to communicate "the rows you have locally
-- were deleted on cloud" — pull queries return 0 rows, the apply loop
-- iterates 0 times, and B's local Dexie keeps the stale state.
--
-- Pattern survey: Standard Notes + Bitwarden use the same per-account
-- revision-marker shape; mature row-level sync engines (Anki, RxDB,
-- CouchDB, Replicache) use per-row tombstones. The R2 migration in
-- flight (add-r2-cloud-sync-migration) replaces per-row LWW with
-- whole-bundle replacement and obsoletes this marker. `schema_version`
-- on the same row is reserved for that cutover so old clients can be
-- force-ejected without a second migration.
-- =====================================================================

CREATE TABLE public.account_metadata (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_reset_at  timestamptz NOT NULL DEFAULT now(),
  schema_version text        NOT NULL DEFAULT '1',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own account_metadata"
  ON public.account_metadata FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own account_metadata"
  ON public.account_metadata FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own account_metadata"
  ON public.account_metadata FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own account_metadata"
  ON public.account_metadata FOR DELETE
  USING (auth.uid() = user_id);

-- ─── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_account_metadata_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_metadata_set_updated_at ON public.account_metadata;
CREATE TRIGGER trg_account_metadata_set_updated_at
  BEFORE UPDATE ON public.account_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.set_account_metadata_updated_at();

-- ─── delete_my_data() — replaces 0002 version ───────────────────────
-- Per `apps/medexam-tw/CLAUDE.md` convention: every future change to a
-- function ships as a new numbered migration with CREATE OR REPLACE;
-- never edit 0002 in place. The body below preserves the existing
-- 8-table DELETE list verbatim and appends the marker bump.
--
-- Known pre-existing scope-out (out of scope for this change):
-- `question_bookmarks` (added in 0005) and `targeted_tickets` (added in
-- 0008) are NOT wiped by delete_my_data today. Tracked separately;
-- preserving the existing behaviour to keep this fix surgical.
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

  -- Bump the reset marker so other devices wipe local on next pull gate.
  INSERT INTO public.account_metadata (user_id, last_reset_at)
  VALUES (uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_reset_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;
