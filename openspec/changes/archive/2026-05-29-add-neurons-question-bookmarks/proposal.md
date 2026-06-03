## Why

Owner dogfood + cross-track audit (2026-05-29 post `add-neurons-helpmenu`): neurons-tw has no question bookmark feature. Players can't ⭐ a question to revisit later — once you advance past a question in QuizModal, it's gone (until random / family-pool puts it back, which may be hundreds of questions later). 二階 (medexam2-hospital-tw) ships a `question-bookmarks` capability with ⭐ button + `/bookmarks` page + filter bar that has been validated under daily use.

Plus: the `wire-neurons-quiz-hotkeys` change reserved the answered-phase `1` hotkey for bookmark toggle — that slot stays no-op until this change wires it. Owner explicitly authorized this in the original「都要做」 directive.

This change ports the 二階 bookmarks feature at scope appropriate for neurons:

- Dexie v6 → v7: new `questionBookmarks` table (mirrors 二階 schema)
- R2 bundle SCHEMA_VERSION 2 → 3: new `questionBookmarks` adapter
- ⭐ button in QuizModal footer + answered-phase `1` hotkey wired
- New `/bookmarks` route with basic family filter
- Cross-device sync via R2 LWW (parity with other neurons synced tables)

## What Changes

**Dexie schema bump**: `apps/neurons-tw/src/lib/db.ts` add `version(7).stores({ questionBookmarks: 'questionId, family, addedAt, updatedAt' })`. Composite PK is `questionId` (a question is bookmarked or not — at most one row per question per user). Includes `family` index for fast filter-by-family queries.

**Row shape**: `{ questionId: string, family: string, addedAt: number, updatedAt: number }`. No `note` field — keep MVP simple (二階 also shipped without notes initially).

**New service** `apps/neurons-tw/src/lib/services/bookmarks.ts`:

- `addBookmark(questionId, family)`: upserts a row with `addedAt = Date.now()` if new.
- `removeBookmark(questionId)`: deletes the row.
- `toggleBookmark(question)`: convenience wrapper — returns the new state `true`/`false`.
- `isBookmarked(questionId)`: returns `Promise<boolean>`.
- `useIsBookmarked(questionId)`: React hook using `useLiveQuery` for reactive UI.
- `useAllBookmarks()`: React hook returning `BookmarkRow[]` ordered by `addedAt` desc.

**QuizModal ⭐ button**:

- New ⭐ button in QuizModal footer (positioned alongside 結束 / 下一題). Visible in BOTH asking and answered phases (player can bookmark before or after seeing the answer).
- Icon: filled `★` when bookmarked, outline `☆` when not.
- Click toggles bookmark. Tooltip: 「收藏 (1)」 / 「取消收藏 (1)」.
- Mobile: button label collapses to icon-only at viewport ≤ 600px.

**Hotkey wiring**: `apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`:

- Answered-phase `1` was reserved as noop by `wire-neurons-quiz-hotkeys`. This change wires it to dispatch `{ kind: 'toggle-bookmark' }` instead of `noop`.
- New `onToggleBookmark` callback prop on `useQuizHotkeys`. Hook executes via injected callback (no DOM access).
- QuizModal passes `onToggleBookmark: () => toggleBookmark(q)`.
- Banner copy updated (v2 → v3): mention 「答題後 <kbd>1</kbd> 收藏」 in addition to existing keys. Banner gets v3 key bump so previously-dismissed users see new copy once.

**New `/bookmarks` route** (`apps/neurons-tw/src/routes/BookmarksPage.tsx`):

- Lists all bookmarked questions in `addedAt` desc order.
- Each row shows: family badge, question stem (truncated to 100 chars + ellipsis), 收藏時間 (relative format「3 分鐘前」 / 「昨天」), ⭐ unbookmark button, 「重新作答」 button that opens a QuizModal scoped to a 1-question pool of that question.
- Empty state: 「目前沒有收藏的題目。在答題時按 ⭐ 或 <kbd>1</kbd> 加入收藏。」
- Family filter bar at top: chips of all 11 families; click toggles inclusion. Default: all families included. Mirrors `FamilyPicker` styling but per-row filter UX (no `onStartQuiz` callback).
- Pagination: not in v1 (limit 200 row render; warn if exceeded — dogfood owner unlikely to bookmark > 200 in one session). Future change can add windowing.

