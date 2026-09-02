-- Tests for migration 0034 — default-deny EXECUTE on the six legacy functions.
--
-- ⚠️ IT WAS SEVEN UNTIL 0035. `enforce_lww()` was the seventh; it and the five prototype tables it
-- served were retired by change `retire-orphan-prototype-schema`. Its assertions are not disabled
-- here, they are DELETED, together with the `__g34_lww` probe that exercised it. A tolerance flag
-- would not have covered that probe — and `::regprocedure` raises on an absent function before any
-- privilege is evaluated, so leaving the name in would turn this whole gate red for a reason that
-- has nothing to do with what it guards. 0034:88 still revokes on it and is still correct, because
-- 0000_prototype_cloud_sync.sql creates it earlier in the chain.
--
-- Run from the `study-rpg-2nd` directory (that is where the Supabase project link lives):
--
--   supabase db query --linked -f ../study-rpg/supabase/tests/0034_legacy_function_grants.sql
--
-- Everything is inside BEGIN … ROLLBACK, and the file RAISES if any assertion fails, so a failing
-- run exits non-zero rather than printing a FAIL column nobody reads.
--
-- ⚠️ WHY THIS READS THE CATALOG AND NOT PostgREST. The intuitive test — call an RPC as `anon` and
-- assert it is refused — WOULD HAVE PASSED BEFORE THIS MIGRATION TOO, and therefore proves nothing.
-- All four SECURITY DEFINER RPCs already RAISE on `auth.uid() IS NULL` as their first executable
-- statement, so an anonymous call is refused with or without the grant. A test that cannot fail
-- against the pre-migration database is not a gate. `has_function_privilege` and an `aclexplode`
-- scan for grantee 0 are the assertions that were true before and are false after.
--
-- ⚠️ WHAT THIS FILE DOES NOT COVER, stated because the previous migration pair got this wrong twice:
-- it asserts catalog privilege and trigger firing. It does NOT exercise 「重置此帳號進度」 end to end
-- (that is a signed-in browser smoke), and it does NOT assert anything about the community-notes
-- functions (`scripts/verify-community-rls.mjs` owns those). Whatever is claimed here is asserted
-- below; nothing else is.

BEGIN;

CREATE TEMP TABLE r(ord int, check_name text, got text, want text);

-- The six functions, and which three keep an `authenticated` grant.
-- ⚠️ `::regprocedure` raises if a signature does not resolve, so a typo here fails the run loudly
-- rather than quietly testing five functions and reporting success.
CREATE TEMP TABLE fns(ord int, sig text, retained boolean);
INSERT INTO fns VALUES
  (1, 'public.delete_my_data()',                             true),
  (2, 'public.delete_my_account()',                          true),
  (3, 'public.upsert_lww(text,jsonb)',                       true),
  (4, 'public.export_my_data()',                             false),
  (5, 'public.set_account_metadata_updated_at()',            false),
  (6, 'public.set_hospital_monotonic_counters_updated_at()', false);

INSERT INTO r SELECT 0, 'all six functions resolve', count(*)::text, '6'
  FROM fns WHERE sig::regprocedure IS NOT NULL;

-- ── anon holds nothing ───────────────────────────────────────────────
-- The load-bearing one. `anon` has its own explicit grant, independent of PUBLIC, so a migration
-- that revoked only from PUBLIC would leave every row here reading `true`.
INSERT INTO r SELECT 100 + ord, 'anon cannot EXECUTE ' || sig,
  has_function_privilege('anon', sig::regprocedure, 'EXECUTE')::text, 'false' FROM fns;

-- ── PUBLIC holds nothing ─────────────────────────────────────────────
INSERT INTO r SELECT 200 + ord, 'PUBLIC holds no EXECUTE on ' || sig,
  EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
           WHERE p.oid = sig::regprocedure
             AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')::text, 'false' FROM fns;

-- ── service_role holds nothing ───────────────────────────────────────
INSERT INTO r SELECT 300 + ord, 'service_role cannot EXECUTE ' || sig,
  has_function_privilege('service_role', sig::regprocedure, 'EXECUTE')::text, 'false' FROM fns;

