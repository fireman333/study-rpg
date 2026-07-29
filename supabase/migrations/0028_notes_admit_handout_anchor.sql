-- 0028_notes_admit_handout_anchor.sql
--
-- Three statements, one transaction:
--   1. notes_insert_own admits a 'handout' anchor alongside 'question'.
--   2. The per-author rolling ceiling moves 5 -> 100.
--   3. The central submissions pause extends to body edits (retraction stays exempt).
--
-- Both function bodies below were taken verbatim from pg_get_functiondef() against
-- production on 2026-07-29 and then altered programmatically, NOT retyped from
-- 0021_community_notes.sql. That file is stale: it still carries the new-author trust
-- window (CASE WHEN v_lifetime < 3 THEN 'withheld') that 0026 removed, and copying it
-- would have silently reinstated a control nobody tests for.
--
-- Applied out of band with `supabase db query --linked -f`. NEVER `supabase db push`:
-- migration history stopped at 0019 and a push replays 0021 (7 tables / 25 functions).

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1. The anchor literal that was reserved for v2 -------------------------
-- ALTER POLICY, not DROP+CREATE: the latter restates the command, the role list and the
-- permissive mode from a stale file, none of which this change is about.
ALTER POLICY notes_insert_own ON public.community_notes
  WITH CHECK (
    auth.uid() = author_id
    AND status = 'pending'
    AND anchor_type IN ('question', 'handout')
    AND license_ack = TRUE
    AND public.community_submissions_enabled()
  );

COMMENT ON POLICY notes_insert_own ON public.community_notes IS
  'Names the permitted anchor types explicitly rather than deferring to the column CHECK '
  'domain: a domain widened for storage would otherwise become client-writable with no '
  'policy edit and therefore no review. The status literal must stay here and must not '
  'move into a trigger -- WITH CHECK is evaluated AFTER BEFORE triggers fire.';

-- 2. The ceiling ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notes_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_recent   INT;
  v_parent   public.community_notes%ROWTYPE;
BEGIN
  IF NEW.author_id IS NULL THEN
    RAISE EXCEPTION 'community_notes: author_id is required' USING ERRCODE = '23502';
  END IF;

  -- 3.4 canonicalise and bound the body -------------------------------
  NEW.body := public.community_validate_body(NEW.body);

  -- 3.3 reply guards ---------------------------------------------------
  -- parent_id reaches PostgREST the moment the column exists, so the depth
  -- limit and anchor inheritance must exist with it, UI or no UI (D8).
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.community_notes
      WHERE id = NEW.parent_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'community_notes: parent not found' USING ERRCODE = '23503';
    END IF;
    IF v_parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'community_notes: replies to replies are not permitted'
        USING ERRCODE = '23514';
    END IF;
    -- assigned from the parent, never trusted from the client
    NEW.anchor_type        := v_parent.anchor_type;
    NEW.anchor_id          := v_parent.anchor_id;
    NEW.source_fingerprint := v_parent.source_fingerprint;
    NEW.content_hash       := v_parent.content_hash;
  END IF;

  -- 3.1 rolling 24 h quota, serialised per author ----------------------
  -- The lock is what makes count-then-insert atomic; a counting subquery in
  -- the policy would let two concurrent inserts both pass (D11).
  PERFORM pg_advisory_xact_lock(
    hashtext('community_notes:' || NEW.author_id::TEXT)::BIGINT);

  SELECT count(*) INTO v_recent FROM public.community_notes
    WHERE author_id = NEW.author_id
      AND created_at > now() - INTERVAL '24 hours';
  IF v_recent >= 100 THEN
    RAISE EXCEPTION 'community_notes: 24-hour submission quota reached'
      USING ERRCODE = '53400';
  END IF;

  -- 3.2 visibility — and never status ----------------------------------
  -- Being authenticated is the whole gate (0023). The lifetime count that
  -- drove the trust window is gone with it.
  NEW.visibility := 'visible';
  -- Retreat to review-before-publish is still this one line:
  --   NEW.visibility := 'withheld';
  -- No policy change, no client change, no data migration (D1).

  -- system-owned columns, whatever the client sent
  NEW.status              := 'pending';
  NEW.retracted_at        := NULL;
  NEW.current_revision_no := 1;
  NEW.edit_count          := 0;
  NEW.edited_at           := NULL;
  NEW.takedown_reason     := NULL;
  NEW.created_at          := now();

  RETURN NEW;
END;
$function$;


COMMENT ON FUNCTION public.community_notes_before_insert() IS
  'The 100/24h ceiling is a capacity limit, not a moderation control: it bounds how much '
  'one account can write before a person notices, and answers nothing about content. '
  'There is deliberately NO whole-table ceiling that REFUSES writes -- whoever exhausted a '
  'shared allowance would deny the write path to everyone, turning one abusive account '
  'into a site-wide outage. A whole-system limit that WITHHOLDS rather than refuses does '
  'not have that property and is not precluded.';

