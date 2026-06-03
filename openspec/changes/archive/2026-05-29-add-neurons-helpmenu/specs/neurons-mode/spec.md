## ADDED Requirements

### Requirement: Neurons-tw SHALL surface a global HelpMenu accessible from every route

The neurons-tw app SHALL render a floating ❓ FAB at the top-right corner that opens a dismissible HelpMenu panel covering neurons mechanics + bug reporting paths. The FAB SHALL be mounted at the App-level (inside `<AuthProvider>` but outside the `<Routes>`), so it stays anchored on every route — Overview, ConnectomePage, DmnCollectionPage, AchievementsPage, LeaderboardPage, MotionDemoPage — without per-route wiring.

**FAB placement and styling**:

- Position `fixed` at `top: 1rem; right: 1rem` on desktop (≥ 600px viewport); `z-index: 900` so it sits above route content but below modals (`z-index: 1000+`).
- Renders as a circular 44×44px button (`border-radius: 50%`) with `❓` icon + accent border matching the warm GBA palette (`background: #fdf6e3; border: 2px solid #8c6d4a; color: #5a3f29`).
- `aria-label="開啟說明選單"`.
- Hover state: subtle lift + accent fill.
- Active state (panel open): rotated 180° via `transform: rotate(180deg)` or visual indicator that it's a toggle.

**Panel structure**:

- Click on FAB opens a panel below the FAB. Panel rendered as `role="dialog" aria-modal="true" aria-label="說明選單"` to signal semantic structure.
- Backdrop: semi-transparent dark overlay (`background: rgba(20, 12, 30, 0.4)`) behind the panel, clickable to close.
- Panel content: `max-width: 480px`, max-height: `calc(100vh - 6rem)`, overflow-y: auto; rounded corners + GBA-palette border + cream background matching modal pattern.
- Panel header: title「📖 說明選單」+ ✕ close button (`aria-label="關閉說明選單"`).
- Panel body: a `<ul role="list">` of accordion `<li>` sections, each containing a native `<details>` element (semantic HTML for keyboard-accessible accordion).

**Accordion sections** (initial 6 sections, identified by stable `id`):

1. **id=`hotkeys`, icon=⌨️, title=「鍵盤快捷鍵」** — body covers:
   - Asking phase: `1`–`4` highlight A–D + `Enter` submit highlighted option
   - Answered phase: `Enter` or `Space` advance (150ms cooldown after submit)
   - Both phases: `Space`/`Shift+Space` page-scroll, `↓`/`↑` step-scroll 40px, `Home`/`End` jump to edges
   - `Esc` close modal anytime
   - Mouse-click bypass: clicking option submits immediately without highlight intermediate
2. **id=`variant-unlock`, icon=🧬, title=「變體解鎖」** — body covers:
   - Per-family AP threshold ladder
   - Auto-pull on threshold crossing — no manual gacha button needed
   - Variant 連結組 (connectome) tree visualization at `/connectome`
3. **id=`synapse-formation`, icon=🔗, title=「Synapse 形成」** — body covers:
   - Cross-family rule:「同日內，跨 family 各答對 5 題 → wire synapse」
   - Weak → strong tier evolution via repeated co-firing
   - Decay after 7 days inactive
4. **id=`dmn-draws`, icon=💎, title=「DMN 抽卡」** — body covers:
   - Time-axis: 每 30 min 累積閱讀 → +1 draw（每日上限 2）
   - Behavior-axis: variant slot unlock / synapse 形成 / synapse 強化 → +1 draw each（每日上限 3）
   - 20-card closed cap collection at `/dmn`
   - 5 event kinds (family-buff / variant-rate-up / quick-review-batch / streak-shield / hidden-reveal)
5. **id=`leaderboard`, icon=🏆, title=「排行榜」** — body covers:
   - Opt-in flow via Settings (`/leaderboard` page)
   - Nickname 2–12 codepoint + NFKC + lowercase 撞名檢查
   - 6 filter columns + my-rank chip
   - 退出 / 改名 / 重設 instructions
6. **id=`bug-report`, icon=🩺, title=「回報問題」** — body covers:
   - Link to GitHub Issues: `https://github.com/fireman333/study-rpg/issues/new` (rendered as `<a target="_blank" rel="noopener">`)
   - One-liner explanation: 「目前 neurons 尚未接 in-app 回報，請開 GitHub Issue 並標 `neurons` label。也歡迎 PR。」
   - NOT a form modal (defer to future `add-neurons-bug-reporting` change if Supabase wiring lands)

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

#### Scenario: FAB renders on every route

- **GIVEN** the player navigates between `/` / `/connectome` / `/dmn` / `/achievements` / `/leaderboard`
- **WHEN** any route renders
- **THEN** the ❓ FAB SHALL appear at the same top-right position (or bottom-right on mobile)
- **AND** the FAB SHALL be clickable on every route (no per-route gating)

#### Scenario: Click FAB opens panel with 6 sections

- **GIVEN** the player is on any route with the panel closed
- **WHEN** the player clicks the ❓ FAB
- **THEN** the panel SHALL open with all 6 accordion sections rendered in collapsed state
- **AND** the panel SHALL have `role="dialog" aria-modal="true"` and the proper aria-label

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
- **AND** if a QuizModal is also open behind the HelpMenu, the QuizModal's Esc listener SHALL also fire (both close — acceptable since HelpMenu pre-empted to focus)

