> **Git discipline (multi-session worktree).** `add-neurons-first-pull` has now SHIPPED
> (merged at `979f913`); the working tree is clean except the `meta.json` builtAt churn
> (exclude from commits) and this change's untracked files. This worktree has hosted
> several parallel sessions, so keep the discipline: NEVER `git add -A` / `git add .`.
> Stage explicit files only and run `git diff --cached --name-status` before every commit
> to confirm the staging set contains ONLY this change's files (new services/components,
> HelpMenu, QuizModal, core bug-report-types, migration 0017,
> openspec/changes/add-neurons-bug-report/). Per `multi_agent_git_safety`.

## 1. Shared types (@study-rpg/core)

- [x] 1.1 In `packages/core/src/lib/bug-report-types.ts` add additive exports for the neurons set: `NEURONS_BUG_REPORT_CATEGORIES` (12 kebab-case values per spec — `app-stability` / `maze-exploration` / `variant-collection` / `synapse` / `dmn-fate-cards` / `study-session` / `numbers-wrong` / `visual-glitch` / `cloud-sync` / `corpus` / `feature-request` / `other`) + `NeuronsBugReportCategory` type. Do NOT mutate the existing `BUG_REPORT_CATEGORIES` (medexam) — keep additive.
- [x] 1.2 Add `'neurons-tw'` to `BUG_REPORT_APPS` (and `BugReportApp` type updates automatically).
- [x] 1.3 **Reuse existing** `QUIZ_BUG_TARGETS` + `QUIZ_BUG_TARGET_TO_CATEGORY` (already in core: question/image/explanation/other → question-error/image-broken/explanation-error/other — generic, not medexam-specific; the 3 mapped categories + `question_id` column already exist via migration `0007`). No new quiz-target const needed. Severities + reproducibility reuse existing exports unchanged.
- [x] 1.4 Re-export new symbols from `packages/core/src/index.ts`; `pnpm --filter @study-rpg/core build` (dist refresh so neurons app sees the new types).

## 2. Supabase migration 0017 (owner-applied)

- [x] 2.1 Write `supabase/migrations/0017_neurons_bug_reports.sql`: `ALTER TABLE public.bug_reports` to DROP + re-add the `app` CHECK including `'neurons-tw'`, and the `category` CHECK as the **union** of existing medexam categories + the 12 neurons categories. Additive only — no data migration. Header comment points at `bug-report-types.ts` as the canonical category source (D3).
- [x] 2.2 Validate the SQL offline (`sqlite3` or paste-read) — confirm CHECK lists are byte-identical to the core const and that every existing medexam value still passes.
- [x] 2.3 Leave a checklist note (in tasks + change README/handoff) that the owner applies `0017` via Supabase dashboard SQL Editor at ship time (it is NOT auto-applied).

## 3. Console error ring buffer (net-new)

- [x] 3.1 New `apps/neurons-tw/src/lib/services/console-error-buffer.ts`: install `window.error` + `unhandledrejection` listeners into a size-5 ring (message + stack); export `getRecentConsoleErrors()`.
- [x] 3.2 Install the buffer once at app startup (e.g. in `App.tsx` boot or a module side-effect import); guard against double-install.

## 4. Snapshot + submit service

- [x] 4.1 New `apps/neurons-tw/src/lib/services/bug-report.ts`: `buildAutoContext()` assembling app version / commit SHA / route / `game_state` (compact PII-free numeric+enum snapshot from neurons `lib/db.ts`) / user agent / viewport / `getRecentConsoleErrors()` / `sync_metadata` (from the sync engine diagnostic getter; fall back to assembling from `globalThis.__sync?.getStatus?.()`-equivalent fields).
- [x] 4.2 `submitBugReport(payload, optOuts)`: omit each opted-out auto-context field; `supabase.from('bug_reports').insert({ app: 'neurons-tw', ... })`. Surface insert errors to the user (no silent swallow per `coding_principles` §5).

## 5. BugReportModal (HelpMenu form)

- [x] 5.1 New `apps/neurons-tw/src/components/BugReportModal.tsx`: category radios (neurons set, emoji + 中文 label) + severity + required「在做什麼 / 發生什麼」+ optional「預期什麼」+ reproducibility + contact + follow-up consent; per-field opt-out checkboxes for the auto-context fields (default checked) with a short disclosure of what each captures.
- [x] 5.2 Force sign-in gate: when `useAuth().user` is null render a sign-in CTA instead of the form (D6).
- [x] 5.3 Rewrite the `HelpMenu.tsx` `bug-report` section (id `'bug-report'`, currently line ~180) to open `BugReportModal` instead of pointing at GitHub Issues; keep the section title「回報問題」.

## 6. Inline QuizModal 🐞

- [x] 6.1 Add an inline 🐞 entry + compact report sheet inside `apps/neurons-tw/src/components/QuizModal.tsx`: small target picker (`NEURONS_QUIZ_BUG_TARGETS`) + single description field, same sign-in gate.
- [x] 6.2 On submit, map target → category, stamp the displayed question's `question_id` (non-opt-out for inline), reuse `submitBugReport`. (Coordinate this QuizModal edit with the future `add-neurons-question-tags` change — same file.)

## 7. Tests

- [x] 7.1 Unit: `buildAutoContext` omits opted-out fields; `game_state` is numeric/enum-only; opted-in fields all present.
- [x] 7.2 Unit: console ring buffer keeps the newest 5; empty buffer is harmless.
- [x] 7.3 Unit: inline target → neurons category mapping is exhaustive; HelpMenu submit has null `question_id`, inline submit stamps `question_id`.
- [x] 7.4 Unit: category canonical-form guard — assert the core `NEURONS_BUG_REPORT_CATEGORIES` list equals the kebab-case list mirrored in the migration (string-compare fixture) so UI↔DB can't drift.
- [x] 7.5 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` clean; `pnpm lint:dexie-fixtures` (no Dexie bump → should pass untouched).

## 8. Verify (/verify stage)

- [x] 8.1 Chrome MCP end-to-end (2026-06-04, dev localhost:5175, owner applied `0017` + signed in): render + force-sign-in gate (signed-out → CTA) ✓. **Live submit VERIFIED:** HelpMenu form → submit → row landed `app='neurons-tw'` / `category='maze-exploration'` (neurons-unique, proves new CHECK) / `question_id=null` / full PII-free `game_state` (13 keys + meta) / `sync_metadata` authed+online; inline QuizModal 🐞 → submit → row landed `category='explanation-error'` (詳解→mapped) / `question_id='111-1-醫學一-生物化學-Q83'` stamped. RLS read-back returned only the player's own 2 rows. Console clean.
- [x] 8.2 If `0017` not yet applied, confirm the client surfaces the Supabase CHECK error (23514) rather than swallowing it, and document the owner-apply gate in the handoff.

## 9. Docs

- [x] 9.1 Update `docs/BUG_REPORTING.md`: add the neurons-tw row to the per-app split, the neurons category set, and the `0017` migration to the schema-migration section.
- [x] 9.2 Add a one-line pointer in project root `CLAUDE.md` (bug reporting section) noting neurons-tw now ships the in-app report flow + the owner-applied `0017` step.
