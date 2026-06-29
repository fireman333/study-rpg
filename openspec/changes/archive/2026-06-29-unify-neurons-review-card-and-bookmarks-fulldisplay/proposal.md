## Why

The `/bookmarks` (收藏與錯題) page showed only a truncated stem per row and forced the player into a re-answer modal to see the figure / 正解 / 詳解 — turning a review surface into an extra click maze. The owner wants every row in all three tabs (手動收藏 / 目前未答對 / 歷史曾錯) to show the complete question inline (題目 + 圖片 + 詳解 + 看原始詳解 PDF). The same read-only question body was also duplicated between 題庫 (QuestionBankPage) and 收藏, so this change unifies it into one shared component while the spec is brought back in line with the implemented reality.

## What Changes

- Add a shared read-only `QuestionReviewCard` that renders the FULL question body (承上題 inline + stem + figure + options + 正解 + 看原始詳解 PDF + per-option 簡答) with no answer interaction and no state mutation. 題庫 and 收藏 both consume it (single source of truth); the interactive `QuizModal` stays a separate molecule.
- **BREAKING (spec)** `/bookmarks` all three tabs now render the full question via the shared card instead of a truncated-stem preview. Wrong-answer tabs (目前未答對 / 歷史曾錯) stay display-only (no action buttons).
- The 收藏 row head now shows the verbatim 題號 (e.g. `104-1-醫學二-病理學-Q92`) + ✨/🤔 flag chips + relative time, **replacing** the old 科目 badge + 年份 badge (the 題號 already encodes 年-次-冊-科目-題號).
- **BREAKING (spec)** 手動收藏 keeps only 取消收藏; the 重新作答 button was removed (the inline full question makes re-answering unnecessary).
- The 收藏 科目 + 年份 filter chip sets each gained a leading 「全部」 select-all chip (matching the homepage `YearFilterBar`); the redundant 「重置（顯示全部）」 buttons were removed from those two sections.
- 題庫 (QuestionBankPage) now shows question figures (a side effect of delegating its body to the shared card; previously it rendered no figure).
- Homepage `YearFilterBar` relocated from above the brain-map maze to below the maze / above the 醫學一 card grid (still inside the FamilyPicker quiz-launch box).
- `QuizModal` (答題系統) 題號 moved from below the 詳解 to a small monospace header above the question stem.

## Capabilities

### New Capabilities
<!-- none — QuestionReviewCard is a shared implementation detail, not a new user-facing capability spec -->

### Modified Capabilities
- `neurons-wrong-answer-list`: the `/bookmarks` three-tab display requirement (full-question rendering via the shared card + 題號 row head + 手動收藏 retains only 取消收藏 + wrong tabs stay action-button-free) and the shared-filter-bar requirement (a 「全部」 select-all chip now leads the 科目 + 年份 chip sets).

## Impact

- **Code (neurons-tw only)**: new `apps/neurons-tw/src/components/QuestionReviewCard.tsx`; `routes/BookmarksPage.tsx`, `routes/QuestionBankPage.tsx`, `components/QuizModal.tsx`, `components/FamilyPicker.tsx`, `styles.css`.
- **No data/sync impact**: no Dexie schema bump, no R2 bundle `SCHEMA_VERSION` change, no Worker change, no migration. Purely presentational.
- **Other specs unchanged**: the year-filter relocation stays within the quiz-launch CTA area (`neurons-quiz-year-filter` unaffected); no neurons spec pins the `QuizModal` 題號 position or the 題庫 figure visibility.
