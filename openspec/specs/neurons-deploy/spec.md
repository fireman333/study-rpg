# neurons-deploy Specification

## Purpose

Defines how `apps/neurons-tw` (M_3rd 神經元 reskin) is delivered to players: Cloudflare Pages co-located deploy at `https://med-study-rpg.com/neurons/`, R2 cloud sync with an isolated per-bundle blob, shared Supabase OAuth, post-pull state-recovery backfill, and the companion-app pointer surfaced from `apps/medexam-tw` SettingsPanel (履行 `neurons-mode` Req 6 deferred clause). Cross-app data flow is explicitly disallowed (per `neurons-mode` Req 4) — every requirement here treats the neurons bundle as the only legitimate read/write target.

## Requirements

### Requirement: neurons-tw SHALL be served at `https://med-study-rpg.com/neurons/` via Cloudflare Pages

The `apps/neurons-tw` application SHALL be deployed to Cloudflare Pages and accessible at the subpath `/neurons/` under the apex domain `med-study-rpg.com`, co-located with the existing 一階 (`/1st/`) and 二階 (`/2nd/`) apps.

The deploy pipeline SHALL produce build artifact `dist-cf/neurons/` containing the neurons-tw production bundle (HTML / JS / CSS / static assets) built with `VITE_DEPLOY_BASE=/neurons/`. The artifact assembly script `scripts/build-cf-pages-dist.mjs` SHALL include neurons-tw in its `ROUTES` array as `{ src: 'apps/neurons-tw/dist', dest: 'neurons' }`.

The deploy SHALL NOT also publish to GitHub Pages. This is greenfield (no legacy users), so the dual-target bake pattern used by `/1st/` and `/2nd/` does NOT apply.

#### Scenario: Root URL loads neurons-tw shell

- **GIVEN** the change has been deployed to Cloudflare Pages
- **WHEN** a browser navigates to `https://med-study-rpg.com/neurons/`
- **THEN** the response status SHALL be 200
- **AND** the response body SHALL contain the neurons-tw HTML shell (with `<title>` matching the neurons-tw app)
- **AND** the page SHALL load its JS / CSS bundle without 404 on any `/neurons/assets/*` asset

#### Scenario: Direct URL to hash route does not 404

- **GIVEN** the app is deployed
- **WHEN** a user opens `https://med-study-rpg.com/neurons/#/connectome` (or any other hash route) as a fresh navigation
- **THEN** the response status SHALL be 200
- **AND** the served HTML SHALL be the neurons-tw shell (which then resolves the hash route client-side)
- **AND** the page SHALL NOT show Cloudflare's default 404 page

#### Scenario: F5 reload on hash route preserves state

- **GIVEN** a user is viewing `https://med-study-rpg.com/neurons/#/achievements`
- **WHEN** the user presses F5 / cmd-R
- **THEN** the URL after reload SHALL still be `https://med-study-rpg.com/neurons/#/achievements`
- **AND** the page SHALL render the achievements route after client-side hydration
- **AND** the response SHALL NOT be a 404

#### Scenario: GH Pages deploy does NOT publish neurons-tw

- **WHEN** the GH Actions `deploy.yml` workflow runs on `main`
- **THEN** the `github-pages` artifact SHALL NOT include any `neurons/` directory
- **AND** opening `https://fireman333.github.io/study-rpg/neurons/` SHALL return 404

### Requirement: neurons-tw cloud sync SHALL use an isolated R2 bundle, separate from m1 / m2 / bookmarks

The neurons-tw sync engine SHALL push and pull its state to the R2 bucket `study-rpg-state` using bundle key `users/<user_id>/neurons-snapshot.json.gz`. This key MUST NOT overlap with the existing bundles `m1-snapshot.json.gz`, `m2-snapshot.json.gz`, or `bookmarks-snapshot.json.gz`.

The bundle's internal JSON schema SHALL include `schema_version` (starting at 1, current = 2) and a serialized snapshot of every neurons-tw Dexie table that participates in cross-device sync.

