## ADDED Requirements

### Requirement: The 「錯題」 list SHALL be derived from `hospital_question_history` at read time, not stored separately

The system SHALL define the 「錯題」 (wrong-answer) list as the live derived view of the `questionHistory` Dexie store filtered to rows whose `lastResult === 'wrong'`. There SHALL be no separate `wrongAnswers` Dexie store, no `question_wrong_answers` Supabase table, and no dedicated cloud-sync adapter for wrong-answers. The wrong-answer list updates automatically whenever `questionHistory[questionId].lastResult` changes — written by the existing `recordWrongAnswer` / `recordCorrectAnswer` flow in `lib/mastery.ts` (per `hospital-quiz` capability) and synced cross-device via the existing `hospital_question_history` cloud table.

The `questionHistory` Dexie store SHALL include a compound index `[lastResult+lastAnsweredAt]` (added in Dexie schema version 11) so the wrong-answer list read query can use the index and avoid full table scan.

#### Scenario: Wrong answer appears in derived list immediately

- **GIVEN** the player has no `questionHistory` row for question `106-2-醫學三-內科-Q10` with `lastResult = 'wrong'`
- **WHEN** the player selects an incorrect option for that question in `QuizModal`
- **AND** `recordWrongAnswer` writes `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'wrong'`
- **THEN** the derived wrong-answer list SHALL contain that question
- **AND** the corresponding entry in `/bookmarks?tab=wrong` SHALL update via `useLiveQuery` without manual reload

#### Scenario: Correct answer removes the question from the derived list

- **GIVEN** the player has `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'wrong'` and the question is currently in the derived wrong-answer list
- **WHEN** the player selects the correct option for that question
- **AND** `recordCorrectAnswer` writes `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'correct'`
- **THEN** the derived wrong-answer list SHALL no longer contain that question
- **AND** the corresponding entry in `/bookmarks?tab=wrong` SHALL disappear via `useLiveQuery` reactivity

#### Scenario: Cross-device — correct answer on device B removes the question from device A's list

- **GIVEN** the player is authenticated on devices A and B
- **AND** device A's local `questionHistory[Q_W].lastResult = 'wrong'` (question appears in 錯題 tab on A)
- **WHEN** the player on device B answers `Q_W` correctly
- **AND** device B's `recordCorrectAnswer` updates `questionHistory[Q_W].lastResult = 'correct'` locally
- **AND** the sync engine pushes the updated `hospital_question_history` row to cloud
- **AND** device A pulls (on tab focus or pull cycle)
- **THEN** device A's local `questionHistory[Q_W].lastResult` SHALL equal `'correct'` (LWW newer wins)
- **AND** the derived wrong-answer list on device A SHALL no longer contain `Q_W`
- **AND** the 「錯題」 tab on device A SHALL re-render without `Q_W` via `useLiveQuery` reactivity

#### Scenario: A question can simultaneously be in the wrong-answer list and bookmarks

- **GIVEN** the player has manually bookmarked question `106-2-醫學三-內科-Q10` (row exists in `bookmarks`)
- **WHEN** the player answers that question incorrectly
- **THEN** `questionHistory[106-2-醫學三-內科-Q10].lastResult` SHALL equal `'wrong'`
- **AND** the derived wrong-answer list SHALL contain that question
- **AND** the `bookmarks` row SHALL remain unchanged
- **AND** subsequent correct answer SHALL flip `lastResult = 'correct'` and remove the question from the derived wrong-answer list; the `bookmarks` row SHALL persist

### Requirement: `/bookmarks` route SHALL host a 「錯題」 tab alongside the 「手動收藏」 tab

The `/bookmarks` route SHALL render a top-level tab control with exactly two tabs: 「手動收藏」 (manual bookmarks, default landing) and 「錯題」 (derived wrong-answer list). The active tab SHALL be reflected in the URL query string via `?tab=manual` (default, also when the param is absent or invalid) or `?tab=wrong`. Tab clicks SHALL update the query string via `history.replaceState` (no full page reload). Direct navigation to `/bookmarks?tab=wrong` SHALL land on the 「錯題」 tab.

The 「手動收藏」 tab SHALL render manual bookmarks per the `question-bookmarks` spec (existing behavior, scoped to that tab).

