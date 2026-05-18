# Bug Reporting (M4.5)

> In-app structured bug / suggestion submission to Supabase Postgres, wired into both `medexam-tw` (一階) and `medexam2-hospital-tw` (二階). Players submit; the owner reads.

## Why it exists

Bug reports off-app (Threads / Slack / email) lose the highest-value context — which route, what game state, what console errors fired. The in-app modal captures all of that automatically and lands it in a `bug_reports` table that's queryable from Claude Code (future skill: `add-bug-report-auto-read-pipeline`).

## Architecture

```
Player → [BugReportModal] → services/bug-report.ts → supabase.from('bug_reports').insert(...)
              ↓
       AutoContext built from:
         - import.meta.env.VITE_APP_VERSION / VITE_COMMIT_SHA
         - window.location.hash
         - Dexie counters (一階: Player; 二階: gameCounters + monotonic + doctors + rooms + tickets)
         - navigator.userAgent
         - viewport (window.innerWidth × innerHeight)
         - getRecentConsoleErrors() ring buffer (window.error + unhandledrejection, size 5)
```

Per-app split (no shared runtime helper):

- `apps/medexam-tw/src/services/bug-report.ts` — reads from `getDB()` Dexie
- `apps/medexam2-hospital-tw/src/services/bug-report.ts` — reads from `getHospitalDB()` Dexie
- Shared types in `@study-rpg/core` (`BUG_REPORT_CATEGORIES`, `BugReportRow`, etc.)

Two near-identical `BugReportModal.tsx` components (one per app). Acceptable duplication for two apps; lift to `_shared` if a third app appears.

## Schema

Single table, immutable rows, RLS-protected.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `user_id` | UUID NOT NULL | `REFERENCES auth.users(id) ON DELETE CASCADE` |
| `app` | text NOT NULL | CHECK `IN ('medexam-tw', 'medexam2-hospital-tw')` |
| `category` | text NOT NULL | 11 kebab-case enums (see below) |
| `severity` | text NOT NULL | 4 enums: `blocker` / `annoying` / `minor` / `suggestion` |
| `what_doing` | text NOT NULL | What the player was doing |
| `what_happened` | text NOT NULL | What went wrong |
| `what_expected` | text NULL | Optional |
| `reproducibility` | text NULL | CHECK `IN ('always','sometimes','once','unsure')` |
| `contact_info` | text NULL | Optional (email / IG / Threads) |
| `allow_followup` | boolean NOT NULL | DEFAULT FALSE |
| `app_version` | text NULL | from `npm_package_version` |
| `commit_sha` | text NULL | from `github.sha` (CI) or `'dev'` (local) |
| `route` | text NULL | `window.location.hash` |
| `game_state` | JSONB NULL | Per-app shape — see Snapshot section |
| `user_agent` | text NULL | |
| `viewport` | text NULL | `1920×1080` |
| `recent_console_errors` | JSONB NULL | Array of `{message, source?, line?, timestamp}` |
| `submitted_at` | timestamptz NOT NULL | DEFAULT `now()` |

Indexes: `user_id`, `submitted_at DESC`, `severity`.

### Categories (11)

`app-stability` · `hospital-management` · `doctors` · `study-session` · `events-fate-cards` · `numbers-wrong` · `visual-glitch` · `cloud-sync` · `corpus` · `feature-request` · `other`

UI labels (emoji + Chinese) live in `BugReportModal.tsx`'s `CATEGORY_LABEL` map. Adding a 12th category requires edits in:

