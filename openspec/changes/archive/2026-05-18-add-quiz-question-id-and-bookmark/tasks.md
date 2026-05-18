# Tasks

> **Apply gate**: this change must NOT enter Stage 1+ until `add-medexam2-question-images` has been merged into `track-m2` and this worktree has been rebased. Stage 0 enforces the gate.

## 0. Pre-flight (apply session entry checks)

- [x] 0.1 Verify `add-medexam2-question-images` has been archived in `openspec/changes/archive/` AND merged into `track-m2`
- [x] 0.2 `git fetch origin && git rebase track-m2` inside this worktree; resolve any `QuizModal.tsx` conflicts by interleaving meta-row markup ABOVE the new image render block (per design.md §6)
- [x] 0.3 `pnpm install && pnpm --filter @study-rpg/core build && pnpm -r typecheck` all green before Stage 1
- [x] 0.4 Confirm `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` post-rebase contains the image render path from the previous change; if missing, halt and investigate

## 1. Question ID display (Feature 1)

- [x] 1.1 Add `.quiz-modal__question-meta` flex row in `apps/medexam2-hospital-tw/src/styles.css` (justify-content: space-between, small monospace ID on left, bookmark button on right, max-width matches stem column)
- [x] 1.2 In `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`, render `<div className="quiz-modal__question-meta">` directly above the existing stem `<div>`, containing a `<span>` with `{question.id}` verbatim
- [x] 1.3 Ensure rendering works for orphan / fallback states (image-fallback path, doctor-picker-blocked path); meta row visible on every QuizModal render that has a question loaded
- [x] 1.4 Manual smoke (Chrome MCP if connected, else dev server visit): open quiz modal, confirm ID string matches `question.id` byte-for-byte, copy-paste round-trips

## 2. Bookmark — schema + service layer (Feature 2 backend)

- [x] 2.1 In `apps/medexam2-hospital-tw/src/db/schema.ts`, add `BookmarkRow` interface (`questionId: string`, `addedAt: number`, `_updatedAt?: number`) and declare `bookmarks!: EntityTable<BookmarkRow, 'questionId'>` on `HospitalDB`
- [x] 2.2 Add `this.version(7).stores({ ...v6Stores, bookmarks: '&questionId, addedAt' })` block; no `.upgrade(...)` hook needed (additive store add)
- [x] 2.3 Create `apps/medexam2-hospital-tw/src/services/bookmarks.ts` exporting `toggleBookmark(questionId)`, `useBookmark(questionId)`, `useAllBookmarks()`; rely on engine hook to stamp `_updatedAt`
- [x] 2.4 Add `exportBookmarksMarkdown(rows, questionsById)` pure helper in the same file; returns Markdown string per design.md §5 format
- [x] 2.5 Add `triggerBookmarksDownload()` thin wrapper that calls `exportBookmarksMarkdown`, wraps in Blob, creates object URL, simulates `<a download>` click, revokes URL
- [x] 2.6 Manual smoke: open hospital app, run `globalThis.__db.bookmarks.put({ questionId: 'test', addedAt: Date.now() })` in DEV console, confirm row + `_updatedAt` stamp visible via `globalThis.__db.bookmarks.toArray()`

## 3. Bookmark — Supabase schema + RPC

- [x] 3.1 Create `supabase/migrations/0004_question_bookmarks.sql` per design.md §3 (table + 1 index + 4 RLS policies)
- [x] 3.2 Create `supabase/migrations/0005_upsert_lww_bookmarks.sql` per design.md §3 (CREATE OR REPLACE of `upsert_lww` with extended whitelist + new ELSIF branch)
- [ ] 3.3 Apply both migrations in the Supabase dashboard SQL editor (project `jakdyjxojokyqxeiuukx`); verify table appears under `public.question_bookmarks` and RPC `upsert_lww` shows updated body — **user action required (dashboard access)**
- [ ] 3.4 RLS sanity: in SQL editor run `select count(*) from question_bookmarks;` under `set role anon;` — must error / return 0; reset role and run again to confirm authenticated visibility works — **gated on 3.3**
- [ ] 3.5 Smoke from client: with a signed-in test session, `await supabase.rpc('upsert_lww', { table_name: 'question_bookmarks', rows: [{ user_id: <uid>, question_id: 'test', added_at: new Date().toISOString(), updated_at: new Date().toISOString(), app_version: '0.2.0' }] })` — expect success — **gated on 3.3**

## 4. Bookmark — sync engine wiring

- [x] 4.1 In `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`, define and export `BOOKMARK_ADAPTER` matching the `TableAdapter` shape per design.md §4 (`postgresTable: 'question_bookmarks'`, `shape: 'collection'`, `dexieTable: 'bookmarks'`, plus `snapshotDirty`, `snapshotAll`, `applyToLocal`)
- [x] 4.2 In `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` (or wherever `HOSPITAL_ADAPTERS` is composed), append `BOOKMARK_ADAPTER` to the array — keep ordering with new adapters at the bottom
- [x] 4.3 Confirm the engine's Dexie `creating` / `updating` hook attaches to the new `bookmarks` table (engine iterates `db.tables`, so this should be automatic — verify with a console log of `db._allTables` after first open)
- [x] 4.4 Type-check that `BookmarkRow._updatedAt` is correctly typed as optional `number` to satisfy `WithUpdatedAt<T>`

## 5. Bookmark — UI in QuizModal

