-- =====================================================================
-- schema_migration_coverage.sql — does every table in production exist
-- because some migration file says so?
--
-- Added by change `retire-orphan-prototype-schema` (study-rpg-2nd).
--
-- WHY THIS EXISTS. On 2026-08-02 five tables were found in production's
-- `public` schema that no migration file creates — `character_state`,
-- `inventory`, `mastery`, `streak_log`, `cosmetic_unlocks`, the first
-- cloud-sync draft, applied by hand on 2026-05-17 and never dropped.
-- They sat there for two and a half months. Nothing looked for them,
-- because nothing was looking in this direction at all.
--
-- ⚠️ `supabase db push --dry-run` CANNOT FIND THIS AND NEVER COULD.
-- It compares the history table against the migration FILENAMES. It
-- reads no catalog, so drift where production has MORE than the files
-- describe is structurally invisible to it. "Remote database is up to
-- date" is a statement about push, not about the schema.
--
-- Not auto-run by any pipeline — nothing here is. Run it after any
-- out-of-band change, and after anything applied through the dashboard.
-- =====================================================================

-- ─── The catalog half ────────────────────────────────────────────────
-- Every base table in `public`, with the two facts most often lost when
-- a table arrives out of band.
SELECT c.relname AS tbl,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ─── The file half, and the comparison ───────────────────────────────
-- SQL cannot read the migration directory, so the second half runs in a
-- shell. From ~/coding-scratch/study-rpg:
--
--   supabase db query --linked -o json -f supabase/sanity/schema_migration_coverage.sql \
--     > /tmp/live.json
--   python3 - <<'PY'
--   import json, re, glob, os
--   live = {r['tbl'] for r in json.load(open('/tmp/live.json'))['rows']}
--   pat = re.compile(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?', re.I)
--   created = set()
--   for f in sorted(glob.glob('supabase/migrations/*.sql')):
--       body = '\n'.join(l.split('--')[0] for l in open(f).read().splitlines())
--       created |= {m.group(1) for m in pat.finditer(body)}
--   orphans = sorted(live - created)
--   print('ORPHANS (in production, created by no migration):', orphans or 'none')
--   print('dropped later (in a migration, not live):', sorted(created - live))
--   PY
--
-- ⚠️ Strip comments before matching, as above. Commented-out DDL in a
-- migration must not count as coverage — that would be the same class of
-- false green this check was written to end.
--
-- Measured 2026-08-02, after 0000 and 0035 were applied — 25 live base
-- tables:
--   ORPHANS: none
--   dropped later (9): character_state, cosmetic_unlocks, inventory,
--     item_instances, mastery, mentor_backlog, player_state, srs_cards,
--     streak_log
--
-- Two different stories in that second list, and neither is a problem:
--   * item_instances, mentor_backlog, player_state, srs_cards — the 一階
--     set, created by 0001 and dropped by 0016.
--   * character_state, cosmetic_unlocks, inventory, mastery, streak_log —
--     the prototype five, created by 0000 and dropped by 0035 one file
--     later. They appear here BECAUSE this change worked: 0000 put them
--     in the files, 0035 took them out of production.
-- This direction is normal and is not what the check is hunting.
--
-- ⚠️ THE FIRST RUN OF THIS CHECK PASSES FOR A REASON WORTH KNOWING.
-- It reports no orphans only because 0000_prototype_cloud_sync.sql was
-- written in the same change to describe the five. Re-run it with 0000
-- excluded and the five come back — that is what the May state looked
-- like. Confirmed on 2026-08-02: with 0000 excluded the check finds
-- exactly those five and nothing else, which is the first systematic
-- look. Finding them originally was one reviewer's persistence.
