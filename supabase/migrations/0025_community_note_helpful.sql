-- =====================================================================
-- 0025  community note helpful marks
-- =====================================================================
-- A logged-in player may mark a note 「這則有幫助」; every reader sees the
-- count. Nothing sorts on it and nothing is earned from it — both deliberate.
-- See openspec change `add-community-note-helpful-signal`.
--
-- Applied BY HAND. Never `supabase db push`: migration history is frozen at
-- 0019 and a push would replay 0021.
--
-- Everything below is one transaction, with the client GRANTs last, so no
-- window exists in which a client can write a row the constraints would
-- later reject.

BEGIN;

-- =====================================================================
-- §1  TABLE
-- =====================================================================
-- The natural key IS the primary key. A surrogate `id` would buy nothing —
-- nothing references a mark — and would cost a second index.
--
-- revision_no is in the key on purpose (design D2). With it out, an edit
-- zeroes the count (§4) and every prior voter is then permanently barred
-- from marking the new revision, so an edited note's count could never
-- recover — including when the edit improved it.
--
-- Unlike community_note_reports this is a PLAIN key, not a partial index.
-- Reports use `WHERE resolved_at IS NULL` because a resolved report stays as
-- history and must not block a later one. A mark has no resolved state:
-- withdrawal deletes the row.
CREATE TABLE IF NOT EXISTS public.community_note_helpful (
  note_id      UUID NOT NULL,
  -- DEFAULT 0 only so the column may be omitted; the BEFORE INSERT trigger
  -- in §3 overwrites it before any constraint is evaluated. A client-supplied
  -- value is ignored, which is what the spec requires (not rejected).
  revision_no  INT  NOT NULL DEFAULT 0,
  -- CASCADE: a mark is an endorsement by a person; with the person gone the
  -- endorsement goes, mirroring reporter deletion. Counts can therefore fall
  -- without anyone withdrawing anything — that is correct, not a defect.
  voter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (note_id, revision_no, voter_id),

  -- Structural, not checked in application code. RESTRICT so a revision that
  -- carries marks cannot be removed out from under them.
  FOREIGN KEY (note_id, revision_no)
    REFERENCES public.community_note_revisions(note_id, revision_no)
    ON DELETE RESTRICT
);

-- No separate aggregation index. The primary key's btree already has
-- (note_id, revision_no) as its left prefix, which is the whole of the
-- projection's predicate in §5. Add one only if EXPLAIN on the real query
-- says otherwise, and record the plan when you do.

-- =====================================================================
-- §2  AVAILABILITY FLAG
-- =====================================================================
-- Voting gets its own switch: a flood of marks must be answerable without
-- withdrawing every player's notes. FALSE so the feature lands off and is
-- turned on deliberately.
--
-- The 0022 audit trigger needs no change — it snapshots to_jsonb(NEW), not a
-- column list, so it captures this column automatically.
ALTER TABLE public.community_flags
  ADD COLUMN IF NOT EXISTS voting_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.community_voting_enabled()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT voting_enabled FROM public.community_flags
      WHERE feature = 'community_notes'), FALSE);
$$;

-- =====================================================================
-- §3  BEFORE INSERT — gate, lock, then stamp the revision
-- =====================================================================
-- Modelled on community_reports_before_insert (0021 §3.8) but deliberately
-- NOT a copy of it. Two behaviours are left out on purpose:
--   * its public_read gate — voting has its own switch (§2)
--   * its community_assert_report_quota() call — votes carry no rate limit
-- Carrying either across would silently reimpose something the design excluded.
--
-- The FOR UPDATE is kept, and is load-bearing for a different reason than in
-- reports: it serialises against the edit path, so a mark cannot be stamped
-- with a revision that an in-flight edit is superseding.
CREATE OR REPLACE FUNCTION public.community_helpful_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_rev INT;
BEGIN
  IF NOT public.community_voting_enabled() THEN
    RAISE EXCEPTION 'community_note_helpful: voting is paused'
      USING ERRCODE = '53400';
  END IF;

  SELECT current_revision_no INTO v_rev
    FROM public.community_notes WHERE id = NEW.note_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_note_helpful: note not found' USING ERRCODE = '23503';
  END IF;

  -- Any client-supplied value is discarded, not validated.
  NEW.revision_no := v_rev;
  NEW.created_at  := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER community_helpful_before_insert
  BEFORE INSERT ON public.community_note_helpful
  FOR EACH ROW EXECUTE FUNCTION public.community_helpful_before_insert();

