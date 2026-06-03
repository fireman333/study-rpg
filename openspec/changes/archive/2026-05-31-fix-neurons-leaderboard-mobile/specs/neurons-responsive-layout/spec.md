## ADDED Requirements

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
