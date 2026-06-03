## 1. Dexie v7 schema

- [x] 1.1 In `apps/neurons-tw/src/lib/db.ts`, add `this.version(7).stores({ questionBookmarks: 'questionId, family, addedAt, updatedAt', questionBookmarkTombstones: 'questionId, updatedAt' })`.
- [x] 1.2 Declare row types: `interface QuestionBookmarkRow { questionId: string; family: string; addedAt: number; updatedAt: number }` and `interface QuestionBookmarkTombstoneRow { questionId: string; updatedAt: number }` (export both from the same module so service + adapter can import).
- [x] 1.3 Add `questionBookmarks: Dexie.Table<QuestionBookmarkRow, string>` and `questionBookmarkTombstones: Dexie.Table<QuestionBookmarkTombstoneRow, string>` fields on the `NeuronsDB` class.

## 2. Service

- [x] 2.1 Create `apps/neurons-tw/src/lib/services/bookmarks.ts`.
- [x] 2.2 `addBookmark(questionId, family)`: tx — if existing row, no-op; else write new row with `addedAt = Date.now(), updatedAt = Date.now()`. Also clear any matching tombstone (un-delete semantic).
- [x] 2.3 `removeBookmark(questionId)`: tx — delete row from `questionBookmarks` AND write tombstone to `questionBookmarkTombstones` with `updatedAt = Date.now()` (needed for cross-device delete propagation).
- [x] 2.4 `toggleBookmark(question: Question): Promise<boolean>`: convenience — check `isBookmarked(q.id)`, branch.
- [x] 2.5 `isBookmarked(questionId): Promise<boolean>`: `await db.questionBookmarks.get(questionId)` → `!!row`.
- [x] 2.6 `useIsBookmarked(questionId): boolean` React hook via `useLiveQuery`.
- [x] 2.7 `useAllBookmarks(): QuestionBookmarkRow[]` React hook via `useLiveQuery` ordered by `addedAt` desc.

## 3. Hotkey wiring (extend existing hook)

- [x] 3.1 In `apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`, change the answered-phase `1` branch from `noop` to `return { kind: 'toggle-bookmark' }`.
- [x] 3.2 Add `onToggleBookmark: () => void` to `UseQuizHotkeysOptions` interface (non-optional — caller must provide).
- [x] 3.3 In the hook's switch statement, change `case 'toggle-bookmark':` from no-op to `event.preventDefault(); opts.onToggleBookmark(); return`.
- [x] 3.4 Update `quiz-hotkeys.test.ts` — change the test「reserved `1` / `2` / `3` are noop」 to:「reserved `2` / `3` are noop, `1` returns toggle-bookmark」. Add new test: answered-phase `1` returns `{kind:'toggle-bookmark'}`.

## 4. QuizModal ⭐ button

- [x] 4.1 In `apps/neurons-tw/src/components/QuizModal.tsx`, import `useIsBookmarked` + `toggleBookmark`.
- [x] 4.2 Add `const bookmarked = useIsBookmarked(q?.id ?? '')` (or equivalent — guard against undefined q).
- [x] 4.3 Add ⭐ button to the footer: position before `結束` button. Icon: `bookmarked ? '★' : '☆'` with accent color when bookmarked. `aria-label`: `bookmarked ? '取消收藏 (1)' : '收藏 (1)'`, `aria-pressed={bookmarked}`. `onClick={() => void toggleBookmark(q)}`. Disabled when `!q` (defensive — modal in exhausted state).
- [x] 4.4 Wire `onToggleBookmark: () => { if (q) void toggleBookmark(q) }` into `useQuizHotkeys({...})` call.
- [x] 4.5 Mobile (`@media (max-width: 600px)`): hide button text label, icon-only.

## 5. Banner v2 → v3

- [x] 5.1 In `apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`, bump `STORAGE_KEY` to `neurons-quiz-hotkeys-banner-dismissed-v3`.
- [x] 5.2 Update banner copy to mention bookmark: insert「答題後 <kbd>1</kbd> 收藏」 in the copy, near the existing「答題後 <kbd>Enter</kbd>/<kbd>Space</kbd> 下一題」 phrase.
- [x] 5.3 Update the comment explaining version bump rationale.

## 6. HelpMenu 7th section

- [x] 6.1 In `apps/neurons-tw/src/components/HelpMenu.tsx`, add a new `bookmark` section to `SECTIONS` array (position: between `hotkeys` and `variant-unlock`).
- [x] 6.2 Section content: id=`bookmark`, icon=⭐, title=「收藏題目」. Body: 「答題時按 ⭐ 按鈕或 <kbd>1</kbd> 鍵收藏題目，到 <a href="/bookmarks">收藏</a> 頁面隨時複習。收藏會跨裝置同步（需登入）。」 + brief mention that bookmarks live in Dexie v7 + R2 LWW.

## 7. BookmarksPage route

