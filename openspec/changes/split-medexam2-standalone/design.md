## Context

二階 (`apps/medexam2-hospital-tw`) is one of three apps in the `study-rpg` pnpm monorepo. Today it:

- Consumes `@study-rpg/core` (`workspace:^`), `@study-rpg/theme-pixel-hospital` (`workspace:*`), `@study-rpg/content-medexam2-tw` (`workspace:*`) via workspace symlinks.
- Ships through **one** Cloudflare Pages project `med-study-rpg`: `pnpm build:cf` builds 一階 (`/1st/`) + 二階 (`/2nd/`) + neurons (`/neurons/`), then `scripts/build-cf-pages-dist.mjs` assembles them into a single `dist-cf/` upload via `wrangler pages deploy`.
- Also ships to GitHub Pages (`fireman333.github.io/study-rpg/hospital/`) via `deploy.yml` subpath co-location + `404.html` HashRouter redirect.
- Syncs cloud saves through the sync Worker at `api.med-study-rpg.com` (R2 bundles + D1 leaderboard), authenticating via Supabase Google OAuth. `bug_reports` is a Supabase table.

Constraints driving this design (from grill, `grilled-拆出二階獨立運作-2026-06-03.md`):
- **Primary driver = decouple the deploy line** (the shared `build:cf` makes any app's break block all three; GH-vs-CF asymmetry has caused silent prod outages).
- **Player URL must stay `med-study-rpg.com/2nd/`** (no subdomain change).
- **Existing players' cloud saves must carry over seamlessly** — same `user_id`, no re-login, no data loss.
- 二階 is feature-mature but **still receives extensions** (achievement/equipment/leaderboard add-ons), so it is *not* fully frozen.
- The original monorepo will eventually be gutted to neurons-only (`retire-medexam1`), so 二階 must be extracted before that.

This change is **spec-only**: it defines the target architecture. Moving code, creating the repo, and deploying are a follow-up implementation pass.

## Goals / Non-Goals

**Goals:**
- 二階 ships from its own repo on its own deploy line, with zero coupling to 一階 / neurons build steps.
- The player-facing URL `med-study-rpg.com/2nd/` is unchanged.
- Existing cloud saves continue working untouched (same backend, same `user_id`, no re-login).
- Old GitHub Pages bookmarks (`…/study-rpg/hospital/`) keep resolving (via 301).
- The original monorepo's shared pipeline cleanly stops building/assembling 二階.

**Non-Goals:**
- **No backend change.** Sync Worker, R2 bucket, D1, KV, Supabase Auth project all stay exactly as-is. (Auth stays on Supabase *permanently*.)
- **No sync data-plane migration** (R2 reads cutover, `bug_reports`→D1) — that is `finish-r2-cutover-medexam2`.
- **No Worker extraction** — `cloudflare/sync-worker/` relocation is `extract-sync-worker-repo`.
- **No 一階 removal** — that is `retire-medexam1`.
- **No code movement in this change** — spec only.

## Decisions

### D1 — Standalone repo; `core` from npm, theme + content move in

二階's new repo contains `apps/medexam2-hospital-tw` + `theme-pixel-hospital` + `content-medexam2-tw` (all 二階-only), and consumes `@study-rpg/core` from the **npm registry** (`@study-rpg/core@^x`).

- **Why npm-core over vendoring:** 二階 still evolves and should receive shared `core` fixes (e.g. the Dexie pk pitfall, sync-engine corrections) via a version bump, not manual cherry-pick. The original repo keeps `core` as single source of truth (neurons also consumes it).
- **Why theme + content move in (not stay/published):** they are 二階-only; nothing else consumes them, so keeping them in the dying monorepo or publishing them to npm adds friction for no benefit.
- **Alternatives considered:**
  - *Hard vendoring of `core`* — rejected: 二階 isn't frozen, so fork drift would strand it from shared fixes. (Was the owner's first instinct; reversed during grill once "still receives extensions" was established.)
  - *Stay in monorepo, only split the deploy line* — rejected: doesn't survive the eventual `retire-medexam1` gutting and doesn't fully decouple.
- **Trade-off:** when a 二階 extension genuinely needs a `core` change, it requires a round-trip (edit core in original repo → publish → bump in 二階 repo). Mitigation: design extensions to live in `app`/`theme`/`content`; `core` changes should be rare.

### D2 — Edge router Worker preserves `/2nd/`; spike before lock

二階 deploys to its own CF Pages project (`med-study-rpg-2nd`). A lightweight **edge router Worker** bound to `med-study-rpg.com` routes `/2nd/*` to the new project and everything else to the existing project, so the apex URL is unchanged.

- **Why:** the only way to satisfy "URL unchanged" + "truly decoupled deploy" simultaneously. CF Pages cannot natively serve two projects under one apex path prefix.
- **Alternatives considered:**
  - *Subdomain + 301* (`hospital.med-study-rpg.com`, 301 from `/2nd/`) — rejected: changes the visible URL, contradicts the owner's "keep /2nd/".
  - *Same CF project, feed 二階's built `dist` back as an artifact* — rejected: still half-coupled (one assembly step remains), defeats the primary driver.
