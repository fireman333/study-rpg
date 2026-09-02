-- 0033_note_image_sweep_bounds.sql
--
-- Change `sweep-abandoned-note-image-uploads` (study-rpg-2nd), follow-up to 0032.
--
-- Two defects in 0032, both found by adversarial review of the applied migration rather than by
-- anything failing. Neither has fired in production; both are shapes that would fire under stress,
-- and one of them makes a written guarantee false today.
--
-- ── 1. RETRIES COULD STARVE THE WORK THEY EXIST TO SUPPORT ────────────────────
--
-- 0032's `claim_expired` handed back up to `p_limit` stale tombstones FIRST and gave new claims only
-- whatever remained, and it never touched `reclaimed_at` on a retry. So with at least `p_limit`
-- tombstones whose R2 deletion keeps failing, every run returns the same batch, the remainder is
-- zero, and no abandoned upload is ever reclaimed again — permanently. It needs sustained R2 delete
-- failures to happen, which would be their own incident, but a retry mechanism that can starve the
-- primary work is a real flaw and not one worth leaving armed.
--
-- Two changes fix it, and they fix different halves:
--
--   * Retries may take at most a quarter of a batch, and never the last slot — so new claims always
--     have room. A share rather than a fixed count, so it scales with whatever limit is passed.
--     (Pedantically the quarter is a floor-to-at-least-one, so at limits of 2 and 3 the share is a
--     half and a third. "Never the last slot" still holds, which is the property that matters, and
--     no caller passes those.)
--   * `last_attempted_at` records when a tombstone was last handed out, and re-emission orders by it
--     with NULLs first. A batch that keeps failing rotates to the back instead of monopolising its
--     own share for ever, and a tombstone written just now — which has never been attempted — is
--     always ahead of one that has.
--
-- ── 2. THE BLAST-RADIUS BOUND EXISTED ONLY IN THE CALLER ──────────────────────
--
-- `claim_expired` accepted any `p_limit`. The Worker's 25-per-batch, 20-batches-per-run arithmetic
-- was a convention of a well-behaved caller, not a bound — anyone holding the sweeper credential
-- could pass a huge value and take the entire eligible backlog in one call. The design document
-- claimed that cap as a deliberate limit on what one unattended run could do, so that document was
-- stating a guarantee the database did not enforce. It does now: `LEAST(…, 500)`.
--
-- ⚠️ Everything else about 0032 survived review with citations and is deliberately NOT touched here:
-- `ORDER BY i.id … FOR UPDATE` does give a consistent lock order; the unlocked candidate selection's
-- TOCTOU is closed by the post-lock ownership re-test plus the ownership FK's `ON DELETE RESTRICT`;
-- the data-modifying CTE runs its INSERT exactly once even though nothing reads it; `SET LOCAL`
-- behaves inside `SECURITY DEFINER` and does not leak across a pooled connection.
--
-- Rehearse inside BEGIN … ROLLBACK, then apply with `supabase db query --linked -f` from the
-- `study-rpg-2nd` directory. NEVER `supabase db push` — history stopped at 0019.

BEGIN;

-- ── §1  when a tombstone was last handed to a caller ──────────────────
-- NULL means "never attempted", which sorts first: an object whose bytes have not been tried once
-- should be reached before one that has already failed.
ALTER TABLE public.community_note_image_reclaimed
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.community_note_image_reclaimed.last_attempted_at IS
  'When this tombstone was last emitted to a caller for byte deletion. NULL = never attempted, and '
  'sorts first. Re-emission orders by this so a batch that keeps failing rotates to the back instead '
  'of monopolising the retry share every run.';

-- Schema-qualified deliberately: unqualified, this resolves through search_path, and under any
-- application path whose search_path lacks `public` the `IF EXISTS` would silently do nothing and
-- leave both indexes behind without an error. Every other reference in this file is qualified.
DROP INDEX IF EXISTS public.community_note_image_reclaimed_reclaimed_at_idx;
CREATE INDEX IF NOT EXISTS community_note_image_reclaimed_retry_idx
  ON public.community_note_image_reclaimed (last_attempted_at NULLS FIRST, reclaimed_at);

-- ── §2  claim_expired, bounded and fair ──────────────────────────────
CREATE OR REPLACE FUNCTION public.community_note_images_claim_expired(
  p_limit INT DEFAULT 100)
RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_limit     INT;
  v_stale_cap INT;
  v_stale     UUID[];
  v_ids       UUID[];
  v_claimed   UUID[];