- [x] 7.1 Create `apps/neurons-tw/src/routes/BookmarksPage.tsx` (~200 lines).
- [x] 7.2 Layout: top header「⭐ 收藏題目」+ family filter chip bar (all 11 chips, default all selected) + scrollable list of rows (max 200, warn if exceeded).
- [x] 7.3 Row: family badge + stem (truncated 100 chars) + 「添加於 X 前」 relative time + ⭐ unbookmark button + 「重新作答」 button.
- [x] 7.4 Empty state: 「📭 目前沒有收藏的題目。在答題時按 ⭐ 或 <kbd>1</kbd> 鍵加入收藏。」 + link back to `/`.
- [x] 7.5 Family filter: local React state Set<string> initialised to all 11 family ids. Click chip toggles inclusion. Filter applied via `useAllBookmarks().filter(b => includedFamilies.has(b.family))`.
- [x] 7.6 「重新作答」: opens QuizModal with `pool = [question]` (1-question pool). Need to resolve `question` from `questionId` via the content pack — pass `pack` prop down from App.tsx, OR fetch via `getContentPack()` inline (defer this loading concern — simplest: pass `pack` as prop, mirror Overview pattern).
- [x] 7.7 Relative time formatter: 「剛剛」 (< 60s) / 「X 分鐘前」 (< 1hr) / 「X 小時前」 (< 1d) / 「昨天」 (1 day) / 「YYYY-MM-DD」 (else).

## 8. App routing + nav

- [x] 8.1 In `apps/neurons-tw/src/App.tsx`, import `BookmarksPage`.
- [x] 8.2 Add `<Route path="/bookmarks" element={<BookmarksPage pack={pack} />} />` to `<Routes>`.
- [x] 8.3 Add nav link「收藏 →」 to the top nav, between「DMN →」 and「成就 →」.

## 9. R2 sync wiring

- [x] 9.1 In `apps/neurons-tw/src/lib/sync/tables.ts`, add `questionBookmarksAdapter` after `dmnActiveBuffsAdapter`. Pattern: snapshot reads all rows; apply does LWW per `questionId` using `updatedAt`.
- [x] 9.2 Add `questionBookmarkTombstonesAdapter`. Snapshot reads all tombstones; apply merges by max `updatedAt`. Also: on apply, if local has bookmark for `questionId` with `updatedAt < tombstone.updatedAt`, delete that bookmark row (delete propagation).
- [x] 9.3 Add both adapters to `NEURONS_ADAPTERS` export at bottom of `tables.ts`.
- [x] 9.4 In `apps/neurons-tw/src/lib/sync/r2/bundles.ts`, bump `SCHEMA_VERSION` from `2` to `3`. Update version history comment.
- [x] 9.5 Add `questionBookmarks` and `questionBookmarkTombstones` to the bundle key allowlist (if such allowlist exists — check current code structure).

## 10. Tests

- [x] 10.1 Create `apps/neurons-tw/src/__tests__/bookmarks.test.ts` (~6 cases): addBookmark (new), addBookmark (idempotent on existing), removeBookmark + tombstone created, toggleBookmark (off → on returns true; on → off returns false), isBookmarked (true / false / nonexistent), tombstone is cleared on re-add.
- [x] 10.2 Create `apps/neurons-tw/src/__tests__/bookmarks-sync.test.ts` (~4 cases): adapter snapshot returns all rows, adapter apply LWW (local newer wins), adapter apply LWW (incoming newer wins), tombstone propagation deletes local row.
- [x] 10.3 Update `quiz-hotkeys.test.ts`: change reserved-noop test to assert answered-phase `1` returns `{kind:'toggle-bookmark'}`.

## 11. Type / lint / test / smoke

- [x] 11.1 Run `pnpm --filter @study-rpg/core build` + `pnpm --filter @study-rpg/neurons-tw typecheck` → expect clean.
- [x] 11.2 Run `pnpm --filter @study-rpg/neurons-tw test` → expect 73 + ~10 = ~83 tests pass.
- [x] 11.3 Chrome MCP smoke: open QuizModal → press `1` in answered → ⭐ button fills → press `1` again → unfills. Navigate to `/bookmarks` → see the bookmarked row. Click unbookmark → row disappears. Click 「重新作答」 → QuizModal opens with 1 question.
- [x] 11.4 Verify banner v3 copy mentions `1` for bookmark.
- [x] 11.5 Verify HelpMenu has 7 sections including `bookmark`.

## 12. Validate + archive + commit

- [ ] 12.1 Run `openspec validate add-neurons-question-bookmarks --strict` → expect「valid」.
- [ ] 12.2 Sync delta into main spec (ADD bookmark requirement + MODIFY hotkey / banner / HelpMenu requirements).
- [ ] 12.3 Move to archive: `mv openspec/changes/add-neurons-question-bookmarks openspec/changes/archive/2026-05-29-add-neurons-question-bookmarks`.
- [ ] 12.4 `openspec validate --all --strict` → expect 61+ specs all green.
- [ ] 12.5 Commit: `spec(archive): merge add-neurons-question-bookmarks — Dexie v7 / R2 v3 bookmark feature + ⭐ button + hotkey 1 + /bookmarks route + family filter + 7th HelpMenu section`.
- [ ] 12.6 Push to `track-neurons`.
