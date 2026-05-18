## Context

study-rpg is in heavy dogfood: a solo medical-student owner (康瑋麟) plays 二階國考 RPG daily and accumulates more papercuts than fits in a Threads DM. Three parallel dogfood sessions are running on the `track-m2` worktree (ports 5180 / 5181 / 5182). This change runs in an isolated worktree on a 4th branch `add-bug-report-pipeline` off `track-m2`, and ships an in-app submission flow that writes to Supabase Postgres.

Current foundation:

- `apps/medexam-tw` and `apps/medexam2-hospital-tw` both already authenticate via Supabase Auth (Google OAuth) — `apps/<app>/src/lib/auth/{client,AuthContext}.ts`.
- Cloud-sync (M4) shipped 3 migrations (`supabase/migrations/0001`–`0003`); RLS pattern is `auth.uid() = user_id` per row.
- Owner reads cloud data either via Supabase dashboard SQL editor or via a future Claude Code skill.
- Both apps use Vite 5 + React 18 + Dexie. Build pipeline uses `VITE_APP_VERSION = github.sha` today (single env injected from `.github/workflows/deploy.yml`).

The handoff fixed every design knob (categories / severities / schema / RLS / scope cuts / button placement). This document records *why* each was chosen and what trade-offs are accepted.

## Goals / Non-Goals

**Goals:**

- Player can file a bug / suggestion in ≤ 30 s from inside either app without leaving the page.
- Submitted report carries enough context (game state JSONB, route, viewport, commit SHA, last 5 console errors) that the owner can usually triage without follow-up.
- Categorisation is in the player's vocabulary (emoji + spoken Chinese), not engineering jargon, while the database stores stable kebab-case enums.
- Player can opt out of any auto-context field per-submit (privacy lever).
- Reports are isolated per user via RLS (`auth.uid()`). Owner reads everyone's reports only through `service_role`.
- Two apps share the type definitions (via `@study-rpg/core`) but have independent snapshot helpers (different Dexie shapes).

**Non-Goals:**

- Screenshot upload — deferred to `add-bug-report-screenshot-upload`.
- Daily cron / `/bug-reports` slash skill / SessionStart nudge — deferred to `add-bug-report-auto-read-pipeline`.
- Anon submit path — deferred. Force sign-in covers MVP.
- In-app triage / list / acknowledge UI for the owner — read-only via SQL or future skill.
- Real-time delivery / push notification — owner polls.

## Decisions

### D1 — Supabase table > Google Forms / GitHub Issues

**Decision**: Store reports in a new Supabase table `bug_reports` with RLS.

**Why**:

- The owner-facing read flow lives inside Claude Code (a future skill will batch query). Forms / Issues require manual scraping.
- Auto-attached `game_state` JSONB is the single highest-value piece of context; neither Google Forms nor GitHub Issues exposes structured JSONB columns to a later SQL aggregation.
- Supabase project (`jakdyjxojokyqxeiuukx`) and auth are already wired; the marginal cost of one more table is near-zero.

**Alternatives considered**:

- Google Forms — drop-in but loses JSONB context and can't be queried from Claude Code easily.
- GitHub Issues via personal-access-token — leaks owner's PAT into client bundle, no RLS, and creates noise in the issue tracker.
- Discord webhook — fast to ship but no SQL aggregation, no per-field opt-out semantics.

### D2 — Force sign-in gate (no anon submissions)

**Decision**: If `supabase.auth.getUser()` returns null when the modal opens, show a sign-in CTA instead of the form. No anon path.

**Why**:

- Dogfood users are already signed in for cloud-sync.
- Public users who haven't signed in cannot follow up on their own report, which defeats the value.
- Anon path requires a rate-limited edge function + abuse mitigation; adding it later is a small change.

**Trade-off accepted**: A first-time visitor who hits a bug *before* signing in must sign in first. UX cost vs. abuse / spam exposure — accepted.

### D3 — 11 categories + 4 severities, fixed enums with CHECK constraints

