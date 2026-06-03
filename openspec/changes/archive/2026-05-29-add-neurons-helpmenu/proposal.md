## Why

Owner dogfood + cross-track audit (2026-05-29 post `wire-neurons-quiz-hotkeys`): neurons-tw has no help / discovery surface. New players landing on Overview have to infer mechanics (variant unlock thresholds, synapse formation rule, DMN draw triggers, hotkey reference) from the UI alone — there's no「mechanic 一次看完」section anywhere. 二階 (medexam2-hospital-tw) ships a `HelpMenu` floating-FAB-into-accordion-panel that 8 mechanics live inside, which has been validated as the right discovery surface.

This change ports the 二階 HelpMenu pattern at scope appropriate for neurons:

- Floating ❓ FAB at top-right that opens an accordion panel
- 6 accordion sections covering neurons-specific mechanics (hotkey reference / variant unlock / synapse formation / DMN draws / leaderboard opt-in / bug reporting via GitHub Issues)
- Bug reporting links out to GitHub Issues — neurons has no Supabase `bug_reports` table or auth wiring (those belong in a future `add-neurons-bug-reporting` change), GitHub Issues is the simplest path that works today
- Sibling change to `wire-neurons-quiz-hotkeys`: bump announcement banner localStorage key `v1 → v2` so existing-dismissed users see the new copy mentioning「詳見右下 ❓ →『⌨️ 鍵盤快捷鍵』」 once

## What Changes

**New component**: `apps/neurons-tw/src/components/HelpMenu.tsx` (~300 lines)

- Floating button: `❓` FAB positioned top-right (`position: fixed; top: 1rem; right: 1rem; z-index: 900`).
- Click opens an accordion panel below the FAB (modal-like overlay; click outside or `Esc` closes).
- 6 accordion sections — each a `<details>` element with an emoji-icon `<summary>` + 1-3 paragraph `<div>` body:
  1. **⌨️ 鍵盤快捷鍵** — full hotkey reference (asking phase 1-4 highlight + Enter, answered phase Enter/Space advance, scroll keys, Esc close). Mirrors banner copy + adds the 150ms cooldown explanation.
  2. **🧬 變體解鎖** — explains AP threshold ladder per family + auto-pull on threshold crossing (no ticket needed).
  3. **🔗 Synapse 形成** — explains「同日跨 family 答對 5 題 → wire synapse」rule + weak / strong tier evolution + decay after 7 days.
  4. **💎 DMN 抽卡** — explains time-axis (每 30 min) + behavior-axis (variant slot unlock / synapse form / synapse strengthen) trigger sources + 2 / 3 daily caps.
  5. **🏆 排行榜** — opt-in nickname check (NFKC + lowercase) + 6 leaderboard filters + opt-out URL.
  6. **🩺 回報問題** — links out to GitHub Issues (`https://github.com/fireman333/study-rpg/issues/new`) since neurons has no Supabase bug-report pipeline. One-liner explanation + label suggestion.
- Section state: only one expanded at a time (single-expand accordion via `expandedId` React state); clicking an already-open section closes it.
- Backdrop click closes the menu (modal pattern).
- `Esc` key closes the menu (separate listener from QuizModal's Esc).
- Mobile fallback: on `@media (max-width: 600px)` viewport, FAB moves to bottom-right + panel becomes full-width sheet.

**App.tsx wiring**: render `<HelpMenu />` inside `<AuthProvider>` at top level so it's available on every route (not just Overview). FAB stays anchored even when the player navigates to `/connectome` / `/dmn` / `/achievements` / `/leaderboard`.

**Banner version bump** (`apps/neurons-tw/src/components/QuizHotkeysAnnouncementBanner.tsx`):

- Bump `STORAGE_KEY` constant from `neurons-quiz-hotkeys-banner-dismissed-v1` → `neurons-quiz-hotkeys-banner-dismissed-v2`. Existing-dismissed users see the banner once more because v2 key doesn't exist in their localStorage; new dismissals write to v2.
- Append HelpMenu reference to banner copy: `... 詳見右下 ❓ →「⌨️ 鍵盤快捷鍵」section。`.
- Update the「Out of scope」 reference in `wire-neurons-quiz-hotkeys` archive to reflect this change shipped.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-mode`: ADD requirement「Neurons-tw SHALL surface a global HelpMenu accessible from every route」 covering FAB placement / accordion panel / single-expand behavior / mobile fallback / Esc + backdrop close / persistence-free state. MODIFY existing「Overview SHALL surface a dismissible hotkey announcement banner」 requirement to bump storage key to `-v2` and append HelpMenu reference in banner copy.

## Impact

- **Code**: 1 new component (`HelpMenu.tsx`, ~300 lines), modify `App.tsx` (+2 lines + import), modify `QuizHotkeysAnnouncementBanner.tsx` (~3 lines — STORAGE_KEY constant + copy revision).
- **No data migration**: localStorage key bump v1 → v2 by design (re-shows banner once); no Dexie / R2 / D1 schema change.
- **No engine change**: HelpMenu is pure content + navigation surface; no game-loop hook.
- **Tests**: HelpMenu is content-heavy + UI state — minimal value in unit tests. Chrome MCP smoke covers FAB open / close / section expand / mobile fallback. Existing 73 tests unchanged.
- **A11y**: FAB `aria-label="開啟說明選單"`; panel `role="dialog" aria-modal="true" aria-label="說明選單"`; each section uses native `<details>` + `<summary>` for semantic accordion (keyboard accessible by default).
- **RWD**: `@media (max-width: 600px)` repositions FAB to bottom-right + panel to bottom-sheet pattern.
- **Out of scope** (NOT in this change):
  - Real bug-reporting Supabase pipeline (would need `bug_reports` table + Supabase auth + per-app form modal — separate `add-neurons-bug-reporting` change later)
  - Help content for follow-up features (bookmark / SRS quality / hospital tier) — those sections added when corresponding `add-neurons-question-bookmarks` / `add-neurons-srs-binary-modifiers` ship
  - Search inside HelpMenu (cmd-K command palette pattern) — overkill for 6 sections
  - Localization / i18n switch (neurons is zh-TW only)
