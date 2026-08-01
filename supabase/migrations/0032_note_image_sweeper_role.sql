-- 0032_note_image_sweeper_role.sql
--
-- Change `sweep-abandoned-note-image-uploads` (study-rpg-2nd), follow-up to 0029/0030.
--
-- `community_note_images_claim_expired` has existed since 0029 and has never run. 0030 removed the
-- service_role key from the Worker, so the only caller it could have had was the project's owner by
-- hand — which means nobody. Every abandoned upload has therefore been retained since the feature
-- shipped, and the count only goes up.
--
-- This migration gives it a caller that is safe to give it. Three things change.
--
-- ── 1. A ROLE THAT CAN DO THIS AND NOTHING ELSE ───────────────────────────────
--
-- The obvious move — hand the Worker a service_role key again — was proposed, costed and rejected.
-- 0030's own opening says why: that key "bypasses RLS on the entire project", and the reach is not
-- limited to this capability's tables. 0001 enables RLS on eight player tables and does not revoke
-- service_role from them, so a service key reads and writes every player's save. Storage and the
-- Auth admin surface answer to it too. A nightly cleanup job needs none of that.
--
-- So `note_image_sweeper` is created holding EXECUTE on exactly two functions and no privilege on
-- any table or sequence. `claim_expired`'s grant to service_role is dropped in the same breath —
-- after this nothing needs it, and leaving it would preserve the reach this change exists to avoid.
--
-- ── 2. RECLAMATION BECOMES TWO-PHASE ──────────────────────────────────────────
--
-- The 0029 function committed the row deletion and THEN returned the identity, so a caller that died
-- in between left bytes with nothing pointing at them. 0029 itself names that as the worse
-- direction: bytes without a row are invisible garbage, a row without bytes merely unreachable.
-- With no caller that was theoretical. With a nightly one it would be a recurring exposure.
--
-- Now one transaction deletes the row AND writes a tombstone. The caller deletes the bytes, then
-- calls `confirm_reclaimed` to drop the tombstone. A run also re-emits tombstones older than an
-- hour, so whatever a previous run failed to finish is picked up by the next one. Bytes may be
-- deleted twice, which R2 treats as a no-op; a tombstone disappears only after its bytes are gone.
--
-- ⚠️ That invariant holds because the CALLER calls these in order and confirms only what it actually
-- deleted. This database cannot verify it — whether an object still exists in R2 is not observable
-- from here. A credential that called claim and then confirm without touching R2 would forget those
-- bytes for good. That is a defect to test for, not an accepted mode, and it is the reason the
-- credential above is scoped as tightly as it is.
--
-- ── 3. ONE LOCK ORDER INSTEAD OF TWO ──────────────────────────────────────────
--
-- 0029's sweep locked candidates in `created_at` order while `community_note_images_assert` locks a
-- submission's references in document order. Two acquisition orders over one table is a deadlock
-- cycle, and Postgres would resolve it by aborting a victim that could be the user's submission.
-- Both now climb in id order: the sweep selects by age without locking and then locks the id set
-- `ORDER BY id`, and `_assert` iterates a SORTED COPY of its references.
--
-- ⚠️ `community_note_images_bind` is deliberately NOT touched. Its second FOREACH writes
-- `community_note_image_display.position` from a counter over `v_refs`, and `v_refs` is in document
-- order by design — sorting it would reorder the images of every note holding more than one. `bind`
-- takes no row locks on `community_note_images`, so it is not part of the cycle.
--
-- One visible consequence, small but real: when a submission references two images that both fail
-- validation, which one `_assert` names in its error can now differ, because it visits them in id
-- order. The "at most 3" and "referenced only once" checks run before the loop and are unaffected.
--
-- ── APPLYING ──────────────────────────────────────────────────────────────────
--
-- ⚠️ The three function bodies restated below were taken from the repo's 0029, NOT from
-- `pg_get_functiondef()` against production. 0031's D12 requires the latter, because migration
-- history stopped at 0019 and everything since has been applied out of band, so the repo is evidence
-- and not proof. RE-CHECK ALL THREE AGAINST PRODUCTION BEFORE APPLYING, and reconcile any drift.
--
-- Rehearse inside BEGIN … ROLLBACK first, then apply with `supabase db query --linked -f`.
-- NEVER `supabase db push` — it would replay 0021.

BEGIN;

-- =====================================================================
-- §1  THE TOMBSTONE
-- =====================================================================

