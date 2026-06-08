## MODIFIED Requirements

### Requirement: Neurons-tw SHALL surface a global HelpMenu accessible from every route

The neurons-tw app SHALL render a floating ❓ FAB at the top-right corner that opens a dismissible HelpMenu panel covering neurons mechanics + bug reporting paths. The FAB SHALL be mounted at the App-level (inside `<AuthProvider>` but outside the `<Routes>`), so it stays anchored on every route — Overview, ConnectomePage, DmnCollectionPage, AchievementsPage, LeaderboardPage, MotionDemoPage — without per-route wiring.

**FAB placement and styling**:

- Position `fixed` at `top: 1rem; right: 1rem` on desktop (≥ 600px viewport); `z-index: 900` so it sits above route content but below modals (`z-index: 1000+`).
- Renders as a circular 44×44px button (`border-radius: 50%`) with `❓` icon + accent border matching the warm GBA palette (`background: #fdf6e3; border: 2px solid #8c6d4a; color: #5a3f29`).
- `aria-label="開啟說明選單"`.
- Hover state: subtle lift + accent fill.
- Active state (panel open): `aria-expanded="true"` + accent fill visual.
- The FAB SHALL persist on the `/bookmarks` route (same App-level mount applies).

**Panel structure**:

- Click on FAB opens a panel below the FAB. Panel rendered as `role="dialog" aria-modal="true" aria-label="說明選單"` to signal semantic structure.
- Backdrop: semi-transparent dark overlay (`background: rgba(20, 12, 30, 0.4)`) behind the panel, clickable to close.
- Panel content: `max-width: 480px`, max-height: `calc(100vh - 6rem)`, overflow-y: auto; rounded corners + GBA-palette border + cream background matching modal pattern.
- Panel header: title「📖 說明選單」+ ✕ close button (`aria-label="關閉說明選單"`).
- Panel body: a `<ul role="list">` of accordion `<li>` sections, each containing a native `<details>` element (semantic HTML for keyboard-accessible accordion).

**Accordion sections** (identified by stable `id`):

- The panel SHALL render a set of accordion sections covering the current neurons player loop plus a bug-reporting entry. Each section SHALL carry a stable `id`, an icon, a title, and explanatory body copy.
- The section list tracks the shipped feature set and is **NOT a locked count** — sections MAY be added or clarified as mechanics ship, without requiring a `neurons-mode` spec change for each. (As of this writing the drawer documents, among others: keyboard hotkeys, bookmarks, the question bank, expedition / exam modes, wrong-answer review, variant unlock + 首答/二回目, synapse formation, the connector neuron, DMN draws, acceleration, living companions, achievements, the leaderboard, and bug reporting — illustrative, not exhaustive.)
- At minimum the drawer SHALL include a keyboard-hotkeys reference section (matching the `QuizModal SHALL accept keyboard hotkeys` requirement) and a bug-reporting entry section.
- Where a section's content is itself normatively specified by another capability — bug reporting by `neurons-bug-report`, DMN draws by `neurons-dmn-fate-cards`, the leaderboard by `neurons-leaderboard`, per-question bookmarks by `question-bookmarks`, etc. — the HelpMenu requirement defers to that capability and does NOT re-specify the section's behavior.

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

#### Scenario: Click FAB opens panel with the mechanic sections

- **GIVEN** the player is on any route with the panel closed
- **WHEN** the player clicks the ❓ FAB
- **THEN** the panel SHALL open with its accordion sections rendered in collapsed state, including at least a keyboard-hotkeys reference section and a bug-reporting entry section
- **AND** the panel SHALL have `role="dialog" aria-modal="true"` and the proper aria-label

#### Scenario: bookmark section links to /bookmarks page

- **GIVEN** the player expands the `bookmark` section
- **WHEN** the player clicks the「收藏」 link inside the body
- **THEN** the route SHALL navigate to `/bookmarks`

#### Scenario: Single-expand accordion behavior

- **GIVEN** the panel is open with section `hotkeys` expanded and other sections collapsed
- **WHEN** the player clicks the summary of another section
- **THEN** that section SHALL expand
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

- **GIVEN** the player opens the panel, expands a section, then closes the panel
- **WHEN** the player reopens the panel later
- **THEN** the panel SHALL re-open with ALL sections collapsed (no memory of the last-opened section)
- **AND** no localStorage / Dexie / sync table SHALL retain `expandedId` state
