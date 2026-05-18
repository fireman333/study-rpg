## Why

Two quiz-experience improvements for 二階 hospital mode, bundled into one change because both modify the same `QuizModal` component:

1. **Question ID display** — When players answer wrong they need to be able to reference the exact question (e.g.「我錯 106-2-醫學三-內科-Q10 這題」) when discussing with peers or external reviewers. `question.id` already encodes year+sitting+paper+subject+number from the build pipeline; it just needs UI exposure.
2. **Question bookmark** — Players want to star notable questions during quiz play and review them later. Storage follows the M4 cloud-sync pattern: IndexedDB is the source of truth, Supabase mirror is opt-in via Google sign-in, conflict resolution uses the existing LWW `upsert_lww` RPC.

Bundling minimises review surface (one capability spec, one PR), avoids two parallel rebases against the same `QuizModal.tsx`, and ships one user-facing UX iteration in a single dogfood loop.

## What Changes

- **MODIFIED** capability `hospital-quiz`:
  - Each question in `QuizModal` SHALL display its identifier in a user-readable format above the stem.
  - Each question in `QuizModal` SHALL display a bookmark toggle button adjacent to the identifier.
- **ADDED** capability `question-bookmarks`:
  - Players SHALL be able to bookmark / un-bookmark any question directly from `QuizModal`.
  - Players SHALL be able to view all bookmarks at `/bookmarks` route, sorted by most-recently-added.
  - Each bookmark list entry SHALL display the full question identifier, stem, options, correct answer, and explanation — readable inline without any extra navigation.
  - Players SHALL be able to remove a bookmark from `/bookmarks` (with confirm).
  - Players SHALL be able to export all bookmarks to a Markdown file (downloaded locally) for offline editing in their own editor of choice.
  - Bookmarks SHALL be stored in IndexedDB (`HospitalDB.bookmarks`) as source of truth.
  - Bookmarks SHALL be mirrored to Supabase `question_bookmarks` when authenticated, via the existing M4 sync engine (LWW, opt-in).
  - Bookmarks SHALL NOT carry any user-editable note field in this iteration; offline-edit-via-export is the intended note workflow.
- **MODIFIED** capability `cloud-sync`:
  - The `upsert_lww` RPC whitelist SHALL include `question_bookmarks`.
  - The hospital-side sync adapter list SHALL include `BOOKMARK_ADAPTER`.

## Capabilities

### New Capabilities

- `question-bookmarks`: Per-question star/un-star, bookmark list view at `/bookmarks` showing full question content + explanation inline, remove + Markdown export, IDB-first storage with opt-in Supabase mirror. No in-app note editing (offline workflow via export).

### Modified Capabilities

- `hospital-quiz`: QuizModal renders question identifier + bookmark toggle alongside the existing stem/options/explanation layout.
- `cloud-sync`: Adds `question_bookmarks` to the `upsert_lww` table whitelist and hospital adapter array.

## Impact

- **Code**:
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` (ID meta row + ⭐ toggle button)
  - `apps/medexam2-hospital-tw/src/components/BookmarksPage.tsx` (new — list view with full stem/answer/explanation inline + remove + Markdown export button)
  - `apps/medexam2-hospital-tw/src/services/bookmarks.ts` (new — toggle / useBookmark / useAllBookmarks / exportBookmarksMarkdown)
  - `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` (new `BOOKMARK_ADAPTER`)
  - `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` (extend `HOSPITAL_ADAPTERS`)
  - `apps/medexam2-hospital-tw/src/App.tsx` (new `/bookmarks` route + nav link)
  - `apps/medexam2-hospital-tw/src/lib/quiz-format.ts` (new — `formatQuestionId` helper)
  - `apps/medexam2-hospital-tw/src/styles.css` (`.quiz-modal__question-meta`, `.quiz-modal__bookmark-toggle`, `.bookmarks-page__*`)
- **Schema**:
  - `packages/content-medexam2-tw/src/db/schema.ts` — additive `HospitalDB` v6 → v7 with new `bookmarks` store keyed on `questionId`.
- **Database migrations**:
  - `supabase/migrations/0005_question_bookmarks.sql` — table + RLS (4 policies) + index on `(user_id, added_at desc)`.
  - `supabase/migrations/0006_*` OR `ALTER` of `0003_upsert_lww.sql` — extend whitelist (decision in design.md).
- **Docs**:
  - `docs/CLOUD_SYNC.md` — add `question_bookmarks` to the synced-tables list.
  - `CLAUDE.md` (project root) — mention the new table in the M4 sync section.
- **Dependencies**: None new. Uses existing Dexie, `useLiveQuery`, `@supabase/supabase-js`, react-router.
- **Concurrent work**: This change MUST land after `add-medexam2-question-images` to avoid a three-way `QuizModal.tsx` conflict. Apply phase is therefore deferred to a future session per handoff instructions.
