-- 0035_drop_prototype_schema.sql
--
-- Change `retire-orphan-prototype-schema` (study-rpg-2nd).
--
-- Retires the first cloud-sync draft: five tables, their five RLS policies, their five
-- BEFORE UPDATE triggers, and `enforce_lww()`. All of it was applied to production by hand
-- on 2026-05-17 and never described by a migration until 0000_prototype_cloud_sync.sql was
-- written alongside this file. Read 0000's header first — it explains why a migration
-- creates what the next one destroys, and why deleting it re-breaks a clean replay.
--
-- Evidence for retiring rather than keeping, all re-confirmed against production
-- immediately before this file was written rather than carried over from design:
--
--   * Zero source consumers across both repos. The only non-documentation hits are
--     0034:88's REVOKE, a stale comment at 0032:368, and the 0034 test file — the last of
--     which is amended in the same change.
--   * Zero inbound foreign keys, zero views or matviews, zero other function bodies
--     mentioning them, not in any publication, and no dependency on them outside the
--     cluster's own policies and triggers.
--   * `upsert_lww`'s table whitelist does not include any of them, so no sync client can
--     reach them.
--   * 11 rows total, one user, all written inside a 143 ms window on 2026-05-17. Three of
--     the five tables are empty.
--
-- ROLLBACK. The rows and the full DDL were captured before this ran, and live outside git
-- at ~/coding-scratch/prototype-schema-retirement-2026-08-02/ (rows.json, ddl.sql,
-- catalog-facts.json, README.md). That capture is the ONLY rollback — nothing else holds a
-- copy of these rows. The restore path is not merely asserted: rows.json was fed back
-- through `jsonb_populate_recordset()` and compared with EXCEPT in both directions against
-- the live tables, returning zero differing rows for all five, before anything was dropped.
--
-- ⚠️ NO EXPLICIT `DROP TRIGGER` STATEMENTS, AND THE ORDER BELOW IS REQUIRED.
-- Verified in pg_depend, not assumed: each enforce_lww_* trigger depends on its table with
-- deptype='a' (auto — DROP TABLE takes it) and on the function with deptype='n' (normal —
-- so the function cannot be dropped while any trigger still references it). Dropping the
-- tables first is therefore what makes the function droppable, and separate DROP TRIGGER
-- statements would be redundant.
--
-- No CASCADE anywhere. If some dependency exists that the checks above missed, this should
-- fail loudly rather than quietly widen its own blast radius.

DROP TABLE IF EXISTS public.character_state;
DROP TABLE IF EXISTS public.inventory;
DROP TABLE IF EXISTS public.mastery;
DROP TABLE IF EXISTS public.streak_log;
DROP TABLE IF EXISTS public.cosmetic_unlocks;

DROP FUNCTION IF EXISTS public.enforce_lww();
