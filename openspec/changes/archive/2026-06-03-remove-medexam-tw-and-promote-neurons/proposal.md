## Why

Two reference apps in this monorepo are now dead weight:

1. **一階 `apps/medexam-tw`** entered maintenance mode on 2026-05-25 when M_3rd `apps/neurons-tw` shipped as the LTP / Hebbian reskin reusing the same ~3505-question 一階 corpus. Shipping both doubles deploy cost (build steps, CF Pages routes, four Supabase tables + R2 `m1` bundle), confuses the product story at `med-study-rpg.com`, and forces every cross-cutting change (auth, sync, deploy) to be tested against two near-identical apps. **Owner confirmed 一階 has NO real players** (only dogfood/owner data), so the data-loss teardown is low-stakes. neurons-tw fully replaces 一階 as the canonical reference impl.

2. **二階 `apps/medexam2-hospital-tw` (+ `theme-pixel-hospital` + `content-medexam2-tw`)** became dormant on 2026-06-03 when `split-medexam2-standalone` extracted 二階 to its own repo (`fireman333/study-rpg-2nd`) consuming `@study-rpg/core` from npm. The split decoupled 二階's *deploy* but deliberately left its *source* in this monorepo (KEEP-then-fold decision, `openspec/decisions/2026-06-03.md`). Two copies now exist; the monorepo copy is dead and will drift. All future 二階 work goes to the standalone repo.

This change tears down 一階 entirely and deletes the dormant monorepo 二階 source in one pass, leaving the monorepo with two live apps: **`neurons-tw` (canonical, `/neurons/`)** and the shared `@study-rpg/core` engine. Backend infrastructure that survives (Supabase Auth, `bug_reports` table, sync Worker, R2 `m2`/`bookmarks`/`neurons` bundles, D1) is untouched because the standalone 二階 + neurons still depend on it.

## What Changes

### 一階 teardown (BREAKING)

