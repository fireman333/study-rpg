# deploy-pipeline Specification

## Purpose
TBD - created by archiving change add-gh-pages-deploy. Update Purpose after archive.
## Requirements
### Requirement: Deploy workflow triggers on main push and manual dispatch

The repository SHALL contain a GitHub Actions workflow at `.github/workflows/deploy.yml` that runs on:

1. Every `push` to the `main` branch
2. Manual `workflow_dispatch` from the GitHub UI

The workflow SHALL deploy the built `apps/medexam-tw/dist/` directory to GitHub Pages using the official `actions/deploy-pages` action.

The workflow SHALL NOT run on PR opens, push to other branches, or scheduled cron — `main` is the only deploy gate per project policy (single-environment dogfood).

#### Scenario: Push to main triggers deploy

- **WHEN** any commit lands on `main` branch (direct push or PR merge)
- **THEN** the `deploy` workflow SHALL start within ~30 seconds (GitHub Actions normal queue latency)
- **AND** on success the deployed site SHALL be live at `https://<owner>.github.io/study-rpg/`

#### Scenario: Manual dispatch is available

- **WHEN** the user opens the `Actions` tab on GitHub and selects the `deploy` workflow
- **THEN** a `Run workflow` button SHALL be available (because `workflow_dispatch` is configured)
- **AND** clicking it SHALL trigger a deploy without needing a new commit

#### Scenario: PR or non-main push does NOT deploy

- **WHEN** a commit is pushed to any non-`main` branch (including `claude/*` worktree branches or feature branches)
- **THEN** the deploy workflow SHALL NOT run
- **AND** any PR opened against `main` SHALL NOT trigger deploy (only the eventual merge to `main` triggers deploy)

### Requirement: Deploy uses pre-built content artifacts

The CI workflow SHALL NOT attempt to re-build the content pack (`@study-rpg/content-medexam-tw`) from upstream `.md` source. Content `.md` files live in the developer's local `~/Desktop/國考/.../` directory and are not committed to the repository (license + size reasons).

The CI workflow SHALL rely on the **already-committed** `apps/medexam-tw/public/content/medexam-tw/{questions,subjects,meta}.json` produced by a developer's local content build.

Content updates SHALL flow:

1. Developer runs `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build` locally
2. Developer copies `dist/*.json` → `apps/medexam-tw/public/content/medexam-tw/`
3. Developer commits both updated JSON files and any related code in a normal change
4. Push to main → CI deploys with the committed JSON

#### Scenario: CI does not invoke content build

- **WHEN** the deploy workflow runs
- **THEN** no step SHALL invoke `pnpm --filter @study-rpg/content-medexam-tw build`
- **AND** the workflow SHALL succeed even though `MEDEXAM_SOURCE_ROOT` is not set in the runner environment

#### Scenario: Stale committed content deploys as-is

- **WHEN** developer forgets to update `apps/medexam-tw/public/content/medexam-tw/questions.json` after editing a content build behavior locally
- **THEN** CI SHALL still deploy whatever is committed (it does not retroactively build)
- **AND** this is intentional — content updates are a deliberate human gate, not an implicit CI side-effect

### Requirement: Workflow uses official actions and minimum-required permissions

The workflow SHALL use only official, audited actions:

| Action | Purpose |
|---|---|
| `actions/checkout@v4` | git clone the repo |
| `pnpm/action-setup@v4` | install pnpm (reads `packageManager` from package.json) |
| `actions/setup-node@v4` | install Node 20 with pnpm cache |
| `actions/upload-pages-artifact@v3` | upload `dist/` as Pages artifact |
| `actions/deploy-pages@v4` | deploy the artifact to Pages |

The workflow's `permissions:` block SHALL grant exactly:

- `contents: read` (for checkout)
- `pages: write` (for Pages deploy)
- `id-token: write` (required by `actions/deploy-pages` for OIDC)

The workflow SHALL NOT request `contents: write` or any broader permission than what is required.

#### Scenario: No third-party actions in workflow

- **WHEN** the deploy workflow is inspected
- **THEN** every `uses:` line SHALL reference an action under the `actions/`, `pnpm/`, or other GitHub-blessed official namespace
- **AND** no community / personal-account third-party action SHALL appear