**Decision**: Use Postgres `CHECK (column IN (...))` against the kebab-case enum list. Same enums exposed via `@study-rpg/core` so client-side radio buttons cannot drift from the DB constraint.

**Why**:

- Free-text "tags" would degrade triage; closed set keeps the bucket distribution learnable.
- CHECK constraint is the canonical-form discipline from `coding_principles.md` §6 — single source of truth on both sides.

**Trade-off accepted**: Adding a 12th category requires a migration (acceptable cadence — quarters, not days).

### D4 — Snapshot is `JSONB`, per-field opt-out is *client-side filter*, not server-side schema

**Decision**: Auto-context is sent as one row with nullable columns; each auto-context field has a checkbox in the modal. Unchecked field → client omits the column from the INSERT payload, server stores NULL.

**Why**:

- Adding a per-field consent row would 9× the row count and complicate ownership queries.
- Player retains real control (verifiable in DevTools network panel).
- Owner gains the ability to query "how many submits ever opted out of `game_state`?" via simple SQL.

**Trade-off accepted**: Server cannot enforce that the player saw the opt-out UI. Acceptable — sign-in gate is the trust anchor.

### D5 — Per-app `services/bug-report.ts` (no shared runtime helper)

**Decision**: Each app has its own `bug-report.ts` and `console-error-buffer.ts`. The only thing shared is types (in `@study-rpg/core`).

**Why**:

- The two apps have different Dexie schemas. A unified helper would have to take a discriminator type and branch — more code than copy-paste.
- M3 just stabilised the npm-published core API surface; adding runtime helpers there now would re-expand the surface area we just contracted.

**Trade-off accepted**: Two near-identical `BugReportModal.tsx` files. If a third app appears, extract to `@study-rpg/_shared-ui` (separate change).

### D6 — Console error buffer = window-level ring buffer, not React error boundary

**Decision**: A module-scoped `Array<{message, source?, line?, timestamp}>` of size 5, fed by `window.addEventListener('error')` + `'unhandledrejection'`. No console.error monkey-patch.

**Why**:

- React Error Boundary catches render-time errors but misses async / promise rejections / non-React handlers.
- Monkey-patching `console.error` mangles dev DX (double-prints, recursion).
- Ring buffer is O(1) on every event and zero overhead when no errors fire.

**Trade-off accepted**: We don't capture pure `console.error('foo')` calls that don't throw — these are rare and usually intentional dev logs.

### D7 — Trigger placement: 一階 SettingsPanel, 二階 HelpMenu accordion

**Decision**: One natural entry per app, matching the existing affordance.

- 一階 (`medexam-tw`) has `SettingsPanel.tsx` with 3 sections (帳號 / 同步狀態 / 資料管理). Add a 4th 「💬 回報問題 / 建議」.
- 二階 (`medexam2-hospital-tw`) has `HelpMenu.tsx` (floating ❓ FAB → 8 accordion sections). Add a 9th 「💬 回報問題 / 建議」 section whose body contains the button.

**Why**:

- Both apps already have a "meta" surface the player visits intentionally — co-locating bug-report there avoids dedicated FAB clutter.
- HelpMenu accordion's expand-on-tap pattern matches the existing UX without retraining muscle memory.

**Alternatives rejected**:

- Floating FAB in both apps (clutter; 一階 has no FAB pattern at all).
- Global keyboard shortcut (discoverability ~0% on mobile).

### D8 — Split `VITE_APP_VERSION` and `VITE_COMMIT_SHA`

**Decision**: `VITE_APP_VERSION` = npm `package.json` `version`. `VITE_COMMIT_SHA` = `github.sha`. Both have a `'dev'` fallback in `vite.config.ts`.

**Why**:

- Today `VITE_APP_VERSION` is `github.sha` everywhere, conflating "what code is running" with "what semver are we on". A bug report ideally tells the owner both ("running v0.2.1 at commit 9156367").
- Splitting now (one CI env-block edit) avoids a backfill later when `package.json` versions start bumping for npm releases.

