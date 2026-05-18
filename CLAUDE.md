# study-rpg — Project Instructions

> Project-level Claude Code memory. Loaded by every session in this repo (and overrides global `~/.claude/CLAUDE.md` where they conflict).

<!-- BEGIN: spec skill (OpenSpec wrapper) — managed block, edit between markers OK -->
## OpenSpec Workflow（本專案）

@openspec/project.md

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven development. Lifecycle gates are wrapped by the global `spec` skill (`~/.claude/skills/spec/`). Above `@openspec/project.md` import pulls the project-level context（tech stack、roadmap、out-of-scope）automatically into every session — avoids re-loading via `/spec resume`.

### Retreat rules

If any of the following are detected, **stop OpenSpec workflow immediately** and route to the correct skill:

- `research_plan.json` present in this dir → use `research-plan` skill instead
- `01_protocol/` + `09_qa/` present → use `ma-end-to-end` skill instead

These exist because OpenSpec is wrong tool for statistical analyses and meta-analyses (those have their own structured workflows).

### Recommended pipeline

For non-trivial changes, prefer this order over ad-hoc edits:

```
/opsx:propose <change>      # write proposal.md / design.md / tasks.md
/opsx:apply                 # implement per tasks.md
/simplify                   # code-quality review (global skill)
/opsx:verify                # OpenSpec 3-dim check (completeness / correctness / coherence)
/verify                     # end-to-end check (global skill, e.g. Chrome MCP for web apps)
/opsx:archive               # merge delta into main specs (slash workflow has sync gate)
auto-git commit             # only after archive — see auto-git skill rules
```

**Skip steps only when**:
- Trivial typo / one-line fix → just edit, no propose
- User explicitly says "skip verify" / "just commit"

### Dual-worktree development (M_2nd parallel track)

M2（一階）+ M_2nd（二階 hospital mode）並行用 git worktree 隔離。完整 workflow / naming convention / sync protocol / git ops policy 詳見 `openspec/project.md` § Development Workflow。

- **一階 session**: `cd ~/coding-scratch/study-rpg` (main branch)
- **二階 session**: `cd ~/coding-scratch/study-rpg-m2` (track-m2 branch)
- **Merge 二階 → main**: `cd ~/coding-scratch/study-rpg && git merge track-m2` (post-archive; needs explicit confirm)

### Curator rules (hard)

- **Never** `git commit` without explicit user confirmation
- **Never** auto-write spec content — every requirement / scenario needs user-confirmed wording
- **Never** run `openspec archive --yes` raw CLI — always use `/opsx:archive` slash (it has a sync gate the raw CLI skips)
- Engine API surface (`packages/core/src/types.ts`) is the third-party fork contract; breaking changes need a CHANGELOG entry
- `packages/core/` stays content-agnostic — medical terms belong in theme / content packs, never in core
<!-- END: spec skill -->

## Repo-specific build / dev quick reference

```bash
# Re-build 題庫 (defaults to all 10 subjects, ~3291 imported / 309 上游 OCR 缺欄位 skip;
# set MEDEXAM_SUBJECTS=藥理學 for vertical-slice fast iteration)
MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build

# Copy built questions.json to app public/
cp packages/content-medexam-tw/dist/*.json apps/medexam-tw/public/content/medexam-tw/

# Cold checkout 第一次跑前要先 build packages/core (main/exports 已指向 dist/，不再走 src/.ts on-the-fly)。
# core src/index.ts 改動後也要再跑一次。`pnpm -r build` 會 topo-sort 自動處理，
# 但只跑 `pnpm dev` 時不會：
pnpm --filter @study-rpg/core build  # 必要 cold checkout 或 core 改動後

# Dev server (http://localhost:5173/study-rpg/)
pnpm --filter @study-rpg/medexam-tw dev

# medexam-tw `build` 已加 prebuild hook 會自動 rebuild core，CI deploy.yml 走這條路徑

# Typecheck everything
pnpm -r typecheck
```

## Supabase cloud sync (M4)

`apps/medexam-tw` mirrors gameplay state to Supabase Postgres via opt-in Google OAuth. IndexedDB stays source of truth; cloud is additive.

### Project + env

| Resource | Value |
|---|---|
| Project ref | `jakdyjxojokyqxeiuukx` (Tokyo `ap-northeast-1`, free tier) |
| Dashboard | https://supabase.com/dashboard/project/jakdyjxojokyqxeiuukx |
| Anon key format | `sb_publishable_*` (new format, replaces legacy anon JWT; both supported by `@supabase/supabase-js@^2.105.4`) |
| OAuth provider | Google only (Client ID `554492800193-1gp4...`, scope `study-rpg-web`) |

Env vars (`.env.local` per app, gitignored; `.env.example` committed):

```
VITE_SUPABASE_URL=https://jakdyjxojokyqxeiuukx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_eWafgmt2wbELXnnIAYENOg_pL0aE5yN
VITE_CLOUD_SYNC_ENABLED=true        # set 'false' to disable client-side (kill switch)
VITE_SYNC_DEBOUNCE_MS=3000          # debounce window for batched push
```

GH Actions secrets (still TBD before next prod deploy — Task 3.3): add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to repo Secrets → expose to `.github/workflows/deploy.yml`.

### Schema (9 sync tables + 4 RPCs)

Migrations live in `supabase/migrations/`:

