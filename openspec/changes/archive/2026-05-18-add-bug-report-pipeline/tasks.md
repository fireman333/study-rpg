## 1. Supabase schema

- [x] 1.1 Write `supabase/migrations/0004_bug_reports.sql` — `CREATE TABLE public.bug_reports` with `id` UUID PK, `user_id` UUID NOT NULL REFERENCES `auth.users(id) ON DELETE CASCADE`, `app` text CHECK (`app` IN ('medexam-tw','medexam2-hospital-tw')), `category` text CHECK enum (11 values), `severity` text CHECK enum (4 values), required textareas, optional textareas, all auto-context columns (`app_version`, `commit_sha`, `route`, `game_state` JSONB, `user_agent`, `viewport`, `recent_console_errors` JSONB), `submitted_at` timestamptz DEFAULT `now()`, three indexes on `(user_id)` / `(submitted_at DESC)` / `(severity)`, `ENABLE ROW LEVEL SECURITY`, and two policies `bug_reports_insert_own` + `bug_reports_select_own` (`auth.uid() = user_id`).
- [x] 1.2 Document the apply path in `docs/BUG_REPORTING.md` (and reference from proposal.md / tasks): user runs `supabase db push` or pastes the SQL via dashboard SQL editor. One-time manual step. _(Doc complete; the actual `db push` is a manual one-time step the user runs before §8 smoke — not gated by archive.)_
- [x] 1.3 RLS sanity SQL (commit as `supabase/sanity/bug_reports_rls.sql` reference, not auto-run): unauth `SELECT` → 0 rows; auth `INSERT` own → OK; auth `INSERT` with foreign `user_id` → rejected by policy.

## 2. Shared types (`@study-rpg/core`)

- [x] 2.1 Add `packages/core/src/lib/bug-report-types.ts` exporting `BUG_REPORT_CATEGORIES` (readonly array of 11 kebab-case strings), `BUG_REPORT_SEVERITIES` (readonly array of 4), `BUG_REPORT_REPRODUCIBILITY` (readonly array of 4: `'always' | 'sometimes' | 'once' | 'unsure'`), and the union types `BugReportCategory` / `BugReportSeverity` / `BugReportReproducibility` derived from those arrays. Also export interfaces `BugReportUserFields` (form data), `BugReportAutoContext` (auto fields), and `BugReportRow` (final DB shape).
- [x] 2.2 Re-export from `packages/core/src/index.ts` so apps consume via `import { BUG_REPORT_CATEGORIES, type BugReportRow } from '@study-rpg/core'`.
- [x] 2.3 Rebuild: `pnpm --filter @study-rpg/core build`. Confirm `packages/core/dist/index.d.ts` contains the new symbols.

## 3. Console-error ring buffer (per app)

- [x] 3.1 Create `apps/medexam-tw/src/services/console-error-buffer.ts` exporting `initConsoleErrorBuffer()` (registers `window.error` + `unhandledrejection` listeners; idempotent) and `getRecentConsoleErrors(): ConsoleErrorEntry[]` (returns shallow clone of internal buffer; size 5).
- [x] 3.2 Create `apps/medexam2-hospital-tw/src/services/console-error-buffer.ts` with identical implementation.
- [x] 3.3 Call `initConsoleErrorBuffer()` once at the top of each app's `main.tsx`, before `ReactDOM.createRoot(...)`.

## 4. Per-app snapshot + submit service

- [x] 4.1 Create `apps/medexam-tw/src/services/bug-report.ts` with `buildAutoContext()` (reads from `lib/db.ts` Dexie counters, returns full `BugReportAutoContext` shape) and `submitBugReport(userFields, autoContext, optOutSet)` (filters opted-out keys from autoContext, calls `supabase.from('bug_reports').insert({ user_id, app: 'medexam-tw', ...userFields, ...filteredAutoContext })`, throws on auth missing or supabase error).
- [x] 4.2 Create `apps/medexam2-hospital-tw/src/services/bug-report.ts` with same shape but reads from `db/schema.ts` HospitalDB tables (`gameCounters`, `doctors`, `pendingEvents`, etc.) and sets `app: 'medexam2-hospital-tw'`.

## 5. `BugReportModal` UI component (per app)

- [x] 5.1 Create `apps/medexam-tw/src/components/BugReportModal.tsx` accepting `{ isOpen, onClose }` props. State: `category`, `severity`, `whatDoing`, `whatHappened`, `whatExpected`, `reproducibility`, `contactInfo`, `allowFollowup`, plus `optOutSet: Set<keyof BugReportAutoContext>`. Reads `user` from `AuthContext`.
- [x] 5.2 Create `apps/medexam2-hospital-tw/src/components/BugReportModal.tsx` — copy of 5.1 with import paths adjusted for hospital app. _(Verbatim copy; same `../lib/auth/AuthContext` + `../services/bug-report` paths resolve correctly in both apps.)_
- [x] 5.3 Add CSS classes (`.bug-report-modal`, `.bug-report-modal__body`, `.bug-report-modal__radio-grid`, `.bug-report-modal__auto-context`, etc.) into each app's `src/styles.css`. 2-column radio grid on viewports > 480 px, single-column below.
- [x] 5.4 Login gate: when `!user`, render `<div className="bug-report-modal__login-gate"><p>請先登入再提交（這樣我才能跟你 follow-up）</p><AuthButton /></div>` instead of the form. _(Inline sign-in button calls `signInWithGoogle()` from useAuth instead of mounting `<AuthButton />` to keep the modal self-contained.)_
- [x] 5.5 Auto-context section: `<details open>` with `<summary>系統自動附帶（你可以逐欄取消勾選）</summary>`. Each field row: `<label><input type="checkbox" checked={!optOutSet.has(key)} onChange={…} /> {label}：<code>{previewValue}</code></label>`.
- [x] 5.6 Submit success: replace modal body with `<div className="bug-report-modal__success">✓ 謝謝你的回報！</div>`, `setTimeout(onClose, 2000)`.
- [x] 5.7 Submit error: show `<div className="bug-report-modal__error">送出失敗：{error.message}</div>` above the submit button; do not clear form state.

