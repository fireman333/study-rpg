-- 0029_community_note_images.sql
--
-- Change `add-community-note-images` (study-rpg-2nd), §3 of its tasks.
-- The database half of attaching images to a community note: the central switch,
-- the object store's bookkeeping, the two records that keep ownership and display
-- apart, the durable upload ledger, the submission-side refusals, and the three
-- functions the Worker calls.
--
-- WHAT IS NOT HERE: bytes. R2 holds those, the Worker writes them, and the
-- guarantees about their format are enforced there by parsing them (design D5).
-- This file is the access-control and accounting half.
--
-- The four function bodies replaced below were taken from pg_get_functiondef()
-- against PRODUCTION on 2026-07-30 and then altered, NOT retyped from
-- 0021/0028. 0021 is stale — it still carries the new-author trust window that
-- 0026 removed from the live functions (design D12).
--
-- Applied out of band with `supabase db query --linked -f`. NEVER
-- `supabase db push`: migration history stopped at 0019 and a push replays 0021
-- (7 tables / 25 functions).
--
-- ORDER MATTERS, twice over:
--   * `images_enabled` must exist BEFORE the bundle that selects it deploys. The
--     client reads flag columns by name, and a missing column takes the WHOLE
--     notes surface down rather than just this feature (the warning 0027 left).
--   * Nothing here is reachable until the Worker endpoints exist, so this can be
--     applied ahead of them safely.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =====================================================================
-- §1  THE CENTRAL SWITCH
-- =====================================================================
-- Unlike `links_enabled`, this one gates SERVING as well as rendering
-- (design D2): `community_note_image_authorize` below returns nothing while it
-- is off, so throwing it is a withdrawal rather than a display preference.
-- Anyone holding a URL — from having read a note, or from the DOM — stops being
-- answered.

ALTER TABLE public.community_flags
  ADD COLUMN IF NOT EXISTS images_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.community_flags.images_enabled IS
  'Serve and render images attached to note bodies. Off = no image is served to anyone, '
  'including a note''s own author, and an own-store reference renders as nothing at all '
  '(not as literal text, which is how a disabled LINK behaves). Owner-only kill switch.';

-- =====================================================================
-- §2  TABLES
-- =====================================================================

-- ── 2.1 the objects ──────────────────────────────────────────────────
-- Identity is assigned here and is opaque: NOT a hash of the bytes. Content
-- addressing would make one object the target of several notes' references, and
-- the whole moderation story is that concealing a note withdraws its images —
-- which cannot hold for an object something else legitimately references. It
-- would also turn the upload path into an existence oracle (design D4).
--
-- `format` is pinned to one value by CHECK rather than left open. The spec names
-- a single container because every condition on an accepted object is a statement
-- about that container's grammar; admitting a second format is therefore a spec
-- change and should cost a migration.
CREATE TABLE IF NOT EXISTS public.community_note_images (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SET NULL, not CASCADE: deleting an account detaches the uploader's identity
  -- and leaves the objects serving with the notes that survive (§3.11).
  uploader_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Caller-supplied, account-scoped. A timeout after a write that succeeded
  -- gives the client no way to tell; without this the retry stores the picture
  -- twice and both copies count against the bound.
  idempotency_key  TEXT NOT NULL
                     CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),

  byte_length      INT  NOT NULL CHECK (byte_length > 0 AND byte_length <= 2097152),
  width            INT  NOT NULL CHECK (width  BETWEEN 1 AND 2400),
  height           INT  NOT NULL CHECK (height BETWEEN 1 AND 2400),
  format           TEXT NOT NULL CHECK (format = 'image/webp'),

  -- The only pre-publication safeguard on this path: no human sees an image
  -- before it is public. Recorded, not merely required.
  image_ack_at     TIMESTAMPTZ NOT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_note_images_idempotency_uniq
  ON public.community_note_images (uploader_id, idempotency_key);

