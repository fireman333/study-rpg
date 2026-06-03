# Tasks — remove-medexam-tw-and-promote-neurons

Ordering = **frontend-first, window 0** (design D4). Owner-run infra steps marked **[OWNER]**.
Apply executed 2026-06-03 (frontend §1–§6 done + verified; backend §7 + ship §8 pending).

## 0. Prerequisite (DONE)

- [x] 0.1 Merge `track-m2 → main` (local, unpushed) to sync main specs to post-split code (design D7). Done 2026-06-03.

## 1. Source deletion (frontend)

- [x] 1.1 Pre-delete ref audit — survivors (core / neurons / content-neurons-tw / theme-pixel-neurons) have **zero** real refs to the deleted packages (only stale docstrings). Confirmed `content-neurons-tw/scripts/build.ts` is self-contained (sources `data/medexam-reconciled`, not `content-medexam-tw`); neurons-tw ships its own `public/content/` JSON.
- [x] 1.2 `git rm -r apps/medexam-tw packages/content-medexam-tw packages/theme-pixel-medical` (一階) + `rm -rf` leftover ephemera dirs.
- [x] 1.3 `git rm -r apps/medexam2-hospital-tw packages/theme-pixel-hospital packages/content-medexam2-tw` (dormant 二階) + `rm -rf`. (1026 tracked files deleted total.)

## 2. Pipeline + build-script updates (frontend)

- [x] 2.1 `git rm .github/workflows/deploy.yml` (GitHub Pages workflow — D1).
- [x] 2.2 `.github/workflows/deploy-cf-pages.yml` — removed 一階 `/1st/` build step; updated header (GH Pages retired, neurons-only).
- [x] 2.3 `scripts/build-cf-pages-dist.mjs` — removed `{ dest: '1st' }` from `ROUTES` + header comment.
- [x] 2.4 `scripts/cf-landing-template.html` — removed 一階 `/1st/` card (2 cards remain: 二階 + neurons) + scrubbed meta description.
- [x] 2.5 root `package.json` — `dev` → neurons; removed `dev:m2` / `build:m2` / `build:content`; `build:cf` now neurons-only.
- [x] 2.6 Residue scan — `.github/`/`scripts/`/`package.json`/worker clean of live 一階 refs. **Follow-up (low pri, non-blocking)**: stale comments/defaults in admin/dev tools reference deleted paths — `scripts/reconcile.ts` (`apps/medexam-tw/.env.local` default), `scripts/bulk-migrate.ts` (comment), `scripts/lint-dexie-fixtures.sh` (medexam2 example comments), `scripts/build-cf-pages-dist.mjs:86` (`/1st/` example comment), `deploy-cf-pages.yml` (content-medexam-tw comment). Not deploy-path; leave or batch-clean later.

## 3. Worker source (m1 removal — frontend, deploys with §7 [OWNER])

- [x] 3.1 `cloudflare/sync-worker/src/presign.ts` — removed `"m1"` from `BUNDLES` + `Bundle` type + `case "m1"` branch. Kept `m2`/`bookmarks`/`neurons` (D5) + added a note comment.
- [x] 3.2 `delete.ts` / `backup.ts` audited — they walk the `users/<sub>/*` prefix (no per-bundle hardcoding), so no m1-specific code to remove. Grep-confirmed only the new note comment mentions m1.
- [x] 3.3 Worker typecheck passes (`pnpm -r typecheck` includes sync-worker → Done).

## 4. Docs