- `0001_init_cloud_sync.sql` — 一階 (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog`) + 二階 (`hospital_state` / `hospital_doctors` / `hospital_mastery` / `hospital_question_history`) tables + 32 RLS policies (`auth.uid() = user_id`)
- `0002_account_lifecycle.sql` — RPCs `delete_my_data()` / `delete_my_account()` / `export_my_data()` (SECURITY DEFINER, scoped to caller's `auth.uid()`)
- `0003_upsert_lww.sql` — RPC `upsert_lww(table_name, rows)` with 8-table whitelist + server-side LWW (`ON CONFLICT WHERE cloud.updated_at < incoming.updated_at`)
- `0005_question_bookmarks.sql` — 二階 `question_bookmarks` table (composite PK `(user_id, question_id)`, immutable `added_at` + LWW `updated_at`) + 4 RLS policies. Backs the `/bookmarks` page in `medexam2-hospital-tw`.
- `0006_upsert_lww_bookmarks.sql` — `CREATE OR REPLACE` of `upsert_lww` extending whitelist to 9 tables + new dispatch branch. Convention: every future `upsert_lww` change ships as a new numbered migration; never edit existing migrations in place.

### Architecture pointers

| Concern | Location |
|---|---|
| Sync engine factory | `apps/medexam-tw/src/lib/sync/engine.ts` |
| Table adapters (per-table snapshot + apply) | `apps/medexam-tw/src/lib/sync/tables.ts` |
| Migration / conflict gate state machine | `apps/medexam-tw/src/lib/sync/migration.ts` |
| React hook wiring | `apps/medexam-tw/src/lib/sync/useSync.ts` |
| Auth context + Supabase client singleton | `apps/medexam-tw/src/lib/auth/{AuthContext,client}.ts` |
| Sign-in resolution modals | `apps/medexam-tw/src/components/{MigrationUploadPrompt,ConflictChooserModal,SettingsPanel}.tsx` |
| Dexie schema (v4 with `localBackup` table) | `packages/core/src/lib/db.ts` |

二階 app (`apps/medexam2-hospital-tw`) currently has schema + env but client-side wiring still pending (Tasks 4.6 + 5.5).

### DEV-only debug handles

When the engine is running (authed + gate state ∈ `fresh-start` / `silent-pull` / `resolved` / non-keep-separate):

```js
globalThis.__sync   // SyncEngine instance — getStatus(), pushNow(), pullNow(), pushAllNow(), pullAllNow(), pause(), resume()
globalThis.__db     // StudyRpgDB Dexie instance
```

Both gated by `import.meta.env.DEV`; stripped from prod build.

### RLS sanity check (run in dashboard SQL editor)

```sql
-- Should return only your own rows under any active session
select count(*), user_id from player_state group by user_id;

-- Should fail (no auth context) — confirms RLS is enforced
set role anon;
select count(*) from player_state;
reset role;
```

## Bug reporting (M4.5)

`apps/medexam-tw` and `apps/medexam2-hospital-tw` both ship an in-app **`💬 回報問題 / 建議`** flow:

- 一階 entry: `SettingsPanel.tsx` new section.
- 二階 entry: `HelpMenu.tsx` 9th accordion section.

Submissions land in Supabase table **`public.bug_reports`** (migration `supabase/migrations/0004_bug_reports.sql`). RLS = `auth.uid() = user_id` per row; owner reads via `service_role` (dashboard SQL editor today, future `/bug-reports` skill after the follow-up change).

Shared types: `@study-rpg/core` exports `BUG_REPORT_CATEGORIES`, `BUG_REPORT_SEVERITIES`, `BugReportRow`, etc. Per-app `services/bug-report.ts` builds the snapshot from each app's Dexie shape; per-app `services/console-error-buffer.ts` keeps a ring buffer of the last 5 `window.error` + `unhandledrejection` events.

Env vars (split from cloud-sync section above): `VITE_APP_VERSION` (npm `package.json` version; CI fills via `npm_package_version` automatically) and `VITE_COMMIT_SHA` (CI sets to `github.sha`). Local dev falls back to `'dev'`.

Force sign-in gate: modal shows a login CTA instead of the form when `useAuth().user` is null. No anon submit path.

Apply the migration manually once: `supabase db push` or paste `0004_bug_reports.sql` into the dashboard SQL editor. Sanity SQL in `supabase/sanity/bug_reports_rls.sql`. Full reference: `docs/BUG_REPORTING.md`.

## Source data path

題庫原始 .md 在使用者本機（**不在 repo 內**）：

```
$HOME/Desktop/國考/一階國考/陽明國考考古/_extracted/
└── 醫學一/ + 醫學二/  (10 subjects × 18 files each = 180 files, ~3505 Q)
```

Build script 預設讀此路徑；其他環境設 `MEDEXAM_SOURCE_ROOT` env var 覆寫。

## Known sharp edges

- TypeScript `tsconfig.base.json` 不要再加 `paths` — leaf packages 透過 pnpm workspace symlink 解析 `@study-rpg/core`，加 paths 反而觸發 rootDir 衝突（2026-05-14 踩過）
- esbuild 解析 TS comment 時對 `**/` 敏感 — 任何 block comment 不要寫 `/**/*.md` 之類 glob，會提前終止註解（content build script 踩過）
- `font-family: 'Cubic 11'` 必須來自 host app `public/fonts/`（透過 `@font-face`），theme package 不能直接 ship webfont 給 npm consumer，因 npm 不會自動 publish 字型檔
