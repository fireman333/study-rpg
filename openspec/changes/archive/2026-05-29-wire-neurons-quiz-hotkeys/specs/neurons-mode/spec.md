## ADDED Requirements

### Requirement: QuizModal SHALL accept keyboard hotkeys for option highlight / submit / advance / scroll

The neurons-tw QuizModal SHALL respond to keyboard input from the moment it opens until it closes, in a two-phase contract that mirrors the modal's existing UI state. The hotkey path SHALL use a deliberate「highlight then commit」 pattern (parity with 二階) — mouse-click on an option still submits immediately so mouse users see no change.

**Asking phase** (`picked === null` — no option selected yet):

- Pressing `1`, `2`, `3`, or `4` SHALL set the highlighted option to A, B, C, or D respectively (order: `Object.keys(q.options)`). The highlighted option SHALL render with a visual accent ring (matching the existing mouse-hover style so the visual vocabulary stays consistent). The submission does NOT happen yet.
- Pressing `5`, `6`, `7`, `8`, `9`, or `0` SHALL be a no-op (defensive — content packs may extend option counts later; current rosters have 4).
- Pressing `Enter` SHALL submit the highlighted option IFF there is one. If no option is highlighted, `Enter` SHALL be a no-op (asking phase requires highlight before commit). Submission invokes the same handler path as a mouse click on that option button.

**Answered phase** (`picked !== null` — option already chosen, reveal showing):

- Pressing `Enter` or `Space` SHALL advance to the next question (equivalent to clicking the existing「下一題」 advance button), provided at least 150ms have elapsed since the asking → answered phase transition. The 150ms cooldown SHALL prevent a single Enter keypress from both submitting an option AND advancing past the reveal.

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

- The hotkey logic SHALL be implemented as a pure `dispatchKey(key, shift, ctx)` function that maps a keypress + context to a discriminated-union `HotkeyAction` (`highlight` / `submit` / `advance` / `scroll` / `noop` / `skip`). The function SHALL have no DOM access, no React state mutation — pure for full unit-test coverage.
- A separate `useQuizHotkeys` hook SHALL own the `document.addEventListener('keydown')` lifecycle, gated on `isOpen`. The hook SHALL pass current phase / option keys / highlighted key / cooldown reference / scroll container ref into `dispatchKey` and execute the returned action via injected callbacks (`setHighlightedKey`, `onSubmit`, `onAdvance`) + DOM scroll on the container.
- The hook SHALL unsubscribe the document listener on modal close / unmount.
- The `HotkeyAction` union SHALL reserve unused variants (`toggle-bookmark` / `toggle-easy` / `toggle-guessed`) as `noop` returns — these are wired by sibling changes (`add-neurons-question-bookmarks`, `add-neurons-srs-binary-modifiers`) and the reserved slots keep this hook's dispatch logic stable across those follow-ups.

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

#### Scenario: Reserved hotkey slots stay no-op until follow-up changes wire them

- **GIVEN** the QuizModal is open in answered phase
- **WHEN** the player presses `1`, `2`, or `3` (bookmark / 太簡單 / 我亂猜的 slots reserved for follow-up changes)
- **THEN** the dispatcher SHALL return `{kind:'noop'}` (no-op) and no action SHALL fire
- **AND** when `add-neurons-question-bookmarks` ships, pressing `1` SHALL toggle bookmark per that change's spec
- **AND** when `add-neurons-srs-binary-modifiers` ships, pressing `2` / `3` SHALL toggle the SRS quality buttons per that change's spec

### Requirement: Overview SHALL surface a dismissible hotkey announcement banner

Overview SHALL render a one-time announcement banner promoting the QuizModal keyboard hotkeys, positioned above `LeaderboardPromoBanner` and below the top status chip. The banner SHALL be dismissible per-device and SHALL hide on touch-only devices where hotkeys are not applicable.

The banner SHALL:

- Display a `⌨️` icon + headline「新功能：答題系統鍵盤快捷鍵」+ inline copy describing the asking-phase `1`–`4` highlight + `Enter` submit, answered-phase `Enter` / `Space` advance, scroll keys (`Space` / `Shift+Space` / `↓↑` / `Home` / `End`), and `Esc` close — all using `<kbd>` semantic elements.
- Render a ✕ dismiss button on the right that, when clicked, hides the banner immediately AND writes a localStorage key `neurons-quiz-hotkeys-banner-dismissed-v1` so the banner stays hidden on subsequent loads.
- Use CSS media query `@media (hover: hover) and (pointer: fine)` to render only on devices with a precise pointer (desktop + tablet with mouse) — touch-only devices SHALL not see the banner since they have no physical keyboard for hotkeys.
- Carry `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"` for screen-reader navigation; the dismiss button SHALL carry `aria-label="關閉公告"`.

The banner SHALL handle localStorage failures gracefully: if `localStorage.setItem` throws (private browsing / quota exceeded), the in-memory `hidden` state SHALL still update so the banner disappears for the current session; the banner re-renders on next page load, which is acceptable degraded behavior.

The localStorage key SHALL include a version suffix (`-v1`) so a future copy revision can bump to `-v2` and re-show the banner without needing migration code. The `add-neurons-helpmenu` follow-up change SHALL bump the key to `-v2` when it appends the「詳見右下 ❓ →『⌨️ 鍵盤快捷鍵』」 HelpMenu reference to the banner copy.

#### Scenario: Banner shows on first Overview load

- **GIVEN** a user lands on Overview for the first time after the change ships (no `neurons-quiz-hotkeys-banner-dismissed-v1` localStorage key)
- **WHEN** Overview renders
- **THEN** the announcement banner SHALL appear above `LeaderboardPromoBanner`
- **AND** the banner content SHALL include `⌨️` icon + headline + hotkey hint copy (covering 1–4, Enter, Space, ↓↑, Home/End, Esc) + dismiss button

#### Scenario: Dismiss persists across reload

- **GIVEN** the banner is visible and the player clicks the ✕ dismiss button
- **WHEN** the player reloads the page
- **THEN** the banner SHALL NOT render
- **AND** the localStorage key `neurons-quiz-hotkeys-banner-dismissed-v1` SHALL equal `'true'`

#### Scenario: Banner is hidden on touch-only devices

- **GIVEN** the user's device matches `@media (hover: none) or (pointer: coarse)` (typical phone / touch tablet)
- **WHEN** Overview renders
- **THEN** the banner SHALL NOT visually appear (via CSS `display: none` in the `@media` block)
- **AND** dismissing the banner SHALL not be required (since it's never visible)

#### Scenario: Banner content uses `<kbd>` semantic elements

- **GIVEN** the announcement banner is rendered
- **WHEN** assistive technology or a CSS-disabled view parses the markup
- **THEN** key references (`1`, `2`, `3`, `4`, `Enter`, `Space`, `↓`, `↑`, `Home`, `End`, `Esc`) SHALL be wrapped in `<kbd>` elements
- **AND** the surrounding copy SHALL describe the hotkey behavior in natural Traditional Chinese

#### Scenario: localStorage failure does not break the page

- **GIVEN** localStorage is unavailable (private browsing / storage quota exceeded / SecurityError)
- **WHEN** the player clicks the dismiss button
- **THEN** the banner SHALL still disappear in the current session (via React state)
- **AND** Overview SHALL NOT throw an error
- **AND** on next page reload, the banner SHALL re-render (acceptable degraded behavior; no error message shown)