- [x] 4.1 `openspec/project.md` — Stack `Deploy` + `Monorepo` lines + Deploy & Distribution `取得方式`/`更新機制` updated to CF-Pages/neurons-canonical. **Remaining (low pri)**: Roadmap rows + Development-Workflow worktree prose still describe 一階/二階 as historical record (largely accurate as history); a `medexam-tw 進入 maintenance mode` line should become "removed".
- [x] 4.2 Project `CLAUDE.md` — "Deploy targets" table fully rewritten (GH Pages retired, neurons canonical, 一階 gone). **Remaining (low pri)**: M_3rd `medexam-tw 進入 maintenance mode` line → "removed"; cloud-sync / leaderboard / achievement sections reference 一階 as historical (accurate); a focused prose pass can scrub forward-looking residue.
- [x] 4.3 `docs/AUTH_REDIRECT_URIS.md` — full rewrite to post-B1 state (Site URL → `/neurons/`; dropped 一階 `/1st/` + both `fireman333.github.io` GH entries + `localhost:5173`; kept `/2nd/` + `/neurons/` + `localhost:5174/5175`). Backs §7.5.
- [x] 4.4 `.github/workflows/README.md` — DELETED (documented only the removed `deploy.yml` / GitHub Pages setup; orphaned by §2.1 + the removed "Setup checklist" requirement).

## 5. Local verification (frontend gate) — ALL GREEN

- [x] 5.1 `pnpm install` → 6 workspace projects (survivors); lockfile updated (`M pnpm-lock.yaml`).
- [x] 5.2 `pnpm -r typecheck` green (core / content-neurons-tw / theme-pixel-neurons / neurons-tw / sync-worker).
- [x] 5.3 `pnpm -r build` green.
- [x] 5.4 `pnpm run build:cf` (exit 0) → `dist-cf/` = `index.html` (hub, 2 cards) + `_redirects` (only `/neurons/` rules) + `neurons/`; NO `1st/`/`2nd/`.
- [x] 5.5 `openspec validate --all` → 78 passed, 0 failed.

## 6. Drop migration authoring (frontend artifact; applied in §7)

- [x] 6.1 `supabase/migrations/0016_drop_medexam_tw_tables.sql` written: `DROP TABLE IF EXISTS player_state, srs_cards, item_instances, mentor_backlog CASCADE`.
- [x] 6.2 Same migration `CREATE OR REPLACE`s `delete_my_data()` (from 0015, minus 4 一階 DELETEs) + `export_my_data()` (from 0002, minus 4 一階 aggregates). `delete_my_account()` + `upsert_lww()` need NO patch (grep-confirmed: former only PERFORMs delete_my_data; latter never referenced the 一階 tables). Migration header documents all this.
- [ ] 6.3 **[OWNER, apply-time]** Confirm whether surviving apps still invoke these RPCs (R2 cutover moved most data ops off Postgres). Harmless either way per migration header note.

## 7. Owner-run backend wipe + deploy [OWNER] (immediately after §5 green)

- [ ] 7.1 **[OWNER]** Apply `0016` via Supabase dashboard SQL editor. Sanity: `\d player_state` errors; `select delete_my_data();` runs clean.
- [ ] 7.2 **[OWNER]** `wrangler r2 object delete` loop over `users/*/m1-snapshot.json.gz`. No soft-delete.
- [ ] 7.3 **[OWNER]** Deploy Worker (`m1` removed). Smoke: presign `m2`/`neurons`/`bookmarks` → 200; `m1` → rejected.
- [ ] 7.4 **[OWNER]** Disable GitHub Pages in repo Settings → Pages.
- [ ] 7.5 **[OWNER]** Apply `docs/AUTH_REDIRECT_URIS.md` owner-action block in Supabase Auth → URL Configuration.

## 8. Ship + prod verify (commit gate — awaiting user)

- [ ] 8.1 Commit (explicit per-file `git add`; archive commit after `/opsx:archive`).
- [ ] 8.2 Merge to `main` (carries the already-merged split archive) + push → triggers `deploy-cf-pages.yml`.
- [ ] 8.3 `gh run list --branch main --limit 5` — 「Deploy Cloudflare Pages」 green (deploy.yml gone).
- [ ] 8.4 Prod SPA three-piece on `med-study-rpg.com/neurons/`; `/2nd/` still served by edge-router; `/1st/` → 404; root hub renders 2 cards.
- [ ] 8.5 Confirm `fireman333.github.io/study-rpg/` → GitHub 404 (after [OWNER] 7.4).
