# neurons-responsive-layout Specification

## Purpose
TBD - created by archiving change add-neurons-mobile-rwd. Update Purpose after archive.

## Requirements

### Requirement: Homepage top-nav SHALL reflow without horizontal overflow at mobile widths

The `OverviewPage` top navigation (route links + `DmnDrawButton` + `AuthGate`) SHALL remain fully reachable and SHALL NOT cause page-level horizontal overflow at viewport widths down to **375px**. At ≤ **480px** the nav SHALL adopt 二階's horizontal-scroll-tabs pattern with a fade-edge affordance (`-webkit-mask-image` gradient) signalling more items off-screen. Breakpoints SHALL use the 二階 values (480 / 768px).

#### Scenario: Nav does not overflow the page at 375px

- **GIVEN** the neurons-tw `OverviewPage` rendered at 375px viewport width
- **WHEN** the layout settles
- **THEN** the document SHALL NOT have horizontal scroll (no element exceeds the 375px content box)
- **AND** every nav item SHALL be reachable (via horizontal-scroll within the nav strip if it does not fit)

#### Scenario: Nav shows scroll affordance at ≤ 480px

- **GIVEN** the `OverviewPage` at ≤ 480px with more nav items than fit
- **THEN** the nav strip SHALL be horizontally scrollable
- **AND** a fade-edge mask SHALL indicate additional off-screen items (mirroring 二階's `.app-header__meta`)

### Requirement: FamilyPicker cards SHALL collapse to a single column below 768px

The `FamilyPicker` card grid SHALL reflow to a single column at viewport widths < 768px so cards never shrink below a legible width or trigger horizontal page scroll.

#### Scenario: Family cards stack single-column on phones

- **GIVEN** the `OverviewPage` `FamilyPicker` rendered at 375px
- **WHEN** the grid lays out
- **THEN** family cards SHALL be stacked in a single column
- **AND** no card SHALL cause horizontal page overflow

### Requirement: Modal and toast overlays SHALL fit the viewport at 375px and lock body scroll when open

The 4 overlays — `QuizModal`, `DmnDrawModal`, `VariantUnlockModal`, and achievement toasts — SHALL fit within a 375px-wide viewport without horizontal overflow; modal inner content longer than the viewport SHALL scroll within the modal (not the page). While a modal backdrop is present the page body SHALL lock scroll (`body:has(.modal-backdrop){overflow:hidden}`) and SHALL set `overscroll-behavior-y: none` to prevent pull-to-refresh bleed-through.

#### Scenario: QuizModal fits and scrolls internally at 375px

- **GIVEN** `QuizModal` open at 375px viewport
- **THEN** the modal SHALL NOT exceed the viewport width (no horizontal overflow)
- **AND** overflowing question/explanation content SHALL scroll inside the modal
- **AND** the page body behind the backdrop SHALL NOT scroll

#### Scenario: Achievement toast does not overflow at 375px

- **GIVEN** an achievement unlock toast shown at 375px
- **THEN** the toast SHALL fit within the viewport width with its margins
- **AND** SHALL NOT introduce horizontal page scroll

### Requirement: Responsive rules SHALL live in a stylesheet and leave desktop layout unchanged

Mobile reflow SHALL be implemented in an `apps/neurons-tw/src/styles.css` stylesheet using `@media` queries (so the rules are viewport-gated), NOT as new always-on inline styles. Only media-sensitive rules migrate out of inline `THEME_PIXEL_NEURONS`; the desktop layout (≥ 768px) SHALL be visually unchanged from before this change.

#### Scenario: Desktop layout unchanged above 768px

- **GIVEN** the `OverviewPage` at ≥ 768px (e.g. 1024px)
- **WHEN** compared to the pre-change layout
- **THEN** nav, family cards, and overlays SHALL render identically (the new `@media` rules SHALL NOT apply above their breakpoints)

### Requirement: Leaderboard rows SHALL collapse to rank + nickname + active stat below 480px

The `/leaderboard` row layout (`apps/neurons-tw`) — a 7-column grid (`# / 暱稱 / 變體 / 家族 / AP / Synapse / 唸書`) whose fixed columns sum to ~470px — SHALL NOT cause horizontal page overflow at viewport widths down to **375px**. At ≤ **480px** the row SHALL show only three columns — rank, nickname, and the single stat column matching the currently-active sort filter (`FILTER_PRIMARY_STAT[activeFilter]`) — hiding the other stat cells. Switching the filter tab SHALL change which stat column is shown. The collapse SHALL apply identically to the header row and data rows so columns stay aligned. The responsive column template SHALL be expressed in `apps/neurons-tw/src/styles.css` (via a `--neurons-lb-cols` CSS variable + `@media`), NOT as inline styles, so the breakpoint can override it.

#### Scenario: Populated leaderboard row does not overflow at 375px

- **GIVEN** the `/leaderboard` rendered at 375px viewport width with at least one ranked player
- **WHEN** the layout settles
- **THEN** the row SHALL NOT exceed the content box (no horizontal page overflow)
- **AND** only the rank cell, the nickname cell, and the stat cell matching the active filter SHALL be visible

#### Scenario: Switching filter tab swaps the visible mobile stat

- **GIVEN** the `/leaderboard` at ≤ 480px on the 變體 (variant_count) filter showing the variant stat column
- **WHEN** the user taps the AP filter tab
- **THEN** the visible stat column SHALL switch to AP
- **AND** the variant column SHALL become hidden

#### Scenario: Desktop leaderboard layout unchanged above 480px

- **GIVEN** the `/leaderboard` at ≥ 480px (e.g. 1024px)
- **WHEN** compared to the pre-change layout
- **THEN** all seven columns (`# / 暱稱 / 變體 / 家族 / AP / Synapse / 唸書`) SHALL render as before (the `@media (max-width: 480px)` rule SHALL NOT apply)