BEGIN
  -- A sweep blocked behind a long submission should end its run, not consume the caller's whole
  -- invocation budget waiting. The candidates are still there next time.
  SET LOCAL lock_timeout = '3s';

  -- The caller's batch arithmetic is a convention; this is the bound. 500 is the largest number of
  -- objects one unattended run is permitted to reclaim.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500);

  -- Retries get at most a quarter, and never the last slot — so new claims always have room even
  -- when every tombstone in the table is failing. At v_limit = 1 the retry share is 0 by
  -- construction: with one slot, new work wins. (The quarter floors to at least one, so at 2 and 3
  -- the share is really a half and a third; the invariant that matters is the last slot.)
  v_stale_cap := LEAST(GREATEST(v_limit / 4, 1), GREATEST(v_limit - 1, 0));

  -- Unfinished business first, but only up to that share. These rows are already gone from
  -- community_note_images, so nothing here needs locking. Stamping them is what makes the order
  -- rotate: whatever is handed out now goes to the back of the queue.
  WITH due AS (
    SELECT image_id
      FROM public.community_note_image_reclaimed
     WHERE reclaimed_at < now() - INTERVAL '1 hour'
     ORDER BY last_attempted_at NULLS FIRST, reclaimed_at
     LIMIT v_stale_cap
  ), stamped AS (
    UPDATE public.community_note_image_reclaimed t
       SET last_attempted_at = now()
      FROM due
     WHERE t.image_id = due.image_id
    RETURNING t.image_id
  )
  SELECT COALESCE(array_agg(image_id), '{}'::UUID[]) INTO v_stale FROM stamped;

  -- Candidates are chosen by age but NOT locked here: locking in `created_at` order is what put
  -- this function on the wrong side of a deadlock cycle with the submission path.
  SELECT COALESCE(array_agg(t.id), '{}'::UUID[]) INTO v_ids
    FROM (
      SELECT i.id
        FROM public.community_note_images i
       WHERE i.created_at < now() - INTERVAL '24 hours'
         AND NOT EXISTS (SELECT 1 FROM public.community_note_image_owners o
                          WHERE o.image_id = i.id)
       ORDER BY i.created_at
       LIMIT GREATEST(v_limit - COALESCE(array_length(v_stale, 1), 0), 0)
    ) t;

  -- Locked in canonical id order, which `community_note_images_assert` also uses. FOR UPDATE and
  -- NOT skip-locked, exactly as before: a candidate locked by a submission in flight must be waited
  -- for and then re-tested, not stepped over and deleted.
  PERFORM 1
     FROM public.community_note_images i
    WHERE i.id = ANY (v_ids)
    ORDER BY i.id
      FOR UPDATE;

  -- Re-tested after the lock, because ownership may have been acquired while this transaction
  -- waited. The FK from the ownership table is the third line of defence: it REFUSES the delete
  -- outright. The tombstone is written in the same statement, so there is no instant at which the
  -- row is gone and nothing records that its bytes remain.
  WITH deleted AS (
    DELETE FROM public.community_note_images i
     WHERE i.id = ANY (v_ids)
       AND NOT EXISTS (SELECT 1 FROM public.community_note_image_owners o
                        WHERE o.image_id = i.id)
    RETURNING i.id
  ), tombstoned AS (
    INSERT INTO public.community_note_image_reclaimed (image_id)
    SELECT id FROM deleted
    ON CONFLICT (image_id) DO NOTHING
  )
  SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_claimed FROM deleted;

  RETURN QUERY SELECT * FROM unnest(v_stale || v_claimed);
END;
$fn$;

COMMENT ON FUNCTION public.community_note_images_claim_expired(INT) IS
  'Deletes rows for objects no note has EVER owned, writes a tombstone for each in the same '
  'transaction, and returns those identities plus a bounded share of tombstones an earlier run left '
  'unconfirmed, so the caller can delete the bytes. Being owned, not being displayed, is what it '
  'tests. p_limit is clamped to 500; retries take at most a quarter of a batch and never the last '
  'slot, so failing retries cannot starve new reclamation.';

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────
-- `supabase/tests/0033_sweep_bounds.sql`, which raises on mismatch. It covers the four behaviours
-- this migration introduces — the clamp, the retry share, rotation, and `last_attempted_at` — none
-- of which the 0032 test file touches.
--
-- ⚠️ That distinction is the whole point of writing a second file rather than trusting the first.
-- An earlier draft of this comment claimed the 0032 tests covered these, and they do not: they
-- assert 0032's structural properties only. Anyone who later changed `LEAST(…, 500)` or the share
-- arithmetic would have seen every durable gate in this project stay green.
