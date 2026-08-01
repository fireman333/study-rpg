-- Tests for migration 0032's one edit to the submission path.
--
-- Run from the `study-rpg-2nd` directory (that is where the Supabase project link lives):
--
--   supabase db query --linked -f ../study-rpg/supabase/tests/0032_lock_order_and_display_order.sql
--
-- Everything is inside BEGIN … ROLLBACK: rows are seeded, assertions run, nothing is kept.
--
-- WHAT THESE GUARD. 0032 changed `community_note_images_assert` to acquire its row locks over a
-- SORTED copy of the body's image references, so that it and `community_note_images_claim_expired`
-- (which locks `ORDER BY i.id`) climb in the same order and cannot form a deadlock cycle. The risk
-- that change introduced is that somebody later "tidies" the sort onto the array `bind` uses — which
-- would silently rearrange the images of every note holding more than one, because
-- `community_note_image_display.position` is assigned by iterating that array in DOCUMENT order.
--
-- So: test 1 proves the lock loop DOES iterate in id order, and test 2 proves the display set does
-- NOT. Either one alone would let the other regress unnoticed.
--
-- ⚠️ WHAT TEST 1 DOES NOT PROVE. It establishes the ordering property, not the absence of a deadlock
-- under real concurrency — that would need two persistent sessions interleaved, and this project has
-- no harness for it. The ordering property is what makes the cycle impossible; test 1 checks the
-- submission's half and test 3 checks the sweep's.
--
-- ⚠️ THIS FILE RAISES ON FAILURE. An earlier version only SELECTed a verdict column, so a failing
-- check printed `FAIL` and `supabase db query` still exited 0 — a report a human had to read, not a
-- gate. If any assertion fails now, the whole thing aborts with the mismatches in the message.

BEGIN;

CREATE TEMP TABLE r(ord int, case_name text, got text, want text);

-- ── 1. the lock loop iterates in id order ────────────────────────────
-- The ids are chosen so id order (C, A, B) differs from body order (A, B, C). Two of the three
-- images belong to a different account, so `_assert` refuses — and the id it NAMES is whichever it
-- reached first, which is exactly the iteration order made observable.
DO $t$
DECLARE
  a uuid := '0000000a-0000-4000-8000-000000000001';
  b uuid := '0000000b-0000-4000-8000-000000000001';
  c uuid := '00000001-0000-4000-8000-000000000001';
  v_author uuid; v_other uuid; v_body text; v_msg text;
BEGIN
  SELECT id INTO v_author FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other  FROM auth.users WHERE id <> v_author ORDER BY created_at LIMIT 1;
  IF v_other IS NULL THEN
    INSERT INTO r VALUES (1,'the id named by the refusal','(needs two accounts)','C (id order)');
    RETURN;
  END IF;

  INSERT INTO public.community_note_images
    (id, uploader_id, idempotency_key, byte_length, width, height, format, image_ack_at, created_at)
  VALUES
    (a, v_other,  'lockorder-aaaa-01', 100, 10, 10, 'image/webp', now(), now()),
    (b, v_author, 'lockorder-bbbb-01', 100, 10, 10, 'image/webp', now(), now()),
    (c, v_other,  'lockorder-cccc-01', 100, 10, 10, 'image/webp', now(), now());

  v_body := '![1](note-image:' || a || ')![2](note-image:' || b || ')![3](note-image:' || c || ')';

  BEGIN
    PERFORM public.community_note_images_assert(
      '11111111-0000-4000-8000-000000000001'::uuid, v_author, v_body);
    v_msg := '(no error — unexpected)';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM; END;

  INSERT INTO r VALUES (1,'the id named by the refusal',
    CASE WHEN v_msg LIKE '%'||c::text||'%' THEN 'C (id order)'
         WHEN v_msg LIKE '%'||a::text||'%' THEN 'A (body order)'
         ELSE v_msg END,
    'C (id order)');
END $t$;