-- ── authenticated holds exactly the three retained ───────────────────
INSERT INTO r SELECT 400 + ord,
  'authenticated EXECUTE on ' || sig || ' is ' || retained::text,
  has_function_privilege('authenticated', sig::regprocedure, 'EXECUTE')::text,
  retained::text FROM fns;

INSERT INTO r SELECT 500, 'exactly three of the six are executable by authenticated',
  count(*) FILTER (WHERE has_function_privilege('authenticated', sig::regprocedure, 'EXECUTE'))::text,
  '3' FROM fns;

-- ── triggers still fire with EXECUTE revoked from every role ─────────
-- Spec scenario: PostgreSQL checks EXECUTE at CREATE TRIGGER time and performs no check when the
-- trigger fires. Probe tables are built here rather than writing to a production row.
-- ⚠️ The writes must run as `authenticated`. The function owner keeps rights implicitly, so the same
-- probe run as owner would pass whether or not the claim is true — which is why the role in effect
-- is itself asserted below.
DO $t$
DECLARE
  v_role_used text;
  v_set  timestamptz;
  v_mono timestamptz;
BEGIN
  -- ⚠️ Regular tables, not TEMP. After SET ROLE, whether another role holds USAGE on this session's
  -- pg_temp schema is a second question this gate should not also be asking. The enclosing
  -- transaction is rolled back, so they never exist outside this run.
  CREATE TABLE public.__g34_set  (id int PRIMARY KEY, updated_at timestamptz);
  CREATE TABLE public.__g34_mono (id int PRIMARY KEY, updated_at timestamptz);
  GRANT ALL ON public.__g34_set, public.__g34_mono TO authenticated;

  -- Created as owner, who holds EXECUTE implicitly. This is the moment the privilege is checked.
  CREATE TRIGGER g_set  BEFORE INSERT OR UPDATE ON public.__g34_set
    FOR EACH ROW EXECUTE FUNCTION public.set_account_metadata_updated_at();
  CREATE TRIGGER g_mono BEFORE INSERT OR UPDATE ON public.__g34_mono
    FOR EACH ROW EXECUTE FUNCTION public.set_hospital_monotonic_counters_updated_at();

  SET LOCAL ROLE authenticated;
  v_role_used := current_user;

  -- updated_at goes in NULL: if the trigger fires it becomes now(). now() is constant within a
  -- transaction, so NULL-vs-not is the signal — comparing timestamps would prove nothing.
  INSERT INTO public.__g34_set  VALUES (1, NULL);
  INSERT INTO public.__g34_mono VALUES (1, NULL);

  SELECT updated_at INTO v_set  FROM public.__g34_set  WHERE id = 1;
  SELECT updated_at INTO v_mono FROM public.__g34_mono WHERE id = 1;

  RESET ROLE;

  INSERT INTO r VALUES (600, 'trigger probe ran as authenticated, not owner', v_role_used, 'authenticated');
  INSERT INTO r VALUES (601, 'set_account_metadata_updated_at fires with EXECUTE revoked',            (v_set  IS NOT NULL)::text, 'true');
  INSERT INTO r VALUES (602, 'set_hospital_monotonic_counters_updated_at fires with EXECUTE revoked', (v_mono IS NOT NULL)::text, 'true');
END
$t$;

-- ── verdict ──────────────────────────────────────────────────────────
DO $v$
DECLARE
  v_failed text;
BEGIN
  SELECT string_agg(format('[%s] %s: got %s, want %s', ord, check_name, got, want), E'\n' ORDER BY ord)
    INTO v_failed FROM r WHERE got IS DISTINCT FROM want;

  IF v_failed IS NOT NULL THEN
    RAISE EXCEPTION E'0034 tests FAILED:\n%', v_failed;
  END IF;

  RAISE NOTICE '0034 tests passed: % assertions', (SELECT count(*) FROM r);
END
$v$;

ROLLBACK;
