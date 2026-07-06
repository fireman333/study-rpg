## 1. Subject filter chips (replace accordion)

- [x] 1.1 Add `selectedSubject` state (init to first subject id from `cram.books[0].subjects[0].subjectId`); remove `openSubject` state
- [x] 1.2 Render a single grouped filter-chip row (醫學一 / 醫學二 sections) from `cram.books`; active chip highlighted; `flex-wrap` for 390px
- [x] 1.3 Render only the selected subject's panel (find subject across both books by `selectedSubject`); remove the two-book `.map` accordion nesting
- [x] 1.4 Remove the sticky quick-jump `<nav>` (`quickJumpStyle` / `quickChipStyle`) and the `#cram-<subjectId>` anchors + `scrollMarginTop`

## 2. Panel content order + 速看 direct

- [x] 2.1 In the selected-subject panel, render 速看重點 blocks FIRST and directly (map `s.blocks` → `CramBlockView`); remove the `showBlocks` state + `blocksToggleStyle` toggle
- [x] 2.2 Order the panel as: 速看重點 blocks → section practice CTA → 考古清單
- [x] 2.3 Keep the book/paper label (醫學一（上午卷）/ 醫學二（下午卷）) visible for the selected subject's paper

## 3. Practice CTA reposition

- [x] 3.1 Move the section-level 「▶ 用本章高頻概念練幾題」 CTA to the top of the 考古清單 (above the list `<ul>`); keep the pooled `resolve([...new Set(ids)])` behavior unchanged

## 4. Rename 押題 → 考古 (user-facing only)

- [x] 4.1 Rename section heading 「🎯 押題清單（依重現度）」 → 「🎯 考古清單（依重現度）」
- [x] 4.2 Rename any 押題 wording in the disclaimer methodology text + evidence-drawer lead + count-chip context to 考古
- [x] 4.3 grep `押題` in CramPage.tsx → confirm only internal code comments referencing the `push` field remain; `cram.json` / `build-cram.ts` `push` field untouched

## 5. Download-PDF row to top

- [x] 5.1 Move the `downloadRowStyle` block (醫學一 / 醫學二 A4 PDF buttons) from file end to directly under the subtab bar, above the disclaimer header
- [x] 5.2 Confirm the two PDF buttons `flex-wrap` to two lines at 390px with no horizontal page scroll

## 6. Cleanup

- [x] 6.1 Remove now-orphan styles (`quickJumpStyle`, `quickChipStyle`, `subjectHeaderStyle` accordion header, `blocksToggleStyle`) and any unused imports/vars introduced by the refactor
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw typecheck` clean

## 7. Verify

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` — 826/826 green (no regression)
- [x] 7.2 Chrome MCP preview smoke: chip select + 解剖學 auto-selected · 速看 renders first + directly · practice CTA above 考古清單 · 押題→考古 rename visible · download row at top (order_OK: download 132 < disclaimer 190 < 速看 372 < CTA 2381 < 考古清單 2419)
- [x] 7.3 390px probe (border-box constrain): scrollW 390 == clientW 390, zero overflow offenders — no horizontal page scroll
- [x] 7.4 Dead-code audit — `noUnusedLocals: true` + typecheck clean + grep confirms no orphan accordion/quickjump styles or state
