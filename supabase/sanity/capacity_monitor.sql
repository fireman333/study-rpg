-- =====================================================================
-- capacity_monitor.sql — Supabase free-tier capacity headroom check
--
-- Run in the Supabase dashboard SQL editor. Not auto-run by any pipeline;
-- treat it as a manual health check before deciding whether to upgrade
-- to Pro tier ($25/mo).
--
-- Free tier ceilings (as of 2026):
--   • Database storage   500 MB
--   • Egress / bandwidth 5 GB / month
--   • Auth MAU           50,000
--   • Realtime conns     200 concurrent
--
-- Empirically the DB-storage ceiling hits first (~500–800 active users
-- given current schema), egress second (~1,500 active users / month).
-- =====================================================================

-- ─── 1. Overall database size + free-tier headroom ───────────────────
SELECT
  pg_size_pretty(pg_database_size(current_database()))         AS db_size,
  pg_database_size(current_database())                         AS db_bytes,
  round(100.0 * pg_database_size(current_database())
                / (500 * 1024 * 1024), 2)                      AS pct_of_500mb_free_tier;
-- Watch for pct_of_500mb_free_tier > 70 — that's the "start planning"
-- threshold. > 90 = act now (upgrade or shrink schema).


-- ─── 2. Per-table size breakdown (table + indexes + toast) ───────────
SELECT
  relname                                                      AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))                AS total_size,
  pg_size_pretty(pg_relation_size(c.oid))                      AS table_size,
  pg_size_pretty(pg_indexes_size(c.oid))                       AS indexes_size,
  pg_total_relation_size(c.oid)                                AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;
-- Usual top offenders (with active users):
--   srs_cards, hospital_question_history, hospital_doctors
-- If srs_cards or hospital_question_history > 50% of DB, consider
-- server-side rollup (store mastery stats, drop per-attempt rows).


-- ─── 3. Row counts per sync table ────────────────────────────────────
SELECT 'player_state'              AS table_name, count(*) AS rows FROM public.player_state
UNION ALL SELECT 'srs_cards',                   count(*) FROM public.srs_cards
UNION ALL SELECT 'item_instances',              count(*) FROM public.item_instances
UNION ALL SELECT 'mentor_backlog',              count(*) FROM public.mentor_backlog
UNION ALL SELECT 'hospital_state',              count(*) FROM public.hospital_state
UNION ALL SELECT 'hospital_doctors',            count(*) FROM public.hospital_doctors
UNION ALL SELECT 'hospital_mastery',            count(*) FROM public.hospital_mastery
UNION ALL SELECT 'hospital_question_history',   count(*) FROM public.hospital_question_history
UNION ALL SELECT 'question_bookmarks',          count(*) FROM public.question_bookmarks
UNION ALL SELECT 'bug_reports',                 count(*) FROM public.bug_reports
ORDER BY rows DESC;


-- ─── 4. User counts: registered vs active ────────────────────────────
-- "Registered" = ever signed in. "Active" = pushed data in last 30 days.
SELECT
  (SELECT count(*) FROM auth.users)                            AS registered_users,
  (SELECT count(DISTINCT user_id) FROM public.player_state
     WHERE updated_at > now() - interval '30 days')            AS active_30d_m1,
  (SELECT count(DISTINCT user_id) FROM public.hospital_state
     WHERE updated_at > now() - interval '30 days')            AS active_30d_m2,
  (SELECT count(DISTINCT user_id) FROM public.player_state
     WHERE updated_at > now() - interval '7 days')             AS active_7d_m1;


-- ─── 5. Average bytes per active user ────────────────────────────────
-- Rough footprint = total user-scoped table size ÷ active user count.
-- Use this to project headroom: free_bytes / avg_bytes_per_user.
WITH active AS (
  SELECT count(DISTINCT user_id) AS n
    FROM public.player_state
   WHERE updated_at > now() - interval '30 days'
),
user_data AS (
  SELECT sum(pg_total_relation_size(c.oid)) AS total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname IN (
       'player_state','srs_cards','item_instances','mentor_backlog',
       'hospital_state','hospital_doctors','hospital_mastery',
       'hospital_question_history','question_bookmarks'
     )
)
SELECT
  active.n                                                     AS active_users_30d,
  pg_size_pretty(user_data.total_bytes)                        AS user_data_size,
  CASE WHEN active.n > 0
    THEN pg_size_pretty(user_data.total_bytes / active.n)
    ELSE 'n/a'
  END                                                          AS avg_per_user,
  CASE WHEN active.n > 0
    THEN ((500 * 1024 * 1024) - pg_database_size(current_database()))
         / nullif(user_data.total_bytes / active.n, 0)
    ELSE NULL
  END                                                          AS projected_remaining_users
FROM active, user_data;
-- projected_remaining_users = how many MORE active users fit before
-- hitting 500 MB at the current per-user footprint.


-- ─── 6. Heaviest users (top 10 by srs_cards row count) ───────────────
-- Useful for spotting power users or runaway data. Cross-reference with
-- hospital_question_history if dominated by 二階 activity.
SELECT
  user_id,
  count(*) AS srs_rows,
  (SELECT count(*) FROM public.hospital_question_history h
     WHERE h.user_id = s.user_id)                              AS hospital_history_rows,
  (SELECT count(*) FROM public.question_bookmarks b
     WHERE b.user_id = s.user_id)                              AS bookmark_rows
FROM public.srs_cards s
GROUP BY user_id
ORDER BY srs_rows DESC
LIMIT 10;


-- ─── 7. Egress proxy: rows pushed in last 24h ────────────────────────
-- Supabase doesn't expose per-table egress directly, but updated_at
-- churn approximates push volume. Compare against the 5 GB/mo ceiling
-- (≈170 MB/day average burn rate).
SELECT 'player_state' AS table_name,
       count(*) AS rows_updated_24h
  FROM public.player_state WHERE updated_at > now() - interval '24 hours'
UNION ALL SELECT 'srs_cards',
       count(*) FROM public.srs_cards WHERE updated_at > now() - interval '24 hours'
UNION ALL SELECT 'hospital_question_history',
       count(*) FROM public.hospital_question_history WHERE updated_at > now() - interval '24 hours'
UNION ALL SELECT 'hospital_doctors',
       count(*) FROM public.hospital_doctors WHERE updated_at > now() - interval '24 hours'
ORDER BY rows_updated_24h DESC;