**Trade-off accepted**: Local dev runs see `'dev'` for both. Acceptable — local bugs are usually self-diagnosed.

### D9 — Use `<details open>` for auto-context section, not a custom expander

**Decision**: Native HTML `<details>` element, `open` by default, with a `<summary>` and a `<ul>` of checkboxes.

**Why**:

- Native = zero JS, free keyboard / screen-reader support.
- "Open by default" makes the privacy lever discoverable (player sees what's attached *before* hitting submit).

### D10 — Submit success / error UX

**Decision**:

- Success → swap modal body for `✓ 謝謝你的回報！` + auto-close after 2 s.
- Error → show `送出失敗：<error.message>`, keep form filled, let player retry.

**Why**:

- Player should never lose typed text after a transient network blip.
- 2 s auto-close beats "Close" button — clicks-saved matter on mobile.

## Risks / Trade-offs

- **[Risk] Migration drift between client TS enums and Postgres CHECK constraint.**
  → Mitigation: Both pull from `BugReportCategory` / `BugReportSeverity` arrays exported by `@study-rpg/core`. The migration SQL has the list inline (Postgres CHECK can't be parameterised by external constants), so any addition requires *both* a TS edit and a migration file. Document this in `docs/BUG_REPORTING.md`.

- **[Risk] Player attaches sensitive PII in free-text fields (`contact_info`, `what_doing`).**
  → Mitigation: Field labels are explicit ("optional", "可選"). Contact field example placeholder reads "email / IG / Threads 留空 = 匿名". No automated scraping of textareas for PII (acceptable — owner reviews manually).

- **[Risk] Ring buffer leaks stale errors across long sessions / route changes.**
  → Mitigation: Buffer size 5 + timestamps means stale errors are visually obvious to the owner. No automatic clearing — players in a single session might trigger errors then file a report 10 min later, and we want those 10-min-old entries.

- **[Risk] `game_state` snapshot reveals current run progress to a third party if `bug_reports` is ever leaked.**
  → Mitigation: RLS enforces `auth.uid() = user_id`. Anon `SELECT` returns zero rows. Owner uses `service_role` (server-side only, never exposed to client). Acceptable risk for a side-project corpus.

- **[Risk] Modal renders a wall of 11 categories on a small phone viewport.**
  → Mitigation: 2-column grid layout on > 480 px, single-column on smaller. Tested via Chrome MCP responsive smoke (tasks §8).

- **[Risk] Two apps' BugReportModal diverge over time (copy-paste rot).**
  → Mitigation: Both files use the same enum source; UX divergence will surface during dogfood. Accepted for MVP; lift to shared component if a third app appears.

## Migration Plan

1. Land the migration file at `supabase/migrations/0004_bug_reports.sql` in this branch.
2. Owner runs `supabase db push` (or pastes the SQL in the dashboard SQL editor) — manual, one-time, documented in task 1.2.
3. RLS sanity SQL (task 1.3): unauth `SELECT` → 0 rows; auth `INSERT` own → OK; auth `INSERT` other user_id → reject.
4. After both apps are wired, smoke via Chrome MCP (tasks §8) on local dev servers (ports 5183 / 5184, isolated from dogfood ports 5180–5182).
5. CI deploy.yml split lands in the same change; on next `main` push the prod build will inject both env vars correctly.
6. No data migration / backfill — `bug_reports` starts empty.

**Rollback**: drop the table (`DROP TABLE public.bug_reports CASCADE;`), revert the merge. Client code degrades gracefully if the table is missing (modal shows error on submit, no other UX surface is touched).

## Open Questions

1. Should we add a `client_local_id` UUID (generated client-side, included in payload) so that retried submits dedupe rather than create duplicate rows? — Deferred. Network is generally good; if dogfood surfaces duplicates we add it in a small follow-up.
2. Should `recent_console_errors` capture stack traces? — Initial impl captures `message` + `source` + `line` only. Stack traces blow up payload size; revisit if owner reports needing them.
3. Should we rate-limit per-user submissions client-side? — No. Dogfood scale; bad actors can be banned later.