The bundle reader SHALL be tolerant of `schema_version` values higher than the current client's `SCHEMA_VERSION`: when a client receives a bundle with `schema_version > SCHEMA_VERSION`, it SHALL log an informational message (`[sync] bundle schema_version newer than client; unknown fields will be dropped`) and continue parsing — the parser MUST NOT throw on this case. Unknown top-level fields in the bundle SHALL be silently dropped. Bundles with `schema_version < 1` SHALL still be rejected (defends against corrupt or truncated bundles).

The sync engine SHALL NOT read from or write to any non-neurons bundle (m1 / m2 / bookmarks). Cross-app data flow is explicitly disallowed per `neurons-mode` Req 4.

The sync engine SHALL go directly to R2-only mode (no Supabase dual-write transitional phase), since neurons-tw has no legacy users to migrate.

#### Scenario: Push writes to neurons bundle only

- **GIVEN** a signed-in player makes a Dexie write that participates in sync (e.g., a quiz correct answer that updates `connectome` and `meta` tables)
- **WHEN** the sync engine debounce window elapses and push fires
- **THEN** the resulting R2 PUT SHALL target key `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the same push event SHALL NOT issue PUT requests against any `m1-snapshot.json.gz`, `m2-snapshot.json.gz`, or `bookmarks-snapshot.json.gz` key

#### Scenario: Pull reads neurons bundle only

- **GIVEN** a signed-in player opens neurons-tw on a second device
- **WHEN** the sync engine initial pull runs
- **THEN** the resulting R2 GET SHALL target key `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the engine SHALL NOT pull `m1-snapshot.json.gz` / `m2-snapshot.json.gz` / `bookmarks-snapshot.json.gz` even if those rows exist for the same user

#### Scenario: New player has no stale bundle on first sign-in

- **GIVEN** a player who has existing rows in m1 / m2 / bookmarks bundles but has never used neurons-tw
- **WHEN** the player signs into neurons-tw for the first time
- **THEN** the sync engine initial pull SHALL receive a 404 for `users/<user_id>/neurons-snapshot.json.gz`
- **AND** the engine SHALL initialize as fresh-start, NOT migrate from m1 / m2 / bookmarks
- **AND** no MigrationBanner / MigrationUploadPrompt / ConflictChooserModal SHALL be displayed (none of these components exist in neurons-tw)

#### Scenario: Bundle schema_version is set on first push (current = 2)

- **GIVEN** a fresh-start player makes their first sync push
- **WHEN** the bundle is serialized to R2
- **THEN** the bundle JSON SHALL contain `"schema_version": 2` at the top level

#### Scenario: v1 client reads v2 bundle without throwing

- **GIVEN** a client running an older build with `SCHEMA_VERSION = 1`
- **WHEN** the client pulls a bundle with `schema_version = 2` (which includes new optional `dmn-*` fields)
- **THEN** the bundle reader SHALL NOT throw
- **AND** the reader SHALL log an informational message indicating unknown fields will be dropped
- **AND** the reader SHALL successfully parse and apply the v1-compatible subset of the bundle (e.g., `connectome`, `neuronVariants`, `achievements`, `leaderboardProfile`)
- **AND** the `dmn-*` fields SHALL be silently dropped — not surfaced to the v1 client's app state, not written to the v1 client's Dexie

#### Scenario: v2 client reads v1 bundle and uses defaults for missing dmn-* fields

- **GIVEN** a client running the new build with `SCHEMA_VERSION = 2`
- **WHEN** the client pulls a bundle with `schema_version = 1` (no `dmn-*` fields present)
- **THEN** the bundle reader SHALL NOT throw
- **AND** the reader SHALL apply the v1 fields normally
- **AND** missing `dmn-*` fields SHALL be treated as preserve-on-omission: local Dexie `dmnCards` / `dmnEventLog` / `dmnActiveBuffs` SHALL retain their existing values (or remain empty if none) — they SHALL NOT be overwritten with empty arrays

