-- Tests for migration 0033 — the two bounds it added to the note-image sweep.
--
-- Run from the `study-rpg-2nd` directory (that is where the Supabase project link lives):
--
--   supabase db query --linked -f ../study-rpg/supabase/tests/0033_sweep_bounds.sql
--
-- Everything is inside BEGIN … ROLLBACK, and the file RAISES if any assertion fails, so a failing
-- run exits non-zero rather than printing a FAIL column nobody reads.
--
-- WHY A SECOND FILE. `0033_note_image_sweep_bounds.sql` fixes two defects that only appear under
-- stress: retries starving new reclamation, and a batch limit that existed only in the caller.
-- Neither is visible to `0032_lock_order_and_display_order.sql`, which asserts 0032's structural
-- properties. Without what follows, anyone who later removed `LEAST(…, 500)` or changed the share
-- arithmetic would see every durable gate in this project stay green — which is precisely the
-- failure mode 0032 was written to avoid, reintroduced one migration later.

BEGIN;

CREATE TEMP TABLE r(ord int, check_name text, got text, want text);

-- ── structural: the bounds are in the function at all ────────────────
INSERT INTO r SELECT 1, 'p_limit is clamped to 500',
  (pg_get_functiondef('public.community_note_images_claim_expired(int)'::regprocedure)
     LIKE '%LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500)%')::text, 'true';

INSERT INTO r SELECT 2, 'retries are ordered by last_attempted_at, NULLs first',
  (pg_get_functiondef('public.community_note_images_claim_expired(int)'::regprocedure)
     LIKE '%ORDER BY last_attempted_at NULLS FIRST%')::text, 'true';

-- ── behavioural ──────────────────────────────────────────────────────
DO $t$
DECLARE
  v_author uuid;
  v_eligible uuid := 'ffffffff-0000-4000-8000-00000000ba01';
  v_a int; v_b int;
BEGIN
  SELECT id INTO v_author FROM auth.users ORDER BY created_at LIMIT 1;

  -- 200 never-attempted tombstones, all past the re-emission window.
  INSERT INTO public.community_note_image_reclaimed (image_id, reclaimed_at)
  SELECT gen_random_uuid(), now() - interval '2 hours' FROM generate_series(1,200);

  -- One genuinely reclaimable object, so starvation is testable rather than assumed.
  INSERT INTO public.community_note_images
    (id, uploader_id, idempotency_key, byte_length, width, height, format, image_ack_at, created_at)
  VALUES (v_eligible, v_author, 'bounds-eligible-t01', 100, 10, 10, 'image/webp',
          now() - interval '48 hours', now() - interval '48 hours');

  -- An oversized limit. Unclamped the retry share would be 249,999 and all 200 would be stamped;
  -- clamped to 500 it is 125. This number is reachable by no other path — there is no other LIMIT
  -- on the retry query — so it is a behavioural proof that the clamp is live.
  PERFORM public.community_note_images_claim_expired(999999);
  SELECT count(*) INTO v_a FROM public.community_note_image_reclaimed
   WHERE last_attempted_at IS NOT NULL;
  INSERT INTO r VALUES (3, 'retry share under an oversized limit', v_a::text, '125');

  -- The defect this migration exists for: 200 failing retries must not stop new work.
  INSERT INTO r VALUES (4, 'new work is reclaimed despite 200 pending retries',
    (NOT EXISTS(SELECT 1 FROM public.community_note_images WHERE id = v_eligible))::text, 'true');

  -- Rotation: NULLs sort ahead of anything stamped, so a second call reaches the remainder.
  PERFORM public.community_note_images_claim_expired(999999);
  SELECT count(*) INTO v_b FROM public.community_note_image_reclaimed
   WHERE last_attempted_at IS NOT NULL;
  INSERT INTO r VALUES (5, 'a second call reaches what the first did not', v_b::text, '200');

  -- The share at the limit the Worker actually passes.
  UPDATE public.community_note_image_reclaimed SET last_attempted_at = NULL;
  PERFORM public.community_note_images_claim_expired(25);
  SELECT count(*) INTO v_a FROM public.community_note_image_reclaimed
   WHERE last_attempted_at IS NOT NULL;
  INSERT INTO r VALUES (6, 'retry share at the Worker batch size of 25', v_a::text, '6');

  -- One slot: new work takes it outright, or the starvation returns at a smaller scale.
  UPDATE public.community_note_image_reclaimed SET last_attempted_at = NULL;
  PERFORM public.community_note_images_claim_expired(1);
  SELECT count(*) INTO v_a FROM public.community_note_image_reclaimed
   WHERE last_attempted_at IS NOT NULL;
  INSERT INTO r VALUES (7, 'retry share when only one slot exists', v_a::text, '0');
END $t$;

SELECT check_name, got, want, CASE WHEN got = want THEN 'ok' ELSE 'FAIL' END AS verdict
  FROM r ORDER BY ord;

-- The gate. Without this the SELECT above is a report, not a test.
DO $gate$
DECLARE v_failed text;
BEGIN
  SELECT string_agg(format('%s (got %L, want %L)', check_name, got, want), '; ' ORDER BY ord)
    INTO v_failed FROM r WHERE got IS DISTINCT FROM want;
  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION '0033 tests FAILED: %', v_failed;
  END IF;
END
$gate$;

ROLLBACK;
