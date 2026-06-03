## Context

`LeaderboardPage.tsx` styles its rows with inline `headerRowStyle` / `dataRowStyle` objects, both hardcoding `gridTemplateColumns: '3rem 1fr 4rem 4rem 5rem 4.5rem 5.5rem'`. Inline styles win over external CSS, so an `@media` rule alone can't override the column template — the responsive property must leave the inline object (same crux as `add-neurons-mobile-rwd`). 二階 (`apps/medexam2-hospital-tw`) already solved the identical problem: its leaderboard is fully class-based with a `--leaderboard-cols` CSS variable that a mobile `@media` retunes (`52px minmax(80px,1fr) 64px 64px`) plus `display:none` on the off-screen stat cells. This change ports that pattern to neurons.

## Goals / Non-Goals

**Goals:**
- Leaderboard row fits a 375px phone (no horizontal overflow) when populated.
- On ≤480px show `# + 暱稱 + only the currently-sorted stat`; switching filter tab swaps the visible stat.
- Desktop (≥480px) pixel-identical to today (7 columns).
- Reuse 二階's `--*-cols` var + cell-hiding pattern for cross-app consistency.

**Non-Goals:**
- bookmarks / achievements / connectome (already mobile-safe).
- card / horizontal-scroll layouts (rejected).
- Any data / fetch / Worker / filter-logic change.
- 320px support.

## Decisions

### Decision 1: Responsive grid lives in CSS via `--neurons-lb-cols`, inline `gridTemplateColumns` is removed

Inline `style={dataRowStyle}` beats any `.neurons-lb-row` CSS rule, so `@media` can't retune it. Give the rows a `className`, express the grid in `styles.css` as `grid-template-columns: var(--neurons-lb-cols)`, define `--neurons-lb-cols` (desktop base) on the list, and **delete** `gridTemplateColumns` from `headerRowStyle` / `dataRowStyle` (their other props — gap, padding, fontSize, etc. — stay inline). `@media (max-width:480px)` then only needs to reassign `--neurons-lb-cols`.

- **Alternative rejected**: keep inline + `!important` everywhere — brittle specificity war; removing the inline prop is clean (same conclusion as the nav change).

### Decision 2: Mobile shows only the active-sorted stat via `data-active-stat` + cell classes

neurons already derives the active column from `FILTER_PRIMARY_STAT[activeFilter]` (a total `Record<LeaderboardFilter, keyof LeaderboardRow>`, so every tab — incl. `composite` — maps to a stat). Set `data-active-stat={FILTER_PRIMARY_STAT[activeFilter]}` on the list container. Give each stat cell a class (`.neurons-lb-cell--variant` / `--family` / `--ap` / `--synapse` / `--study`). In `@media (max-width:480px)`:
- `--neurons-lb-cols` → `2.6rem minmax(0,1fr) 4.5rem` (rank + nickname + one stat).
- Hide all stat cells: `.neurons-lb-cell--variant, … { display:none }`.
- Re-show the active one via attribute selector: `.neurons-lb-list[data-active-stat="variant_count"] .neurons-lb-cell--variant { display:flex }` (one rule per filter→cell mapping).
- Apply the same hide/show to BOTH the header row and data rows so labels stay aligned.

- **Alternative rejected**: show a fixed 2 stats regardless of sort — less informative; the active-stat approach mirrors 二階 and reuses an existing hook.

### Decision 3: Breakpoint 480px, desktop unchanged

Single `@media (max-width:480px)` (matches the nav change's mobile breakpoint). ≥480px keeps the full 7-col `--neurons-lb-cols` base, so desktop + tablet are untouched. No 768 split needed (the row already fits ≥480px).

### Decision 4: Verification uses fabricated rows (prod is empty)

Prod has 0 ranked players → the populated row never renders live. Verify with the Chrome MCP class-override clone probe **fabricating ≥1 mock `.neurons-lb-row`** (clone the header row, fill stat cells with sample numbers), or by temporarily seeding the snapshot in dev. Assert: at 375px the row's `scrollWidth ≤ contentBox`; only rank+nickname+active-stat cells have non-`none` display; switching `data-active-stat` changes which stat shows; at 1024px all 7 cells visible. Per `chrome_mcp_rwd_probe.md`, use class-override (not `resize_window`).

## Risks / Trade-offs

- **[Inline grid silently wins]** → Decision 1: delete the inline `gridTemplateColumns`; confirm via `getComputedStyle(row).gridTemplateColumns` reflecting the CSS value.
- **[Header/data misalignment if only one collapses]** → apply identical `--neurons-lb-cols` + cell-hiding to header AND data rows (both currently share the same template string).
- **[`composite` filter maps to a stat that's also a visible column]** → `FILTER_PRIMARY_STAT['composite']` already resolves to a real `LeaderboardRow` key; confirm at apply which column it is and that the attribute-selector rule covers it.
- **[Can't verify on live data]** → Decision 4 fabricated-row probe; note in tasks that prod re-check waits until the leaderboard has a ranked player.
- **[Scope creep into bookmarks]** → hard out-of-scope; bookmarks confirmed safe.

## Migration Plan

1. Read 二階 `styles.css` ~5747–5920 for the exact `--leaderboard-cols` + cell-hiding shape.
2. Add `.neurons-lb-list` / `.neurons-lb-row` / `.neurons-lb-row--header` / `.neurons-lb-cell--*` classes + `--neurons-lb-cols` base + `@media (max-width:480px)` collapse to `styles.css`.
3. In `LeaderboardPage.tsx`: add the classNames + per-stat cell classes + `data-active-stat`; delete `gridTemplateColumns` from `headerRowStyle` / `dataRowStyle`.
4. Verify with fabricated rows at 375 / 1024 (Decision 4); typecheck + build; `validate --strict`.

**Rollback**: restore the two inline `gridTemplateColumns` props + drop the new CSS classes. Pure-additive otherwise.

## Open Questions

- Exact `FILTER_PRIMARY_STAT['composite']` target column — resolve by reading lines 49–56 at apply (decides one attribute-selector rule).
- Whether the my-rank sticky row (if neurons has one like 二階's `--me-sticky`) needs the same treatment — check at apply; if present, give it the same `--neurons-lb-cols` + cell classes.
