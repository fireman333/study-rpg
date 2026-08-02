-- 0000_prototype_cloud_sync.sql
--
-- Change `retire-orphan-prototype-schema` (study-rpg-2nd).
--
-- ⚠️ THIS FILE RECORDS HISTORY. IT IS NOT A PROPOSAL TO HAVE THIS SCHEMA.
-- Everything it creates is destroyed by 0035_drop_prototype_schema.sql, the very next
-- migration. Read forward that is absurd, so here is why it exists.
--
-- These five tables, their five policies, their five triggers and `enforce_lww()` were
-- applied to production BY HAND on 2026-05-17, four days before 0001_init_cloud_sync.sql
-- was recorded. They are the first cloud-sync draft. The implementation then went a
-- different way — `player_state`, `srs_cards`, `hospital_*` — and nobody dropped these.
-- No migration file has ever created them. They were found on 2026-08-02 while checking
-- for drift in the direction `db push --dry-run` structurally cannot see: it compares the
-- history table against filenames and never looks at the catalog.
--
-- ⚠️ DELETING THIS FILE AS POINTLESS RE-BREAKS A CLEAN REPLAY.
-- 0034_legacy_function_grants.sql:88 does:
--     REVOKE ALL ON FUNCTION public.enforce_lww() FROM PUBLIC, anon, authenticated, service_role;
-- and until this file existed, nothing created that function. Replaying 0001→0034 against
-- an empty database therefore aborted at 0034 with `42883 function ... does not exist` —
-- measured, not assumed. 0034 was written in a world where these objects existed; this
-- file is what makes that world reproducible. With it in place, 0034's REVOKE resolves,
-- and all seven of its REVOKEs stay unguarded, which is what 0034 is for.
--
-- The alternative considered and rejected was editing 0034 to wrap that one REVOKE in
-- `EXCEPTION WHEN undefined_function THEN NULL`. That is the silent-swallow pattern this
-- project's coding principles name outright: the guard cannot tell "legitimately retired"
-- from "renamed, and this REVOKE now points at nothing". It would also have meant editing
-- an already-applied migration, which 0016's header states is never done here.
--
-- ⚠️ NOT IDEMPOTENT, DELIBERATELY. NEVER REACH THIS FILE WITH `db push --include-all`.
-- PostgreSQL 17 has no `CREATE POLICY IF NOT EXISTS` and no `CREATE OR REPLACE POLICY`
-- (measured: 42601). So the guards below cannot be uniform: tables take IF NOT EXISTS, the
-- function and triggers take OR REPLACE / DROP IF EXISTS, and THE POLICIES ARE WRITTEN
-- BARE. Against a database that still holds these objects this file aborts with 42710.
--
-- That failure is the safer one and is the reason for the choice. A fully DO-guarded 0000
-- would apply cleanly against production and then let 0035 run straight after it,
-- destroying the objects 0000 exists to record. The non-idempotence is load-bearing, not
-- an oversight. This file is recorded into history with `migration repair 0000 --status
-- applied`; it is never executed against production.
--
-- Reproduced AS FOUND, not tidied — including the RLS enable flags, the table grants and
-- the policies. A cleaned-up version would be a claim about the past that is false in the
-- details that matter. Transcribed from the live catalog on 2026-08-02 while the objects
-- still existed; the capture, and the 11 rows they held, are outside git at
-- ~/coding-scratch/prototype-schema-retirement-2026-08-02/.
--
-- One deviation from "as found" is forced and is deliberate: `enforce_lww()` is created
-- below with NO grant statement of its own. Production's proacl today reads
-- `{postgres=X/postgres}`, but that is the POST-0034 state. On 2026-05-17 it was the
-- default — owner plus the implicit PUBLIC EXECUTE every new function gets. Creating it
-- plainly reproduces that, and 0034 then revokes down to exactly what production has.
-- Baking the post-0034 ACL in here would reach the same end state while asserting a
-- history that never happened, and would quietly turn 0034:88 into a no-op that still
-- looks like it is doing something.

-- ---------------------------------------------------------------------------
-- character_state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.character_state (
  user_id            uuid NOT NULL,
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  app_version        text NOT NULL,
  app_schema_version integer NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT character_state_pkey PRIMARY KEY (user_id),
  CONSTRAINT character_state_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.character_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.character_state
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
GRANT ALL ON TABLE public.character_state TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory (
  user_id            uuid NOT NULL,
  instance_id        text NOT NULL,
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  app_version        text NOT NULL,
  app_schema_version integer NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_pkey PRIMARY KEY (user_id, instance_id),
  CONSTRAINT inventory_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.inventory
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
GRANT ALL ON TABLE public.inventory TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mastery  (NOTE: not hospital_mastery — a different, current-era table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mastery (
  user_id            uuid NOT NULL,
  subject_id         text NOT NULL,
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  app_version        text NOT NULL,
  app_schema_version integer NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT mastery_pkey PRIMARY KEY (user_id, subject_id),
  CONSTRAINT mastery_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.mastery
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
GRANT ALL ON TABLE public.mastery TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- streak_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streak_log (
  user_id            uuid NOT NULL,
  log_date           date NOT NULL,
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  app_version        text NOT NULL,
  app_schema_version integer NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT streak_log_pkey PRIMARY KEY (user_id, log_date),
  CONSTRAINT streak_log_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.streak_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.streak_log
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
GRANT ALL ON TABLE public.streak_log TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cosmetic_unlocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cosmetic_unlocks (
  user_id            uuid NOT NULL,
  cosmetic_id        text NOT NULL,
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  app_version        text NOT NULL,
  app_schema_version integer NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT cosmetic_unlocks_pkey PRIMARY KEY (user_id, cosmetic_id),
  CONSTRAINT cosmetic_unlocks_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.cosmetic_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON public.cosmetic_unlocks
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
GRANT ALL ON TABLE public.cosmetic_unlocks TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- enforce_lww() — the function 0034:88 revokes on.
-- No GRANT/REVOKE here; see the header note on the post-0034 ACL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_lww()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.updated_at <= OLD.updated_at THEN
    -- Stale or equal write — keep cloud row unchanged
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Triggers — created after the function they call.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS enforce_lww_character_state  ON public.character_state;
CREATE TRIGGER enforce_lww_character_state  BEFORE UPDATE ON public.character_state  FOR EACH ROW EXECUTE FUNCTION public.enforce_lww();

DROP TRIGGER IF EXISTS enforce_lww_inventory        ON public.inventory;
CREATE TRIGGER enforce_lww_inventory        BEFORE UPDATE ON public.inventory        FOR EACH ROW EXECUTE FUNCTION public.enforce_lww();

DROP TRIGGER IF EXISTS enforce_lww_mastery          ON public.mastery;
CREATE TRIGGER enforce_lww_mastery          BEFORE UPDATE ON public.mastery          FOR EACH ROW EXECUTE FUNCTION public.enforce_lww();

DROP TRIGGER IF EXISTS enforce_lww_streak_log       ON public.streak_log;
CREATE TRIGGER enforce_lww_streak_log       BEFORE UPDATE ON public.streak_log       FOR EACH ROW EXECUTE FUNCTION public.enforce_lww();

DROP TRIGGER IF EXISTS enforce_lww_cosmetic_unlocks ON public.cosmetic_unlocks;
CREATE TRIGGER enforce_lww_cosmetic_unlocks BEFORE UPDATE ON public.cosmetic_unlocks FOR EACH ROW EXECUTE FUNCTION public.enforce_lww();