-- ── 2. the display set still follows the body ────────────────────────
-- Same id-vs-body mismatch. The note itself carries no images, so the submission guards have nothing
-- to object to; `bind` is then called directly with the image-bearing body, which isolates ordering
-- from every other rule the write path enforces. A `handout` anchor is used because the
-- `community_notes_binding_by_anchor_type` CHECK requires source_fingerprint + content_hash for a
-- `question` anchor and forbids both for a `handout` one.
DO $t$
DECLARE
  a uuid := '0000000a-0000-4000-8000-000000000002';
  b uuid := '0000000b-0000-4000-8000-000000000002';
  c uuid := '00000001-0000-4000-8000-000000000002';
  v_author uuid; v_note uuid; v_body text; v_order text;
BEGIN
  SELECT id INTO v_author FROM auth.users ORDER BY created_at LIMIT 1;

  INSERT INTO public.community_note_images
    (id, uploader_id, idempotency_key, byte_length, width, height, format, image_ack_at, created_at)
  VALUES
    (a, v_author, 'disporder-aaaa-02', 100, 10, 10, 'image/webp', now(), now()),
    (b, v_author, 'disporder-bbbb-02', 100, 10, 10, 'image/webp', now(), now()),
    (c, v_author, 'disporder-cccc-02', 100, 10, 10, 'image/webp', now(), now());

  INSERT INTO public.community_notes (author_id, anchor_type, anchor_id, body, license_ack)
  VALUES (v_author, 'handout', 'test-display-order', 'no images here', true)
  RETURNING id INTO v_note;

  v_body := '![1](note-image:' || a || ')![2](note-image:' || b || ')![3](note-image:' || c || ')';
  PERFORM public.community_note_images_bind(v_note, v_body);

  SELECT string_agg(
           CASE image_id WHEN a THEN 'A' WHEN b THEN 'B' WHEN c THEN 'C' ELSE '?' END,
           '' ORDER BY position)
    INTO v_order
    FROM public.community_note_image_display WHERE note_id = v_note;

  INSERT INTO r VALUES (2,'display order follows the body', COALESCE(v_order,'(none)'), 'ABC');
  INSERT INTO r VALUES (3,'all three images are displayed',
    (SELECT count(*)::text FROM public.community_note_image_display WHERE note_id = v_note), '3');
  INSERT INTO r VALUES (4,'ownership was acquired for all three',
    (SELECT count(*)::text FROM public.community_note_image_owners WHERE note_id = v_note), '3');
END $t$;

-- ── 3. the sweep's half of the lock order ────────────────────────────
-- Structural rather than behavioural: `claim_expired` locks its candidate set in id order, which is
-- what test 1's ordering has to agree with. The header used to claim this check existed elsewhere;
-- it now exists here.
INSERT INTO r
SELECT 5, 'claim_expired locks ORDER BY i.id',
       (pg_get_functiondef('public.community_note_images_claim_expired(int)'::regprocedure)
          LIKE '%ORDER BY i.id%')::text,
       'true';

INSERT INTO r
SELECT 6, 'claim_expired writes the tombstone',
       (pg_get_functiondef('public.community_note_images_claim_expired(int)'::regprocedure)
          LIKE '%community_note_image_reclaimed%')::text,
       'true';

SELECT case_name, got, want, CASE WHEN got = want THEN 'ok' ELSE 'FAIL' END AS verdict
  FROM r ORDER BY ord;

-- The gate. Without this the SELECT above is a report, not a test: `supabase db query` exits 0 no
-- matter what it printed.
DO $gate$
DECLARE v_failed text;
BEGIN
  SELECT string_agg(format('%s (got %L, want %L)', case_name, got, want), '; ' ORDER BY ord)
    INTO v_failed FROM r WHERE got IS DISTINCT FROM want;
  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION '0032 tests FAILED: %', v_failed;
  END IF;
END
$gate$;

ROLLBACK;
