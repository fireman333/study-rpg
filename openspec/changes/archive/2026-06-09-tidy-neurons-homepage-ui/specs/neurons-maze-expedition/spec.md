## MODIFIED Requirements

### Requirement: Opt-in, persisted show/hide

The expedition band SHALL play automatically during active-study moments rather than requiring a manual opt-in: on the maze homepage it SHALL play while reading is active (`reading-timer` `status === 'reading'`) and be static otherwise; in `QuizModal` the compact band SHALL play for the duration the modal is open. A single persisted「關閉動畫」visibility preference (default shown) SHALL let the player hide the band in BOTH contexts, and the choice SHALL survive page reloads. The band's visibility SHALL be controlled by (a) an **on-band minimize control (`×`)** that hides the band, and (b) a **restore control in the Help menu** that shows it again; there SHALL NOT be a persistent show/hide toggle chip on the maze homepage (the band auto-plays at the right moments, so an explicit "show" toggle is redundant; the `×` covers hiding and the Help menu covers restoring). When the OS requests reduced motion (`prefers-reduced-motion: reduce`), the band SHALL freeze to a static scene regardless of the preference. Visibility wording SHALL use show/hide ("遠征動畫 顯示/隱藏") rather than start/stop, because the underlying journey is always running and cannot be paused.

#### Scenario: Homepage band auto-plays while reading
- **WHEN** the player starts a reading session on the maze homepage (reading-timer status becomes `reading`) and the band is not hidden
- **THEN** the band animates; when reading pauses/stops, the band returns to a static scene

#### Scenario: Quiz band auto-plays during a session
- **WHEN** the player opens `QuizModal` and the band is not hidden
- **THEN** the compact band animates in the upper background for the duration of the session

#### Scenario: Hide choice persists across reloads and both contexts
- **WHEN** the player hides the band (via the on-band `×` or the Help-menu control) and then reloads the page
- **THEN** the band stays hidden on both the homepage and in QuizModal, and the persisted state records it as hidden

#### Scenario: On-band hide and Help-menu restore drive one persisted state
- **WHEN** the player hides the band via the on-band minimize control (`×`)
- **THEN** the band is hidden in both contexts and the persisted preference records it as hidden
- **AND** the band can be shown again via the restore control in the Help menu
- **AND** there is no persistent show/hide toggle chip on the maze homepage