The 「錯題」 tab SHALL render every `questionHistory` row whose `lastResult === 'wrong'`, sorted by `lastAnsweredAt` descending (most recent wrong first). Each list entry SHALL display the question identifier verbatim, the full question stem, all four options with their texts, the correct-answer label, and the explanation — using the same `ExplanationMarkdown` render pipeline as the 「手動收藏」 tab. Wrong-answer entries whose `questionId` is not present in the currently-loaded `questions.json` SHALL render a stub with the identifier and a 「題目已不在題庫」 notice (no remove button — wrong-answer entries are auto-managed by `lastResult` flips; orphans naturally exit the list when the player answers the question correctly, or persist as stubs if the question is permanently gone from the corpus).

#### Scenario: Default landing is 「手動收藏」 tab

- **GIVEN** the player navigates to `/bookmarks` (no query string)
- **WHEN** the page renders
- **THEN** the 「手動收藏」 tab SHALL be visually active
- **AND** the URL SHALL be updated to `/bookmarks?tab=manual` (or remain at `/bookmarks` if no replaceState; either acceptable)
- **AND** the manual bookmarks list SHALL be rendered

#### Scenario: Direct deep-link to wrong-answer tab lands correctly

- **GIVEN** the player opens `/bookmarks?tab=wrong` directly (e.g., from a shared link or F5 reload)
- **WHEN** the page loads
- **THEN** the 「錯題」 tab SHALL be visually active
- **AND** the wrong-answer list SHALL be rendered

#### Scenario: Tab click switches view without full page reload

- **GIVEN** the player is on `/bookmarks?tab=manual`
- **WHEN** the player clicks the 「錯題」 tab
- **THEN** the URL SHALL update to `/bookmarks?tab=wrong` via `history.replaceState`
- **AND** the wrong-answer list SHALL render
- **AND** no full page reload SHALL occur (existing React component state SHALL be preserved across the tab switch)

#### Scenario: Invalid tab query string falls back to manual

- **GIVEN** the player opens `/bookmarks?tab=invalid_value_xyz`
- **WHEN** the page loads
- **THEN** the 「手動收藏」 tab SHALL be active
- **AND** the URL MAY be normalized to `/bookmarks?tab=manual`

#### Scenario: Wrong-answer list renders newest-wrong-first

- **GIVEN** the player has 3 questions in `questionHistory` with `lastResult = 'wrong'` and `lastAnsweredAt` values T1 < T2 < T3
- **WHEN** the player views `/bookmarks?tab=wrong`
- **THEN** the page SHALL render 3 entries
- **AND** the entry with `lastAnsweredAt = T3` SHALL appear first
- **AND** the entry with `lastAnsweredAt = T1` SHALL appear last

#### Scenario: Wrong-answer entry shows full question content inline

- **GIVEN** `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'wrong'`
- **WHEN** the player views `/bookmarks?tab=wrong`
- **THEN** the entry SHALL display the literal identifier `106-2-醫學三-內科-Q10`
- **AND** the full question stem, all four option labels and texts, correct-answer label, and explanation SHALL be visible inline
- **AND** the explanation SHALL be rendered through `ExplanationMarkdown` (same pipeline as manual bookmarks)
- **AND** no further click SHALL be required to reveal any of the above

#### Scenario: Orphaned wrong-answer entry renders stub

- **GIVEN** `questionHistory[999-9-醫學一-X-Q99].lastResult = 'wrong'`
- **AND** that identifier is not present in the currently-loaded `questions.json`
- **WHEN** the player views `/bookmarks?tab=wrong`
- **THEN** the entry SHALL display the identifier
- **AND** the entry SHALL display the text 「題目已不在題庫」
- **AND** the page SHALL NOT throw or crash

### Requirement: The 「錯題」 tab SHALL surface a header helper banner explaining ephemeral behavior and promote affordance

The 「錯題」 tab SHALL render a fixed helper banner at the top of the list (above the first entry, persistent — not a dismissible toast) containing the following two pieces of information in Traditional Chinese:

1. A brief definition: 「錯題」 = the player's most recently wrong question, AND that it auto-leaves the list on the next correct answer.
2. A promote affordance hint: instruct the player they can click ★ on any entry (or use the inline ★ in `QuizModal` answer feedback) to add the question to 「手動收藏」 for permanent retention.

