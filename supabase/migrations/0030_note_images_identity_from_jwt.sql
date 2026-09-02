-- 0030_note_images_identity_from_jwt.sql
--
-- Change `add-community-note-images`, follow-up to 0029 (owner decision, 2026-07-30).
--
-- 0029 left the Worker needing a Supabase **service_role** key, because the three
-- functions were granted to `service_role` alone. That key bypasses RLS on the entire
-- project, and the Worker only ever needs to do three narrow things — so it was the wrong
-- credential for the job by a wide margin.
--
-- This takes the identity OUT of the Worker's hands entirely:
--
--   * `community_note_image_reserve` no longer accepts an uploader. It reads `auth.uid()`.
--     Granted to `authenticated`. The Worker forwards the caller's own JWT, so it is no
--     longer capable of claiming an upload belongs to somebody else — a guarantee it
--     previously only had because we trusted it to pass the right parameter.
--   * `community_note_image_authorize` no longer accepts a requester. It reads `auth.uid()`,
--     which is NULL for an anonymous request — exactly the value the predicate already
--     wanted. Granted to `anon` and `authenticated`, because an `<img>` sends no credential
--     and the serving decision still has to be made for it.
--
-- The signatures change, so these are DROP + CREATE rather than CREATE OR REPLACE, and
-- their OIDs therefore change. That is expected here and is the one difference a
-- field-level diff of this migration should show.
--
-- ⚠️ WHAT THIS COSTS, stated rather than discovered later:
--
--  1. `authenticated` can now call `reserve` DIRECTLY through PostgREST, not only through
--     the Worker, and can therefore create object rows whose recorded length and dimensions
--     are false. Those rows are **unservable** — serving resolves through R2, and only the
--     Worker writes bytes — so the effect is wasted rows inside the caller's own 60-per-24h
--     count bound. It cannot inflate storage: 60 objects × the 2 MB per-object ceiling is
--     the same 120 MB the byte bound was already imposing, so understating `byte_length`
--     buys nothing. It CAN leave a note carrying a permanently broken image reference, which
--     is self-inflicted and visible only to its author.
--  2. `community_note_images_claim_expired` stays `service_role`-only, because its caller
--     must delete the R2 bytes and a client cannot. With no service-role key in the Worker,
--     **the expiry sweep has no automated caller** and retention becomes an owner-run
--     operation. pg_cron is not installed on this project, so there is no third option
--     today.
--
-- Applied out of band with `supabase db query --linked -f`. NEVER `supabase db push`.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =====================================================================
-- §1  reserve — the uploader is whoever the JWT says, and nobody else
-- =====================================================================

DROP FUNCTION IF EXISTS public.community_note_image_reserve(UUID, TEXT, INT, INT, INT, TEXT, BOOLEAN);

CREATE FUNCTION public.community_note_image_reserve(
  p_idempotency_key TEXT,
  p_byte_length     INT,
  p_width           INT,
  p_height          INT,
  p_format          TEXT,
  p_image_ack       BOOLEAN)
