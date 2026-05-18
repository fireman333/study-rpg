## Why

Dogfood user (owner 康瑋麟，醫五) is running 二階國考 RPG daily and accumulating bugs / UX papercuts faster than they can be reported via Threads / Slack / email. Off-app reporting also strips the auto-captured context that matters most (which route, what game state, recent console errors, viewport, commit SHA). An in-app "💬 回報問題" modal — wired to a Supabase `bug_reports` table — lets the player file a structured report in 30 s with full snapshot attached, so the owner can triage every morning via Claude Code. Slots between M4 (cloud-sync, just shipped) and M6 (social), and is the prerequisite for a later "daily cron + `/bug-reports` skill" follow-up change.

## What Changes

- Add a new **`bug_reports`** Postgres table in Supabase (migration `supabase/migrations/0004_bug_reports.sql`) with CHECK constraints on category / severity / app, three indexes, RLS enabled, and two policies (`insert_own`, `select_own`). Owner reads via `service_role`.
- Add shared TypeScript types in `packages/core/src/lib/bug-report-types.ts` (`BugReportCategory` — 11 kebab-case enums; `BugReportSeverity` — 4 enums; `BugReportUserFields`, `BugReportAutoContext`, `BugReport`). Re-export from `packages/core/src/index.ts`.
- Add a per-app **console error ring buffer** (`services/console-error-buffer.ts`) capturing the last 5 `window.error` / `unhandledrejection` events. Initialised once in each `main.tsx` at boot.
- Add a per-app **snapshot + submit service** (`services/bug-report.ts`) that reads Dexie counters into `game_state` JSONB and POSTs to Supabase.
- Add a per-app **`BugReportModal.tsx`** component (copy-paste OK for MVP; later extracted) — category radio (11), severity radio (4), three textareas (`what_doing`, `what_happened`, `what_expected`), reproducibility radio, optional contact + allow-followup checkbox. Expandable `系統自動附帶` section shows every auto-context field with per-field opt-out checkbox.
- **Force sign-in gate**: if `auth.user` is null when the modal opens, show "請先登入再提交（這樣我才能跟你 follow-up）" + inline sign-in button instead of the form. No anon submit path.
- Wire trigger buttons:
  - 一階 (`apps/medexam-tw`): new section "💬 回報問題 / 建議" inside `SettingsPanel.tsx` after 資料管理.
  - 二階 (`apps/medexam2-hospital-tw`): 9th accordion section "💬 回報問題 / 建議" inside `HelpMenu.tsx`.
- Split `VITE_APP_VERSION` and `VITE_COMMIT_SHA` env injection in both `vite.config.ts` (with `'dev'` fallback) and in `.github/workflows/deploy.yml` (APP_VERSION = npm `package.json` `version`, COMMIT_SHA = `github.sha`). The current deploy.yml maps APP_VERSION to `github.sha`, which is reused as COMMIT_SHA today; this change makes them semantically distinct.
- Document the architecture in `docs/BUG_REPORTING.md` (owner read flow), add a "Bug reporting (M4.5)" section to root `CLAUDE.md`, and amend `openspec/project.md` Roadmap.

## Capabilities

### New Capabilities
- `bug-reporting`: In-app structured bug / suggestion submission to Supabase, with auto-attached game-state context and per-field opt-out.

### Modified Capabilities

(None — no existing capability's requirements change. `auth` / `cloud-sync` / `deploy-pipeline` are touched at the configuration / consumer level only, not at the requirement level.)

## Impact

- **New code**:
  - `supabase/migrations/0004_bug_reports.sql` (table + indexes + RLS policies)
  - `packages/core/src/lib/bug-report-types.ts` + re-export from `packages/core/src/index.ts`
  - `apps/medexam-tw/src/services/{bug-report,console-error-buffer}.ts` + `components/BugReportModal.tsx`
  - `apps/medexam2-hospital-tw/src/services/{bug-report,console-error-buffer}.ts` + `components/BugReportModal.tsx`
  - `docs/BUG_REPORTING.md`
- **Modified code**:
  - `apps/medexam-tw/src/main.tsx` + `apps/medexam2-hospital-tw/src/main.tsx` (call `initConsoleErrorBuffer()`)
  - `apps/medexam-tw/src/components/SettingsPanel.tsx` (new section + state for modal)
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` (9th accordion section + state for modal)
  - `apps/medexam-tw/vite.config.ts` + `apps/medexam2-hospital-tw/vite.config.ts` (add `define` for `VITE_APP_VERSION` / `VITE_COMMIT_SHA`)
  - `.github/workflows/deploy.yml` (split APP_VERSION / COMMIT_SHA env)
  - `apps/medexam-tw/src/styles.css` + `apps/medexam2-hospital-tw/src/styles.css` (modal styling)
  - `packages/core/src/index.ts` (re-export new types)
  - Root `CLAUDE.md` + `openspec/project.md` (docs)
- **Dependencies**: no new npm packages. Reuses `@supabase/supabase-js` (already in both apps), Dexie (already), React (already).
- **External resources**: requires user to apply migration `0004_bug_reports.sql` once via `supabase db push` or dashboard SQL editor (documented in tasks).
- **No breaking changes** to public API surface (`@study-rpg/core`'s exported types are additive).

## Out of Scope

- ❌ Screenshot file upload — needs a Supabase Storage bucket + signed-URL flow + client-side image compression. Deferred to follow-up change `add-bug-report-screenshot-upload`.
- ❌ Daily cron job + `/bug-reports` slash skill + SessionStart hook nudge — owner-side automation. Deferred to follow-up change `add-bug-report-auto-read-pipeline`.
- ❌ Anon (unauthenticated) submission via rate-limited edge function — not needed while dogfooding; sign-in gate is adequate.
- ❌ In-app triage UI (list / acknowledge / resolve reports). Owner reads via direct SQL or future skill; players never see other players' reports.