**App routing**: `apps/neurons-tw/src/App.tsx` add `<Route path="/bookmarks" element={<BookmarksPage />} />` + nav link「收藏 →」 in top header.

**HelpMenu new section**: `add-neurons-helpmenu` 6 sections grow to 7 — new `bookmark` section explains the feature:
- 「⭐ 收藏題目 — 答題時按 ⭐ 按鈕或 <kbd>1</kbd> 鍵收藏，到 `/bookmarks` 頁面隨時複習。」

**R2 sync wiring** (`apps/neurons-tw/src/lib/sync/tables.ts` + `bundles.ts`):

- New `questionBookmarksAdapter` (LWW per `questionId`, updatedAt-based merge).
- Bundle `SCHEMA_VERSION` bumps from 2 → 3.
- The forward-compat tolerance pattern (v2 clients silently drop unknown `questionBookmarks` field) is preserved per existing `validateBundleMeta` behavior.

## Capabilities

### New Capabilities

(none — the bookmarks feature lives in the existing `neurons-mode` capability rather than a separate `neurons-bookmarks` capability since the surface is small and tightly coupled to QuizModal + hotkeys)

### Modified Capabilities

- `neurons-mode`: ADD requirement「Neurons-tw SHALL persist per-question bookmarks with cross-device sync」. MODIFY the existing「QuizModal SHALL accept keyboard hotkeys」 requirement to wire answered-phase `1` → bookmark toggle (replacing the reserved-noop placeholder). MODIFY the existing「Overview SHALL surface a dismissible hotkey announcement banner」 requirement to bump key v2 → v3 + append bookmark key to copy. MODIFY the existing「HelpMenu accessible from every route」 requirement to add the 7th `bookmark` section.

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/db.ts` (+10 lines: version(7) + table schema + types)
  - `apps/neurons-tw/src/lib/services/bookmarks.ts` (~80 lines new)
  - `apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts` (+5 lines: dispatch toggle-bookmark, callback prop)
  - `apps/neurons-tw/src/components/QuizModal.tsx` (+30 lines: ⭐ button + onToggleBookmark wiring)
  - `apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx` (+3 lines: v2 → v3 key bump + copy revision)
  - `apps/neurons-tw/src/components/HelpMenu.tsx` (+25 lines: 7th `bookmark` section)
  - `apps/neurons-tw/src/routes/BookmarksPage.tsx` (~200 lines new)
  - `apps/neurons-tw/src/App.tsx` (+3 lines: Route + nav link)
  - `apps/neurons-tw/src/lib/sync/tables.ts` (+50 lines: questionBookmarksAdapter)
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (+2 lines: SCHEMA_VERSION bump + adapter key in allowlist)
- **Data migration**: Dexie v7 schema add is additive (no row backfill). R2 bundle v2 → v3 is additive (existing v2 clients drop the new field gracefully per `validateBundleMeta` tolerance).
- **Tests**: new `apps/neurons-tw/src/__tests__/bookmarks.test.ts` covering `toggleBookmark` / `addBookmark` / `removeBookmark` / `isBookmarked` (~6 cases). New `bookmarks-sync.test.ts` covering adapter snapshot + apply LWW (~4 cases). Total: 73 + ~10 = ~83 tests.
- **A11y**: ⭐ button has `aria-pressed` toggle + dynamic `aria-label`. BookmarksPage rows are `<article>` with proper headings; family filter chips have `aria-pressed`.
- **RWD**: BookmarksPage uses `repeat(auto-fill, minmax(280px, 1fr))` grid; falls to single column on phone. Family filter chips wrap.
- **No engine change**: bookmarks are purely UI / persistence — game-loop (rewards / SRS / DMN trigger / mastery) untouched.
- **Out of scope** (NOT in this change):
  - Notes / annotations on bookmarks (defer to `add-neurons-bookmark-notes` if user demand surfaces)
  - Bulk export / import of bookmarks (R2 sync covers cross-device; manual export = future)
  - Pagination beyond 200 rows
  - everWrong / wrong-history tracking (二階 has this; for neurons defer to `add-neurons-wrong-history` future change — same UX value but bigger schema)
  - Grace toast on wrong→correct transition (sibling to everWrong; same future change)
  - SRS quality buttons (太簡單 / 我亂猜的) → `add-neurons-srs-binary-modifiers` (sibling D)
