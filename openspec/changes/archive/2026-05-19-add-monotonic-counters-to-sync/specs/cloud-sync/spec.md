## MODIFIED Requirements

### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables (player, items, mastery, cosmetic_unlocks, srs_cards, streak, **question_bookmarks**, **hospital_monotonic_counters**; exact set finalized in design.md). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

The `question_bookmarks` table SHALL use composite primary key `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`). The table SHALL additionally carry `added_at TIMESTAMPTZ NOT NULL` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`. The `upsert_lww` RPC whitelist SHALL accept `'question_bookmarks'` as a valid table name and SHALL dispatch inserts using a dedicated `ELSIF` branch that maps `question_id`, `added_at`, `updated_at`, and `app_version` from the JSONB payload.

The `hospital_monotonic_counters` table SHALL be a per-user singleton with primary key `user_id`, opaque `data JSONB NOT NULL DEFAULT '{}'` payload, `updated_at TIMESTAMPTZ NOT NULL`, and optional `app_version TEXT`. The client-side fields stored in `data` (currently `totalStudyMinutes`, `fateCardBadLuckPity`, `freshCorrectSinceLastTicket`; shape may evolve with gameplay additions) SHALL be opaque to the cloud — the server SHALL NOT interpret or validate the JSONB structure. The `upsert_lww` RPC whitelist SHALL accept `'hospital_monotonic_counters'` as a valid table name and SHALL dispatch using the standard singleton `INSERT ... ON CONFLICT (user_id) DO UPDATE` branch identical to `hospital_state` and `mentor_backlog`.

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

### Requirement: Account deletion removes all cloud data

The app SHALL provide an account-deletion action that, when confirmed by the user, deletes all rows owned by `auth.uid()` across all cloud-sync tables, then signs the user out. The underlying `delete_my_data()` RPC SHALL ALSO bump `account_metadata.last_reset_at = now()` for the same user (creating the row on first use via `INSERT ... ON CONFLICT DO UPDATE`) so that other devices signed into the same account can detect the wipe on their next pull-gate evaluation and propagate it locally. The DELETE list SHALL include `hospital_monotonic_counters` so that reset clears the singleton on cloud, and the cross-device propagation marker then drives the local wipe + force-pull on every other device.

#### Scenario: Deletion clears cloud rows
- **WHEN** the user opens settings, picks "Delete account data", and confirms
- **THEN** every row in every cloud-sync table where `user_id = auth.uid()` SHALL be deleted (including `hospital_monotonic_counters`)
- **AND** the Supabase auth user record SHALL be deleted (or marked for deletion per Supabase Auth API)
- **AND** `account_metadata.last_reset_at` for the user SHALL be `now()` (row inserted or updated)
- **AND** the user SHALL be signed out
- **AND** local IndexedDB SHALL remain intact (user can keep playing offline if they want)