RETURNS TABLE (image_id UUID, replayed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_uploader UUID := auth.uid();
  v_existing UUID;
  v_count    INT;
  v_bytes    BIGINT;
  v_new      UUID;
BEGIN
  -- Not a parameter any more. A caller cannot name an account other than its own, so the
  -- own-upload rule the submission trigger enforces can no longer be undermined upstream.
  IF v_uploader IS NULL THEN
    RAISE EXCEPTION 'community_note_images: an upload requires an account'
      USING ERRCODE = '42501';
  END IF;

  -- Specific to images and NOT satisfied by the body licence acknowledgement: the two
  -- assert different things, and one control asserting both would let each be agreed to
  -- without being read.
  IF p_image_ack IS NOT TRUE THEN
    RAISE EXCEPTION 'community_note_images: the image acknowledgement is required'
      USING ERRCODE = '23514';
  END IF;

  -- Pausing submission pauses uploads, independently of `images_enabled`: a control that
  -- stops new text while permitting new images does not stop new content.
  IF NOT public.community_submissions_enabled() THEN
    RAISE EXCEPTION 'community_note_images: submissions are paused'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('community_note_images:' || v_uploader::TEXT)::BIGINT);

  -- Idempotency by key, never by comparing bytes — comparing bytes would be content
  -- addressing under another name, with every property it was rejected for (design D4).
  SELECT i.id INTO v_existing
    FROM public.community_note_images i
   WHERE i.uploader_id = v_uploader
     AND i.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing, TRUE;
    RETURN;
  END IF;

  -- From the ledger, which outlives the objects it counted.
  SELECT count(*), COALESCE(sum(u.byte_length), 0)
    INTO v_count, v_bytes
    FROM public.community_note_image_uploads u
   WHERE u.uploader_id = v_uploader
     AND u.created_at > now() - INTERVAL '24 hours';

  -- 60 objects and 120 MB per rolling 24 hours (owner decision, 2026-07-30). The COUNT is
  -- the binding one now that a client can call this directly: 60 × the 2 MB per-object
  -- ceiling is the same 120 MB, so a caller understating `p_byte_length` gains nothing.
  IF v_count >= 60 OR v_bytes + p_byte_length > 120 * 1024 * 1024 THEN
    RAISE EXCEPTION 'community_note_images: 24-hour upload bound reached'
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.community_note_images
    (uploader_id, idempotency_key, byte_length, width, height, format, image_ack_at)
  VALUES (v_uploader, p_idempotency_key, p_byte_length, p_width, p_height, p_format, now())
  RETURNING id INTO v_new;

  INSERT INTO public.community_note_image_uploads (uploader_id, image_id, byte_length)
  VALUES (v_uploader, v_new, p_byte_length);

  RETURN QUERY SELECT v_new, FALSE;
END;
$fn$;

COMMENT ON FUNCTION public.community_note_image_reserve(TEXT, INT, INT, INT, TEXT, BOOLEAN) IS
  'The uploader is auth.uid(), never a parameter, so no caller — including the Worker — can '
  'claim an upload belongs to another account. Callable by `authenticated` directly, which is '
  'accepted: a row created without bytes is unservable and is bounded by the caller''s own '
  '60-per-24h count.';

-- =====================================================================
-- §2  authorize — the requester is the JWT, and NULL when there is none
-- =====================================================================

DROP FUNCTION IF EXISTS public.community_note_image_authorize(UUID, UUID);

CREATE FUNCTION public.community_note_image_authorize(p_image_id UUID)
RETURNS TABLE (format TEXT, byte_length INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_requester UUID := auth.uid();
BEGIN
  -- The switch gates SERVING, not only rendering. Without this it is a display preference:
  -- anyone holding a URL keeps being answered after it is thrown. It follows that while it
  -- is off an author cannot see their own images either, which is intended.
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
       -- visibility, so a predicate testing visibility alone would keep serving for every
       -- note the read model had just stopped returning.
       (public.community_public_read_enabled() AND n.visibility = 'visible')
       OR
       -- The author's own access survives the public-read switch and stops at takedown —
       -- the one state whose body has itself been redacted. NULL for an anonymous request,
       -- which is exactly what an <img> is.
       (v_requester IS NOT NULL
        AND n.author_id = v_requester
        AND n.visibility <> 'removed')
     );
END;
$fn$;

COMMENT ON FUNCTION public.community_note_image_authorize(UUID) IS
  'Zero rows is the refusal, and every reason for refusing produces it: absent object, '
  'concealed note, taken-down note, switch off. The caller MUST render them identically and '
  'MUST send refusals uncacheable. The requester is auth.uid() — NULL for the anonymous '
  '<img> request this exists to answer.';

-- =====================================================================
-- §3  grants
-- =====================================================================
-- `reserve` to authenticated only: an upload requires an account.
-- `authorize` to anon as well: the request it exists to answer carries no credential.
--
-- `community_note_images_claim_expired` is deliberately NOT re-granted. Its caller has to
-- delete the R2 bytes, which a client cannot do, so opening it would trade rows for leaked
-- bytes. With no service-role key in the Worker the sweep therefore has no automated
-- caller and retention is an owner-run operation — recorded in the header, not hidden here.

REVOKE ALL ON FUNCTION
  public.community_note_image_reserve(TEXT, INT, INT, INT, TEXT, BOOLEAN),
  public.community_note_image_authorize(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.community_note_image_reserve(TEXT, INT, INT, INT, TEXT, BOOLEAN)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.community_note_image_authorize(UUID)
  TO anon, authenticated;

COMMIT;