-- ── 2.2 ownership: one note, for the object's whole life ──────────────
-- PRIMARY KEY on image_id is the "at most one owner, ever" guarantee, held by
-- the database rather than by a query.
--
-- note_id is NULLABLE with ON DELETE SET NULL, and that is the whole point: the
-- question asked elsewhere is "has this object EVER been owned", so the answer
-- cannot live in a row that disappears with the note. A note can be deleted; an
-- ownership record expressed as a dependency on that row would take the answer
-- with it, the object would read as never owned, and it would become both
-- expiry-eligible and claimable by a fresh visible note. Deleting the note must
-- also not be obstructed, which is what SET NULL (rather than RESTRICT) buys.
--
-- ON DELETE RESTRICT on image_id makes the retention promise structural: once an
-- object has been owned, nothing can delete its row — the expiry sweep below
-- filters owned objects out, and this refuses if it ever stops.
CREATE TABLE IF NOT EXISTS public.community_note_image_owners (
  image_id  UUID PRIMARY KEY
              REFERENCES public.community_note_images(id) ON DELETE RESTRICT,
  note_id   UUID REFERENCES public.community_notes(id) ON DELETE SET NULL,
  owned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2.3 the display set: what the LIVE body currently shows ───────────
-- Distinct from ownership because ownership must outlive the text a takedown
-- redacts (design D10). Derived, so it CASCADEs: deleting a note makes its
-- images unservable without touching what it owned.
--
-- Revisions deliberately have no equivalent. A body kept for audit is text, and
-- serving an image because a superseded version mentioned it would make the
-- audit trail an access-granting structure.
CREATE TABLE IF NOT EXISTS public.community_note_image_display (
  note_id   UUID NOT NULL REFERENCES public.community_notes(id)       ON DELETE CASCADE,
  image_id  UUID NOT NULL REFERENCES public.community_note_images(id) ON DELETE CASCADE,
  position  INT  NOT NULL CHECK (position BETWEEN 1 AND 3),
  PRIMARY KEY (note_id, image_id),
  UNIQUE (note_id, position)
);

-- The serving path resolves an object to its displaying note, so this is the
-- index that matters on every image request.
CREATE INDEX IF NOT EXISTS community_note_image_display_image_idx
  ON public.community_note_image_display (image_id);

-- ── 2.4 the durable upload ledger ────────────────────────────────────
-- The rolling bound is computed from THIS, not from a count over live objects.
-- Counting live objects makes the bound self-erasing: upload to the ceiling, let
-- the unowned objects expire, upload again — the allowance returns every
-- retention period, so the real ceiling would be the retention window rather
-- than the day (design D11).
--
-- `image_id` is deliberately NOT a foreign key. Any action would break the
-- property this table exists for: RESTRICT would block expiry, CASCADE would
-- delete the accounting with the object, SET NULL would erase which object it
-- was. The ledger has to survive the rows it counted.
CREATE TABLE IF NOT EXISTS public.community_note_image_uploads (
  id           BIGSERIAL PRIMARY KEY,
  uploader_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  image_id     UUID,
  byte_length  INT NOT NULL CHECK (byte_length > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_note_image_uploads_window_idx
  ON public.community_note_image_uploads (uploader_id, created_at DESC);

-- =====================================================================
-- §3  AUTHORIZATION: no client reaches any of this
-- =====================================================================
-- RLS on, zero policies, zero grants — unreachable by anon and authenticated by
-- construction, exactly as `community_note_revisions` is. Every access is through
-- a SECURITY DEFINER function below.
--
-- service_role is revoked for the reason 0021 gives: Supabase's default
-- privileges hand it ALL on every new table, and leaving that would let anything
-- holding the service key write these tables directly — inventing an ownership
-- row, or a ledger row, and bypassing every check in §5.

ALTER TABLE public.community_note_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_image_owners  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_image_display ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_note_image_uploads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_note_images,
                    public.community_note_image_owners,
                    public.community_note_image_display,
                    public.community_note_image_uploads
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON SEQUENCE public.community_note_image_uploads_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- =====================================================================
-- §4  READING IMAGE REFERENCES OUT OF A BODY
-- =====================================================================

-- ── 4.1 the references a body displays (never raises) ─────────────────
-- Answers "which own-store images does this body show", in document order. It
-- ignores everything else on purpose: an external image construct displays
-- nothing (the renderer neutralises it and issues no request), so it is not part
-- of a display set. This must not raise, because the display set is rewritten by
-- a takedown's redaction and by any other body write reaching a body this
-- capability never validated.
CREATE OR REPLACE FUNCTION public.community_note_image_display_refs(p_body TEXT)
RETURNS UUID[]
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_body TEXT;
  v_refs UUID[];
BEGIN
  -- An escaped bang is literal text, not an image construct. chr(2) is a safe
  -- placeholder: canonicalisation has already removed every C0 control from a
  -- stored body, so it cannot occur naturally.
  v_body := replace(COALESCE(p_body, ''), '\!', chr(2));

  SELECT COALESCE(array_agg(t.m[1]::UUID ORDER BY t.ord), '{}'::UUID[])
    INTO v_refs
    FROM regexp_matches(
           v_body,
           '!\[[^]]*\]\(note-image:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)',
           'g') WITH ORDINALITY AS t(m, ord);

  RETURN v_refs;
END;
$fn$;

-- ── 4.2 the references a body may contain (raises) ────────────────────
-- Every image construct in a body being written must be an own-store reference.
-- The check is a count comparison rather than a second pattern: anything that
-- opens an image and is not the exact generated form — an absolute URL with any
-- scheme or host including ours, a reference-style `![a][b]`, a malformed
-- identity — is refused without needing to be recognised individually. That is
-- the fail-closed direction; a validator enumerating what to reject admits
-- whatever it failed to think of.
--
-- Deliberately conservative in one place: an image construct inside a fenced code
-- block is refused too, though it would render as text. Refusing is the safe side
-- of that error, and a body that needs to SHOW `![](…)` as an example is a use
-- nobody has asked for.
CREATE OR REPLACE FUNCTION public.community_note_image_refs(p_body TEXT)
RETURNS UUID[]
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_body   TEXT;
  v_starts INT;
  v_refs   UUID[];
BEGIN
  v_body   := replace(COALESCE(p_body, ''), '\!', chr(2));
  v_starts := (length(v_body) - length(replace(v_body, '![', ''))) / 2;
  v_refs   := public.community_note_image_display_refs(p_body);

  IF v_starts <> COALESCE(array_length(v_refs, 1), 0) THEN
    RAISE EXCEPTION
      'community_note_images: an image must be an own-store reference, not a URL'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_refs;
END;
$fn$;

-- =====================================================================
-- §5  SUBMISSION-SIDE ENFORCEMENT
-- =====================================================================

-- ── 5.1 the refusals ─────────────────────────────────────────────────
-- Called from the BEFORE triggers, and it RAISES rather than repairing the row.
-- It must not rewrite anything: PostgreSQL evaluates RLS WITH CHECK AFTER BEFORE
-- triggers, so a trigger-written column is what the policy then tests — the
-- finding that forced `status` and `visibility` apart in 0021 (design D10).
--
-- SECURITY DEFINER is required, not decorative: `authenticated` holds no
-- privilege at all on the image tables, so every lookup here would fail on
-- permission otherwise.
CREATE OR REPLACE FUNCTION public.community_note_images_assert(
  p_note_id UUID, p_author UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_refs     UUID[];
  v_id       UUID;
  v_uploader UUID;
  v_owner    UUID;
  v_found    BOOLEAN;
BEGIN
  v_refs := public.community_note_image_refs(p_body);

  -- Occurrences, not distinct objects: occurrences are what a reader receives.
  IF COALESCE(array_length(v_refs, 1), 0) > 3 THEN
    RAISE EXCEPTION 'community_note_images: at most 3 images per note'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_refs) AS r GROUP BY r HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'community_note_images: an image may be referenced only once'
      USING ERRCODE = '23514';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(v_refs, '{}'::UUID[]) LOOP
    -- FOR UPDATE is what excludes a concurrent expiry sweep (design D11): the
    -- sweep locks its candidates, so either it waits and then re-tests ownership
    -- and skips this object, or it deleted the row first and this lookup finds
    -- nothing and refuses. The submission never commits against bytes that are
    -- going away.
    SELECT i.uploader_id INTO v_uploader
      FROM public.community_note_images i
     WHERE i.id = v_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'community_note_images: no such image %', v_id
        USING ERRCODE = '23503';
    END IF;

    IF v_uploader IS NULL OR v_uploader <> p_author THEN
      RAISE EXCEPTION 'community_note_images: image % was uploaded by another account', v_id
        USING ERRCODE = '42501';
    END IF;

    SELECT o.note_id, TRUE INTO v_owner, v_found
      FROM public.community_note_image_owners o
     WHERE o.image_id = v_id;

    -- Refused when another note owns it, and when the owning note has been
    -- DELETED (note_id NULL) — having been owned is permanent, so a deleted
    -- note's object is not recyclable. The owning note re-referencing its own
    -- object is permitted: the normative rule is "no OTHER note", and an author
    -- who removed a reference by mistake must be able to put it back. See the
    -- decision recorded alongside this change.
    IF COALESCE(v_found, FALSE) AND v_owner IS DISTINCT FROM p_note_id THEN
      RAISE EXCEPTION 'community_note_images: image % already belongs to another note', v_id
        USING ERRCODE = '23505';
    END IF;

    v_found := FALSE;
  END LOOP;
END;
$fn$;

-- ── 5.2 acquiring ownership and rewriting the display set ─────────────
-- Runs AFTER the row is written, for two reasons. It writes other tables, which
-- is not a BEFORE trigger's job; and a takedown's redaction must reach it, while
-- the BEFORE guards are skipped wholesale when the moderation bypass is set.
--
-- It never validates the body. Account dissociation and owner operations both
-- arrive at bodies this capability never checked, and making them fail would
-- make an account undeletable.
CREATE OR REPLACE FUNCTION public.community_note_images_bind(
  p_note_id UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_refs UUID[];
  v_id   UUID;
  v_pos  INT := 0;
BEGIN
  v_refs := public.community_note_image_display_refs(p_body);

  FOREACH v_id IN ARRAY COALESCE(v_refs, '{}'::UUID[]) LOOP
    INSERT INTO public.community_note_image_owners (image_id, note_id)
    VALUES (v_id, p_note_id)
    ON CONFLICT (image_id) DO NOTHING;

    -- DO NOTHING is idempotent for a note re-binding its own object, so the
    -- uniqueness backstop has to be asserted rather than assumed: without this
    -- a body reaching here unvalidated could quietly display another note's
    -- image.
    IF NOT EXISTS (
      SELECT 1 FROM public.community_note_image_owners o
       WHERE o.image_id = v_id AND o.note_id IS NOT DISTINCT FROM p_note_id
    ) THEN
      RAISE EXCEPTION 'community_note_images: image % belongs to another note', v_id
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  -- Rewritten from the live body, wholesale. An edit that removed a reference
  -- therefore stops that object being served while leaving it owned.
  DELETE FROM public.community_note_image_display WHERE note_id = p_note_id;

  FOREACH v_id IN ARRAY COALESCE(v_refs, '{}'::UUID[]) LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.community_note_image_display (note_id, image_id, position)
    VALUES (p_note_id, v_id, v_pos);
  END LOOP;
END;
$fn$;

-- =====================================================================
-- §6  THE TRIGGERS, REPLACED FROM PRODUCTION DEFINITIONS
-- =====================================================================
-- Each body below is the live pg_get_functiondef() output with the image lines
-- added and nothing else touched. The trailing semicolon pg_get_functiondef
-- omits has been added.

-- ── 6.1 BEFORE INSERT: the refusals reach a first submission ──────────
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

  -- Image references (0029). NEW.id is already the final identity here: column
  -- defaults are applied before BEFORE triggers fire, so ownership can be
  -- tested against this note rather than against "no note yet".
  PERFORM public.community_note_images_assert(NEW.id, NEW.author_id, NEW.body);

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

-- ── 6.2 AFTER INSERT: revision 1, then ownership and display ──────────
CREATE OR REPLACE FUNCTION public.community_notes_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.community_note_revisions (note_id, revision_no, body, editor_id)
  VALUES (NEW.id, 1, NEW.body, NEW.author_id);

  -- 0029: same transaction as the body it is derived from.
  PERFORM public.community_note_images_bind(NEW.id, NEW.body);

  RETURN NULL;
END;
$function$;

-- ── 6.3 BEFORE UPDATE: an edit is subject to every submission rule ────
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

    -- 0029: an edit is subject to every rule a first submission is, which is
    -- what stops three images becoming four by arriving later than the check.
    PERFORM public.community_note_images_assert(OLD.id, OLD.author_id, NEW.body);

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

-- ── 6.4 AFTER UPDATE: the display set follows the live body ────────────
-- WHEN (body changed) rather than an unconditional trigger, and the condition is
-- doing real work in three directions:
--   * a takedown's redaction fires it, which is what makes the images of a
--     taken-down note stop being displayed with no image-specific operation;
--   * a RETRACTION does not fire it, and must not — the display set has to
--     survive so the note's own author can still see their own images, which is
--     exactly what the author exception in the serving gate is for;
--   * account dissociation does not fire it, so deleting an account never
--     depends on the shape of a body this capability did not validate.
CREATE OR REPLACE FUNCTION public.community_notes_after_update_images()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  PERFORM public.community_note_images_bind(NEW.id, NEW.body);
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS community_notes_after_update_images ON public.community_notes;
CREATE TRIGGER community_notes_after_update_images
  AFTER UPDATE ON public.community_notes
  FOR EACH ROW
  WHEN (NEW.body IS DISTINCT FROM OLD.body)
  EXECUTE FUNCTION public.community_notes_after_update_images();

-- =====================================================================
-- §7  WHAT THE WORKER CALLS
-- =====================================================================
-- service_role holds no privilege on any of these tables (§3), so the Worker
-- reaches them only through these three functions. That is the closed verb list:
-- reserve an identity, ask whether an object may be served, claim expired
-- objects. There is deliberately no "delete this object" and no "publish".

-- ── 7.1 reserve an identity for an upload ─────────────────────────────
-- Called AFTER the Worker has parsed the bytes and satisfied itself they are a
-- simple lossy WebP within bounds. The dimensions and length recorded here are
-- what the Worker READ OUT of the container, never what the client declared.
--
-- The identity is assigned before the bytes are written, so a failed R2 write
-- leaves an object no note will ever reference — which expiry is for. The
-- alternative, writing bytes first, needs a key before there is an identity.
CREATE OR REPLACE FUNCTION public.community_note_image_reserve(
  p_uploader        UUID,
  p_idempotency_key TEXT,
  p_byte_length     INT,
  p_width           INT,
  p_height          INT,
  p_format          TEXT,
  p_image_ack       BOOLEAN)
RETURNS TABLE (image_id UUID, replayed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_existing UUID;
  v_count    INT;
  v_bytes    BIGINT;
  v_new      UUID;
BEGIN
  IF p_uploader IS NULL THEN
    RAISE EXCEPTION 'community_note_images: an upload requires an account'
      USING ERRCODE = '23502';
  END IF;

  -- Specific to images and NOT satisfied by the body licence acknowledgement:
  -- the two assert different things, and one control asserting both would let
  -- each be agreed to without being read.
  IF p_image_ack IS NOT TRUE THEN
    RAISE EXCEPTION 'community_note_images: the image acknowledgement is required'
      USING ERRCODE = '23514';
  END IF;

  -- Pausing submission pauses uploads, independently of `images_enabled`: a
  -- control that stops new text while permitting new images does not stop new
  -- content.
  IF NOT public.community_submissions_enabled() THEN
    RAISE EXCEPTION 'community_note_images: submissions are paused'
      USING ERRCODE = '42501';
  END IF;

  -- Serialised per account, for the reason the note quota is: the lock is what
  -- makes read-then-write atomic, so two concurrent uploads cannot both observe
  -- room for one.
  PERFORM pg_advisory_xact_lock(
    hashtext('community_note_images:' || p_uploader::TEXT)::BIGINT);

  -- Idempotency by key, never by comparing bytes — comparing bytes would be
  -- content addressing under another name, with every property it was rejected
  -- for (design D4).
  SELECT i.id INTO v_existing
    FROM public.community_note_images i
   WHERE i.uploader_id = p_uploader
     AND i.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing, TRUE;
    RETURN;
  END IF;

  -- From the ledger, which outlives the objects it counted.
  SELECT count(*), COALESCE(sum(u.byte_length), 0)
    INTO v_count, v_bytes
    FROM public.community_note_image_uploads u
   WHERE u.uploader_id = p_uploader
     AND u.created_at > now() - INTERVAL '24 hours';

  -- 60 objects and 120 MB per rolling 24 hours (owner decision, 2026-07-30).
  -- Expressed in objects AND bytes because either alone is evadable.
  IF v_count >= 60 OR v_bytes + p_byte_length > 120 * 1024 * 1024 THEN
    RAISE EXCEPTION 'community_note_images: 24-hour upload bound reached'
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.community_note_images
    (uploader_id, idempotency_key, byte_length, width, height, format, image_ack_at)
  VALUES (p_uploader, p_idempotency_key, p_byte_length, p_width, p_height,
          p_format, now())
  RETURNING id INTO v_new;

  INSERT INTO public.community_note_image_uploads (uploader_id, image_id, byte_length)
  VALUES (p_uploader, v_new, p_byte_length);

  RETURN QUERY SELECT v_new, FALSE;
END;
$fn$;

-- ── 7.2 may this object be served, and as what ───────────────────────
-- Zero rows means refuse, and the Worker must render every refusal identically:
-- an object that never existed, one whose note is concealed, one whose note was
-- taken down and one refused because the switch is off are the same answer here
-- by construction, because they are all "no row".
--
-- `format` is returned so the response's content type comes from what was
-- detected at write time rather than from anything the uploader declared.
CREATE OR REPLACE FUNCTION public.community_note_image_authorize(
  p_image_id UUID, p_requester UUID)
RETURNS TABLE (format TEXT, byte_length INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  -- The switch gates SERVING, not only rendering. Without this it is a display
  -- preference: anyone holding a URL keeps being answered after it is thrown.
  -- It follows that while it is off an author cannot see their own images
  -- either, which is intended — a rollback that exempted the author would not
  -- be a rollback of the serving path.
  IF NOT COALESCE((SELECT f.images_enabled FROM public.community_flags f
                    WHERE f.feature = 'community_notes'), FALSE) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT i.format, i.byte_length
    FROM public.community_note_image_display d
    JOIN public.community_notes n       ON n.id = d.note_id
    JOIN public.community_note_images i ON i.id = d.image_id
   WHERE d.image_id = p_image_id
     AND (
       -- Withholding public reading withholds notes WITHOUT changing any note's
       -- visibility, so a predicate testing visibility alone would keep serving
       -- for every note the read model had just stopped returning.
       (public.community_public_read_enabled() AND n.visibility = 'visible')
       OR
       -- The author's own access survives the public-read switch, matching how
       -- their text already behaves, and stops at takedown — the one state whose
       -- body has itself been redacted.
       (p_requester IS NOT NULL
        AND n.author_id = p_requester
        AND n.visibility <> 'removed')
     );
END;
$fn$;

-- ── 7.3 claim objects no note ever owned ─────────────────────────────
-- Returns the identities it deleted so the caller can delete the bytes: this
-- function cannot reach R2, and an object row without bytes is unreachable while
-- bytes without a row are merely cost.
--
-- There is no scheduler in this project — pg_cron is not installed — so this has
-- a caller or it does not run. The Worker invoking it opportunistically on the
-- upload path is the cheapest arrangement and is bounded by p_limit.
CREATE OR REPLACE FUNCTION public.community_note_images_claim_expired(
  p_limit INT DEFAULT 100)
RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_ids UUID[];
BEGIN
  -- FOR UPDATE and NOT skip-locked: a candidate locked by a submission in flight
  -- must be waited for and then re-tested, not stepped over and deleted.
  SELECT COALESCE(array_agg(t.id), '{}'::UUID[]) INTO v_ids
    FROM (
      SELECT i.id
        FROM public.community_note_images i
       WHERE i.created_at < now() - INTERVAL '24 hours'
         AND NOT EXISTS (SELECT 1 FROM public.community_note_image_owners o
                          WHERE o.image_id = i.id)
       ORDER BY i.created_at
       LIMIT GREATEST(COALESCE(p_limit, 100), 0)
       FOR UPDATE
    ) t;

  -- Re-tested after the lock, because ownership may have been acquired while
  -- this transaction waited. The FK from the ownership table is the third line
  -- of defence: it REFUSES the delete outright.
  RETURN QUERY
  DELETE FROM public.community_note_images i
   WHERE i.id = ANY (v_ids)
     AND NOT EXISTS (SELECT 1 FROM public.community_note_image_owners o
                      WHERE o.image_id = i.id)
  RETURNING i.id;
END;
$fn$;

-- ── 7.4 grants: the Worker, and nobody else ──────────────────────────
REVOKE ALL ON FUNCTION
  public.community_note_image_display_refs(TEXT),
  public.community_note_image_refs(TEXT),
  public.community_note_images_assert(UUID, UUID, TEXT),
  public.community_note_images_bind(UUID, TEXT),
  public.community_notes_after_update_images(),
  public.community_note_image_reserve(UUID, TEXT, INT, INT, INT, TEXT, BOOLEAN),
  public.community_note_image_authorize(UUID, UUID),
  public.community_note_images_claim_expired(INT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.community_note_image_reserve(UUID, TEXT, INT, INT, INT, TEXT, BOOLEAN),
  public.community_note_image_authorize(UUID, UUID),
  public.community_note_images_claim_expired(INT)
  TO service_role;

COMMENT ON FUNCTION public.community_note_image_authorize(UUID, UUID) IS
  'Zero rows is the refusal, and every reason for refusing produces it: absent object, '
  'concealed note, taken-down note, switch off. The caller MUST render them identically '
  'and MUST send refusals uncacheable, so one cannot be replayed after the note changes.';

COMMENT ON FUNCTION public.community_note_images_claim_expired(INT) IS
  'Deletes rows for objects no note has EVER owned and returns their identities so the '
  'caller can delete the bytes. Being owned, not being displayed, is what it tests: an '
  'object whose reference was edited away, whose note was taken down, or whose note was '
  'deleted has still been owned and is still retained.';

COMMIT;
