## Why

Owner dogfood + cross-track audit (2026-05-29 post `realign-neurons-quiz-entry-to-per-family-cards`): neurons-tw QuizModal currently only listens for `Escape` — there are no number/letter shortcuts to pick an option, no Enter to advance, no scrollable container for long stems. Power users (especially the owner running 2025–2026 一階 dogfood at scale) want to keep both hands on the keyboard. 二階 (medexam2-hospital-tw) already shipped `use-quiz-hotkeys.ts` + `QuizHotkeysAnnouncementBanner` via the prior `add-quiz-number-hotkeys-medexam2` change and has been validated under daily use.

This change ports the 二階 hotkey UX into neurons-tw at **full parity for the surfaces neurons currently has** — covering the asking + answered phases, highlight-then-Enter 2-step interaction, scroll keys, and announcement banner. Subsequent sibling changes (`add-neurons-helpmenu`, `add-neurons-question-bookmarks`, `add-neurons-srs-binary-modifiers`) will layer on bookmark / SRS quality / HelpMenu features and their dedicated hotkey branches.

## What Changes

**Hotkey hook** (`apps/neurons-tw/src/lib/hooks/useQuizHotkeys.ts`):

- New hook borrowed from 二階's `use-quiz-hotkeys.ts` with the same pure `dispatchKey` design. Initial scope covers four `HotkeyAction` kinds: `highlight` / `submit` / `advance` / `scroll`. Bookmark / quality branches stay in the dispatch enum as `noop` (reserved for future changes to wire).
- **Asking-phase 2-step UX**: `1` / `2` / `3` / `4` highlight option A / B / C / D (visual ring + accent — same paint as mouse hover). `Enter` submits the highlighted option. This matches 二階's deliberate「look before you commit」pattern. Mouse-click on an option still submits immediately (no behavior change for mouse users).
- **Answered-phase**: `Enter` (or `Space`) advances to next question, gated by 150ms phase-cooldown so the same Enter that submitted doesn't immediately advance.
- **Scroll keys (both phases)**: `Space` (page-down) / `Shift+Space` (page-up) / `↓` / `↑` (step-by-step) / `Home` / `End` (jump to top / bottom). Operates on a scrollable container inside the modal body so long stems / explanations don't require page-level scroll.
- **Esc** continues to close (existing behavior).
- **Phase-change cooldown**: 150ms after asking → answered transition Enter is ignored.
- **Input-focus guard**: `<input>` / `<textarea>` focus → all hotkeys passthrough.

**QuizModal changes** (`apps/neurons-tw/src/components/QuizModal.tsx`):

- Add `highlighted: string | null` state alongside `picked`. Mouse-click on an option still calls `handlePick` directly (preserves current snappy mouse UX). Hotkey path sets `highlighted` then `Enter` triggers `handlePick(highlighted)`.
- Wrap modal body content in a `<div ref={scrollContainerRef}>` with `overflow-y: auto` + `max-height` constraints so hotkey scroll has something to manipulate.
- Visual highlight state: highlighted option button renders with a glowing accent ring (matches the existing hover style on mouse-over so visual vocabulary stays consistent).
- Wire `useQuizHotkeys({ isOpen, phase, optionKeys, highlightedKey, scrollContainerRef, setHighlightedKey, onSubmit, onAdvance })`.

**Announcement banner** (`apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`):

- Port the dismissible localStorage banner from 二階 (key: `neurons-quiz-hotkeys-banner-dismissed-v1`).
- Render above `LeaderboardPromoBanner` on Overview.
- CSS-gated to desktop (`@media (hover: hover) and (pointer: fine)`) — touch users skip.
- Copy mentions all initial hotkeys (1–4 + Enter + Space + scroll keys + Esc) using `<kbd>` semantic elements. **Does NOT yet reference HelpMenu** — that copy is added by the follow-up `add-neurons-helpmenu` change (it appends「詳見右下 ❓ →『⌨️ 鍵盤快捷鍵』」 once the menu lands).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-mode`: ADD requirement「QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll」 — covers full hotkey surface this change ships. ADD requirement「Overview SHALL surface a dismissible hotkey announcement banner」 — covers banner UX + localStorage dismissal + desktop-only gate.

## Impact

- **Code**: 1 new hook file (`useQuizHotkeys.ts`, ~180 lines including scroll branch), 1 new banner component (~70 lines), modify `QuizModal.tsx` (~40 lines to add highlight state, scroll container, wire hook), modify `OverviewPage.tsx` (~2 lines + import). CSS for banner in `apps/neurons-tw/src/index.css` (~30 lines with `@media` gate).
- **No data migration**: localStorage key `neurons-quiz-hotkeys-banner-dismissed-v1` is brand new; no Dexie / R2 / D1 schema change.
- **No engine change**: hotkey hook is purely UI input → existing `recordCorrectAnswer` / `recordIncorrectAnswer` callbacks reused.
- **Tests**: new `apps/neurons-tw/src/__tests__/quiz-hotkeys.test.ts` covering `dispatchKey` pure logic (~16 cases — asking/answered/scroll/cooldown/input-guard/oob/escape branches). Existing 50 tests untouched.
- **A11y**: banner has `role="region"` + `aria-label`; dismiss button has `aria-label="關閉公告"`; hotkey hints use `<kbd>` semantic elements. Highlighted option button stays focusable; `aria-pressed` toggled on highlight.
- **RWD**: banner CSS `@media (hover: hover) and (pointer: fine)` hides on touch devices. Scrollable modal body container has fluid `max-height: calc(100vh - 200px)` so phone viewport doesn't get cut off.
- **Mouse-click behavior preserved**: clicking an option still submits immediately (no two-step gate for mouse users); highlight state only applies to hotkey path.
- **Out of scope** (deferred to follow-up changes):
  - Bookmark hotkey → `add-neurons-question-bookmarks` (`1` in answered phase)
  - Quality buttons (太簡單 / 我亂猜的) hotkey → `add-neurons-srs-binary-modifiers` (`2` / `3` in answered phase)
  - HelpMenu entry「⌨️ 鍵盤快捷鍵」 → `add-neurons-helpmenu` (banner copy revision happens there too)
