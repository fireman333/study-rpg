# Tasks

## 1. Issue 1 — on-band hide control + live visibility

- [x] 1.1 `expedition-visibility.ts`: add a module-level listener `Set` + `subscribeExpeditionHidden(fn)` (returns unsubscribe); `setExpeditionHiddenPref` notifies listeners after the localStorage write. → 驗證：unit test or console — calling `setExpeditionHiddenPref(true)` invokes a subscribed callback.
- [x] 1.2 Add a small `useExpeditionHidden()` hook (or inline `useState`+`useEffect(subscribe)`) and adopt it in `QuizModal.tsx` (replace `useState(getExpeditionHidden)` at line ~239) and `MazeGrid.tsx` (replace `useState(getExpeditionHidden)` at line ~578, keeping `setExpeditionHide`). → 驗證：typecheck clean; hiding via maze `×` live-hides nothing else breaks.
- [x] 1.3 `MazeExpedition.tsx`: render the on-band `×` control on the compact band too. Change the render gate from `onHide && !compact` so the control appears in both contexts; on the compact band give the control `pointer-events: auto` (wrapper stays `pointer-events: none`), and make the control keyboard-focusable with `aria-label="隱藏遠征動畫"`. → 驗證：compact band shows a clickable top-right `×`; rest of band still does not intercept clicks.
- [x] 1.4 `MazeExpedition.tsx`: standardize the on-band control glyph as a minimize `−` (收合, NOT close `×`) on both bands; aria-label/title = 收合遠征動畫. Align spec + Help copy to `−`. → 驗證：homepage + compact both show `−`.
- [x] 1.5 `MazeExpedition.tsx`: a11y — ensure the compact `×` is not inside an `aria-hidden` subtree (drop `aria-hidden` from the compact wrapper which already has `aria-label`; keep decorative inner layers `aria-hidden`). → 驗證：the `×` is exposed to AT (focusable, labeled).
- [x] 1.6 `QuizModal.tsx`: pass an `onHide` to `<MazeExpedition compact />` that calls `setExpeditionHiddenPref(true)` (live-hides via the reactive store). → 驗證：clicking the quiz-band `×` hides the band immediately and persists.
- [x] 1.7 `HelpMenu.tsx`: align the「⚔️ 出征模式」`ExpeditionAnimationHelpControl` copy — the on-band `−` 收合 is available during **閱讀 AND 答題**; document the in-place `＋ 展開` restore handle; the in-menu toggle now live-updates an open band. → 驗證：copy matches actual behavior.
- [x] 1.8 `MazeExpedition.tsx`: add exported `ExpeditionRestoreStub` (slim `＋ 展開遠征動畫` pill). Render it in BOTH contexts when collapsed: `QuizModal.tsx` (`bandHidden ? stub : band`) + `MazeGrid.tsx` (`expeditionHidden ? stub : band`), each calling `setExpeditionHiddenPref(false)` / `setExpeditionHide(false)`. → 驗證：collapsing leaves a visible ＋ restore handle that re-shows the band live, on homepage + quiz.

## 2. Issue 2 — HelpMenu category grouping

- [x] 2.1 `HelpMenu.tsx`: add a `CATEGORIES` constant (6 entries: `{ label, icon, sectionIds[] }`) per the proposal membership/order. → 驗證：every existing section `id` appears in exactly one category; no id dropped.
- [x] 2.2 `HelpMenu.tsx`: render category headers (static, non-collapsible) with each category's `<details>` sections nested beneath, looking up bodies from the existing `SECTIONS` map by id. Preserve `expandedId` single-expand behavior + the bug-report inline button + section ids/links. → 驗證：6 headers render; sections nested in declared order.
- [x] 2.3 Confirm single-expand still collapses across categories (opening a section in category B collapses an open section in category A). → 驗證：manual / Chrome MCP.

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` clean.
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw test` green (no economy/logic change; existing expedition/help tests still pass).
- [x] 3.3 Chrome MCP live smoke (preflight `list_connected_browsers`): desktop quiz `×` hide → reopen stays hidden → Help「顯示遠征動畫」live-restores the open quiz band; HelpMenu shows 6 categories with single-expand intact.
- [x] 3.4 Chrome MCP RWD probe (forced-width class-override, NOT `resize_window`): at < 600px the compact band `×` is reachable and the band never overlaps the stem.
- [x] 3.5 `/simplify` (code-quality) + `openspec validate polish-neurons-quiz-hide-and-help-grouping --strict`.
