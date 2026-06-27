## MODIFIED Requirements

### Requirement: Canonical neurons category set across UI, types, and DB

The neurons category set SHALL be a single canonical kebab-case list (`app-stability`, `maze-exploration`, `variant-collection`, `synapse`, `dmn-fate-cards`, `study-session`, `numbers-wrong`, `visual-glitch`, `cloud-sync`, `corpus`, `desktop-app`, `feature-request`, `other`) used identically by the form UI, the `@study-rpg/core` types, and the Supabase `category` CHECK constraint, so a UI value can never be silently rejected by the database. The `desktop-app` category (desktop / Tauri-shell issues) SHALL be offered in the form only when running on the desktop build (`isDesktop()`); on the web build it SHALL NOT appear.

#### Scenario: UI value accepted by DB
- **WHEN** the player submits any category offered by the neurons form
- **THEN** the value satisfies the `category` CHECK and the insert succeeds (no constraint violation)

#### Scenario: Single source of truth
- **WHEN** the category list is read from `@study-rpg/core` and compared to the latest migration's `category` CHECK list (the union superset across all apps, extended by migration `0018`)
- **THEN** every neurons category — including `desktop-app` — is present in the CHECK list, so no neurons-form value can be rejected by the constraint

#### Scenario: Desktop category is desktop-only
- **WHEN** the bug-report form renders on the web build (`isDesktop()` is false)
- **THEN** the `desktop-app` category is not offered in the category list
- **AND** on the desktop build it is offered

### Requirement: Auto-attached context with per-field opt-out

The system SHALL auto-attach a context snapshot to each submission and SHALL render a per-field opt-out checkbox (default checked) for each captured field. Captured fields: app version (`VITE_APP_VERSION`), commit SHA (`VITE_COMMIT_SHA`), current route (`location.hash`), a neurons `game_state` snapshot built from the neurons Dexie database, user agent, viewport size, recent console errors, and sync diagnostics (`sync_metadata`). On the desktop build the snapshot SHALL additionally capture a platform descriptor (`platform` = desktop/Tauri, the OS, and the desktop app version), so desktop-specific reports are triageable.

#### Scenario: All context attached by default
- **WHEN** a player submits without changing any opt-out checkbox
- **THEN** the inserted row carries app version, commit SHA, route, `game_state`, user agent, viewport, recent console errors, and `sync_metadata`

#### Scenario: Opted-out field omitted
- **WHEN** a player unchecks the「遊戲狀態」(game_state) opt-out before submitting
- **THEN** the inserted row's `game_state` is null and all other checked fields are still attached

#### Scenario: game_state stays PII-free
- **WHEN** the `game_state` snapshot is built
- **THEN** it contains only numeric counters and enum/state values (no free-text or personally identifying content)

#### Scenario: Desktop platform descriptor attached on desktop
- **WHEN** a player submits a report from the desktop (Tauri) build without opting out of the platform field
- **THEN** the inserted row's context carries the platform descriptor (platform = desktop/Tauri, OS, desktop app version)
- **AND** on the web build no desktop platform descriptor is attached

## ADDED Requirements

### Requirement: Desktop bug-report category migration

A new migration `supabase/migrations/0018_neurons_desktop_bug_category.sql` SHALL extend the `bug_reports.category` CHECK to the prior union plus `desktop-app`, additively (no data migration; existing rows and all other apps unaffected). RLS, indexes, the `app` CHECK, and the `sync_metadata` column SHALL remain unchanged. The migration SHALL be applicable via the Supabase CLI (`supabase db push`) rather than requiring a dashboard paste, and the migration file SHALL be committed regardless of how it is applied.

#### Scenario: desktop-app category accepted post-migration
- **WHEN** migration `0018` has been applied and a neurons row is inserted with `category = 'desktop-app'` and `app = 'neurons-tw'`
- **THEN** the insert satisfies the `category` CHECK and succeeds

#### Scenario: Other apps and existing rows unaffected
- **WHEN** migration `0018` is applied
- **THEN** existing rows and every previously-valid `category` value remain valid with no data migration
- **AND** the 二階 (standalone repo) bug-report flow, which never submits `desktop-app`, is unaffected