-- `image_id` is deliberately NOT a foreign key, for the same reason 0029 gives for the upload
-- ledger and one more that is decisive here: this row is written in the very transaction that
-- deletes the `community_note_images` row it names, so a reference could not commit under any
-- ordering. RESTRICT would block the delete, CASCADE would remove the tombstone along with it, SET
-- NULL would erase which object it was. The record has to survive the row it names — that is the
-- whole job.
CREATE TABLE IF NOT EXISTS public.community_note_image_reclaimed (
  image_id     UUID PRIMARY KEY,
  reclaimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_note_image_reclaimed IS
  'An object whose record has been deleted but whose stored bytes have not. Written in the same '
  'transaction as the deletion; removed by community_note_images_confirm_reclaimed once the caller '
  'has deleted the bytes. A row older than the re-emission window means byte deletion is failing.';

-- Ordering the re-emission scan; the table is expected to be near-empty in steady state.
CREATE INDEX IF NOT EXISTS community_note_image_reclaimed_reclaimed_at_idx
  ON public.community_note_image_reclaimed (reclaimed_at);

ALTER TABLE public.community_note_image_reclaimed ENABLE ROW LEVEL SECURITY;

-- No policies, and no privileges for anyone. Every access goes through the two SECURITY DEFINER
-- functions below — the same stance 0029 takes for the other four tables.
REVOKE ALL ON TABLE public.community_note_image_reclaimed
  FROM PUBLIC, anon, authenticated, service_role;

-- =====================================================================
-- §2  RECLAMATION, TWO-PHASE
-- =====================================================================

-- Returns the identities whose bytes the caller must now delete: rows it just deleted, plus
-- tombstones an earlier run left unconfirmed. The caller deletes the bytes and then calls
-- `confirm_reclaimed` with ONLY the identities whose deletion succeeded.
--
-- Being owned, not being displayed, is still what this tests. An object whose reference was edited
-- away, whose note was taken down, or whose note was deleted has still been owned and is retained.
CREATE OR REPLACE FUNCTION public.community_note_images_claim_expired(
  p_limit INT DEFAULT 100)
RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_limit   INT := GREATEST(COALESCE(p_limit, 100), 0);
  v_stale   UUID[];
  v_ids     UUID[];
  v_claimed UUID[];
BEGIN
  -- A sweep blocked behind a long submission should end its run, not consume the caller's whole
  -- invocation budget waiting. The candidates are still there next time.
  SET LOCAL lock_timeout = '3s';

  -- Unfinished business first: whatever a previous run deleted but never confirmed. These rows are
  -- already gone from community_note_images, so nothing here needs locking.
  SELECT COALESCE(array_agg(r.image_id), '{}'::UUID[]) INTO v_stale
    FROM (
      SELECT image_id
        FROM public.community_note_image_reclaimed
       WHERE reclaimed_at < now() - INTERVAL '1 hour'
       ORDER BY reclaimed_at
       LIMIT v_limit
    ) r;

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

  -- Locked in canonical id order, which `community_note_images_assert` now also uses. FOR UPDATE
  -- and NOT skip-locked, exactly as before: a candidate locked by a submission in flight must be
  -- waited for and then re-tested, not stepped over and deleted.
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

-- Drops the tombstones the caller has finished with. Returns how many it removed, so a caller that
-- confirms an identity twice — which the re-emission window makes possible — can tell.
--
-- ⚠️ Call this ONLY with identities whose bytes were actually deleted. Confirming an identity whose
-- bytes are still stored forgets them permanently: after this, nothing anywhere records that the
-- object exists.
CREATE OR REPLACE FUNCTION public.community_note_images_confirm_reclaimed(
  p_ids UUID[])
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_removed INT;
BEGIN
  DELETE FROM public.community_note_image_reclaimed
   WHERE image_id = ANY (COALESCE(p_ids, '{}'::UUID[]));
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$fn$;

-- =====================================================================
-- §3  ONE LOCK ORDER
-- =====================================================================

-- Restated from 0029 §5.1 with ONE change: the FOR UPDATE loop iterates `v_lock_refs`, a sorted
-- copy, so this path and the sweep acquire image row locks in the same order. Every check, every
-- error, every ERRCODE is otherwise unchanged.
--
-- The two checks above the loop read `v_refs` and are order-independent: "at most 3" counts
-- occurrences and the duplicate check groups them.
CREATE OR REPLACE FUNCTION public.community_note_images_assert(
  p_note_id UUID, p_author UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_refs      UUID[];
  v_lock_refs UUID[];
  v_id        UUID;
  v_uploader  UUID;
  v_owner     UUID;
  v_found     BOOLEAN;
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

  -- Sorted for LOCKING ONLY. Body order is not discarded — `v_refs` keeps it, and
  -- `community_note_images_bind` derives the display set from its own document-order read. The one
  -- consequence: when two references both fail, which is reported first can differ.
  SELECT COALESCE(array_agg(r ORDER BY r), '{}'::UUID[]) INTO v_lock_refs
    FROM unnest(COALESCE(v_refs, '{}'::UUID[])) AS r;

  FOREACH v_id IN ARRAY v_lock_refs LOOP
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

-- =====================================================================
-- §4  THE ROLE, AND THE GRANT THAT GOES AWAY
-- =====================================================================

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'note_image_sweeper') THEN
    CREATE ROLE note_image_sweeper NOLOGIN;
  END IF;
END
$do$;

-- PostgREST has to resolve the function; that is the only reason for USAGE, and it carries no
-- privilege on any object in the schema.
GRANT USAGE ON SCHEMA public TO note_image_sweeper;

-- Listed one by one on purpose, matching 0021's note about REVOKE ALL ON ALL FUNCTIONS. This is
-- also where `claim_expired` stops being reachable by service_role.
REVOKE ALL ON FUNCTION
  public.community_note_images_claim_expired(INT),
  public.community_note_images_confirm_reclaimed(UUID[])
  FROM PUBLIC, anon, authenticated, service_role, note_image_sweeper;

GRANT EXECUTE ON FUNCTION
  public.community_note_images_claim_expired(INT),
  public.community_note_images_confirm_reclaimed(UUID[])
  TO note_image_sweeper;

-- Belt and braces: a role created after Supabase's ALTER DEFAULT PRIVILEGES inherits nothing, but
-- this table is the one thing the sweeper must never read or write directly.
REVOKE ALL ON TABLE public.community_note_image_reclaimed FROM note_image_sweeper;

-- ── How the Worker presents this role ────────────────────────────────
-- Rotating this role's password, stopping the sweep, or running a reclamation by hand:
-- `cloudflare/sync-worker/NOTE_IMAGE_SWEEPER_RUNBOOK.md` in the same repo. It also records that
-- the dashboard's "Reset database password" is the WRONG button — that resets `postgres` and does
-- nothing to this role.
-- PATH A, decided 2026-07-31 after checking the project's JWT settings: the current signing key is
-- ECC (P-256) and the legacy HS256 shared secret is listed under "previously used keys", retained
-- only to verify tokens that have not yet expired and flagged for revocation once they have. A
-- PostgREST route would have meant minting a token against that key — working today and failing
-- silently on the day it is revoked, with nothing recording why. So the Worker connects instead.
--
-- ⚠️ Run this SEPARATELY, not as part of this file, so the password never lands in a migration that
-- gets committed. Set it out of band and put the resulting connection string in the Worker secret
-- `NOTE_IMAGE_SWEEPER_DATABASE_URL`:
--
--   ALTER ROLE note_image_sweeper LOGIN PASSWORD '<generated, stored only in the Worker secret>';
--
-- The connection goes through Supavisor in TRANSACTION mode, as `note_image_sweeper.<project_ref>`.
-- The client sets `prepare: false` accordingly.
--
-- NOT TAKEN — a pre-minted JWT carrying `role: note_image_sweeper`, which would have needed
-- `GRANT note_image_sweeper TO authenticator`. Recorded so it is not re-proposed: it costs no
-- dependency, and it is the reason this role must NOT be granted to `authenticator` — doing so
-- would make the role reachable by anything that can present a token for it.

COMMENT ON FUNCTION public.community_note_images_claim_expired(INT) IS
  'Deletes rows for objects no note has EVER owned, writes a tombstone for each in the same '
  'transaction, and returns those identities plus any tombstone an earlier run left unconfirmed, so '
  'the caller can delete the bytes. Being owned, not being displayed, is what it tests.';

COMMENT ON FUNCTION public.community_note_images_confirm_reclaimed(UUID[]) IS
  'Drops tombstones whose bytes the caller has deleted. MUST be called only with identities whose '
  'byte deletion actually succeeded — confirming an object whose bytes remain forgets them for good, '
  'and this database cannot tell the difference.';

COMMIT;

-- ── Verification, to run after applying ──────────────────────────────
-- Rehearsed against production inside BEGIN … ROLLBACK on 2026-07-31; every check below passed.
--
-- ⚠️ Use `OFFSET 0` as an optimisation fence on these scans. Without it the planner may apply
-- has_*_privilege() to rows the relkind filter was meant to exclude, and the scan dies with
-- `42809: "saml_providers_pkey" is not a sequence` on the first index it happens to reach.
--
--   SELECT count(*) FROM (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--                          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') OFFSET 0) t
--    WHERE has_table_privilege('note_image_sweeper', t.oid,
--          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
--   -- rehearsed: 0. Same shape with has_sequence_privilege over relkind='S': also 0.
--
--   SELECT string_agg(proname, ', ' ORDER BY proname)
--     FROM (SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--            WHERE n.nspname='public' OFFSET 0) f
--    WHERE has_function_privilege('note_image_sweeper', f.oid, 'EXECUTE');
--   -- rehearsed: NINE, not two. claim_expired and confirm_reclaimed by the grants above, plus
--   -- delete_my_account, delete_my_data, export_my_data, enforce_lww, upsert_lww and two
--   -- set_*_updated_at triggers — all of which are granted to PUBLIC, so every role has them.
--   -- `anon` and `authenticated` were checked and hold the same seven. The role is therefore no
--   -- more able than an anonymous caller, which is the property to assert; "exactly two" is not.
--
--   SELECT has_function_privilege('service_role',
--            'public.community_note_images_claim_expired(int)','EXECUTE');
--   -- rehearsed: false. The REVOKE above lands.
--
-- Functional rehearsal, with a seeded 48-hour-old unowned row and an equally old OWNED row:
--   claim returned exactly the unowned one; the owned one was untouched; a tombstone naming it was
--   written in the same transaction (so no FK problem exists — there is no FK); a second claim inside
--   the grace window returned nothing; backdating the tombstone by 2 hours re-emitted it; confirm
--   removed it and left the table empty.
