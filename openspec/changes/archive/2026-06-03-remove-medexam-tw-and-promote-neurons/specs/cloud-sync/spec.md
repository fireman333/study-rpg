## MODIFIED Requirements

### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables. After `remove-medexam-tw-and-promote-neurons`, the 一階 (`medexam-tw`) tables `player_state`, `srs_cards`, `item_instances`, and `mentor_backlog` (and their client-side `player` / `items` / `mastery` / `cosmetic_unlocks` / `srs_cards` / `streak` mirrors) are DROPPED — 一階 is removed and has no remaining sync surface. The surviving Supabase tables in this requirement are the shared / 二階-consumed singletons: **`question_bookmarks`** and **`hospital_monotonic_counters`** (still written by the standalone 二階 app via the shared backend). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

The `question_bookmarks` table SHALL use composite primary key `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`). The table SHALL additionally carry `added_at TIMESTAMPTZ NOT NULL` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`. The `upsert_lww` RPC whitelist SHALL accept `'question_bookmarks'` as a valid table name and SHALL dispatch inserts using a dedicated `ELSIF` branch that maps `question_id`, `added_at`, `updated_at`, and `app_version` from the JSONB payload.

The `hospital_monotonic_counters` table SHALL be a per-user singleton with primary key `user_id`, opaque `data JSONB NOT NULL DEFAULT '{}'` payload, `updated_at TIMESTAMPTZ NOT NULL`, and optional `app_version TEXT`. The client-side fields stored in `data` (currently `totalStudyMinutes`, `fateCardBadLuckPity`, `freshCorrectSinceLastTicket`; shape may evolve with gameplay additions) SHALL be opaque to the cloud — the server SHALL NOT interpret or validate the JSONB structure. The `upsert_lww` RPC whitelist SHALL accept `'hospital_monotonic_counters'` as a valid table name and SHALL dispatch using the standard singleton `INSERT ... ON CONFLICT (user_id) DO UPDATE` branch identical to `hospital_state` and `mentor_backlog`.

The migration that drops the 一階 tables (`supabase/migrations/0016_drop_medexam_tw_tables.sql`) SHALL also `CREATE OR REPLACE` the account-lifecycle RPCs (`delete_my_data` / `delete_my_account` / `export_my_data`) and `upsert_lww` to remove every reference to the four dropped 一階 tables, so that the RPCs continue to run for the surviving apps without raising a "relation does not exist" error.

#### Scenario: User cannot read another user's row
- **WHEN** authed user A queries any cloud-sync table directly (e.g., via Supabase REST) for rows belonging to user B
- **THEN** the response SHALL contain zero rows
- **AND** no error SHALL leak schema or row-existence information

#### Scenario: Insert without user_id is rejected
- **WHEN** any client attempts to INSERT a row without `user_id = auth.uid()`
- **THEN** Postgres SHALL reject the write via RLS policy

#### Scenario: question_bookmarks RLS isolates per-user rows

- **GIVEN** user A has bookmarked question `106-2-醫學三-內科-Q10`
- **AND** user B has bookmarked question `108-1-醫學四-外科-Q23`
- **WHEN** user A queries `question_bookmarks` via the authenticated REST client
- **THEN** the response SHALL contain exactly user A's row
- **AND** user B's row SHALL NOT appear in the response

#### Scenario: hospital_monotonic_counters RLS isolates per-user rows

- **GIVEN** user A's `hospital_monotonic_counters` row holds `{totalStudyMinutes: 12.5}` and user B's holds `{totalStudyMinutes: 3.1}`
- **WHEN** user A queries `hospital_monotonic_counters` via the authenticated REST client
- **THEN** the response SHALL contain exactly user A's row with `{totalStudyMinutes: 12.5}`
- **AND** user B's row SHALL NOT appear

#### Scenario: upsert_lww accepts hospital_monotonic_counters table name

- **GIVEN** an authenticated client batch with `table_name = 'hospital_monotonic_counters'` and one row payload `{user_id: <auth.uid>, data: {...}, updated_at: T1, app_version: 'v0.x'}`
- **WHEN** the RPC executes
- **THEN** rows whose payload `updated_at` is strictly newer than the existing cloud row SHALL be upserted via singleton ON CONFLICT
- **AND** rows whose payload `updated_at` is equal to or older than the existing cloud row SHALL be skipped (LWW deterministic tie-break, same as every other singleton)
- **AND** the RPC SHALL NOT raise `unknown table` for `'hospital_monotonic_counters'`

#### Scenario: upsert_lww accepts question_bookmarks table name

- **GIVEN** an authenticated client batch with `table_name = 'question_bookmarks'`
- **AND** every row's `user_id` matches `auth.uid()`
- **WHEN** the RPC executes
- **THEN** rows whose payload `updated_at` is strictly newer than the existing cloud row SHALL be upserted
- **AND** rows whose payload `updated_at` is equal to or older than the existing cloud row SHALL be skipped (LWW deterministic tie-break)
- **AND** the RPC SHALL NOT raise `unknown table` for `'question_bookmarks'`

#### Scenario: Dropping 一階 tables does not break surviving-app account RPCs

- **GIVEN** migration `0016_drop_medexam_tw_tables.sql` has dropped `player_state`, `srs_cards`, `item_instances`, `mentor_backlog`
- **WHEN** a surviving app invokes `delete_my_data()`, `export_my_data()`, or a `upsert_lww` batch
- **THEN** the RPC SHALL execute without raising a "relation does not exist" error for any of the four dropped tables
- **AND** the RPC SHALL continue to operate correctly on the surviving tables (`question_bookmarks`, `hospital_monotonic_counters`, and any others not owned by 一階)