#### Scenario: Bundle with schema_version < 1 is still rejected

- **GIVEN** a corrupted or hand-crafted bundle with `schema_version = 0`
- **WHEN** the bundle reader attempts to parse it
- **THEN** the reader SHALL throw `Error('invalid_schema_version')`
- **AND** the sync engine SHALL surface the error rather than silently parsing garbage

### Requirement: OAuth sign-in SHALL succeed on the `/neurons/` subpath using the shared Supabase project

neurons-tw SHALL reuse the existing Supabase project (`jakdyjxojokyqxeiuukx`) and Google OAuth Client (`554492800193-1gp4...`) used by medexam-tw and medexam2-hospital-tw.

The Supabase Auth dashboard's Site URL and Redirect URL allowlist SHALL include `https://med-study-rpg.com/neurons/` (added as part of this change's owner-manual setup, tracked in `docs/AUTH_REDIRECT_URIS.md`).

After a successful Google OAuth callback, the user SHALL be returned to `https://med-study-rpg.com/neurons/` with an active session and the sync engine SHALL detect the auth context and start its pull-then-push cycle.

#### Scenario: Sign-in completes and returns to neurons-tw root

- **GIVEN** an anonymous user is viewing `https://med-study-rpg.com/neurons/`
- **WHEN** they click "Sign in with Google" and complete the Google OAuth flow
- **THEN** the browser SHALL be redirected back to `https://med-study-rpg.com/neurons/` (root, not external)
- **AND** the auth context SHALL show `user !== null` after the auth-helper extracts the session
- **AND** the sync engine SHALL transition to its authenticated state and begin pull

#### Scenario: Missing Supabase allowlist entry surfaces clear error

- **GIVEN** the Supabase Auth dashboard does NOT yet have `https://med-study-rpg.com/neurons/` in its Site URL / Redirect URLs allowlist (owner-manual setup not yet completed)
- **WHEN** an anonymous user clicks "Sign in with Google" and Google returns to the callback URL
- **THEN** Supabase Auth SHALL return an error (typically HTTP 422 "redirect_to is not in the allowlist")
- **AND** the AuthGate UI SHALL surface this error to the user with guidance ("Setup incomplete — please report to the developer") rather than failing silently

### Requirement: Sync engine `onPullComplete` hook SHALL run a fixed-order, idempotent triple backfill

After every successful pull-and-apply cycle (R2 bundle downloaded, parsed, and applied to local Dexie), the sync engine SHALL trigger an `onPullComplete` hook that executes three backfill steps in strict order:

1. **MAX-merge counter backfill** — for every monotonic counter (e.g., `meta['maxQuizCorrectStreak']`), the local Dexie value SHALL be replaced with `max(localValue, incomingValue)`. The current per-event streak counter (`meta['currentQuizCorrectStreak']`) is NOT part of MAX-merge (it is regular LWW).
2. **Achievement backfill** — invoke `backfillAchievementsFromCurrentStats()`: iterate over the full achievement catalog, evaluate each predicate against current Dexie stats, and for every achievement whose predicate is `true` but whose row is missing in the local `achievements` table, `bulkPut` a new row with `notificationShown: true` (silent — no toast / modal / reward dispatch).
3. **Leaderboard derived field backfill** — invoke `deriveBadgesCsvFromDexie()` and `deriveAchievementSnapshot()` to recompute `leaderboardProfile.badges_csv` (and any other server-derived field) so the next push carries the latest badge state to D1.

All three steps SHALL be idempotent: running the hook twice in succession on the same Dexie state SHALL produce the same final state and SHALL NOT duplicate rows / fire toasts / overwrite already-correct values.

If any step throws, the next step SHALL still execute (each step is wrapped in its own try/catch with a `[sync.backfill]` channel log) — partial completion is acceptable.

#### Scenario: Counter backfill precedes achievement check on pull

