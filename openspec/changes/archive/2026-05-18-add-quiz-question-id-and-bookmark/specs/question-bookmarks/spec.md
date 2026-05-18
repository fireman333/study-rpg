## ADDED Requirements

### Requirement: Players SHALL be able to bookmark and un-bookmark questions from QuizModal

The system SHALL provide a bookmark toggle on every `QuizModal` render. Clicking the toggle when the current question is not bookmarked SHALL persist a `BookmarkRow` to the local `bookmarks` Dexie store with `questionId = question.id` and `addedAt = Date.now()`. Clicking the toggle when the current question is already bookmarked SHALL delete the corresponding row from the local store. The toggle SHALL operate synchronously on the local store regardless of authentication state.

#### Scenario: Bookmarking persists a row to IndexedDB

- **GIVEN** the player has no bookmark for question `106-2-醫學三-內科-Q10`
- **WHEN** the player clicks the bookmark toggle in `QuizModal` while that question is displayed
- **THEN** a new row SHALL exist in the `bookmarks` Dexie store with `questionId = "106-2-醫學三-內科-Q10"`
- **AND** `addedAt` SHALL equal `Date.now()` at the moment of the click (within tolerance for test timing)
- **AND** the toggle button SHALL re-render with the filled glyph

#### Scenario: Un-bookmarking deletes the row

- **GIVEN** a bookmark row exists for question `106-2-醫學三-內科-Q10`
- **WHEN** the player clicks the bookmark toggle in `QuizModal` while that question is displayed
- **THEN** the row SHALL be deleted from the `bookmarks` Dexie store
- **AND** the toggle button SHALL re-render with the outline glyph

#### Scenario: Bookmark operations work without authentication

- **GIVEN** the player is not signed in to a Google account
- **WHEN** the player toggles bookmarks during a quiz session
- **THEN** all bookmark mutations SHALL persist to IndexedDB successfully
- **AND** no sync push SHALL be attempted
- **AND** no error SHALL surface to the player

### Requirement: A `/bookmarks` route SHALL list all bookmarked questions with full content inline

The system SHALL expose a `/bookmarks` route accessible from the hospital home page navigation. The route SHALL render every row from the local `bookmarks` Dexie store, sorted by `addedAt` descending (most recent first). Each list entry SHALL display the question identifier verbatim, the full question stem, all four options with their texts, the correct-answer label, and the explanation — without any truncation or "click to expand" interaction. Bookmark entries whose `questionId` is not present in the currently-loaded `questions.json` SHALL render a stub with the identifier and a "題目已不在題庫" notice plus a remove button.

#### Scenario: Bookmarks list renders all bookmarks most-recent-first

- **GIVEN** the player has 3 bookmarks with `addedAt` values T1 < T2 < T3
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL render 3 entries
- **AND** the entry with `addedAt = T3` SHALL appear first
- **AND** the entry with `addedAt = T1` SHALL appear last

#### Scenario: Each entry shows full question content inline

- **GIVEN** the player has bookmarked question `106-2-醫學三-內科-Q10`
- **WHEN** the player views `/bookmarks`
- **THEN** the entry SHALL display the literal identifier `106-2-醫學三-內科-Q10`
- **AND** the full question stem SHALL be visible
- **AND** all four option labels (A, B, C, D) and their text SHALL be visible
- **AND** the correct answer label SHALL be visible
- **AND** the explanation text SHALL be visible
- **AND** no further click SHALL be required to reveal any of the above

#### Scenario: Orphaned bookmark renders stub with remove option

- **GIVEN** the player has a bookmark for `questionId = "999-9-醫學一-X-Q99"`
- **AND** that identifier is not present in the currently-loaded `questions.json`
- **WHEN** the player views `/bookmarks`
- **THEN** the entry SHALL display the identifier
- **AND** the entry SHALL display the text `題目已不在題庫`
- **AND** the entry SHALL display a remove-bookmark button
- **AND** the page SHALL NOT throw or crash

#### Scenario: Empty state when no bookmarks exist

- **GIVEN** the `bookmarks` Dexie store contains zero rows
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL display the message `還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。`
- **AND** no list entries SHALL render
- **AND** the export button SHALL be disabled

### Requirement: Players SHALL be able to remove bookmarks from the list view