- **Spike required (design gate, do before locking):** evaluate two concrete mechanisms and pick the one that keeps the SPA working:
  1. **Worker reverse-proxy** to the 二階 project's `*.pages.dev` origin for `/2nd/*` (fetch + stream, preserving path).
  2. **CF Pages path-based routing / custom-domain path mapping** if CF offers a config-only path attach.
  Validate for the chosen mechanism: (a) `/2nd/` asset requests resolve (`VITE_DEPLOY_BASE=/2nd/` keeps asset paths correct), (b) SPA fallback works for deep links (the project's existing `_redirects` / HashRouter behavior survives behind the router), (c) F5 on a deep route does not 404, (d) latency overhead acceptable.

### D3 — GitHub Pages 二階 path → 301 redirect-only

`fireman333.github.io/study-rpg/hospital/` stops serving the app; it 301-redirects to `med-study-rpg.com/2nd/` (path/hash preserved where feasible).

- **Why:** preserve old bookmarks/links without maintaining a second live build of 二階.
- **Alternatives:** full removal (rejected — silently breaks old links); keep serving (rejected — that's the coupling we're removing).
- **Sequencing constraint:** the flip must respect the existing domain-migration bake. See Risk R4 (IndexedDB per-origin) — anonymous GH-only players must have been exposed to the `DomainMigrationBanner` Export-JSON CTA before their entry point becomes a hard redirect.

### D4 — Backend continuity is an invariant, achieved by config-only

Seamless saves are guaranteed by **not touching the backend** and keeping 二階's runtime config identical:

- Build with `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` (same Worker), same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (same Auth project ⇒ same `user_id`), same R2/D1 backend flags.
- Because the served **origin stays `med-study-rpg.com`** (D2), the browser's per-origin storage (IndexedDB, Supabase session cookies) and the OAuth redirect origin are all unchanged — no re-login, no local-data loss for players already on the CF domain.

### D5 — Original monorepo pipeline drops 二階 (modifies `deploy-pipeline`)

In the original repo: remove the `2nd` entry from `scripts/build-cf-pages-dist.mjs` `ROUTES`; drop `medexam2-hospital-tw` from `build:cf` / `deploy:cf` / `dev:m2` / `build:m2`; remove the 二階 build + subpath merge from `deploy.yml`; convert the 二階 GH path to the 301 redirect (D3).

## Risks / Trade-offs

- **R1 — Edge router is a new moving part.** A misrouted `/2nd/*` takes 二階 down. → Mitigation: keep the Worker minimal (pure path-prefix proxy, no logic); cover with the SPA three-suite smoke (in-app nav / direct URL / F5) on prod after cutover; keep rollback trivial (re-point the route to the old project).
- **R2 — npm-core cross-repo friction** (D1 trade-off). → Mitigation: keep extensions out of `core`; document the publish→bump loop in the new repo's README.
- **R3 — Asset base mismatch.** 二階 served under `/2nd/` from a different CF project must still build with `VITE_DEPLOY_BASE=/2nd/`, or assets 404. → Mitigation: pin `VITE_DEPLOY_BASE=/2nd/` in the new repo's build; the spike (D2) explicitly tests asset resolution.
- **R4 — IndexedDB is per-origin; GH-only anonymous players.** A player who only ever used `fireman333.github.io/study-rpg/hospital/` and never signed in has local-only IndexedDB save scoped to that origin. A hard 301 to `med-study-rpg.com` lands them on a *different origin* with empty local storage → apparent save loss. → Mitigation: the 301 flip (D3) must come *after* the existing `DomainMigrationBanner` Export-JSON bake has run on GH Pages; signed-in players are unaffected (cloud restore). Call this out as a sequencing dependency, not a code task in this change.
- **R5 — Cutover double-serve window.** Briefly both the old combined project and the new project could answer `/2nd/`. → Mitigation: stand up + smoke the new project and edge route first, flip atomically, then remove 二階 from the old assembly.
- **R6 — OAuth redirect / Supabase Site URL.** If anything about the served origin changed, the allowlist would need edits. → Because origin stays `med-study-rpg.com` (D2), expected change = none; verify against `docs/AUTH_REDIRECT_URIS.md` at implementation, don't assume.

## Migration Plan

Implementation-phase sequence (this change only specifies it):

1. Create the new repo; move `theme-pixel-hospital` + `content-medexam2-tw` + `apps/medexam2-hospital-tw`; switch `@study-rpg/core` to npm `^x`; `pnpm install` + `pnpm build` + `pnpm typecheck` green.
2. **Run the D2 spike**; lock the edge-router mechanism.
3. Create CF Pages project `med-study-rpg-2nd`; deploy 二階 (base `/2nd/`, Worker URL `api.med-study-rpg.com`, Supabase env).
4. Stand up the edge router Worker; route `med-study-rpg.com/2nd/*` → new project.
5. **Prod smoke (SPA three-suite + cloud-save continuity):** sign in as an existing player, confirm cloud save restores; verify `/2nd/`, a deep link, and F5 all 200.
6. Remove 二階 from the original monorepo pipeline (D5).
7. Flip GH Pages 二階 path to 301 (D3), respecting the R4 bake dependency.

**Rollback:** at any step before #6, re-point the edge route to the old combined project and the old pipeline still serves `/2nd/` unchanged. After #6, rollback = restore the `ROUTES`/workflow entries and redeploy the combined project.

## Open Questions

- **vendoring vs npm-core (D1)** — provisionally **npm-core**; owner to confirm at design review (only blocker would be the original repo not wanting a sustained `@study-rpg/core` publish cadence).
- **Edge-router mechanism (D2)** — Worker reverse-proxy vs CF path-mapping; resolved by the spike before any code.
- **OAuth / Supabase Site URL (R6)** — expected no-op; confirm against `docs/AUTH_REDIRECT_URIS.md` at implementation.
- **R4 bake timing** — has the `DomainMigrationBanner` Export-JSON exposure run long enough on GH Pages to safely 301 二階? Owner judgment at implementation.
