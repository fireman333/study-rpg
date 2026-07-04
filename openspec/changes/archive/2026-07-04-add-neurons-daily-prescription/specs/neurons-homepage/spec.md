## ADDED Requirements

### Requirement: Homepage SHALL surface a collapsible 今日處方箋 card above the merged stat card

The homepage (`/`) SHALL render a `DailyPrescriptionCard` (per `neurons-daily-prescription`) as the **topmost homepage surface, directly above the merged daily-loop stat card**. Placing it above the stat card SHALL preserve the existing relative order of the merged stat card → read-only squad preview → (family grid + embedded maze) surfaces beneath it (it adds a surface above the stat card; it does NOT reorder those existing surfaces among themselves). The card SHALL be **collapsible / expandable**: the collapsed state SHALL show a slim single-row strip (a summary of the two lines' progress + the「已固化 X 天」indicator + an affordance to start/expand), and the expanded state SHALL show the two prescription lines with their progress (e.g. `訂正錯題 2/4`, `開發盲區 5/8`), the single 「開始今日處方」 CTA, the「已固化 X 天」cumulative indicator, and the NG-0717 收藏神經元 at its derived maturation stage. The collapse/expand state SHALL persist device-local (a `meta` flag, NOT added to `SYNCED_META_KEYS`), defaulting to expanded on first view. The card SHALL degrade under `prefers-reduced-motion` (no mascot/arc animation, static end-state), and SHALL render correctly under direct-URL navigation and F5 as an SPA route.

#### Scenario: Prescription card is the topmost homepage surface above the stat card
- **WHEN** the homepage renders
- **THEN** the `DailyPrescriptionCard` SHALL render as the topmost surface, directly above the merged daily-loop stat card
- **AND** the existing relative order of merged stat card → squad preview → (family grid + embedded maze) SHALL be preserved beneath it

#### Scenario: Card collapses to a summary strip and expands, persisting device-local
- **WHEN** the player collapses the card
- **THEN** it SHALL show a slim strip summarizing the two lines' progress plus the「已固化 X 天」indicator and a start/expand affordance
- **WHEN** the player expands the card
- **THEN** it SHALL show the two lines with progress, the single 「開始今日處方」 CTA, the「已固化 X 天」indicator, and the NG-0717 收藏神經元 at its derived maturation stage
- **AND** the collapse/expand choice SHALL persist across reloads (device-local `meta`, not synced), defaulting to expanded on first view

#### Scenario: Card degrades under reduced motion and survives F5
- **WHEN** the user has `prefers-reduced-motion` enabled, or navigates directly to `/` / presses F5
- **THEN** the card SHALL render its static end-state (no mascot/arc animation) and SHALL render fully as an SPA route (not a blank shell)
