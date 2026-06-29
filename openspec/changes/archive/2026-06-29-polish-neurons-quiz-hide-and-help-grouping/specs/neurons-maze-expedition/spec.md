## MODIFIED Requirements

### Requirement: Decorative expedition animation band

The system SHALL render a cosmetic side-scrolling "expedition" animation band composed of three independently-scrolling parallax layers — a far brain-sulci sky (slowest), a neural-tissue ground, and fast foreground synapse particles — that loop seamlessly to simulate the squad marching deeper into the brain. The band SHALL render in two contexts: a full-size band on the maze homepage, and a **compact** band in `QuizModal` during a quiz session. The band SHALL be purely decorative and MUST NOT read from or mutate any maze game state. The compact quiz band SHALL be non-interactive (`pointer-events: none`) **EXCEPT for a single on-band minimize control (`−`), which SHALL be interactive (`pointer-events: auto`) and keyboard-focusable** so the player can hide the band while answering; the rest of the band SHALL continue to not intercept clicks. The compact band SHALL be rendered as an **in-flow strip that reserves its own vertical space between the title bar and the question body** — NOT as an out-of-flow translucent overlay positioned over the content — so neither the band nor its `−` control can ever obscure or intercept the answer UI on any viewport.

#### Scenario: Band renders with three parallax layers
- **WHEN** the expedition animation is shown (on the maze homepage or in QuizModal)
- **THEN** a far sky layer, a tissue ground layer, and a foreground particle layer are each present and animate via CSS `background-position` at distinct (slow → fast) speeds, looping seamlessly

#### Scenario: Band does not affect game state
- **WHEN** the expedition band is shown or hidden in either context
- **THEN** maze growth-signal accrual, node settling, and connected-region count are unchanged (the band neither pauses nor advances the journey)

#### Scenario: Compact quiz band stays out of the way
- **WHEN** the compact band renders in the QuizModal
- **THEN** every part of the band EXCEPT the on-band `−` control is non-interactive (does not intercept clicks) and occupies its own strip of vertical space between the title bar and the question body
- **AND** the question stem and options sit entirely below the band and are never overlapped by it (nor by the `−` control), on both desktop and mobile viewports

### Requirement: Opt-in, persisted show/hide

The expedition band SHALL play automatically during active-study moments rather than requiring a manual opt-in: on the maze homepage it SHALL play while reading is active (`reading-timer` `status === 'reading'`) and be static otherwise; in `QuizModal` the compact band SHALL play for the duration the modal is open. A single persisted「關閉動畫」visibility preference (default shown) SHALL let the player hide the band in BOTH contexts, and the choice SHALL survive page reloads. The band's visibility SHALL be controlled by (a) an **on-band minimize control (`−`)** that collapses the band — this control SHALL render in **BOTH contexts** (the full homepage band AND the compact QuizModal band), so the player can collapse the animation while reading on the homepage AND while answering in the QuizModal, on desktop and mobile — and (b) when collapsed, a **slim in-place restore handle (`＋ 展開遠征動畫`)** rendered where the band was, that re-shows it on click; this restore handle SHALL ALSO render in **BOTH contexts**, so a collapse is always reversible on-screen without opening the Help menu. The Help menu SHALL additionally offer a restore control (redundant convenience). There SHALL NOT be a persistent show/hide toggle while the band is shown (the band auto-plays at the right moments, so an always-visible toggle is redundant; the `−` collapses, the in-place `＋ 展開` handle restores). The on-band control's glyph SHALL be a **minimize `−`** (NOT a close `×`) so it reads as a restorable collapse rather than a permanent dismiss; the in-place restore handle SHALL use a **`＋` (expand)** affordance, forming a minimize/restore pair; the Help-menu copy SHALL describe the control consistently as a 收合 (collapse) affordance with a 展開 (expand) restore. The persisted visibility preference SHALL be **reactive within the tab**: a change written by any surface (an on-band `−` hide, or the Help-menu restore) SHALL be reflected **live** by every currently-mounted band — without requiring a remount or page reload — so restoring the band from the Help menu while a QuizModal (or the homepage band) is open shows it again immediately, and hiding it via one band hides it everywhere at once. When the OS requests reduced motion (`prefers-reduced-motion: reduce`), the band SHALL freeze to a static scene regardless of the preference. Visibility wording SHALL use show/hide ("遠征動畫 顯示/隱藏") rather than start/stop, because the underlying journey is always running and cannot be paused.

#### Scenario: Homepage band auto-plays while reading
- **WHEN** the player starts a reading session on the maze homepage (reading-timer status becomes `reading`) and the band is not hidden
- **THEN** the band animates; when reading pauses/stops, the band returns to a static scene

#### Scenario: Quiz band auto-plays during a session
- **WHEN** the player opens `QuizModal` and the band is not hidden
- **THEN** the compact band animates in the upper background for the duration of the session

#### Scenario: Hide choice persists across reloads and both contexts
- **WHEN** the player hides the band (via the on-band `−` in either context, or the Help-menu control) and then reloads the page
- **THEN** the band stays hidden on both the homepage and in QuizModal, and the persisted state records it as hidden

#### Scenario: On-band collapse leaves an in-place restore handle (both contexts)
- **WHEN** the player collapses the band via the on-band minimize control (`−`) in either context
- **THEN** the band is collapsed in both contexts and the persisted preference records it as hidden
- **AND** a slim in-place `＋ 展開遠征動畫` restore handle SHALL render where the band was, in that context
- **AND** activating the in-place restore handle (or the Help-menu restore control) SHALL re-show the band
- **AND** there is no always-visible show/hide toggle while the band is shown

#### Scenario: Compact quiz band carries its own on-band collapse control
- **WHEN** the player opens `QuizModal` with the band not hidden, on either a desktop or a mobile viewport
- **THEN** the compact band SHALL render a top-right on-band `−` control that is clickable and keyboard-focusable
- **AND** activating it SHALL collapse the band, persist the hidden preference, and reveal the in-place `＋ 展開` restore handle

#### Scenario: In-place restore handle re-shows the band live
- **GIVEN** the band is collapsed and the player has a QuizModal open (or the homepage band mounted)
- **WHEN** the player clicks the in-place `＋ 展開遠征動畫` restore handle (or the Help-menu restore control)
- **THEN** the compact QuizModal band (and the homepage band, if mounted) SHALL reappear immediately, without a remount or page reload