-- 3. The pause's reach ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_notes_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_open_reports INT;
BEGIN
  -- Owner operations (§3.10, §3.12) and the concealment trigger set the
  -- bypass; their writes skip every author guard, including the revision
  -- snapshot, so a takedown does not capture what it is redacting.
  IF public.community_bypass_active() THEN
    RETURN NEW;
  END IF;

  -- Account deletion arrives HERE, as an UPDATE. `author_id` is ON DELETE SET NULL, and
  -- PostgreSQL implements that by updating this table — which the identity guard below
  -- rejects, so a player who had ever written a note could not delete their account at
  -- all. `delete_my_account()` (migration 0002) is a shipped, player-facing path, and
  -- the spec requires deletion to complete in the presence of notes. Dissociation is
  -- exactly what design D7 asks for, so permit that ONE transition, ahead of the
  -- retracted/removed guards — a retracted note must be dissociable too. The rest of the
  -- row is pinned by comparing the WHOLE record minus `author_id` rather than by listing
  -- columns: an enumeration silently stops covering any column added later. No client can
  -- reach this anyway — `authenticated` holds UPDATE on (body, retracted_at) only.
  IF OLD.author_id IS NOT NULL AND NEW.author_id IS NULL
     AND to_jsonb(NEW) - 'author_id' IS NOT DISTINCT FROM to_jsonb(OLD) - 'author_id' THEN
    RETURN NEW;
  END IF;

  IF OLD.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'community_notes: a retracted note is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.visibility = 'removed' THEN
    RAISE EXCEPTION 'community_notes: a removed note is immutable'
      USING ERRCODE = '23514';
  END IF;

  -- identity, anchor and binding drift (3.6) --------------------------
  IF NEW.id                 IS DISTINCT FROM OLD.id
  OR NEW.author_id          IS DISTINCT FROM OLD.author_id
  OR NEW.parent_id          IS DISTINCT FROM OLD.parent_id
  OR NEW.anchor_type        IS DISTINCT FROM OLD.anchor_type
  OR NEW.anchor_id          IS DISTINCT FROM OLD.anchor_id
  OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint
  OR NEW.content_hash       IS DISTINCT FROM OLD.content_hash
  OR NEW.license_ack        IS DISTINCT FROM OLD.license_ack
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'community_notes: identity and bindings are immutable'
      USING ERRCODE = '23514';
  END IF;

  -- moderation state is owner-only, and refusing beats discarding ------
  IF NEW.status          IS DISTINCT FROM OLD.status
  OR NEW.visibility      IS DISTINCT FROM OLD.visibility
  OR NEW.takedown_reason IS DISTINCT FROM OLD.takedown_reason THEN
    RAISE EXCEPTION
      'community_notes: moderation state is set only by an owner operation'
      USING ERRCODE = '42501';
  END IF;

  -- counters are derived, never supplied
  NEW.current_revision_no := OLD.current_revision_no;
  NEW.edit_count          := OLD.edit_count;
  NEW.edited_at           := OLD.edited_at;

  -- 3.7 retraction: one-way, author only -------------------------------
  IF NEW.retracted_at IS DISTINCT FROM OLD.retracted_at THEN
    IF NEW.retracted_at IS NULL THEN
      RAISE EXCEPTION 'community_notes: retraction cannot be undone'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.author_id IS NULL OR OLD.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'community_notes: only the author may retract'
        USING ERRCODE = '42501';
    END IF;
    NEW.retracted_at := now();          -- server-stamped, not client-chosen
    NEW.visibility   := 'retracted';
  END IF;

  -- 3.6 body edit ------------------------------------------------------
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    IF OLD.author_id IS NULL OR OLD.author_id <> auth.uid() THEN
      RAISE EXCEPTION 'community_notes: only the author may edit'
        USING ERRCODE = '42501';
    END IF;

    -- The central pause covers edits as well as creation: a control that stops new text
    -- while permitting existing notes to be rewritten does not stop new text. Retraction
    -- is deliberately NOT gated (see the branch above) -- it removes content rather than
    -- introducing it, and is the one authoring action that must stay available while the
    -- surface is in trouble. This cannot live in the policy: `authenticated` holds
    -- UPDATE (body, retracted_at) through one grant and one policy, and a policy cannot
    -- compare a row's new state against its old.
    IF NOT public.community_submissions_enabled() THEN
      RAISE EXCEPTION 'community_notes: submissions are paused'
        USING ERRCODE = '42501';
    END IF;

    NEW.body := public.community_validate_body(NEW.body);

    NEW.current_revision_no := OLD.current_revision_no + 1;
    NEW.edit_count          := OLD.edit_count + 1;
    NEW.edited_at           := now();

    INSERT INTO public.community_note_revisions
      (note_id, revision_no, body, editor_id)
    VALUES (OLD.id, NEW.current_revision_no, NEW.body, auth.uid());

    -- An edit never restores a concealed note, and editing under an
    -- unresolved report conceals — so an adjudicator is never comparing a
    -- report against content that has since changed.
    IF NEW.visibility = 'visible' THEN
      SELECT count(*) INTO v_open_reports FROM public.community_note_reports
        WHERE note_id = OLD.id AND resolved_at IS NULL;
      IF v_open_reports > 0 THEN
        NEW.visibility := 'quarantined';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


COMMENT ON FUNCTION public.community_notes_before_update() IS
  'Body edits are gated on the central submissions pause; retraction deliberately is not. '
  'Withdrawal removes content rather than introducing it and must stay available exactly '
  'when the surface is in trouble.';

COMMIT;