- **GIVEN** device A pushed `meta['maxQuizCorrectStreak'] = 12` and a corresponding achievement `quiz-streak-10` was unlocked on device A
- **AND** device B (which had `maxQuizCorrectStreak = 0` and no achievements) now pulls the bundle
- **WHEN** the pull-apply completes and `onPullComplete` fires
- **THEN** step 1 (counter MAX-merge) SHALL update device B's `maxQuizCorrectStreak` to 12 BEFORE step 2 runs
- **AND** step 2 SHALL detect that `quiz-streak-10` predicate is satisfied and `bulkPut` the achievement row with `notificationShown: true`
- **AND** no toast SHALL be queued (silent backfill)

#### Scenario: Idempotency on repeated pull

- **GIVEN** a player's pull-apply has just completed and `onPullComplete` has finished running
- **WHEN** the same `onPullComplete` runs a second time without any intervening state change
- **THEN** the achievements table SHALL contain the same set of rows (no duplicates introduced)
- **AND** the `leaderboardProfile.badges_csv` SHALL contain the same string
- **AND** no toast / modal SHALL fire

#### Scenario: Step failure does not abort subsequent steps

- **GIVEN** the MAX-merge counter backfill step throws an exception (e.g., transient Dexie transaction error)
- **WHEN** `onPullComplete` continues
- **THEN** the achievement backfill step (step 2) SHALL still execute
- **AND** the leaderboard derived field backfill (step 3) SHALL still execute
- **AND** the error from step 1 SHALL be logged with `[sync.backfill]` channel prefix and the originating step name
- **AND** the pull cycle SHALL NOT be re-run automatically as a retry

#### Scenario: First-time pull on a device runs full backfill end-to-end

- **GIVEN** a player who has been using neurons-tw on device A for a week with multiple achievements unlocked
- **WHEN** the same player signs in on device B for the first time and the initial pull completes
- **THEN** `onPullComplete` SHALL fire once
- **AND** after all three steps complete, device B's `achievements` table SHALL contain the same rows as device A's
- **AND** device B's `leaderboardProfile.badges_csv` (if any) SHALL match device A's derived value
- **AND** no toast / modal SHALL surface (silent backfill)

### Requirement: medexam-tw SettingsPanel SHALL surface a companion-app pointer to neurons-tw

To fulfill `neurons-mode` Req 6 (the deferred banner clause "Banner content and placement deferred to `add-neurons-deploy`"), the `apps/medexam-tw/src/components/SettingsPanel.tsx` SHALL surface a non-intrusive entry pointing players at neurons-tw.

The entry SHALL:
- Live inside SettingsPanel (NOT as a footer link or persistent banner over the main game view)
- Be labelled with clear "companion app" framing — explicit language like "神經元主題版（companion app）" — NOT "新版本" / "升級" / "新主程式" or any framing implying medexam-tw is being deprecated or replaced
- State that data is independent — phrase such as "資料獨立、不影響此存檔"
- When clicked, open `https://med-study-rpg.com/neurons/` in a new tab (`target="_blank" rel="noopener"`)
- NOT auto-trigger / redirect / interstitial when the player first loads medexam-tw

The medexam-tw save data SHALL continue to function exactly as before; this requirement does not authorize any data deletion, forced migration, or feature removal in medexam-tw.

#### Scenario: SettingsPanel entry exists and links externally

- **GIVEN** a player opens medexam-tw `SettingsPanel`
- **THEN** the panel SHALL include an entry containing the substring "神經元" or "neurons" (case-insensitive) AND the substring "companion" OR "companion app"
- **AND** clicking the entry SHALL open a new browser tab to `https://med-study-rpg.com/neurons/`
- **AND** the medexam-tw page SHALL remain open and unchanged in the original tab

#### Scenario: Companion entry does not auto-redirect on app load

- **GIVEN** a player opens medexam-tw fresh (no prior session interaction this load)
- **WHEN** the app loads
- **THEN** the page SHALL render medexam-tw's existing home / overview route as before
- **AND** no banner overlay / modal / interstitial SHALL surface pointing at neurons-tw
- **AND** no automatic redirect to neurons-tw SHALL fire