- [x] 5.1 In `QuizModal.tsx`, import `useBookmark` and `toggleBookmark` from `services/bookmarks.ts`
- [x] 5.2 Inside the existing question render block, compute `const bookmarked = !!useBookmark(question.id)`
- [x] 5.3 Render `<button>` inside the meta row from Task 1.2, with `role="switch"`, `aria-pressed={bookmarked}`, `aria-label={bookmarked ? '取消收藏這題' : '收藏這題'}`, glyph swap between ⭐ (filled) and ☆ (outline)
- [x] 5.4 Wire `onClick={() => toggleBookmark(question.id)}`
- [x] 5.5 Add `.quiz-modal__bookmark-toggle` styles (no border, 1.4rem glyph, hover state, focus ring respecting `:focus-visible`)
- [x] 5.6 Manual smoke: open modal, click ⭐ → glyph fills + Dexie row appears; click again → glyph empties + row gone; navigate to next question and back to original via re-roll → state persists

## 6. Bookmark — `/bookmarks` route + page

- [x] 6.1 In `apps/medexam2-hospital-tw/src/App.tsx` (or wherever react-router routes live), add `<Route path="/bookmarks" element={<BookmarksPage />} />`
- [x] 6.2 Create `apps/medexam2-hospital-tw/src/components/BookmarksPage.tsx`
- [x] 6.3 Page uses `useAllBookmarks()` for row list and existing questions hook (or `useQuestions()` if exposed) to hydrate each row
- [x] 6.4 Render header: `📚 收藏題目 (N)` count + 「⬇ 匯出 Markdown」 button (disabled when N=0) wired to `triggerBookmarksDownload`
- [x] 6.5 Render list entries in `addedAt DESC` order, each showing: identifier, full stem, all 4 options labeled A–D, correct answer, explanation, 「移除收藏」 button
- [x] 6.6 Handle orphan rows (questionId not in `questions.json`): render identifier + `題目已不在題庫` notice + remove button
- [x] 6.7 Empty state: render `還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。` text, no list, export button disabled
- [x] 6.8 「移除收藏」 button uses `window.confirm` (or a small inline confirmation pill) before calling `toggleBookmark(questionId)`
- [x] 6.9 Add CSS for `.bookmarks-page__*` classes (header, list, entry card, divider line under identifier, remove button)
- [x] 6.10 In the hospital home page header / nav, add a `<Link to="/bookmarks">📚 收藏</Link>` next to existing nav links

## 7. Documentation

- [x] 7.1 Update `docs/CLOUD_SYNC.md` synced-tables list to include `question_bookmarks` (with note: composite PK `(user_id, question_id)`, `added_at` separate from `updated_at`)
- [x] 7.2 Update `CLAUDE.md` project root M4 sync section schema bullet to mention `question_bookmarks` as the 9th synced table
- [x] 7.3 Add a convention note in `docs/CLOUD_SYNC.md` migration section: "Any future change to `upsert_lww` adds a new `0NNN_upsert_lww_*.sql` migration; never edit an existing migration in place."

## 8. Verification (Chrome MCP smoke)

- [x] 8.1 `pnpm -r typecheck` green
- [x] 8.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` green
- [x] 8.3 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` → preflight Chrome MCP via `list_connected_browsers`
- [x] 8.4 Chrome MCP smoke A — ID display: open quiz modal on any subject, confirm `question.id` string visible above stem and identical to `globalThis.__db` lookup
- [x] 8.5 Chrome MCP smoke B — bookmark toggle: ⭐ on a question, advance to next question, return via repeat roll, ⭐ state still correct
- [x] 8.6 Chrome MCP smoke C — list page: navigate to `/bookmarks`, all bookmarks visible with full content, sort order correct (most recent first)
- [x] 8.7 Chrome MCP smoke D — orphan: manually `globalThis.__db.bookmarks.put({ questionId: 'orphan-test', addedAt: Date.now() })`, reload `/bookmarks`, confirm `題目已不在題庫` stub renders + remove works
- [x] 8.8 Chrome MCP smoke E — empty state: clear all bookmarks via DEV console, confirm empty-state copy renders + export button disabled
- [x] 8.9 Chrome MCP smoke F — Markdown export: bookmark 3 known questions, click 「匯出 Markdown」, download file, open in editor, confirm format matches design.md §5 sample
- [x] 8.10 Chrome MCP smoke G — unauth path: tested implicitly (no sign-in during smoke, all bookmark ops worked locally; no Supabase request observed)
- [ ] 8.11 Chrome MCP smoke H — auth round-trip: sign in, bookmark 2 questions, wait 5s for debounce push, verify rows appear in Supabase dashboard `question_bookmarks` table — **gated on 3.3 (migrations applied)**
- [x] 8.12 Chrome MCP smoke I — SPA route prod-equivalent: F5 on `/bookmarks` should reload page successfully (matches CLAUDE.md SPA verification rule)
- [x] 8.13 Spec verify: `openspec validate add-quiz-question-id-and-bookmark --strict` reports no issues

## 9. Archive

- [ ] 9.1 `/opsx:verify` — 3-dim spec-vs-impl check
- [ ] 9.2 `/verify` — global end-to-end check (re-runs Chrome MCP smokes + `/simplify`) — optional, current session already exercised smokes manually
- [ ] 9.3 `/opsx:archive` — merge delta into `openspec/specs/{hospital-quiz,question-bookmarks,cloud-sync}/spec.md`
- [ ] 9.4 Auto-git commit with template: `spec(archive): merge add-quiz-question-id-and-bookmark — quiz UX 2 features` — **explicit user confirmation required (CLAUDE.md curator rule)**
- [ ] 9.5 (When ready) sync `track-m2` → `main` via `cd ~/coding-scratch/study-rpg && git merge track-m2` — **explicit user confirmation required**
