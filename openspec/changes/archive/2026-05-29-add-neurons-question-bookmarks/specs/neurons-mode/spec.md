## ADDED Requirements

### Requirement: Neurons-tw SHALL persist per-question bookmarks with cross-device sync

The neurons-tw app SHALL provide a per-question bookmark feature so players can mark interesting / hard / want-to-revisit questions for later review. Bookmarks SHALL persist locally (Dexie) and SHALL sync across devices via the existing R2 LWW bundle pipeline.

**Schema** (Dexie v7):

- Table name: `questionBookmarks`
- Primary key: `questionId` (string — a question is bookmarked or not, at most one row per question)
- Indexed columns: `family` (for fast filter queries), `addedAt` (for chronological listing), `updatedAt` (for LWW sync)
- Row shape: `{ questionId: string, family: string, addedAt: number, updatedAt: number }`
- `addedAt` is set once when the bookmark is created; it does NOT update on re-bookmark (re-add after remove sets a NEW `addedAt`).
- `updatedAt` updates on every write (add / remove → tombstone row with `updatedAt = Date.now()`).
- No `note` / `tags` fields in v1 (defer to future change if owner demands).

**Service surface** (`apps/neurons-tw/src/lib/services/bookmarks.ts`):

- `addBookmark(questionId, family): Promise<void>` — upsert row; if already bookmarked, no-op (preserves original `addedAt`).
- `removeBookmark(questionId): Promise<void>` — delete row from Dexie. (Note: R2 sync needs tombstones — see Sync section below.)
- `toggleBookmark(question: Question): Promise<boolean>` — convenience returning the NEW bookmarked state (true = now bookmarked, false = removed).
- `isBookmarked(questionId): Promise<boolean>` — synchronous-style check.
- `useIsBookmarked(questionId): boolean | undefined` — React hook via `useLiveQuery` for reactive `<button>` rendering.
- `useAllBookmarks(): BookmarkRow[]` — React hook returning all bookmarks ordered by `addedAt` desc.

**QuizModal ⭐ button**:

- Renders in the QuizModal footer, alongside「結束」 and (in answered phase)「下一題」.
- Visible in BOTH asking and answered phases — player can bookmark before or after seeing the answer.
- Icon: filled `★` (with accent color `#d4a04d`) when bookmarked; outline `☆` (muted) when not.
- Tooltip / `aria-label`: 「收藏 (1)」 when not bookmarked; 「取消收藏 (1)」 when bookmarked.
- `aria-pressed` reflects current bookmark state.
- Click toggles bookmark via `toggleBookmark(q)`.
- Mobile (`@media (max-width: 600px)`): button shrinks to icon-only (no text label).

**Hotkey `1` in answered phase**:

- The answered-phase `1` slot (previously reserved as no-op by `wire-neurons-quiz-hotkeys`) SHALL dispatch `{ kind: 'toggle-bookmark' }` after this change ships.
- `useQuizHotkeys` hook SHALL accept a new `onToggleBookmark: () => void` callback prop.
- QuizModal SHALL pass `onToggleBookmark: () => void toggleBookmark(q)` when wiring the hook.
- The asking-phase `1` slot remains as `highlight` for option A (no conflict).

**`/bookmarks` route**:

- New route `BookmarksPage` mounted at path `/bookmarks` in `App.tsx`.
- Top nav link「收藏 →」 added to the App-level header.
- Page lists all bookmarked questions in `addedAt` desc order.
- Each row renders as an `<article>`:
  - Family badge (matching NT branch accent color)
  - Question stem (truncated to 100 chars + ellipsis; full stem on click → opens single-question QuizModal)
  - Added timestamp (relative format: 「剛剛」 / 「3 分鐘前」 / 「2 小時前」 / 「昨天」 / `YYYY-MM-DD`)
  - ⭐ unbookmark button (immediate remove with confirm — no separate confirm modal since the action is reversible)
  - 「重新作答」 button → opens QuizModal scoped to a 1-question pool of that question (uses existing QuizModal infrastructure; the modal then exhausts after that 1 question)
- Empty state: 「📭 目前沒有收藏的題目。在答題時按 ⭐ 或 <kbd>1</kbd> 鍵加入收藏。」 + link back to `/`.
- Family filter bar at top: chips of all 11 families; click toggles inclusion. Default state: all included.
- Cap at 200 visible rows (warn at 201+: 「顯示前 200 筆，更多功能在後續版本」). MVP scope guard.

**Sync via R2 LWW**:

