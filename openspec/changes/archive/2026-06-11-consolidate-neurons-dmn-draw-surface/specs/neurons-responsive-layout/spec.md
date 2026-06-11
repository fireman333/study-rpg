## MODIFIED Requirements

### Requirement: Homepage top-nav SHALL reflow without horizontal overflow at mobile widths

The `OverviewPage` top navigation (route links + `AuthGate`) SHALL remain fully reachable and SHALL NOT cause page-level horizontal overflow at viewport widths down to **375px**. At ≤ **480px** the nav SHALL adopt 二階's horizontal-scroll-tabs pattern with a fade-edge affordance (`-webkit-mask-image` gradient) signalling more items off-screen. Breakpoints SHALL use the 二階 values (480 / 768px). The DMN draw entry-point SHALL NOT be a top-nav item (it is hosted in the homepage daily-loop stat card's DMN stage, per `neurons-dmn-fate-cards`).

#### Scenario: Nav does not overflow the page at 375px

- **GIVEN** the neurons-tw `OverviewPage` rendered at 375px viewport width
- **WHEN** the layout settles
- **THEN** the document SHALL NOT have horizontal scroll (no element exceeds the 375px content box)
- **AND** every nav item SHALL be reachable (via horizontal-scroll within the nav strip if it does not fit)

#### Scenario: Nav shows scroll affordance at ≤ 480px

- **GIVEN** the `OverviewPage` at ≤ 480px with more nav items than fit
- **THEN** the nav strip SHALL be horizontally scrollable
- **AND** a fade-edge mask SHALL indicate additional off-screen items (mirroring 二階's `.app-header__meta`)
