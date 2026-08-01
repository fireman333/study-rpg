-- 0034_legacy_function_grants.sql
--
-- Change `tighten-legacy-function-grants` (study-rpg-2nd).
--
-- The seven functions below were created in the 0002 / 0003 / 0015 era with `GRANT EXECUTE … TO
-- authenticated` and nothing was ever revoked. That is not a default-deny posture. `CREATE FUNCTION`
-- grants EXECUTE to PUBLIC automatically, and Supabase's `ALTER DEFAULT PRIVILEGES` adds `anon` and
-- `service_role` on top — so every one of them is presently executable by PUBLIC *and* by anon. The
-- production ACL read on 2026-08-01 was identical for all seven:
--
--     {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--        ↑ PUBLIC
--
-- Nothing here is exploitable today. Each of the four SECURITY DEFINER RPCs assigns `uid := auth.uid()`
-- in DECLARE and RAISEs as its first executable statement when that is NULL, so an anonymous call
-- fails closed rather than matching NULL — separately confirmed during `sweep-abandoned-note-image-
-- uploads`. This migration removes the reliance on that single in-body check and adopts the stance
-- 0021 already applied to the community-notes functions. The in-body guards stay; this is a second
-- layer, not a replacement.
--
-- ⚠️ EVERY REVOKE NAMES `anon` OUTRIGHT, AND THAT IS LOAD-BEARING. `anon` holds its own explicit
-- EXECUTE grant, separate from PUBLIC, courtesy of Supabase's ALTER DEFAULT PRIVILEGES — `aclexplode`
-- shows grantees `PUBLIC, anon, authenticated, postgres, service_role`. A migration written as
-- `REVOKE … FROM PUBLIC` alone would read correctly, apply cleanly, and leave anon exactly as it was.
--
-- Side effect, deliberate: the `note_image_sweeper` role introduced by 0032 reaches these functions
-- only through PUBLIC. Revoking here narrows that credential from nine reachable functions toward the
-- two it was designed for — the number `sweep-abandoned-note-image-uploads` originally claimed and
-- could not then assert. It does not disturb the property its spec does assert, that the role is not
-- wider than anonymous, because anon loses the same grants in the same statement.
--
-- ⚠️ Any future SECURITY DEFINER function left at its default grant silently re-widens both anon and
-- the sweeper. This migration fixes a state, not a mechanism.
--
-- Rehearse inside BEGIN … ROLLBACK, then apply with `supabase db query --linked -f` from the
-- `study-rpg-2nd` directory — the project link lives there and `supabase` fails with "Cannot find
-- project ref" anywhere else. NEVER `supabase db push` — history stopped at 0019 and 0020–0033 were
-- all applied out of band.
--
-- Gate: `supabase/tests/0034_legacy_function_grants.sql`. It asserts against the catalog, not through
-- PostgREST, and the distinction matters — see that file's header.

BEGIN;

-- ── 1. The four SECURITY DEFINER RPCs ────────────────────────────────────────

REVOKE ALL ON FUNCTION public.delete_my_data()          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_my_account()       FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_my_data()          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_lww(TEXT, JSONB)   FROM PUBLIC, anon, authenticated, service_role;

-- Called by the in-place account reset flow, as `authenticated`:
--   apps/medexam2-hospital-tw/src/lib/sync/reset-account.ts:75
-- This is the only user-facing path this migration can break.
GRANT EXECUTE ON FUNCTION public.delete_my_data()       TO authenticated;

-- No app call site. Retained because it is the self-service account-deletion verb and
--   scripts/verify-community-rls.mjs:1078
-- exercises it over PostgREST with a disposable account. Drop this grant if that script is retired.
GRANT EXECUTE ON FUNCTION public.delete_my_account()    TO authenticated;

-- Called by the Supabase sync push path:
--   apps/medexam2-hospital-tw/src/lib/sync/engine.ts:614 and :817
-- ⚠️ Dormant in production (VITE_CLOUD_SYNC_BACKEND=r2 → writeSupabase=false), but this grant must
-- stay: a rollback to backend=supabase|dual breaks push without it, and that rollback is the reason
-- the Supabase write path still exists at all.
GRANT EXECUTE ON FUNCTION public.upsert_lww(TEXT, JSONB) TO authenticated;

-- export_my_data() is deliberately NOT re-granted, which makes it uncallable. It has zero call sites
-- in either repository — src, scripts, and the shipped dist bundles were all searched — and its
-- replacement is already the wired path at
--   apps/medexam2-hospital-tw/src/lib/sync/r2/export.ts
-- If a data-export UI is ever built, restore the grant together with the code that calls it.

-- ── 2. The three trigger functions ───────────────────────────────────────────
--
-- These RETURN trigger, so PostgREST does not expose them and a direct call raises "trigger functions
-- can only be called as triggers". Revoking EXECUTE does not stop their triggers firing: PostgreSQL
-- checks EXECUTE at CREATE TRIGGER time and performs no privilege check when the trigger fires.
--
-- ⚠️ That sentence was not taken on trust. It was proven against this database before this file was
-- written, in a transaction that ended in RAISE EXCEPTION so it could not commit — probe kept at
-- `openspec/changes/tighten-legacy-function-grants/probe-trigger-execute.sql` in study-rpg-2nd.
-- All three fired identically either side of the revoke, with the probe also asserting that the
-- writes ran as `authenticated` (not as the owner, who keeps rights implicitly and would prove
-- nothing) and that the revoke had taken effect at all (auth_exec t->f).

REVOKE ALL ON FUNCTION public.enforce_lww()                                FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_account_metadata_updated_at()            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_hospital_monotonic_counters_updated_at() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Nothing is dropped or altered, so the prior state is restored exactly by re-granting:
--
--   GRANT EXECUTE ON FUNCTION public.<f> TO PUBLIC, anon, authenticated, service_role;
--
-- for each of the seven.
