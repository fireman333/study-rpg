## Why

Owner dogfood (2026-05-29): neurons-tw Overview's quiz-entry flow is two-step (select family chip → click separate「🎯 開始答題」CTA), while 二階 (medexam2-hospital-tw) HomePage's `RecruitmentBanner` pattern is one-step (per-subject card has its own「📚 學習」button → click opens QuizModal scoped to that subject). The 二階 pattern is faster, has lower cognitive load, and reads more obviously as「each subject is its own entry point」rather than「pick a filter then act」. Owner asked to align neurons to the 二階 pattern.

Sibling realign (`realign-neurons-quiz-entry-to-subject-labels`, archived 2026-05-28) already flipped the picker chip label hierarchy so subject name leads — that change made the picker scannable. This change finishes the alignment by making each card directly actionable.

## What Changes

- **`FamilyPicker` cards become per-family quiz entry points.** Each card grows a 「🎯 答題」 button at the bottom; clicking it opens `QuizModal` scoped to that family's question pool in one click. The「select family chip (filter state) → click separate global CTA」 two-step flow is retired.
- **Cross-family random entry moves to a new hero CTA on Overview.** A 「🎲 隨機跨 family 答題」 button pairs with the existing「📖 開始閱讀」reading-timer CTA in the hero-adjacent CTA section. The old 「全部」 chip is removed from the picker (replaced by this hero CTA).
- **Picker selection state is removed entirely.** No `selectedFamilyId` React state, no confirmation banner, no filter-state preservation. The action IS the entry — pool filtering happens at click time via `filterPoolByFamily(pack.questions, familyId)`.
- **MasteryChip is inlined into each card.** The standalone「🎓 家族熟練度」chip row at the bottom of Overview is removed (mastery info now lives per-card next to the question count chip).
- **NT-branch grouping retained.** Cards still group by DA / 5-HT / GABA / Glu (the teaching anchor stays).
- **Label hierarchy from prior realign retained.** Card primary label = `subject.id` (canonical 國考 subject name); secondary muted label = `subject.displayName` (family persona); tooltip = both + 題數.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-mode`: the「Overview SHALL surface a family subject picker that filters the active quiz pool」requirement body is rewritten to describe the per-card direct-entry pattern. Scenarios for the「全部」chip, selection-state preservation, and select-then-CTA flow are replaced with scenarios for direct-entry click + responsive card grid + content-pack identity sourcing (the latter unchanged from prior realign).
- `neurons-mode`: NEW requirement「Overview SHALL surface a hero CTA for cross-family random quiz entry」 added, capturing the relocated 「全部」 semantic now living as a hero CTA paired with the reading-timer CTA.

## Impact

- **Code**: `apps/neurons-tw/src/components/FamilyPicker.tsx` (rewritten — drop `selectedFamilyId` prop / `onSelect` callback / `AllChip` / selection banner; add per-card `onStartQuiz` button + inline `MasteryChip`); `apps/neurons-tw/src/routes/OverviewPage.tsx` (rewritten — drop `selectedFamilyId` state; replace big-CTA + picker section with reading + random-CTA row + per-family card grid; drop standalone「🎓 家族熟練度」section).
- **No data migration**: `filterPoolByFamily` API unchanged; `subjects.json` unchanged; no Dexie / R2 / D1 schema change.
- **No engine change**: rewards / SRS / DMN trigger / family mastery accrual pipelines untouched (per same invariant as prior picker spec).
- **Tests**: existing `quiz-pool.test.ts` passes unchanged (5 cases — pure `filterPoolByFamily` filter still in use). No new Vitest needed (UI surface change; covered by Chrome MCP smoke).
- **A11y**: each card is an `<article aria-label="{subject.id} · {persona}">` with a `<button>` inside; tooltip retained on button.
- **RWD**: card grid uses `grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))` → 4 col @ 768px / 2 col @ 414px / 1 col @ 360px (verified via Chrome MCP probe). CTA row uses `flex: 1 1 220px` → side-by-side wide, stacked narrow.
- **Visual deltas vs prior version**: old「🎯 開始答題」big yellow CTA replaced by「🎲 隨機跨 family 答題」(same yellow, paired with reading); per-family cards grew from ~102px-wide chip to ~170px-wide article card to host the button; standalone mastery chip row removed.
- **Out of scope**: QuizModal interior (no change — header still shows `第 N / M 題 · {q.subject}` per existing behavior); connectome SVG (unchanged); achievements / leaderboard / family-mastery surfaces (unchanged — family persona stays primary there per prior realign requirement).