The exact copy is implementation-detail (UI polish in apply phase) but SHALL include both pieces above. The banner SHALL remain visible while the player scrolls through the list (sticky positioning at tab top, OR rendered as the first non-scrolling element above a scrollable list — either acceptable).

#### Scenario: Helper banner renders on wrong-answer tab landing

- **WHEN** the player lands on `/bookmarks?tab=wrong` (with non-empty list OR empty list)
- **THEN** a helper banner SHALL be rendered above the list area
- **AND** the banner SHALL contain text explaining 「錯題」 = the most recently wrong question, auto-leaves on next correct answer
- **AND** the banner SHALL contain text pointing the player to ★ as the way to convert to permanent 手動收藏

#### Scenario: Helper banner does NOT render on manual tab

- **WHEN** the player is on `/bookmarks?tab=manual`
- **THEN** the wrong-answer helper banner SHALL NOT be visible (it is wrong-answer-tab-scoped)

### Requirement: Wrong-answer list entries SHALL expose a ★ toggle to promote to 「手動收藏」

Each wrong-answer list entry SHALL include a ★ toggle. Clicking the toggle when the question is NOT in `bookmarks` SHALL add a new row to the `bookmarks` Dexie store (with `addedAt = Date.now()`, behavior identical to `QuizModal` bookmark toggle per `question-bookmarks` spec). Clicking the toggle when the question IS already in `bookmarks` SHALL remove the bookmark row (un-bookmark). The toggle's visual state (filled ★ vs outline ☆) SHALL reflect the current `bookmarks` membership. The wrong-answer derivation itself SHALL NOT be affected by this toggle — wrong-answer membership is determined by `questionHistory.lastResult`, orthogonal to manual bookmark state.

#### Scenario: Promoting a wrong-answer entry adds a bookmark row

- **GIVEN** `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'wrong'` and no `bookmarks` row for that question
- **WHEN** the player clicks the ★ toggle on that entry in the wrong-answer tab
- **THEN** a new `bookmarks` row SHALL exist with `questionId = "106-2-醫學三-內科-Q10"` and `addedAt = Date.now()`
- **AND** the `questionHistory` row SHALL remain unchanged (still `lastResult = 'wrong'`)
- **AND** the toggle SHALL re-render with the filled ★ glyph

#### Scenario: Un-promoting (toggling ★ off) removes the bookmark row but keeps the wrong-answer entry

- **GIVEN** both `bookmarks[106-2-醫學三-內科-Q10]` exists and `questionHistory[106-2-醫學三-內科-Q10].lastResult = 'wrong'`
- **WHEN** the player clicks the ★ toggle (now filled) on the wrong-answer tab entry
- **THEN** the `bookmarks` row SHALL be deleted
- **AND** the `questionHistory` row SHALL remain unchanged
- **AND** the entry SHALL still appear in the wrong-answer tab

#### Scenario: Subsequent correct answer removes wrong-answer entry but bookmark persists if promoted

- **GIVEN** both `bookmarks[Q]` exists and `questionHistory[Q].lastResult = 'wrong'` (after promoting via ★)
- **WHEN** the player answers Q correctly
- **AND** `recordCorrectAnswer` flips `questionHistory[Q].lastResult = 'correct'`
- **THEN** Q SHALL no longer appear in the derived wrong-answer list
- **AND** the `bookmarks[Q]` row SHALL persist
- **AND** the question SHALL no longer appear in the 「錯題」 tab
- **AND** the question SHALL continue to appear in the 「手動收藏」 tab

### Requirement: Wrong-answer list SHALL render an empty-state placeholder when no entries exist

When no `questionHistory` row exists with `lastResult = 'wrong'` (or all such rows have orphaned `questionId` not in corpus — which still render but as stubs), the 「錯題」 tab SHALL render a friendly empty-state message in Traditional Chinese (e.g., 「目前還沒有答錯的題目 — 答錯後會自動收進這裡」 or equivalent — exact copy is UI polish). The helper banner SHALL still render above the empty state.

#### Scenario: Empty state renders when no wrong-answer rows exist

- **GIVEN** no `questionHistory` row has `lastResult = 'wrong'`
- **WHEN** the player navigates to `/bookmarks?tab=wrong`
- **THEN** the helper banner SHALL be visible at the top
- **AND** a friendly empty-state message SHALL be displayed in the list area
- **AND** no list entries SHALL render
- **AND** no error SHALL be thrown