- New `questionBookmarksAdapter` in `apps/neurons-tw/src/lib/sync/tables.ts` mirroring existing adapters' shape.
- Bundle `SCHEMA_VERSION` bumps from `2` → `3` in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`.
- Snapshot: read all `questionBookmarks` rows; serialize as JSON-safe records.
- Apply: LWW per `questionId` using `updatedAt` — incoming row wins iff `incoming.updatedAt > local.updatedAt`.
- Tombstone behavior: removing a bookmark = local row deletion. To carry deletes across devices, the adapter writes a tombstone row `{ questionId, family, addedAt: -1, updatedAt: Date.now() }` to a separate `questionBookmarkTombstones` table (Dexie v7 secondary table). Apply phase: incoming bookmark with `updatedAt > localTombstone.updatedAt` un-deletes; incoming tombstone with `updatedAt > localBookmark.updatedAt` deletes.
- Forward-compat: existing v2 clients silently drop the `questionBookmarks` field per existing `validateBundleMeta` tolerance.

**HelpMenu 7th section**:

- The `HelpMenu` accordion SHALL grow to 7 sections with a new `bookmark` section:
  - id=`bookmark`, icon=⭐, title=「收藏題目」
  - Body: 「答題時按 ⭐ 按鈕或 <kbd>1</kbd> 鍵收藏題目，到 <a href="/bookmarks">收藏</a> 頁面隨時複習。收藏會跨裝置同步（需登入）。」

#### Scenario: ⭐ button toggles bookmark and updates icon

- **GIVEN** the QuizModal is open showing question X (not yet bookmarked)
- **WHEN** the player clicks the ⭐ button
- **THEN** the icon SHALL change from outline `☆` to filled `★`
- **AND** `aria-pressed` SHALL flip to `true`
- **AND** a new row SHALL appear in Dexie `questionBookmarks` with `questionId === X.id` and `addedAt === Date.now()`
- **WHEN** the player clicks the ⭐ button again
- **THEN** the icon SHALL revert to outline `☆`
- **AND** the row SHALL be removed from `questionBookmarks` (and a tombstone written to `questionBookmarkTombstones`)

#### Scenario: Hotkey `1` in answered phase toggles bookmark

- **GIVEN** the QuizModal is open in answered phase (player has submitted an answer)
- **WHEN** the player presses `1` (the slot previously reserved by `wire-neurons-quiz-hotkeys`)
- **THEN** the bookmark toggle SHALL fire (same effect as clicking the ⭐ button)
- **AND** the asking-phase `1` slot SHALL still highlight option A (no regression)

#### Scenario: BookmarksPage renders all bookmarks in addedAt desc order

- **GIVEN** the player has bookmarked questions X (added 1 min ago), Y (added 10 min ago), Z (added 1 hour ago)
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL render 3 rows in order: X (top, 「剛剛」), Y (「10 分鐘前」), Z (「1 小時前」)
- **AND** each row SHALL display the family badge + stem truncated to 100 chars + ⭐ unbookmark + 「重新作答」 button

#### Scenario: Empty state surfaces when no bookmarks exist

- **GIVEN** the player has no bookmarks
- **WHEN** the player navigates to `/bookmarks`
- **THEN** the page SHALL render an empty-state message「📭 目前沒有收藏的題目。在答題時按 ⭐ 或 <kbd>1</kbd> 鍵加入收藏。」
- **AND** SHALL include a link「← 回總覽」 back to `/`

#### Scenario: Family filter restricts visible rows

- **GIVEN** the player has bookmarks across 3 families (藥理學, 生理學, 病理學)
- **WHEN** the player toggles the 藥理學 chip off in the filter bar
- **THEN** the page SHALL hide all 藥理學 bookmarks
- **AND** 生理學 / 病理學 rows SHALL remain visible

#### Scenario: 「重新作答」 opens QuizModal scoped to that question

- **GIVEN** the player has bookmark for question X
- **WHEN** the player clicks 「重新作答」 on X's row
- **THEN** a QuizModal SHALL open with a 1-question pool containing only X
- **AND** after submitting + advancing, the modal SHALL show「題庫已答完」 (since the pool is exhausted)

#### Scenario: R2 sync replicates bookmarks across devices

- **GIVEN** the player bookmarks question X on Device A (writes to local Dexie + queues sync push)
- **WHEN** the player loads neurons on Device B (signed in to the same account)
- **THEN** the sync pull SHALL include the X bookmark in the incoming bundle
- **AND** Device B's local Dexie SHALL apply the row via LWW
- **AND** subsequent `useIsBookmarked(X.id)` calls on Device B SHALL return `true`

#### Scenario: Tombstone propagates bookmark removal across devices

- **GIVEN** the player has bookmarked X on both Device A and Device B
- **WHEN** the player removes the bookmark on Device A (writes tombstone with `updatedAt = T2 > original addedAt`)
- **AND** Device B pulls the latest bundle
- **THEN** Device B's local `questionBookmarks` SHALL have the X row removed
- **AND** Device B's `questionBookmarkTombstones` SHALL contain the tombstone
- **AND** `useIsBookmarked(X.id)` on Device B SHALL return `false`

#### Scenario: v2 client tolerates v3 bundle (forward-compat)

- **GIVEN** a v2 client (pre-`add-neurons-question-bookmarks`) pulls a v3 bundle from R2
- **WHEN** `validateBundleMeta` runs
- **THEN** it SHALL log an info message about unknown fields but SHALL NOT throw
- **AND** the v2 client SHALL silently drop the `questionBookmarks` and `questionBookmarkTombstones` fields
- **AND** the v2 client SHALL still apply all other v2-known adapters normally

## MODIFIED Requirements

### Requirement: QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll

The neurons-tw QuizModal SHALL respond to keyboard input from the moment it opens until it closes, in a two-phase contract that mirrors the modal's existing UI state. The hotkey path SHALL use a deliberate「highlight then commit」 pattern (parity with 二階) — mouse-click on an option still submits immediately so mouse users see no change.

**Asking phase** (`picked === null` — no option selected yet):

- Pressing `1`, `2`, `3`, or `4` SHALL set the highlighted option to A, B, C, or D respectively (order: `Object.keys(q.options)`). The highlighted option SHALL render with a visual accent ring (matching the existing mouse-hover style so the visual vocabulary stays consistent). The submission does NOT happen yet.
- Pressing `5`, `6`, `7`, `8`, `9`, or `0` SHALL be a no-op (defensive — content packs may extend option counts later; current rosters have 4).
- Pressing `Enter` SHALL submit the highlighted option IFF there is one. If no option is highlighted, `Enter` SHALL be a no-op (asking phase requires highlight before commit). Submission invokes the same handler path as a mouse click on that option button.

**Answered phase** (`picked !== null` — option already chosen, reveal showing):

- Pressing `Enter` or `Space` SHALL advance to the next question (equivalent to clicking the existing「下一題」 advance button), provided at least 150ms have elapsed since the asking → answered phase transition. The 150ms cooldown SHALL prevent a single Enter keypress from both submitting an option AND advancing past the reveal.
- **Pressing `1` SHALL toggle the bookmark for the current question** (replaces the reserved-noop placeholder from `wire-neurons-quiz-hotkeys`). The hotkey hook SHALL execute via a new `onToggleBookmark` callback prop, kept symmetric with `onSubmit` / `onAdvance` / `setHighlightedKey`. The button-click + hotkey paths share the same `toggleBookmark(q)` service call.

**Both phases — scroll bindings**:

- Pressing `Space` (no modifier) SHALL page-scroll the modal's body container DOWN by `0.8 × clientHeight` (smooth behavior). In answered phase this conflicts with the advance binding above; the dispatcher resolves by checking phase first — answered-phase Space advances, asking-phase Space scrolls down. Players who scrolled to read a long stem can keep using Space until they highlight (1–4), then Enter submits.
- Pressing `Shift+Space` SHALL page-scroll UP by `0.8 × clientHeight` (smooth).
- Pressing `↓` (ArrowDown) SHALL scroll down by 40px (`auto` behavior — instant for fine adjustments).
- Pressing `↑` (ArrowUp) SHALL scroll up by 40px.
- Pressing `Home` SHALL scroll to top of container (smooth).
- Pressing `End` SHALL scroll to bottom of container (smooth).
- All scroll operations target a dedicated `<div ref={scrollContainerRef}>` wrapping the modal body (NOT the page `<html>` or `<body>`). The container has `overflow-y: auto` + `max-height: calc(100vh - 200px)` so long question stems / explanations stay within the modal.

**Both phases — close**:

- Pressing `Escape` SHALL close the modal (this is the existing behavior — explicitly preserved, not regressed via the existing QuizModal `useEffect` Esc listener that lives alongside the hotkey hook).

**Both phases — input-focus guard**:

- When `event.target` is an `HTMLInputElement` or `HTMLTextAreaElement`, the hotkey handler SHALL skip dispatch entirely and let the keypress passthrough to native input handling. This is a defensive guard — neurons QuizModal currently has no inputs, but the guard ensures future inputs (e.g. note-taking field) don't break user typing.

**Dispatch architecture**:

- The hotkey logic SHALL be implemented as a pure `dispatchKey(key, shift, ctx)` function that maps a keypress + context to a discriminated-union `HotkeyAction` (`highlight` / `submit` / `advance` / `scroll` / `toggle-bookmark` / `noop` / `skip`). The function SHALL have no DOM access, no React state mutation — pure for full unit-test coverage.
- A separate `useQuizHotkeys` hook SHALL own the `document.addEventListener('keydown')` lifecycle, gated on `isOpen`. The hook SHALL pass current phase / option keys / highlighted key / cooldown reference / scroll container ref into `dispatchKey` and execute the returned action via injected callbacks (`setHighlightedKey`, `onSubmit`, `onAdvance`, `onToggleBookmark`) + DOM scroll on the container.
- The hook SHALL unsubscribe the document listener on modal close / unmount.
- The `HotkeyAction` union SHALL reserve unused variants (`toggle-easy` / `toggle-guessed`) as `noop` returns — these are wired by sibling change `add-neurons-srs-binary-modifiers` and the reserved slots keep this hook's dispatch logic stable.

**Visual feedback on highlight**:

- Highlighted option button SHALL render with a thicker / glowing border ring matching the existing mouse-hover style (DO NOT introduce a new visual idiom). `aria-pressed="true"` SHALL be set on the highlighted button; false on others.
- Switching highlight via `1` → `2` SHALL immediately update the visual ring (no animation delay).
- The reveal phase (after submit) SHALL clear the highlight visual since the answer + correct-key colors take over.

#### Scenario: Asking phase number key highlights option

- **GIVEN** the QuizModal is open, no option highlighted yet, and the served question has options `{ A: '...', B: '...', C: '...', D: '...' }`
- **WHEN** the player presses the `2` key
- **THEN** the modal SHALL set the highlighted key to `'B'` (the 2nd entry in `Object.keys(options)`)
- **AND** option B's button SHALL render with the accent ring + `aria-pressed="true"`
- **AND** no answer SHALL be submitted yet (the option-pick handler is NOT called)

#### Scenario: Asking phase Enter submits highlighted option

- **GIVEN** the QuizModal is open in asking phase with option C highlighted
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL invoke the option-pick handler with key `'C'`
- **AND** the modal SHALL transition to answered-phase rendering exactly as if the player had clicked option C with a mouse

#### Scenario: Asking phase Enter with no highlight is a no-op

- **GIVEN** the QuizModal is open in asking phase and no option has been highlighted
- **WHEN** the player presses `Enter`
- **THEN** no submission SHALL happen
- **AND** no visual state SHALL change

#### Scenario: Number key switches highlight to a different option

- **GIVEN** the QuizModal is open with option A currently highlighted
- **WHEN** the player presses `3`
- **THEN** the highlight SHALL move to option C
- **AND** option A's `aria-pressed` SHALL flip to `false` and option C's to `true`

#### Scenario: Out-of-bounds number key is a no-op

- **GIVEN** the QuizModal is open with a question that has only 3 options (e.g. `optionKeys=['A','B','C']`)
- **WHEN** the player presses `4`
- **THEN** no highlight SHALL change
- **AND** the dispatcher SHALL return `{kind:'noop'}`

#### Scenario: Answered phase Enter advances to next question

- **GIVEN** the QuizModal is open, the player has picked option C, the reveal is showing, and more than 150ms have elapsed since the pick
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL invoke the advance handler (equivalent to clicking「下一題」)
- **AND** the next question SHALL render with `picked` reset to `null` and `highlighted` reset to `null`

#### Scenario: Answered phase Space also advances

- **GIVEN** the QuizModal is open in answered phase with cooldown OK
- **WHEN** the player presses `Space`
- **THEN** the modal SHALL invoke the advance handler (equivalent to `Enter` in answered phase)

#### Scenario: Phase-change cooldown blocks immediate Enter advance

- **GIVEN** the QuizModal is open with option B highlighted in asking phase
- **WHEN** the player presses `Enter` (submits B, modal enters answered phase) and then presses `Enter` again within 150ms
- **THEN** the second `Enter` SHALL be a no-op (cooldown active)
- **AND** the reveal SHALL remain visible until the player presses `Enter` again after the cooldown expires (or clicks「下一題」)

#### Scenario: Answered phase `1` toggles bookmark

- **GIVEN** the QuizModal is open in answered phase showing question X (not yet bookmarked)
- **WHEN** the player presses `1`
- **THEN** the bookmark SHALL be added (Dexie `questionBookmarks` row written)
- **AND** the ⭐ button in the modal footer SHALL update to filled `★`
- **WHEN** the player presses `1` again
- **THEN** the bookmark SHALL be removed (row deleted + tombstone written)

#### Scenario: Asking phase Space scrolls modal body down

- **GIVEN** the QuizModal is open in asking phase with a long question stem requiring scroll, no option highlighted
- **WHEN** the player presses `Space` (no Shift modifier)
- **THEN** the modal's scrollable body container SHALL scroll DOWN by `0.8 × clientHeight` smoothly
- **AND** the page `<html>` / `<body>` SHALL NOT scroll
- **AND** no highlight SHALL change

#### Scenario: Shift+Space scrolls modal body up in either phase

- **GIVEN** the QuizModal is open (any phase) with the body scrolled partway down
- **WHEN** the player presses `Shift+Space`
- **THEN** the modal's body container SHALL scroll UP by `0.8 × clientHeight` smoothly

#### Scenario: Arrow keys provide fine-grained scroll

- **GIVEN** the QuizModal is open
- **WHEN** the player presses `↓`
- **THEN** the body container SHALL scroll DOWN by 40px (instant `auto` behavior)
- **WHEN** the player presses `↑`
- **THEN** the body container SHALL scroll UP by 40px

#### Scenario: Home / End jump to container edges

- **GIVEN** the QuizModal is open with the body partially scrolled
- **WHEN** the player presses `Home`
- **THEN** the body container SHALL scroll smoothly to the top
- **WHEN** the player presses `End`
- **THEN** the body container SHALL scroll smoothly to the bottom

#### Scenario: Escape closes the modal in any phase

- **GIVEN** the QuizModal is open
- **WHEN** the player presses `Escape` (regardless of asking / answered phase, regardless of highlight state)
- **THEN** the modal SHALL invoke the `onClose` handler (existing Esc behavior preserved via the existing useEffect listener — NOT through the hotkey hook)

#### Scenario: Input focus suspends hotkey dispatch

- **GIVEN** the QuizModal is open and a hypothetical `<input>` field inside the modal has focus (defensive — current modal has no inputs but the guard MUST exist)
- **WHEN** the player presses any key (e.g. `1`, `Enter`, `Space`)
- **THEN** the hotkey hook SHALL NOT dispatch any action
- **AND** the keypress SHALL passthrough to the native input handling

#### Scenario: Hook unmounts cleanly on modal close

- **GIVEN** the QuizModal is open with the hotkey hook active
- **WHEN** the modal closes (via Esc / ✕ / backdrop click / question exhaustion)
- **THEN** the hook's `document.addEventListener('keydown')` listener SHALL be removed
- **AND** subsequent keystrokes on Overview SHALL NOT trigger any quiz-related action

#### Scenario: Mouse click bypass — click submits immediately

- **GIVEN** the QuizModal is open in asking phase
- **WHEN** the player CLICKS option B with the mouse (no prior keyboard interaction)
- **THEN** the modal SHALL invoke the option-pick handler with key `'B'` IMMEDIATELY (no highlight intermediate)
- **AND** the modal SHALL transition to answered phase as today
- **AND** the highlight state SHALL remain `null` (irrelevant; reveal phase paints take over)

#### Scenario: Reserved hotkey slots stay no-op until sibling SRS change wires them

- **GIVEN** the QuizModal is open in answered phase
- **WHEN** the player presses `2` or `3` (太簡單 / 我亂猜的 SRS quality slots — reserved for `add-neurons-srs-binary-modifiers`)
- **THEN** the dispatcher SHALL return `{kind:'noop'}` (no-op) and no action SHALL fire
- **AND** when `add-neurons-srs-binary-modifiers` ships, pressing `2` / `3` SHALL toggle the SRS quality buttons per that change's spec

### Requirement: Overview SHALL surface a dismissible hotkey announcement banner

Overview SHALL render a one-time announcement banner promoting the QuizModal keyboard hotkeys + bookmark feature, positioned above `LeaderboardPromoBanner` and below the top status chip. The banner SHALL be dismissible per-device and SHALL hide on touch-only devices where hotkeys are not applicable.

The banner SHALL:

- Display a `⌨️` icon + headline「新功能：答題系統鍵盤快捷鍵」+ inline copy describing the asking-phase `1`–`4` highlight + `Enter` submit, answered-phase `Enter` / `Space` advance, **answered-phase `1` bookmark toggle**, scroll keys (`Space` / `Shift+Space` / `↓↑` / `Home` / `End`), and `Esc` close — all using `<kbd>` semantic elements.
- Append a HelpMenu reference at the end of the copy: `... 詳見右上 ❓ →「⌨️ 鍵盤快捷鍵」section。` so players who dismiss the banner know where to find a permanent reference.
- Render a ✕ dismiss button on the right that, when clicked, hides the banner immediately AND writes a localStorage key `neurons-quiz-hotkeys-banner-dismissed-v3` (BUMPED from `-v2` to `-v3` so previously-dismissed users see the new bookmark-key-mentioning copy ONCE) so the banner stays hidden on subsequent loads.
- Use CSS media query `@media (hover: hover) and (pointer: fine)` to render only on devices with a precise pointer (desktop + tablet with mouse) — touch-only devices SHALL not see the banner since they have no physical keyboard for hotkeys.
- Carry `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"` for screen-reader navigation; the dismiss button SHALL carry `aria-label="關閉公告"`.