1. `packages/core/src/lib/bug-report-types.ts` — append to `BUG_REPORT_CATEGORIES` array.
2. `supabase/migrations/<next>.sql` — ALTER the CHECK constraint (Postgres CHECK can't be parameterised by app code).
3. `apps/<app>/src/components/BugReportModal.tsx` — add `CATEGORY_LABEL[<new>]`.

### Severities (4)

`blocker` · `annoying` · `minor` · `suggestion`. Same migration / type discipline as categories.

## Auto-context snapshot (per app)

Each app's `services/bug-report.ts` exports `buildAutoContext(): Promise<BugReportAutoContext>`. The `game_state` JSONB shape:

**一階 (medexam-tw)** — read from `getDB()`:

```ts
{
  playerId, level, xp, stats, currentStreak, longestStreak,
  lastCheckInDate, todayProgress, itemCount, srsCardCount, mockAttemptCount
}
```

**二階 (medexam2-hospital-tw)** — read from `getHospitalDB()`:

```ts
{
  tier, revenue, reputation, hasUsedStarterPull,
  currentSessionStartedAt, pendingEventId, pendingEventTriggeredAt,
  vipBoostUntil, totalStudyMinutes, doctorCount, roomCount, ticketsAvailable
}
```

Players can opt out of every auto-context field individually via per-field checkboxes in the modal's `<details open>` section. Opted-out fields are omitted from the INSERT payload; server stores `NULL`.

## RLS policies

- `bug_reports_insert_own` — `FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`
- `bug_reports_select_own` — `FOR SELECT TO authenticated USING (auth.uid() = user_id)`
- No UPDATE / DELETE policies. Reports are immutable.
- Owner reads everyone's reports via `service_role` (bypasses RLS).

## Sign-in gate

Unauthenticated players see a login prompt instead of the form. No anon submit path. Implemented in `BugReportModal.tsx` by checking `useAuth().user`. The check happens before any network call — confirm via DevTools Network panel that opening the modal while signed out produces zero outbound `supabase.co` traffic.

## Schema migration

One-time manual apply via either:

```bash
# Option A — Supabase CLI
supabase db push

# Option B — Dashboard
# 1. Open Supabase dashboard → SQL Editor
# 2. Paste contents of supabase/migrations/0004_bug_reports.sql
# 3. Run
```

After applying, run the queries in `supabase/sanity/bug_reports_rls.sql` to confirm RLS behavior (unauth `SELECT` → 0 rows; cross-user INSERT → rejected).

## Env vars

| Var | Local dev fallback | CI / prod value |
|---|---|---|
| `VITE_APP_VERSION` | `'dev'` | `npm_package_version` from `package.json` (set automatically by pnpm during build) |
| `VITE_COMMIT_SHA` | `'dev'` | `${{ github.sha }}` from CI workflow |
| `VITE_SUPABASE_URL` | from `.env.local` | from CI secrets |
| `VITE_SUPABASE_ANON_KEY` | from `.env.local` | from CI secrets |

Vite picks up `npm_package_version` automatically when pnpm runs the build script. `VITE_COMMIT_SHA` needs explicit CI plumbing — see `.github/workflows/deploy.yml`.

## Owner read flow

Until the future `/bug-reports` slash skill ships, read reports via the Supabase dashboard SQL editor (`service_role` bypasses RLS by default):

```sql
-- Last 10 reports across both apps
SELECT id, app, category, severity, submitted_at,
       what_doing, what_happened, contact_info, allow_followup,
       game_state, recent_console_errors
  FROM public.bug_reports
  ORDER BY submitted_at DESC
  LIMIT 10;

-- Blockers from the last 7 days
SELECT *
  FROM public.bug_reports
  WHERE severity = 'blocker'
    AND submitted_at > now() - INTERVAL '7 days'
  ORDER BY submitted_at DESC;

-- Distribution by category × severity
SELECT category, severity, count(*) AS n
  FROM public.bug_reports
  GROUP BY category, severity
  ORDER BY n DESC;
```

## Follow-up changes (not in this milestone)

- `add-bug-report-screenshot-upload` — Supabase Storage bucket + signed-URL flow + client-side image compression.
- `add-bug-report-auto-read-pipeline` — daily cron + `/bug-reports` slash skill + SessionStart hook nudge so the owner gets a digest each morning.
