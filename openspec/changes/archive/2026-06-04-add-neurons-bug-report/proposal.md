## Why

`apps/neurons-tw` has no in-app bug/suggestion channel — its HelpMenu「🩺 回報問題」section (`HelpMenu.tsx:180`) is a placeholder that only links to GitHub Issues, so player reports lose the highest-value context (which route, what game state, what console errors fired). 二階 already proved the in-app structured-report pattern (M4.5, documented in `docs/BUG_REPORTING.md`): a force-signed-in modal that auto-captures route + Dexie snapshot + console-error ring buffer + sync diagnostics into the shared Supabase `bug_reports` table the owner triages from Claude Code. neurons should get the same channel as it nears wider dogfood.

## What Changes

- Upgrade the HelpMenu「回報問題」placeholder into a real **`BugReportModal`** form (category radios + severity + free-text「在做什麼 / 發生什麼 / 預期什麼」 + reproducibility + optional contact), gated behind **force sign-in** (未登入顯示登入 CTA 取代表單，無匿名提交).
- Add an **inline 🐞 entry inside `QuizModal`** so a player can report a problem about the specific question they are looking at (carries `question_id`, mirroring 二階 migration `0007`). The 4 inline target choices map to neurons-flavored categories.
- Auto-attach context snapshot, each field per-submit opt-out via checkbox: `VITE_APP_VERSION` / `VITE_COMMIT_SHA` / `location.hash` route / neurons Dexie counters (`game_state`) / `user_agent` / viewport / recent console errors (new ring buffer) / **sync diagnostics** (`sync_metadata`).
- Introduce neurons-flavored `category` enum (12): `app-stability` / `maze-exploration` / `variant-collection` / `synapse` / `dmn-fate-cards` / `study-session` / `numbers-wrong` / `visual-glitch` / `cloud-sync` / `corpus` / `feature-request` / `other`. Severities reuse the existing 4 (`blocker` / `annoying` / `minor` / `suggestion`).
- **Supabase migration `0017`** (owner-applied, dashboard SQL): extend `bug_reports.app` CHECK to add `'neurons-tw'`; extend the `category` CHECK to include the neurons categories above (additive union with the existing medexam categories — existing rows unaffected, no data migration).
- Shared types in `@study-rpg/core` (`bug-report-types.ts`) gain the neurons categories so client + types + DB enum stay a single canonical set.
- **No Dexie `.version()` bump, no R2 bundle `SCHEMA_VERSION` bump** — bug reports write straight to Supabase Postgres (not IndexedDB / R2), exactly like 二階. Zero schema overlap with the in-flight `add-neurons-first-pull` change.

## Capabilities

### New Capabilities
- `neurons-bug-report`: in-app structured bug/suggestion submission for neurons-tw — force-signed-in HelpMenu form + inline QuizModal 🐞 (question-scoped) + auto-context snapshot (route / Dexie counters / console-error ring buffer / sync diagnostics, each opt-out) → shared Supabase `bug_reports` table; immutable rows, RLS `auth.uid() = user_id`, owner reads via service_role.

### Modified Capabilities
<!-- None. The generic `bug-reporting` spec stays medexam-scoped; neurons keeps an
     independent capability (same precedent as neurons-achievements vs achievement-system).
     The shared bug_reports table's app/category CHECK extension is additive infra,
     documented under Impact — it does not change medexam behavior. -->

## Impact

- **Code (neurons-tw)**: new `lib/services/bug-report.ts` (snapshot from neurons Dexie `db.ts`) + new `lib/services/console-error-buffer.ts` (window.error + unhandledrejection ring buffer, size 5) + new `components/BugReportModal.tsx` + new inline `QuizBugReportSheet` (or equivalent) wired into `components/QuizModal.tsx` + rewrite of the `HelpMenu.tsx` `bug-report` section.
- **Shared types**: `@study-rpg/core/src/lib/bug-report-types.ts` extended with neurons categories (additive; medexam categories retained).
- **Backend (owner-applied)**: `supabase/migrations/0017_*.sql` extends `bug_reports.app` + `category` CHECK constraints (additive). RLS / indexes unchanged. Reuses existing `sync_metadata` JSONB column from migration `0010` (no new column).
- **Auth dependency**: relies on existing neurons `lib/auth/{AuthContext,client}.ts` (force sign-in gate).
- **Env**: reuses `VITE_APP_VERSION` / `VITE_COMMIT_SHA` (CI-filled; local dev falls back to `'dev'`).
- **No impact**: Dexie schema / R2 bundle / sync engine / leaderboard / SRS / mastery / DMN / maze — zero overlap with the parallel `add-neurons-first-pull` session (shared working tree → explicit per-file `git add` discipline at apply/commit).
- **Owner manual step at ship**: apply `0017` via Supabase dashboard SQL Editor (same cadence as 二階 bug-report migrations).
