# cloud-sync (delta)

## ADDED Requirements

### Requirement: Paused-banner reopen entry visually anchored to sibling top-bar controls

WHEN the paused banner displays AND another top-bar control (e.g., AuthButton chip) is concurrently visible, THEN the paused-banner reopen entry SHALL render at a vertical position whose center is aligned with the sibling control's center (≤ 2px tolerance) so the two controls read as a single visual row.

#### Scenario: Paused banner and authed AuthButton co-present

- **WHEN** `sync.gateState === 'paused'`
- **AND** the user is signed in (AuthButton renders as the authed chip variant)
- **THEN** the vertical center of `.sync-paused-banner__btn` and the vertical center of `.auth-button` SHALL differ by no more than 2px at viewport widths ≥ 1024px
- **AND** at viewport widths < 768px (mobile), if banner stacks below the chip due to width reflow, the two SHALL maintain consistent left/right anchoring so the visual relationship remains coherent

#### Scenario: Paused banner standalone (user unauthed or AuthButton hidden)

- **WHEN** `sync.gateState === 'paused'` AND AuthButton is not visible
- **THEN** the reopen entry's position SHALL remain stable (no layout jitter) and SHALL NOT shift when the user signs in/out