#### Scenario: Permissions are scoped minimum

- **WHEN** the deploy workflow's `permissions:` block is inspected
- **THEN** it SHALL contain exactly `contents: read`, `pages: write`, `id-token: write` — no more, no less

### Requirement: Concurrent deploys are serialized

The workflow SHALL declare `concurrency: { group: pages, cancel-in-progress: false }` so two simultaneous deploys (e.g., manual dispatch + push to main) queue rather than overwrite each other.

`cancel-in-progress: false` is correct (not `true`) — we want each deploy to finish; the latter deploy waits for the former rather than killing it mid-upload.

#### Scenario: Two deploys triggered in quick succession both complete

- **WHEN** a push to main triggers deploy A, and 10 seconds later the user manually dispatches deploy B
- **THEN** deploy A SHALL finish before deploy B begins
- **AND** the final deployed site SHALL reflect the artifact from deploy B (latest wins)
- **AND** neither deploy SHALL be cancelled

### Requirement: Setup checklist documented for repo owner

A markdown checklist SHALL exist at `.github/workflows/README.md` (or equivalent location referenced from main README.md) that walks the repo owner through one-time GitHub repo settings required for the workflow to actually publish:

1. Settings → Pages → Source = "GitHub Actions"
2. Settings → Actions → General → Workflow permissions = "Read and write" (required so `deploy-pages` can publish)
3. (Optional) Settings → Pages → Custom domain (left for future change)

The main `README.md` SHALL link to this setup file or inline the checklist.

#### Scenario: New fork can deploy without trial-and-error

- **WHEN** a third-party fork clones the repo, pushes to their fork's main, and Pages doesn't publish
- **THEN** they SHALL find the setup checklist via README in under 30 seconds (top-level link or inline section)
- **AND** completing the checklist SHALL make the next deploy succeed

### Requirement: SPA route fallback works on GitHub Pages

The deployed site SHALL serve any client-side route (e.g. `/study-rpg/skills`, future `/study-rpg/streak`) directly via URL, page refresh, or external link without GitHub Pages returning a 404. The fallback SHALL be implemented via a `404.html` redirect file (rafgraph/spa-github-pages pattern) that encodes the requested path into a query string and redirects to `index.html`, plus a small inline script in `index.html` `<head>` that restores the original URL via `history.replaceState` before React Router boots.

#### Scenario: Direct URL to SPA route resolves to React app

- **WHEN** a user opens `https://<owner>.github.io/study-rpg/skills` directly (typed URL, bookmark, or shared link)
- **THEN** the GitHub Pages 404.html SHALL be served first
- **AND** within 1 redirect the browser SHALL land on `https://<owner>.github.io/study-rpg/skills` with the React app rendered (skill tree visible, not GitHub's 404 page)
- **AND** the URL bar SHALL show the original clean path (no `?/skills` query string visible to the user)

#### Scenario: Page refresh on SPA route preserves the route

- **WHEN** a user is on `/study-rpg/skills` and presses F5 / Cmd-R / browser reload
- **THEN** the React app SHALL re-mount on `/study-rpg/skills` (NOT redirect to home, NOT show GitHub 404)
- **AND** any client-side state derived from URL params SHALL be re-derived correctly

#### Scenario: 404.html and Vite base path stay in sync

- **WHEN** the project's `vite.config.ts` declares `base: '/<project-name>/'` (currently `/study-rpg/`)
- **THEN** `apps/medexam-tw/public/404.html` `pathSegmentsToKeep` constant SHALL equal the number of leading `/`-separated segments in that base (currently `1`)
- **AND** changing one without the other SHALL be flagged in code review (the spec scenario codifies the expectation)

#### Scenario: In-app navigation continues to work unchanged

- **WHEN** a user clicks an internal `<Link>` or triggers `useNavigate()` to switch routes (e.g. home → /skills via 技能樹 button)
- **THEN** navigation SHALL continue to use `pushState` and SHALL NOT trigger a full page reload
- **AND** SHALL NOT touch the 404.html redirect path
