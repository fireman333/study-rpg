# Tasks

> Implementation was completed in the working tree before this change was authored
> (code-first, then spec sync). All boxes reflect work already done + verified.

## 1. Shared read-only card

- [x] 1.1 Create `apps/neurons-tw/src/components/QuestionReviewCard.tsx` — read-only body (承上題 inline + stem + figure + options + 正解 + 看原始詳解 PDF + 簡答); props `question` / optional `header` / `showFigure` (default true); owns the moved exam-content styles + `acceptedKeysOf` helper.

## 2. 收藏 (BookmarksPage)

- [x] 2.1 Render all three tabs (手動收藏 / 目前未答對 / 歷史曾錯) via `QuestionReviewCard` (drop the truncated-stem preview).
- [x] 2.2 Replace the row head's 科目 + 年份 badges with the verbatim 題號 (`題號 <id>`); keep ✨/🤔 flag chips + relative time; remove the now-orphaned `familyMap` / `familyBadgeStyle` / `yearBadgeStyle`.
- [x] 2.3 Remove the 重新作答 button (+ its replay `QuizModal`/state/handler); keep 取消收藏.
- [x] 2.4 Add a 「全部」 select-all chip to the 科目 + 年份 filter chip sets and remove the redundant 「重置（顯示全部）」 buttons from those two sections.

## 3. 題庫 (QuestionBankPage)

- [x] 3.1 Delegate `QuestionEntry`'s body to `QuestionReviewCard` (keep the 題號 + 🐞 回報 + 年/次/科 tags as the header slot); remove the now-orphaned exam-content styles + leaf-component imports. 題庫 now shows figures.

## 4. Homepage (FamilyPicker)

- [x] 4.1 Relocate `<YearFilterBar />` from above the maze to inside `.neurons-md`, between the maze detail and the master card grid (below the brain map, above 醫學一); update the stale CSS / comments that described the old order.

## 5. 答題系統 (QuizModal)

- [x] 5.1 Move the 題號 line from below the 詳解 to a small monospace header above the question stem (`questionIdTopStyle`); remove the bottom 題號.

## 6. Verification

- [x] 6.1 `tsc --noEmit` clean (`pnpm --filter @study-rpg/neurons-tw typecheck`).
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw test` — 755 tests pass.
- [x] 6.3 Chrome MCP end-to-end: homepage order (maze→年份→醫學一); 収藏 full-question render + 題號 head + 全部 chip toggle + 重新作答 gone; 題庫 figures; QuizModal 題號 is `firstElementChild` above the stem; no console errors.
