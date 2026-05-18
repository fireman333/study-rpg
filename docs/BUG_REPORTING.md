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

## Inline quiz bug report (2026-05-19 — `add-quiz-inline-bug-report`)

The original entry points (一階 SettingsPanel / 二階 HelpMenu) require leaving QuizModal to file a report — too much friction for "this question's answer is wrong" type cases. A second entry point lives directly inside QuizModal:

### UI flow

1. 🐞 icon top-right of QuizModal (next to the close ✕).
2. Click → `QuizBugReportSheet` opens with:
   - 4-radio target picker: 題目本身有錯 / 題目圖片有問題 / 詳解有錯 / 簡答（其他意見）
   - Single-line textarea (max 200 chars, e.g. "答案標 B 但詳解推 C")
   - 「送出」button (disabled until target + description both set)
   - 「展開完整表單」escape hatch → opens `BugReportModal` pre-filled with the chosen category + description
3. On submit → transient toast「✓ 已送出回報，感謝你！」, sheet closes, quiz UI underneath untouched (current question, timer, progress preserved).

### Target → category mapping

| Target radio | `category` enum value | Migration adds |
|---|---|---|
| 題目本身有錯 | `question-error` | 0007 |
| 題目圖片有問題 | `image-broken` | 0007 |
| 詳解有錯 | `explanation-error` | 0007 |
| 簡答（其他意見） | `other` | (existing) |

Existing 11 categories remain available via SettingsPanel / HelpMenu entry; total enum is now 14 values.

### `game_state` shape (inline-flow rows)

Inline-flow submissions auto-attach this shape, MERGED on top of the existing `buildAutoContext()` output (so app-specific stats like `tier` / `revenue` / `currentStreak` are still present):

```json
{
  "...existing buildAutoContext fields...": "...",
  "questionId": "<question.id>",
  "subject": "<question.subject>",
  "year": <number | string | null>,
  "selectedOption": "<key | null>",
  "correctAnswer": "<key>",
  "disputed": <boolean>,
  "hasImage": <boolean>,
  "inMockExam": <boolean>
}
```

The player **cannot opt out** of these fields via the sheet UI (the sheet has no checkbox section — opt-out would defeat the purpose of a contextual report). To opt out, the player clicks 「展開完整表單」 to open `BugReportModal`, which restores the per-field opt-out checkboxes.

### `question_id` column

Migration 0007 adds a top-level `question_id text NULL` column + partial B-tree index `bug_reports_question_id_idx` (only indexes non-NULL rows). This lets the owner write:

```sql
-- Which questions are most-reported (≥ 3 reports)?
SELECT question_id, count(*) AS n, max(submitted_at) AS latest
  FROM public.bug_reports
  WHERE question_id IS NOT NULL
  GROUP BY question_id
  HAVING count(*) >= 3
  ORDER BY n DESC;

-- All reports for one question
SELECT category, severity, what_happened, submitted_at, contact_info
  FROM public.bug_reports
  WHERE question_id = '醫四-小兒科-22717s2'
  ORDER BY submitted_at DESC;
```

Legacy rows (submitted via SettingsPanel / HelpMenu) have `question_id IS NULL` — the partial index keeps them out of the index entirely.

### Mock exam (一階)

`inMockExam` is captured in `game_state`. Today the QuizModal entry always passes `false` (QuizModal is used in reading/review modes, not mock). `MockRunnerRoute` would need its own 🐞 wiring and would pass `true`; that's deferred to a future change.

When `inMockExam=true` the sheet shows an inline notice 「模擬考進行中，送出後可繼續答題」 and does not pause any stopwatch.

### `severity` default

Inline-flow rows always get `severity='minor'` (smallest impact tier in the existing 4-value enum). Players who think their report is more severe than 'minor' use the 「展開完整表單」 escape hatch and pick severity themselves.

## Follow-up changes (not in this milestone)

- `add-bug-report-screenshot-upload` — Supabase Storage bucket + signed-URL flow + client-side image compression.
- `add-bug-report-auto-read-pipeline` — daily cron + `/bug-reports` slash skill + SessionStart hook nudge so the owner gets a digest each morning.
- `add-inline-bug-report-from-mock-runner` — wire 🐞 into 一階 `MockRunnerRoute` with `inMockExam=true` snapshot wiring.