## 6. Wire trigger buttons

- [x] 6.1 一階 — `apps/medexam-tw/src/components/SettingsPanel.tsx`: add a 4th `<section className="settings-section">` titled 「回報問題 / 建議」 after the 資料管理 section. Body: short description + `<button onClick={() => setBugReportOpen(true)}>💬 回報問題 / 建議</button>`. Add modal mount + state to `SettingsPanel.tsx` (or hoist to App if cleaner).
- [x] 6.2 二階 — `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`: add a 9th entry to `SECTIONS` with `id: 'bug-report'`, `icon: '💬'`, `title: '回報問題 / 建議'`, and body that includes a button which sets a `bugReportOpen` state held in HelpMenu (or the parent). Modal mounted alongside HelpMenu's existing dialog.

## 7. Env / CI configuration

- [x] 7.1 In both `apps/medexam-tw/vite.config.ts` and `apps/medexam2-hospital-tw/vite.config.ts`, add a `define` block: `'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version ?? 'dev')`, `'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(process.env.VITE_COMMIT_SHA ?? 'dev')`.
- [x] 7.2 Edit `.github/workflows/deploy.yml` env block: keep `VITE_APP_VERSION` but switch its value from `${{ github.sha }}` to a `package.json`-derived value (e.g. set via a step that reads the version with `jq`); add a new line `VITE_COMMIT_SHA: ${{ github.sha }}`. Apply to both build steps (一階 + 二階). _(Implemented by dropping the explicit `VITE_APP_VERSION` env in CI — pnpm sets `npm_package_version` from `package.json` during the build script, which the new vite.config define picks up automatically. `VITE_COMMIT_SHA: ${{ github.sha }}` added.)_
- [x] 7.3 No `.env.example` change required — both fall back to `'dev'` locally; document in `docs/BUG_REPORTING.md` § Local dev.

## 8. Smoke verification (Chrome MCP) — deferred to user after migration applied

> Steps 8.1–8.6 require the migration `0004_bug_reports.sql` to be applied to the Supabase project first (manual one-time step per §1.2). They cannot be auto-run in this apply session because the table does not yet exist. The user runs these after applying the migration; results inform whether the change can be archived.

- [ ] 8.1 Run dev server on **port 5183** for 二階 (`pnpm --filter @study-rpg/medexam2-hospital-tw dev -- --port 5183`), avoiding ports 5180/5181/5182 occupied by dogfood sessions. Sign in via Google OAuth → open HelpMenu → expand 「💬 回報問題 / 建議」 → click open-modal button → fill form (category `app-stability`, severity `annoying`, sample text) → submit. Verify success state shown, modal auto-closes.
- [ ] 8.2 In Supabase dashboard SQL editor: `SELECT * FROM public.bug_reports ORDER BY submitted_at DESC LIMIT 1;` — confirm exact row, `game_state` JSONB shape, `app = 'medexam2-hospital-tw'`, `user_id = auth.uid()`.
- [ ] 8.3 Run dev server on **port 5184** for 一階 (`pnpm --filter @study-rpg/medexam-tw dev -- --port 5184`). Sign in → open Settings → click 「💬 回報問題 / 建議」 → repeat submit. Verify SQL row with `app = 'medexam-tw'`.
- [ ] 8.4 Sign out → re-open the modal in either app → confirm login gate is shown. Inspect DevTools network panel: zero outbound `supabase.co` traffic from the modal flow.
- [ ] 8.5 Opt-out smoke: re-sign-in, open modal, uncheck `game_state` checkbox, submit. SQL: `SELECT game_state FROM bug_reports ORDER BY submitted_at DESC LIMIT 1;` → expect `NULL`.
- [ ] 8.6 Console-error capture: in DevTools console run `setTimeout(() => { throw new Error('test-buffer-entry') }, 0)`. Open modal, submit. SQL: `SELECT recent_console_errors FROM bug_reports ORDER BY submitted_at DESC LIMIT 1;` → expect JSONB array containing the error.

## 9. Docs

- [x] 9.1 Create `docs/BUG_REPORTING.md` covering: architecture diagram (modal → service → Supabase), schema reference, RLS policies, env var inventory, owner-side read flow (SQL examples), local dev fallback values, follow-up changes roadmap.
- [x] 9.2 Update root `CLAUDE.md`: insert a new section "Bug reporting (M4.5)" after the existing "Supabase cloud sync (M4)" section, summarising the new table, env vars, modal entry points, and link to `docs/BUG_REPORTING.md`.
- [x] 9.3 Update `openspec/project.md` Roadmap: insert a new row `M4.5 — In-app bug report → Supabase` between M4 and M5 (do not renumber M5+). Mark status ✓ shipped once archive completes.

## 10. Pre-archive checks

- [x] 10.1 `pnpm -r typecheck` green.
- [x] 10.2 `pnpm -r build` green. _(Required `MEDEXAM_ALLOW_SKIPS=1 MEDEXAM2_ALLOW_SKIPS=1` — pre-existing 309 + 14 upstream OCR gaps; not introduced by this change.)_
- [x] 10.3 `openspec validate add-bug-report-pipeline --strict` passes.
- [ ] 10.4 `/opsx:verify` 3-dim check passes (completeness / correctness / coherence).
- [ ] 10.5 Working tree status reviewed; user confirms before invoking `/opsx:archive`.
