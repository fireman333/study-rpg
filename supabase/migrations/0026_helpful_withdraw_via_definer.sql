-- =====================================================================
-- 0026  withdrawal moves to a definer function
-- =====================================================================
-- Fixes a defect in 0025 that only an unprivileged client could reveal.
--
-- 0025 granted DELETE and deliberately no SELECT, on the reasoning that the
-- viewer's own state arrives as a computed boolean on the projection and that
-- nothing should be able to enumerate voting behaviour. The grant is not
-- sufficient: **PostgreSQL requires SELECT privilege on every column named in
-- a DELETE's WHERE clause.** A client withdrawing a mark filters on
-- (note_id, revision_no, voter_id), holds SELECT on none of them, and is
-- refused 42501 — so withdrawal failed for every player, always.
--
-- Measured, not reasoned: as `authenticated`,
--   DELETE FROM community_note_helpful WHERE voter_id = '…'  →  42501
--   after GRANT SELECT (voter_id) only, the same statement   →  ALLOWED
-- The privileged probe missed it because `postgres` holds SELECT.
--
-- The obvious repair — grant column-level SELECT — is the enumeration 0025
-- refused, and would also make `?select=voter_id` return an empty set instead
-- of a denial, contradicting the boundary requirement. So withdrawal moves
-- behind a SECURITY DEFINER function instead, which is what this schema
-- already does when a client must act on a row it cannot name
-- (`community_report_display_name`, 0021).

BEGIN;

-- Resolves the row from `auth.uid()` rather than trusting a caller-supplied
-- voter, so one account can never withdraw another's mark. Gates on the same
-- switch as the INSERT trigger: a kill switch that stopped only recording
-- would leave half the write paths open.
CREATE OR REPLACE FUNCTION public.community_unmark_helpful(
  p_note_id     UUID,
  p_revision_no INT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'community_note_helpful: not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.community_voting_enabled() THEN
    RAISE EXCEPTION 'community_note_helpful: voting is paused' USING ERRCODE = '53400';
  END IF;

  -- Scoped to the revision, never to the note alone: marks on superseded
  -- revisions are retained on purpose and a note-wide delete would take them.
  DELETE FROM public.community_note_helpful
   WHERE note_id     = p_note_id
     AND revision_no = p_revision_no
     AND voter_id    = v_uid;

  -- Deleting nothing is not an error. The row may already be gone, and there
  -- is no state to report back that the projection will not show anyway.
END;
$fn$;

-- The direct DELETE grant from 0025 is now dead: unusable without SELECT, and
-- superseded by the function. 0021's rule applies — an ungranted privilege is
-- better than one that happens to be unusable.
REVOKE DELETE ON public.community_note_helpful FROM authenticated;

-- `helpful_delete_own` is deliberately KEPT. It grants nothing on its own and
-- the definer function bypasses RLS entirely, but it means a future migration
-- that re-grants DELETE does not thereby open withdrawal to arbitrary rows.

REVOKE ALL ON FUNCTION public.community_unmark_helpful(UUID, INT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.community_unmark_helpful(UUID, INT) TO authenticated;

COMMIT;