#### Scenario: Bug-report section links out to GitHub Issues

- **GIVEN** the player expands the `bug-report` section
- **WHEN** the player clicks the「開 GitHub Issue」 link
- **THEN** the browser SHALL open `https://github.com/fireman333/study-rpg/issues/new` in a new tab
- **AND** the link SHALL carry `target="_blank" rel="noopener"` attributes

#### Scenario: Panel mounts at App level — does not interfere with QuizModal

- **GIVEN** the player has a QuizModal open via family-card click
- **WHEN** the player clicks the ❓ FAB
- **THEN** the HelpMenu panel SHALL open over the QuizModal (higher z-index or modal-on-modal pattern)
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

## MODIFIED Requirements

### Requirement: Overview SHALL surface a dismissible hotkey announcement banner

Overview SHALL render a one-time announcement banner promoting the QuizModal keyboard hotkeys, positioned above `LeaderboardPromoBanner` and below the top status chip. The banner SHALL be dismissible per-device and SHALL hide on touch-only devices where hotkeys are not applicable.

The banner SHALL:

- Display a `⌨️` icon + headline「新功能：答題系統鍵盤快捷鍵」+ inline copy describing the asking-phase `1`–`4` highlight + `Enter` submit, answered-phase `Enter` / `Space` advance, scroll keys (`Space` / `Shift+Space` / `↓↑` / `Home` / `End`), and `Esc` close — all using `<kbd>` semantic elements.
- **Append a HelpMenu reference at the end of the copy**: `... 詳見右下 ❓ →「⌨️ 鍵盤快捷鍵」section。` so players who dismiss the banner know where to find a permanent reference.
- Render a ✕ dismiss button on the right that, when clicked, hides the banner immediately AND writes a localStorage key `neurons-quiz-hotkeys-banner-dismissed-v2` (BUMPED from `-v1` to `-v2` so previously-dismissed users see the new HelpMenu-referencing copy ONCE) so the banner stays hidden on subsequent loads.
- Use CSS media query `@media (hover: hover) and (pointer: fine)` to render only on devices with a precise pointer (desktop + tablet with mouse) — touch-only devices SHALL not see the banner since they have no physical keyboard for hotkeys.
- Carry `role="region"` + `aria-label="新功能公告：鍵盤快捷鍵"` for screen-reader navigation; the dismiss button SHALL carry `aria-label="關閉公告"`.

The banner SHALL handle localStorage failures gracefully: if `localStorage.setItem` throws (private browsing / quota exceeded), the in-memory `hidden` state SHALL still update so the banner disappears for the current session; the banner re-renders on next page load, which is acceptable degraded behavior.

The localStorage key version suffix (currently `-v2`) SHALL be bumped (`-v3`, `-v4`, …) by future changes whenever banner copy revises materially, so re-discovery happens without migration code.

#### Scenario: Banner shows on first Overview load OR after v1→v2 key bump

- **GIVEN** a user lands on Overview for the first time after `add-neurons-helpmenu` ships (no `neurons-quiz-hotkeys-banner-dismissed-v2` localStorage key — either fresh user OR user who dismissed v1 banner previously)
- **WHEN** Overview renders
- **THEN** the announcement banner SHALL appear above `LeaderboardPromoBanner`
- **AND** the banner content SHALL include `⌨️` icon + headline + hotkey hint copy + **the new「詳見右下 ❓ →『⌨️ 鍵盤快捷鍵』section。」 trailing reference** + dismiss button

#### Scenario: Dismiss persists across reload via v2 key

- **GIVEN** the banner is visible and the player clicks the ✕ dismiss button
- **WHEN** the player reloads the page
- **THEN** the banner SHALL NOT render
- **AND** the localStorage key `neurons-quiz-hotkeys-banner-dismissed-v2` SHALL equal `'true'`
- **AND** the legacy `-v1` key (if present from prior dismissal) SHALL be ignored — only `-v2` gates display now

#### Scenario: Banner is hidden on touch-only devices

- **GIVEN** the user's device matches `@media (hover: none) or (pointer: coarse)` (typical phone / touch tablet)
- **WHEN** Overview renders
- **THEN** the banner SHALL NOT visually appear (via CSS `display: none` in the `@media` block)
- **AND** dismissing the banner SHALL not be required (since it's never visible)

#### Scenario: Banner content uses `<kbd>` semantic elements + HelpMenu reference

- **GIVEN** the announcement banner is rendered
- **WHEN** assistive technology or a CSS-disabled view parses the markup
- **THEN** key references (`1`, `2`, `3`, `4`, `Enter`, `Space`, `↓`, `↑`, `Home`, `End`, `Esc`) SHALL be wrapped in `<kbd>` elements
- **AND** the trailing「詳見右下 ❓ →『⌨️ 鍵盤快捷鍵』」 SHALL appear as natural-Chinese text (the ❓ may use `<span aria-hidden="true">❓</span>` styling)

#### Scenario: localStorage failure does not break the page

- **GIVEN** localStorage is unavailable (private browsing / storage quota exceeded / SecurityError)
- **WHEN** the player clicks the dismiss button
- **THEN** the banner SHALL still disappear in the current session (via React state)
- **AND** Overview SHALL NOT throw an error
- **AND** on next page reload, the banner SHALL re-render (acceptable degraded behavior; no error message shown)