- **BREAKING**: Delete `apps/medexam-tw/`, `packages/content-medexam-tw/`, `packages/theme-pixel-medical/`. Pre-deletion git history is the only artifact. `@study-rpg/core` is unaffected (verified: neurons / 二階 / their content+theme packs have zero source or `package.json` references to the deleted packages).
- **BREAKING (live URL)**: `https://med-study-rpg.com/1st/` → 404 (dropped from CF Pages ROUTES). No redirect; bookmarks break.
- **BREAKING (live URL)**: **GitHub Pages fully retired** — `.github/workflows/deploy.yml` deleted; `https://fireman333.github.io/study-rpg/` and `/study-rpg/hospital/` both → GitHub 404. The `/hospital/`→`/2nd/` 301 redirect (in 一階's `public/404.html`) dies with the app; **old github.io bookmarks break** (accepted — 二階 lives on `med-study-rpg.com/2nd/`, GH Pages was already in deprecation bake). Owner manually disables Pages in repo Settings (removing the workflow only stops new deploys; last deploy lingers until disabled).
- **BREAKING (data)**: New migration `supabase/migrations/0016_drop_medexam_tw_tables.sql` drops 4 一階 tables (`player_state`, `srs_cards`, `item_instances`, `mentor_backlog`) + their 32 RLS policies (CASCADE), and `CREATE OR REPLACE`s the account-lifecycle RPCs (`delete_my_data` / `delete_my_account` / `export_my_data`) + `upsert_lww` whitelist to drop references to the 4 dropped tables so surviving apps' account flows don't break at runtime. Owner-run via dashboard SQL.
- **BREAKING (data)**: Delete all `users/*/m1-snapshot.json.gz` blobs in the R2 bucket (owner-run `wrangler r2 object delete` over the listed prefix; no soft-delete bake).
- **MODIFIED**: `cloudflare/sync-worker/src/presign.ts` — drop `'m1'` from the `BUNDLES` list (keep `m2` / `bookmarks` / `neurons` — **二階 standalone + neurons still PUT/GET those via this shared Worker**). Audit `delete.ts` / `backup.ts` for `m1` references and drop them too.
- **MODIFIED**: `.github/workflows/deploy-cf-pages.yml` — remove the 一階 (`/1st/`) build step; keep neurons.
- **MODIFIED**: `scripts/build-cf-pages-dist.mjs` — drop the `1st` route from `ROUTES` (neurons-only assembly).
- **MODIFIED**: `scripts/cf-landing-template.html` — remove the 一階 (`/1st/`) app-card; keep 二階 (`/2nd/`) + neurons (`/neurons/`) cards; scrub 一階 from the meta description. (Owner chose to **keep** the existing hub landing — no new banner / redirect.)
- **MODIFIED**: root `package.json` — drop `dev` (currently → medexam-tw; repoint to neurons), `build:content` (→ content-medexam-tw), and the `build:cf` / `deploy:cf` 一階 build segment.

### 二階 dormant-source teardown (fold-in)

- **BREAKING (monorepo only, NOT the product)**: Delete `apps/medexam2-hospital-tw/`, `packages/theme-pixel-hospital/`, `packages/content-medexam2-tw/`. The product 二階 is unaffected — it lives in the standalone repo and serves `med-study-rpg.com/2nd/` via the edge-router Worker. Backend (Supabase Auth, `bug_reports`, sync Worker, R2 `m2`, D1 leaderboard) untouched.
- **MODIFIED**: root `package.json` — drop `dev:m2` / `build:m2` aliases.
- **NO CHANGE (called out so nobody "cleans it up")**: `@study-rpg/core` `BUG_REPORT_APPS = ['medexam-tw','medexam2-hospital-tw']` stays intact — the standalone 二階 still writes `'medexam2-hospital-tw'` bug reports to the shared Supabase `bug_reports` table; `'medexam-tw'` merely freezes to legacy (historical rows stay readable). Worker `BUNDLES` keeps `'m2'`. D1 `leaderboard_m2` untouched.

### Docs

- **MODIFIED**: `openspec/project.md` Roadmap (M2 row → archived/removed, M_3rd → primary), project `CLAUDE.md` (drop 一階 maintenance-mode line + deploy-target 一階 column + GH Pages rows + 一階 sharp-edges; note monorepo 二階 source removed), `docs/AUTH_REDIRECT_URIS.md` (drop 一階 + GH Pages OAuth allowlist entries).

## Capabilities

### New Capabilities
(none — teardown)

### Modified Capabilities

- **`deploy-pipeline`**: REMOVE all GitHub-Pages requirements (the `deploy.yml` workflow trigger, GH-Pages official-actions/permissions, GH concurrency, GH SPA `404.html` fallback, GH migration banner). MODIFY the CF-Pages requirements to drop the `/1st/` route + 一階 build + "alongside GitHub Pages" framing, and the root-landing requirement to drop the `/1st/` card. CF Pages (neurons + the existing `_redirects` SPA fallback + scoped CF token) survives.
- **`cloud-sync`**: MODIFY the schema-mirror requirement to drop the 4 一階 Postgres tables (`player_state`/`srs_cards`/`item_instances`/`mentor_backlog` + their `player`/`items`/`mastery`/`cosmetic_unlocks`/`streak` client mirrors) — that is the one normatively-false statement after 一階 is removed; the surviving `question_bookmarks` + `hospital_monotonic_counters` singletons stay (standalone 二階 still writes them). Add the `0016` RPC-patch guarantee. The `m1`-bundle and `/1st/`-URL references elsewhere in cloud-sync are **illustrative examples inside bundle-/origin-agnostic engine requirements** (corrupt-blob recovery, conditional pull, Worker domain/CORS) whose behavior is unchanged by B1 — their editorial scrub (`m1`→`m2`, `/1st/`→`/neurons/`, drop legacy `fireman333.github.io` CORS origin) is **deferred to the bake-end follow-up that already owns the legacy-origin removal** (`cloud-sync` spec line 688). The R2 bundle / LWW / tombstone / schema-version / startup-probe machinery is engine-level and unaffected.
- **`bug-reporting`**: **No spec delta.** The capability's normative content is unchanged by B1 — `BUG_REPORT_APPS` stays whole (D5), and all modal / RLS / console-capture behaviors are untouched. The 一階 `SettingsPanel.tsx` modal-entry scenario becomes editorial staleness, but the whole bug-reporting capability *relocated* to the standalone 二階 repo (it has no monorepo app implementing it after 一階 is deleted); reconciling that relocation is bigger than B1 and is left to a future capability-relocation cleanup. The D5 decision (`'medexam-tw'` frozen legacy; `'medexam2-hospital-tw'` still active via standalone) is recorded in `design.md`.
- **`build-tooling`**: REMOVE the "Content build default subject scope" requirement (it is `packages/content-medexam-tw`-specific; the package is deleted). The src-cleanliness + imported/skipped/total-counter requirements stay (apply to `content-neurons-tw`).

## Impact

**Code deletions** (~est. 13,000+ lines): 一階 `apps/medexam-tw` (110 files) + `content-medexam-tw` (12) + `theme-pixel-medical` (83); 二階 `apps/medexam2-hospital-tw` (1420 files) + `theme-pixel-hospital` (187) + `content-medexam2-tw` (27).

**Code modifications**: `deploy.yml` (deleted), `deploy-cf-pages.yml`, `build-cf-pages-dist.mjs`, `cf-landing-template.html`, root `package.json`, `presign.ts` (+ audit `delete.ts`/`backup.ts`), 1 new migration `0016_drop_medexam_tw_tables.sql`, ~3 doc files.

**Infrastructure (owner-run, frontend-first ordering, window=0 since no real players)**:
1. Frontend: delete source + update pipelines + redeploy CF Pages (一階 stops being a write source).
2. Backend (immediately after): Supabase apply `0016` (DROP 4 tables + patch RPCs); R2 `wrangler r2 object delete` loop on `users/*/m1-snapshot.json.gz`; Worker redeploy with `m1` removed; disable GitHub Pages in repo Settings; remove 一階 OAuth redirect URIs from Supabase Auth allowlist.

**Out of scope**:
- Removing `'medexam-tw'` from `bug_reports.app` enum (deferred until legacy rows archived).
- Touching `neurons-tw` / standalone 二階 source — only docs that reference 一階 get updated.
- Migrating 一階 user data into neurons-tw (different state shape; accept loss — no real players).
- `add-cloudflare-auth-migration/` draft folder (separate in-flight B2 work; leave untouched).
- Moving neurons off `/neurons/` (owner chose to keep its URL; `/1st/` simply 404s).

## Prerequisite (already done)

`git merge track-m2 → main` (local, unpushed) was run on 2026-06-03 to bring the `split-medexam2-standalone` archive + abandoned-equipment tombstone to main, syncing main's specs (`deploy-pipeline` 16→15, `medexam2-standalone` ADDED) to main's already-post-split code. This change's spec deltas are authored against that post-split baseline. The split archive + this change push together at the merge gate → one deploy.
