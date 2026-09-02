-- ═══════════════════════════════════════════════════════════════════════
-- 0023 — remove the new-author trust window
-- ═══════════════════════════════════════════════════════════════════════
-- Any authenticated player's FIRST note now publishes immediately. Being
-- signed in is the only gate.
--
-- 0021 withheld an account's first 3 lifetime notes pending owner review.
-- In a closed cohort of ~132 Google-OAuth accounts all sitting the same
-- exam, that protected against a threat that is rare here while imposing a
-- cost paid every day: a well-meaning classmate's first contribution
-- vanished silently from everyone else's view. The owner has decided the
-- exchange is not worth it and accepts the exposure — a brand-new account's
-- first note is public the moment it is written, with no buffer before
-- someone reports it. Every other compensating control is untouched:
-- licence acknowledgement, 1-reporter conceal for phi / third-party-
-- copyright, 3-reporter conceal otherwise, the 5-per-24h quota, takedown,
-- and the kill switch.
--
-- This REPLACES the function rather than editing 0021, which is already
-- applied to production; rewriting an applied migration makes the file a
-- record of something that never ran. Same signature, so the existing
-- trigger rebinds — no CREATE TRIGGER, and no window in which the table has
-- no insert guard.
--
-- ── Two things a later reader will want to "fix". Do not. ──────────────
--
-- 1. `community_notes.visibility` still has `DEFAULT 'withheld'`
--    (0021:121). Dead in practice now that the trigger always assigns, but
--    it is the fail-closed backstop if the trigger is ever dropped.
--    "Aligning" it to 'visible' would turn a missing trigger from a visible
--    outage into silent publication.
--
-- 2. `community_review_queue()` still carries the comment
--    "-- new authors waiting on the trust window" (0021:1215). The comment
--    is stale; the BRANCH is not. That branch is the retreat console — it
--    is what makes `withheld` a review queue rather than a black hole the
--    moment the retreat below is taken. Replacing a second function to
--    correct prose buys nothing and risks something.
--
-- `withheld` therefore stays in the CHECK domain and
-- `community_note_publish()` stays in the owner verb set, even though after
-- this migration NO insert path produces `withheld`. That pair is the
-- retreat: restoring review-before-publish is the one-line change marked
-- below, with the domain, the policies, the queue and the publish verb all
-- already in place. Deleting them to tidy up would trade a cheap retreat
-- for nothing, at the exact moment one would be reaching for it — under a
-- PHI or copyright incident.
--
-- Rollback: re-apply the 0021 body as 0024. No data migration either way.
-- Rows already 'withheld' are untouched and remain publishable. If the
-- concern is urgent rather than behavioural, the kill switch
-- (community_flags.submissions_enabled = false) is faster than any
-- migration.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.community_notes_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
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
  IF v_recent >= 5 THEN
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
$fn$;