-- =====================================================================
-- §4  PRIVILEGE AND POLICY
-- =====================================================================
-- INSERT and DELETE only. NO SELECT grant of any kind, not even own-row:
-- the viewer's own state reaches the client as a computed boolean on the
-- projection (§5), so no path exists by which an account can enumerate
-- voting behaviour, its own included.
--
-- The GRANTs are not decoration. This schema opens with REVOKE ALL and a
-- policy does not confer privilege — a DELETE policy without GRANT DELETE
-- yields a withdrawal path that fails for every player and presents as a
-- policy bug rather than a missing grant.
REVOKE ALL ON public.community_note_helpful
  FROM PUBLIC, anon, authenticated, service_role;

-- revision_no is granted so a client-supplied value is *ignored* by the §3
-- trigger rather than rejected by the grant — the spec says ignored, and
-- 0021 grants it on reports for exactly this reason. created_at is NOT
-- granted: nothing in the spec says a client may name it.
GRANT INSERT (note_id, revision_no, voter_id)
  ON public.community_note_helpful TO authenticated;
GRANT DELETE
  ON public.community_note_helpful TO authenticated;

ALTER TABLE public.community_note_helpful ENABLE ROW LEVEL SECURITY;

CREATE POLICY helpful_insert_own ON public.community_note_helpful
  FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = auth.uid()
    AND public.community_voting_enabled()
  );

-- The switch gates withdrawal too. Gating only INSERT would leave DELETE open
-- through the API while the control is hidden either way in the UI — a kill
-- switch that stops half the write paths is not a kill switch.
CREATE POLICY helpful_delete_own ON public.community_note_helpful
  FOR DELETE TO authenticated
  USING (
    voter_id = auth.uid()
    AND public.community_voting_enabled()
  );

-- Deliberately no SELECT policy. With no SELECT grant it would be inert
-- anyway; its absence is the statement.

-- =====================================================================
-- §5  PUBLIC PROJECTION
-- =====================================================================
-- security_invoker = false is what makes §4 workable: the view runs as its
-- owner, so it reads a table no client can. auth.uid() still resolves — it
-- reads the request's JWT claim, not the executing role — so viewer_has_marked
-- is per-reader without exposing any voter_id. It is NULL-safe: anon has no
-- uid, EXISTS is false.
--
-- helpful_count counts only marks on the CURRENT revision, so an edit zeroes
-- the displayed count while the superseded rows stay for later analysis.
CREATE OR REPLACE VIEW public.community_notes_public
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  n.id,
  n.parent_id,
  n.anchor_type,
  n.anchor_id,
  n.source_fingerprint,
  n.content_hash,
  n.body,
  CASE
    WHEN p.nickname IS NULL                     THEN '匿名同學'
    WHEN p.nickname_visibility <> 'visible'     THEN '匿名同學'
    ELSE p.nickname
  END                               AS nickname,
  n.created_at,
  (n.edit_count > 0)                AS is_edited,
  -- Exposed so the client can scope its withdrawal DELETE to the current
  -- revision. Without it a client filtering on note_id alone would delete
  -- that account's marks on superseded revisions too.
  n.current_revision_no,
  (SELECT count(*)
     FROM public.community_note_helpful h
    WHERE h.note_id     = n.id
      AND h.revision_no = n.current_revision_no)::INT  AS helpful_count,
  EXISTS (SELECT 1
            FROM public.community_note_helpful h
           WHERE h.note_id     = n.id
             AND h.revision_no = n.current_revision_no
             AND h.voter_id    = auth.uid())           AS viewer_has_marked
FROM public.community_notes n
LEFT JOIN public.community_profiles p ON p.user_id = n.author_id
WHERE n.visibility = 'visible'
  AND EXISTS (
    SELECT 1 FROM public.community_flags f
     WHERE f.feature = 'community_notes' AND f.public_read
  );

GRANT SELECT ON public.community_notes_public TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.community_notes_public
  FROM PUBLIC, anon, authenticated, service_role;

-- =====================================================================
-- §6  FUNCTION PRIVILEGES — after every CREATE FUNCTION
-- =====================================================================
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions
-- to anon, authenticated and service_role BY NAME. `REVOKE ... FROM PUBLIC`
-- does not touch a named grant, so each role is revoked explicitly. 0021
-- measured 10 of 11 functions reachable by anon before this was added.
REVOKE ALL ON FUNCTION public.community_voting_enabled()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_helpful_before_insert()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.community_voting_enabled() TO authenticated;

COMMIT;