The banner SHALL handle localStorage failures gracefully: if `localStorage.setItem` throws (private browsing / quota exceeded), the in-memory `hidden` state SHALL still update so the banner disappears for the current session; the banner re-renders on next page load, which is acceptable degraded behavior.

The localStorage key version suffix (currently `-v3`) SHALL be bumped (`-v4`, `-v5`, …) by future changes whenever banner copy revises materially, so re-discovery happens without migration code.

#### Scenario: Banner shows on first Overview load OR after v2→v3 key bump

- **GIVEN** a user lands on Overview for the first time after `add-neurons-question-bookmarks` ships (no `neurons-quiz-hotkeys-banner-dismissed-v3` localStorage key — either fresh user OR user who dismissed v1 or v2 banner previously)
- **WHEN** Overview renders
- **THEN** the announcement banner SHALL appear above `LeaderboardPromoBanner`
- **AND** the banner content SHALL include `⌨️` icon + headline + hotkey hint copy + **mention of `1` for bookmark** + the「詳見右上 ❓ →『⌨️ 鍵盤快捷鍵』」 trailing reference + dismiss button

#### Scenario: Dismiss persists across reload via v3 key

- **GIVEN** the banner is visible and the player clicks the ✕ dismiss button
- **WHEN** the player reloads the page
- **THEN** the banner SHALL NOT render
- **AND** the localStorage key `neurons-quiz-hotkeys-banner-dismissed-v3` SHALL equal `'true'`
- **AND** the legacy `-v1` / `-v2` keys (if present from prior dismissals) SHALL be ignored — only `-v3` gates display now