The system SHALL render a remove control on every entry in `/bookmarks`. Activating the control SHALL delete the underlying `bookmarks` Dexie row and update the rendered list within the current navigation. A confirmation step SHALL prevent accidental removal.

#### Scenario: Remove control deletes bookmark with confirmation

- **GIVEN** the player has 3 bookmarks visible on `/bookmarks`
- **WHEN** the player clicks the remove control on the entry for question `106-2-醫學三-內科-Q10`
- **AND** confirms the removal in the resulting dialog
- **THEN** the corresponding row SHALL be deleted from the `bookmarks` Dexie store
- **AND** the entry SHALL disappear from the rendered list
- **AND** the list SHALL now display 2 entries

#### Scenario: Cancelling removal preserves bookmark

- **GIVEN** the player has clicked the remove control on a bookmark entry
- **WHEN** the player cancels the confirmation dialog
- **THEN** the bookmark row SHALL remain in the Dexie store
- **AND** the entry SHALL remain in the rendered list

### Requirement: Players SHALL be able to export all bookmarks to a downloadable Markdown file

The system SHALL render an "匯出 Markdown" button on `/bookmarks` whenever at least one bookmark exists. Activating the button SHALL trigger a browser download of a Markdown file named `bookmarks-YYYY-MM-DD.md`. The file SHALL contain a header line with the total count and export timestamp, followed by one section per bookmark in the same order shown in the list view. Each section SHALL include the question identifier as a heading, the full stem, all four options as a bulleted list, the correct answer label, and the explanation. The export SHALL run entirely client-side without any network call.

#### Scenario: Export downloads file with all bookmarks

- **GIVEN** the player has 5 bookmarks
- **WHEN** the player clicks the 「匯出 Markdown」 button
- **THEN** a file named `bookmarks-<today's date in YYYY-MM-DD>.md` SHALL be downloaded by the browser
- **AND** the file content SHALL start with a heading containing the count `5` and the export timestamp
- **AND** the file SHALL contain 5 sections, one per bookmark, in the same order as displayed
- **AND** each section SHALL include the question identifier, stem, options, correct answer, and explanation
- **AND** no network request SHALL be made

#### Scenario: Export button disabled when no bookmarks exist

- **GIVEN** the `bookmarks` Dexie store contains zero rows
- **WHEN** the player views `/bookmarks`
- **THEN** the 「匯出 Markdown」 button SHALL be disabled or not rendered
- **AND** no download SHALL be triggered

### Requirement: Bookmarks SHALL be mirrored to Supabase via the existing M4 sync engine when authenticated

The system SHALL include `bookmarks` in the Dexie sync hook scope so that local writes trigger debounced pushes via the existing M4 sync engine. When the player is signed in, every bookmark mutation SHALL be persisted to the Supabase `question_bookmarks` table via the `upsert_lww` RPC. Conflict resolution SHALL follow the same Last-Write-Wins semantics as other synced tables (`updated_at` newest wins; cloud wins on tie). When the player is not signed in, no push SHALL be attempted and no error SHALL surface.

#### Scenario: Authenticated bookmark write pushes to cloud within debounce window

- **GIVEN** the player is signed in
- **AND** sync is enabled (`VITE_CLOUD_SYNC_ENABLED=true`)
- **WHEN** the player toggles a bookmark on
- **AND** waits 4 seconds without further interaction
- **THEN** a single batched push SHALL occur targeting the `question_bookmarks` table via `upsert_lww`
- **AND** the cloud row SHALL contain matching `question_id`, `added_at`, and `updated_at`

#### Scenario: Bookmark sync round-trip across two devices

- **GIVEN** device A and device B are both signed in to the same account
- **AND** device A bookmarks question `106-2-醫學三-內科-Q10`
- **AND** device A's debounced push completes
- **WHEN** device B's next pull fires (on tab focus, per `cloud-sync` spec)
- **THEN** device B's local `bookmarks` store SHALL contain the same row
- **AND** device B's `/bookmarks` page SHALL display the entry

#### Scenario: Unauthenticated bookmark write does not attempt push

- **GIVEN** the player is not signed in
- **WHEN** the player toggles a bookmark on
- **THEN** no network request to Supabase SHALL be made
- **AND** the local IndexedDB row SHALL persist normally
- **AND** the toggle SHALL succeed without surfacing any error