#### Scenario: medexam-tw save remains intact

- **GIVEN** a player with an existing medexam-tw save (Dexie rows in `connectome`, achievements, etc.) clicks the SettingsPanel companion entry
- **WHEN** they return to the medexam-tw tab later
- **THEN** their save data SHALL be exactly as it was (no rows deleted / modified)
- **AND** the app SHALL function identically to before this change shipped

### Requirement: CF Pages build pipeline SHALL produce `dist-cf/neurons/` artifact via the existing assembly script

The build script `scripts/build-cf-pages-dist.mjs` SHALL be extended to add `apps/neurons-tw/dist` to its `ROUTES` array (mapping `src` → `dest: 'neurons'`). The script's existing logic for SPA fallback (`_redirects`), per-app `404.html` stripping, and asset directory passthrough SHALL apply to the neurons-tw output without further modification.

The landing template `scripts/cf-landing-template.html` SHALL include an entry row for neurons-tw (alongside the existing 1st / 2nd rows), pointing at `/neurons/`.

The CF Pages dashboard's build command (which runs on each push to `main` via the Cloudflare-GitHub integration) SHALL include `VITE_DEPLOY_BASE=/neurons/ pnpm --filter @study-rpg/neurons-tw build` before `node scripts/build-cf-pages-dist.mjs`. This build command is owner-managed via the CF Pages dashboard (NOT via `.github/workflows/deploy.yml` — that workflow drives GitHub Pages only and SHALL NOT build neurons-tw per Req 1's last scenario).

#### Scenario: build-cf-pages-dist.mjs writes `dist-cf/neurons/index.html`

- **GIVEN** `apps/neurons-tw/dist/` exists from a successful `pnpm --filter @study-rpg/neurons-tw build` run with `VITE_DEPLOY_BASE=/neurons/`
- **WHEN** `node scripts/build-cf-pages-dist.mjs` runs
- **THEN** `dist-cf/neurons/index.html` SHALL exist
- **AND** `dist-cf/neurons/` SHALL NOT contain `404.html` (stripped by the script)
- **AND** `dist-cf/_redirects` SHALL contain a rule starting with `/neurons/` (e.g., `/neurons/*  /neurons/  200`)
- **AND** `dist-cf/_redirects` SHALL contain explicit passthrough rules for `/neurons/assets/*`, `/neurons/content/*` etc. matching the existing pattern for 1st / 2nd

#### Scenario: Landing template references neurons-tw

- **GIVEN** the assembled `dist-cf/index.html` is rendered in a browser
- **THEN** the page SHALL contain a visible link to `/neurons/`
- **AND** the link text SHALL identify the app as the neurons-themed version (e.g., contains "神經元" or "neurons")

#### Scenario: CF Pages dashboard build command builds neurons-tw before bundling

- **GIVEN** a push to `main` triggers the CF Pages dashboard's GitHub-integration build
- **THEN** the configured build command SHALL invoke `pnpm --filter @study-rpg/neurons-tw build` with environment variable `VITE_DEPLOY_BASE=/neurons/`
- **AND** this build step SHALL execute BEFORE `node scripts/build-cf-pages-dist.mjs`
- **AND** the produced `dist-cf/` directory served by CF Pages SHALL contain `neurons/index.html`

#### Scenario: GH Pages workflow does NOT build neurons-tw

- **GIVEN** `.github/workflows/deploy.yml` runs on a push to `main`
- **THEN** the workflow SHALL NOT invoke any `pnpm --filter @study-rpg/neurons-tw build` step
- **AND** the `actions/upload-pages-artifact` step SHALL NOT pick up any neurons-tw build output
- **AND** the resulting `github-pages` artifact SHALL contain only the medexam-tw + medexam2-hospital-tw artifacts (at root and `/hospital/` respectively)
