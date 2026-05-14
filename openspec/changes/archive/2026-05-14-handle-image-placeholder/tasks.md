## 1. Shared banner component + styles

- [x] 1.1 Add `.image-placeholder-banner` styles to `apps/medexam-tw/src/styles.css` (yellow/warning palette, pixel theme consistent, distinct in both modals)
- [x] 1.2 Decide if banner is inlined per modal or extracted to `apps/medexam-tw/src/components/ImagePlaceholderBanner.tsx` (probably inline first; extract if duplication grows)

## 2. QuizModal — banner + skip

- [x] 2.1 In `QuizModal.tsx`, add `skippedCount` to local session state alongside existing tallies
- [x] 2.2 Render placeholder banner above question stem when `currentQuestion.hasImage === true` (visible in both answering and reveal states)
- [x] 2.3 In banner, render "跳過此題" button visible only when current question has NOT been answered yet (no selectedOption)
- [x] 2.4 Implement `handleSkip()`: increment `skippedCount`, do NOT push to correct/wrong tallies, do NOT call SRS write, advance to next question (or summary if last)
- [x] 2.5 Update summary panel to render `跳過 K` line when `skippedCount > 0`
- [x] 2.6 Verify reward batching: confirm `setPlayer` update excludes skipped questions from XP/stat/roll calculations (skipped contribute zero)
- [x] 2.7 Confirm attribution footer still renders on hasImage placeholder questions (spec compliance)

## 3. BossModal — banner only, no skip

- [x] 3.1 In `BossModal.tsx`, render same placeholder banner component when `currentQuestion.hasImage === true`
- [x] 3.2 Confirm NO skip button is rendered (and no skip handler exists in BossModal scope)
- [x] 3.3 Confirm timer continues running regardless of banner presence

## 4. Verification

- [x] 4.1 Manual: start reading-mode quiz, find hasImage question, verify banner appears, click skip, verify advance + skippedCount displayed in summary
- [x] 4.2 Manual: start reading-mode quiz, find hasImage question, click an MCQ option (not skip), verify banner persists into reveal state, no skip button visible
- [x] 4.3 Manual: start mini-boss, verify hasImage questions show banner but NO skip button; verify timer keeps running
- [x] 4.4 Manual: complete a reading session with mixed skipped+answered, verify XP / rolls match answered-only count
- [x] 4.5 `pnpm -r typecheck` passes
- [x] 4.6 `openspec validate handle-image-placeholder --strict` passes
