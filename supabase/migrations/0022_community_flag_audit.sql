-- =====================================================================
-- 0022_community_flag_audit.sql
-- An append-only trail of every write to public.community_flags.
--
-- Why: on 2026-07-28 the community-notes flags were found already enabled in
-- production, and nobody could say when or by whom. The migration seeds them
-- FALSE/FALSE (0021), task 7.5 had verified the surface was dark hours earlier,
-- and no record of the change existed anywhere — not in git, not in
-- community_review_runs, not in any log the app repo can read. The kill switch
-- is the only rollback for a public UGC surface carrying a moderation
-- obligation, so a silent flip of it is exactly the event that must not be
-- silent.
--
-- WHAT THIS CANNOT DO. It does not identify a person. Every write path to
-- community_flags is privileged and carries no JWT — the dashboard SQL editor,
-- `supabase db query --linked`, and service_role all arrive with auth.uid()
-- NULL, and no client role holds UPDATE on the table at all (0021 §2.8 grants
-- SELECT and nothing else). What is captured is the identity of the CONNECTION:
-- role, client address, application_name, backend pid, and the time. That would
-- have answered "when, and from what" for the 07-28 incident; it would not have
-- answered "who". Do not let this table's existence stand in for an access
-- review.
--
-- Apply by pasting into the Supabase dashboard SQL editor, or via
-- `supabase db query --linked`. Additive and reversible: the rollback is
-- `DROP TRIGGER community_flags_audit ON public.community_flags;` — which is
-- itself unaudited, and there is no fixing that from inside the database.
--
-- Governing spec: `openspec/specs/community-notes/spec.md` in study-rpg-2nd.
-- =====================================================================

-- ── 1. the trail ─────────────────────────────────────────────────────
-- old_row / new_row are jsonb rather than mirrored boolean columns so that a
-- later column on community_flags is captured without touching this table or
-- its trigger. `feature` is lifted out as a scalar because it is the only thing
-- anyone filters on.
--
-- There is deliberately NO foreign key to community_flags and NO check
-- constraint anywhere below. See §3 for why that is load-bearing rather than
-- laziness.
CREATE TABLE IF NOT EXISTS public.community_flag_audit (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  feature      TEXT,
  op           TEXT,
  old_row      JSONB,
  new_row      JSONB,
  db_role      TEXT,
  session_role TEXT,
  jwt_sub      TEXT,
  client_addr  INET,
  app_name     TEXT,
  backend_pid  INTEGER,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_flag_audit_feature_time
  ON public.community_flag_audit (feature, changed_at DESC);

-- ── 2. authorization ─────────────────────────────────────────────────
-- Same shape as every other non-public table in 0021: RLS on, no client policy,
-- and EXECUTE/DML revoked from the three roles BY NAME. Revoking from PUBLIC
-- alone does not work here — Supabase's ALTER DEFAULT PRIVILEGES grants to
-- anon, authenticated and service_role by name, and a PUBLIC revoke leaves
-- those named grants standing (0021 §2.10 found 10 of 11 functions reachable by
-- anon that way).
--
-- The owner reads this table as a superuser through the dashboard or the CLI,
-- which bypasses RLS. No reader function is provided: adding one would widen
-- the surface to buy nothing the owner does not already have.
ALTER TABLE public.community_flag_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_flag_audit FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. the trigger ───────────────────────────────────────────────────
-- SECURITY DEFINER because §2 leaves nobody with INSERT: the function's owner
-- is the only writer, which is also what makes the trail append-only in
-- practice — a role that can change a flag cannot edit the record of it.
--
-- NOTHING IN THIS FUNCTION MAY RAISE. An AFTER trigger that throws aborts the
-- statement that fired it, and the statement that fires this one is the kill
-- switch: the emergency control for a surface that can carry PHI or third-party
-- copyright. Blocking a takedown-driven flag flip because an audit insert
-- failed is a worse outcome than an unaudited flip. So the failure modes are
-- removed by construction rather than swallowed (swallowing would put us back
-- where we started, with a silent write):
--
--   * no foreign key to community_flags, so a flag row can be deleted;
--   * no check constraints and no NOT NULL except the defaulted changed_at;
--   * to_jsonb(record) cannot fail;
--   * current_setting(..., true) returns NULL for a missing setting instead of
--     raising, and jwt_sub is stored as TEXT rather than cast to UUID — a cast
--     is the one thing here that could have thrown, on a malformed claim;
--   * inet_client_addr() is NULL on a local socket rather than an error.
--
-- What remains is disk-full, which fails the flag write anyway.
CREATE OR REPLACE FUNCTION public.community_flags_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  INSERT INTO public.community_flag_audit (
    feature, op, old_row, new_row,
    db_role, session_role, jwt_sub, client_addr, app_name, backend_pid
  ) VALUES (
    COALESCE(NEW.feature, OLD.feature),
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    current_user,
    session_user,
    current_setting('request.jwt.claim.sub', true),
    inet_client_addr(),
    current_setting('application_name', true),
    pg_backend_pid()
  );
  RETURN NULL;  -- AFTER trigger; the return value is discarded
END;
$fn$;

REVOKE ALL ON FUNCTION public.community_flags_audit()
  FROM PUBLIC, anon, authenticated, service_role;

-- FOR EACH ROW on all three verbs. A no-op UPDATE that sets a flag to the value
-- it already holds is recorded too: "someone touched this and changed nothing"
-- is a fact worth having, and old_row/new_row make it self-evident.
DROP TRIGGER IF EXISTS community_flags_audit ON public.community_flags;
CREATE TRIGGER community_flags_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.community_flags
  FOR EACH ROW EXECUTE FUNCTION public.community_flags_audit();

-- ── 4. the gap this cannot close ─────────────────────────────────────
-- The trail starts empty and says nothing about the state before it existed.
-- One row is seeded to mark the boundary, so a future reader does not mistake
-- "no rows before this date" for "no changes before this date". It is written
-- through a plain INSERT rather than the trigger, and its NULL old_row/new_row
-- is what distinguishes it from a real flag write.
INSERT INTO public.community_flag_audit (feature, op, db_role, session_role, app_name)
VALUES ('community_notes', 'AUDIT_START', current_user, session_user,
        'flags enabled before this point are unattributable; see 0022 header');
