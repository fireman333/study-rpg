## MODIFIED Requirements

### Requirement: Slots SHALL be grouped by family with family-filter chips defaulting to all-shown

The dex SHALL group the player's **collected variants** into one section per neuron family (each section a labelled row of that family's collected variant cards; a family with zero collected variants renders its header with no cards). A family-filter chip bar (mirroring the `YearFilterBar` pixel-chip pattern; neurons-tw has no shared `.filter-bar` CSS) SHALL be present. With no chip narrowing applied, ALL families SHALL be shown. Selecting one or more chips SHALL narrow the view to those families; the chips SHALL act as additive narrowing, not a gate that hides everything by default. The chip bar SHALL NOT render a visible-family count (`X / N 科` or any other `X / N` readout) — it reads as a collection denominator (the dex hides catalog totals) and crowds the bar on narrow viewports; the 科別 label and the chips themselves are the bar's only contents.

#### Scenario: Default view shows all families

- **WHEN** the collection page first renders with no filter chip narrowing applied
- **THEN** all 11 family sections SHALL be visible (each showing only its collected cards)

#### Scenario: Selecting a family chip narrows to that family

- **GIVEN** the player narrows to only the `藥理學` family chip
- **THEN** only the `藥理學` section SHALL be shown
- **AND** restoring all chips SHALL show all families again

#### Scenario: Chip bar carries no visible-count readout

- **WHEN** the family-filter chip bar renders (any narrowing state)
- **THEN** no `X / N 科` (or other `X / N`) visible-family count SHALL appear in the bar
- **AND** the bar SHALL contain only the 科別 label, the 全部 chip, and the per-family chips

### Requirement: The collection page SHALL be responsive desktop-to-mobile

The dex slot grid SHALL use an intrinsic auto-fill column track (`repeat(auto-fill, minmax(150px, 1fr))`, matching the shipped `DmnCollectionPage`) so column count reflows with available width — more columns on desktop, progressively fewer on narrow viewports (down to 1–2 columns on phones). The filter chip bar SHALL let its chips **flow freely into as many rows as needed** (free wrap — there SHALL be no artificial maximum-row cap, no horizontal scrolling, and no overflow clipping of chips) and SHALL remain usable at mobile widths; the bar's 科別 label SHALL top-align against a multi-row chip block (not float at its vertical center).

#### Scenario: Slot grid reflows fewer columns as viewport narrows

- **GIVEN** the collection page renders across desktop and phone widths
- **THEN** the slot grid SHALL show several columns on desktop (e.g. ≥ 4 at ≥ 768px) and reflow to 1–2 columns on phone widths (≤ 414px)
- **AND** the filter chip bar SHALL wrap and remain usable at mobile widths

#### Scenario: Filter chips wrap freely into multiple rows on narrow viewports

- **WHEN** the collection page renders at a phone width (≤ 414px) where the 12 chips (全部 + 11 families) cannot fit in two rows
- **THEN** the chips SHALL flow into as many rows as needed (three or more), with every chip fully visible
- **AND** no chip SHALL be clipped, horizontally scrolled, or hidden by a row cap
- **AND** the 科別 label SHALL top-align with the first chip row