#### Scenario: Banner is hidden on touch-only devices

- **GIVEN** the user's device matches `@media (hover: none) or (pointer: coarse)` (typical phone / touch tablet)
- **WHEN** Overview renders
- **THEN** the banner SHALL NOT visually appear (via CSS `display: none` in the `@media` block)
- **AND** dismissing the banner SHALL not be required (since it's never visible)

#### Scenario: Banner content uses `<kbd>` semantic elements + HelpMenu reference + bookmark key

- **GIVEN** the announcement banner is rendered
- **WHEN** assistive technology or a CSS-disabled view parses the markup
- **THEN** key references (`1`, `2`, `3`, `4`, `Enter`, `Space`, `↓`, `↑`, `Home`, `End`, `Esc`) SHALL be wrapped in `<kbd>` elements
- **AND** the bookmark mention (e.g.「答題後 <kbd>1</kbd> 收藏」) SHALL appear in the copy
- **AND** the trailing「詳見右上 ❓ →『⌨️ 鍵盤快捷鍵』」 SHALL appear as natural-Chinese text

#### Scenario: localStorage failure does not break the page

- **GIVEN** localStorage is unavailable (private browsing / storage quota exceeded / SecurityError)
- **WHEN** the player clicks the dismiss button
- **THEN** the banner SHALL still disappear in the current session (via React state)
- **AND** Overview SHALL NOT throw an error
- **AND** on next page reload, the banner SHALL re-render (acceptable degraded behavior; no error message shown)

### Requirement: Neurons-tw SHALL surface a global HelpMenu accessible from every route

The neurons-tw app SHALL render a floating ❓ FAB at the top-right corner that opens a dismissible HelpMenu panel covering neurons mechanics + bug reporting paths. The FAB SHALL be mounted at the App-level (inside `<AuthProvider>` but outside the `<Routes>`), so it stays anchored on every route — Overview, ConnectomePage, DmnCollectionPage, AchievementsPage, LeaderboardPage, MotionDemoPage, **BookmarksPage** — without per-route wiring.

**FAB placement and styling**:

- Position `fixed` at `top: 1rem; right: 1rem` on desktop (≥ 600px viewport); `z-index: 900` so it sits above route content but below modals (`z-index: 1000+`).
- Renders as a circular 44×44px button (`border-radius: 50%`) with `❓` icon + accent border matching the warm GBA palette (`background: #fdf6e3; border: 2px solid #8c6d4a; color: #5a3f29`).
- `aria-label="開啟說明選單"`.
- Hover state: subtle lift + accent fill.
- Active state (panel open): `aria-expanded="true"` + accent fill visual.

**Panel structure**:

- Click on FAB opens a panel below the FAB. Panel rendered as `role="dialog" aria-modal="true" aria-label="說明選單"` to signal semantic structure.
- Backdrop: semi-transparent dark overlay (`background: rgba(20, 12, 30, 0.4)`) behind the panel, clickable to close.
- Panel content: `max-width: 480px`, max-height: `calc(100vh - 6rem)`, overflow-y: auto; rounded corners + GBA-palette border + cream background matching modal pattern.
- Panel header: title「📖 說明選單」+ ✕ close button (`aria-label="關閉說明選單"`).
- Panel body: a `<ul role="list">` of accordion `<li>` sections, each containing a native `<details>` element (semantic HTML for keyboard-accessible accordion).

**Accordion sections** (7 sections after `add-neurons-question-bookmarks`, identified by stable `id`):

1. **id=`hotkeys`, icon=⌨️, title=「鍵盤快捷鍵」** — body covers full hotkey reference matching the `wire-neurons-quiz-hotkeys` requirement (asking-phase 1-4 highlight + Enter, answered-phase Enter/Space + 150ms cooldown, **answered-phase `1` bookmark**, scroll keys, Esc, mouse-click bypass).
2. **id=`bookmark`, icon=⭐, title=「收藏題目」** — body covers the bookmark feature: 「答題時按 ⭐ 按鈕或 <kbd>1</kbd> 鍵收藏題目，到 <a href="/bookmarks">收藏</a> 頁面隨時複習。收藏會跨裝置同步（需登入）。」
3. **id=`variant-unlock`, icon=🧬, title=「變體解鎖」** — body covers per-family AP threshold ladder + auto-pull on threshold + `/connectome` link.
4. **id=`synapse-formation`, icon=🔗, title=「Synapse 形成」** — body covers cross-family 同日各答對 5 題 → wire + weak→strong tier + 7-day decay.
5. **id=`dmn-draws`, icon=💎, title=「DMN 抽卡」** — body covers time-axis (30 min/draw, cap 2) + behavior-axis (variant slot unlock / synapse form / synapse strengthen, cap 3) + 20-card closed cap at `/dmn` + 5 event kinds.
6. **id=`leaderboard`, icon=🏆, title=「排行榜」** — body covers opt-in flow + nickname NFKC + lowercase 撞名檢查 + 6 filter columns + opt-out flow.
7. **id=`bug-report`, icon=🩺, title=「回報問題」** — body links out to GitHub Issues `https://github.com/fireman333/study-rpg/issues/new` (rendered as `<a target="_blank" rel="noopener">`); one-liner: 「目前 neurons 尚未接 in-app 回報，請開 GitHub Issue 並標 `neurons` label。也歡迎 PR。」. NOT a form modal.

**Single-expand accordion behavior**:

- Only ONE section may be expanded at a time. Opening section X SHALL collapse all others.
- Clicking the summary of an already-open section closes it (toggle behavior).
- State held in transient React state `expandedId: string | null`; not persisted to localStorage / Dexie / sync.

**Close affordances**:

- Click ✕ in panel header → panel closes.
- Click backdrop (outside the panel) → panel closes.
- Press `Esc` → panel closes (separate listener from QuizModal's Esc; both can coexist since QuizModal's Esc only fires when QuizModal is open).
- Panel does NOT close on section toggle (so player can read multiple sections without re-opening).

**Mobile fallback** (`@media (max-width: 600px)`):

- FAB repositions to bottom-right corner (`top: auto; bottom: 1rem; right: 1rem`).
- Panel becomes a bottom sheet: `bottom: 0; left: 0; right: 0; width: 100%; max-width: none; border-radius: 12px 12px 0 0; max-height: 80vh`.
- Sections stay accordion-style (no horizontal layout change).

#### Scenario: FAB renders on every route including /bookmarks

- **GIVEN** the player navigates between `/` / `/connectome` / `/dmn` / `/achievements` / `/leaderboard` / `/bookmarks`
- **WHEN** any route renders
- **THEN** the ❓ FAB SHALL appear at the same top-right position (or bottom-right on mobile)
- **AND** the FAB SHALL be clickable on every route (no per-route gating)

#### Scenario: Click FAB opens panel with 7 sections

- **GIVEN** the player is on any route with the panel closed
- **WHEN** the player clicks the ❓ FAB
- **THEN** the panel SHALL open with all 7 accordion sections rendered in collapsed state (hotkeys / bookmark / variant-unlock / synapse-formation / dmn-draws / leaderboard / bug-report)
- **AND** the panel SHALL have `role="dialog" aria-modal="true"` and the proper aria-label

#### Scenario: bookmark section links to /bookmarks page

- **GIVEN** the player expands the `bookmark` section
- **WHEN** the player clicks the「收藏」 link inside the body
- **THEN** the route SHALL navigate to `/bookmarks`
- **AND** the HelpMenu panel SHALL close (or stay open per the existing accordion behavior — implementation choice)

#### Scenario: Single-expand accordion behavior

- **GIVEN** the panel is open with section `hotkeys` expanded and other sections collapsed
- **WHEN** the player clicks the summary of section `dmn-draws`
- **THEN** section `dmn-draws` SHALL expand
- **AND** section `hotkeys` SHALL collapse (no two sections open simultaneously)

#### Scenario: Clicking expanded section closes it (toggle)

- **GIVEN** the panel is open with section `variant-unlock` expanded
- **WHEN** the player clicks `variant-unlock`'s summary again
- **THEN** the section SHALL collapse
- **AND** no other section SHALL be expanded (player can have zero sections expanded)

#### Scenario: Backdrop click closes panel

- **GIVEN** the panel is open
- **WHEN** the player clicks the semi-transparent backdrop outside the panel content
- **THEN** the panel SHALL close
- **AND** the FAB SHALL return to closed-state styling

#### Scenario: Esc key closes panel

- **GIVEN** the panel is open
- **WHEN** the player presses `Esc`
- **THEN** the panel SHALL close
- **AND** if a QuizModal is also open behind the HelpMenu, the QuizModal's Esc listener MAY also fire (both close — acceptable since both are dismissible modals)

#### Scenario: Bug-report section links out to GitHub Issues

- **GIVEN** the player expands the `bug-report` section
- **WHEN** the player clicks the「開 GitHub Issue」 link
- **THEN** the browser SHALL open `https://github.com/fireman333/study-rpg/issues/new` in a new tab
- **AND** the link SHALL carry `target="_blank" rel="noopener"` attributes

#### Scenario: Panel mounts at App level — does not interfere with QuizModal

- **GIVEN** the player has a QuizModal open via family-card click
- **WHEN** the player clicks the ❓ FAB
- **THEN** the HelpMenu panel SHALL open over the QuizModal (higher z-index)
- **AND** the QuizModal SHALL remain mounted underneath
- **WHEN** the player closes the HelpMenu
- **THEN** the QuizModal SHALL still be visible and the player can continue answering

#### Scenario: Mobile viewport positions FAB at bottom

- **GIVEN** the viewport is approximately 414px wide (iPhone Plus)
- **WHEN** the player views any route
- **THEN** the FAB SHALL render at bottom-right (NOT top-right)
- **WHEN** the player taps the FAB to open the panel
- **THEN** the panel SHALL slide up as a bottom sheet covering up to 80% of viewport height

#### Scenario: HelpMenu state does not persist

- **GIVEN** the player opens the panel, expands section `synapse-formation`, then closes the panel
- **WHEN** the player reopens the panel later
- **THEN** the panel SHALL re-open with ALL sections collapsed (no memory of `synapse-formation` being last-opened)
- **AND** no localStorage / Dexie / sync table SHALL retain `expandedId` state
