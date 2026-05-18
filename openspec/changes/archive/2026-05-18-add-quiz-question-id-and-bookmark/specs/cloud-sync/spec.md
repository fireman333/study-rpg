## MODIFIED Requirements

### Requirement: Cloud schema mirrors IndexedDB tables 1:1 with row ownership and timestamp

The app SHALL define a Supabase Postgres schema that mirrors the gameplay-relevant Dexie tables (player, items, mastery, cosmetic_unlocks, srs_cards, streak, **question_bookmarks**; exact set finalized in design.md). Every row SHALL include `user_id UUID NOT NULL` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-Level Security (RLS) SHALL enforce `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE.

The `question_bookmarks` table SHALL use composite primary key `(user_id, question_id)` where `question_id TEXT` matches the corpus question identifier (e.g., `106-2-醫學三-內科-Q10`). The table SHALL additionally carry `added_at TIMESTAMPTZ NOT NULL` (immutable display sort key, distinct from `updated_at`) and `app_version TEXT`. The `upsert_lww` RPC whitelist SHALL accept `'question_bookmarks'` as a valid table name and SHALL dispatch inserts using a dedicated `ELSIF` branch that maps `question_id`, `added_at`, `updated_at`, and `app_version` from the JSONB payload.

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

#### Scenario: upsert_lww accepts question_bookmarks table name

- **GIVEN** an authenticated client batch with `table_name = 'question_bookmarks'`
- **AND** every row's `user_id` matches `auth.uid()`
- **WHEN** the RPC executes
- **THEN** rows whose payload `updated_at` is strictly newer than the existing cloud row SHALL be upserted
- **AND** rows whose payload `updated_at` is equal to or older than the existing cloud row SHALL be skipped (LWW deterministic tie-break)
- **AND** the RPC SHALL NOT raise `unknown table` for `'question_bookmarks'`
