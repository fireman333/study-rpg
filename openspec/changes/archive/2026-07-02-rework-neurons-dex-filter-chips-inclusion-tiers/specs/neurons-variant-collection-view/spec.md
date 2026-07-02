# neurons-variant-collection-view (delta)

## MODIFIED Requirements

### Requirement: Slots SHALL be grouped by family with family-filter chips defaulting to all-shown

The dex SHALL group the player's **collected variants** into one section per neuron family (each section a labelled row of that family's collected variant cards; with no 稀有度 narrowing applied, a family with zero collected variants renders its header with no cards). A 科目 family-filter chip bar SHALL be present, styled as the 收藏 tab's labelled filter card (a 「依科目篩選」 header above a wrapping chip row) and using the **inclusion model** shared with 收藏 / 題庫: with NO chips selected (the default), ALL families SHALL be shown and the leading 「全部」 chip reads as active; selecting one or more family chips SHALL narrow the view to exactly those families (additive multi-select), and activating 「全部」 SHALL clear the selection back to all-shown. Selecting a chip SHALL NOT hide that family (no exclusion model). Each family chip SHALL carry that subject's own accent color (`Subject.color`) — solid color fill when included, dashed outline of the same color when excluded — and the 「全部」 chip SHALL use the shared gold accent. The chip bar SHALL NOT render a visible-family count (`X / N 科` or any other `X / N` readout) — it reads as a collection denominator (the dex hides catalog totals) and crowds the bar on narrow viewports; the bar's header label and the chips themselves are its only contents.

#### Scenario: Default view shows all families

- **WHEN** the collection page first renders with no filter chip selected
- **THEN** all 11 family sections SHALL be visible (each showing only its collected cards)
- **AND** the 「全部」 chip SHALL read as the active selection

#### Scenario: Selecting a family chip narrows to that family

- **GIVEN** the player selects only the `藥理學` family chip
- **THEN** only the `藥理學` section SHALL be shown and the 「全部」 chip SHALL release
- **AND** activating 「全部」 SHALL show all families again

#### Scenario: Chips carry per-subject accent colors

- **WHEN** the 科目 chip bar renders
- **THEN** each family chip SHALL use that subject's `Subject.color` — solid fill when included, dashed outline when excluded

#### Scenario: Chip bar carries no visible-count readout

- **WHEN** the family-filter chip bar renders (any narrowing state)
- **THEN** no `X / N 科` (or other `X / N`) visible-family count SHALL appear in the bar
- **AND** the bar SHALL contain only its header label, the 全部 chip, and the per-family chips

### Requirement: The collection page SHALL be responsive desktop-to-mobile

The dex slot grid SHALL use an intrinsic auto-fill column track (`repeat(auto-fill, minmax(150px, 1fr))`, matching the shipped `DmnCollectionPage`) so column count reflows with available width — more columns on desktop, progressively fewer on narrow viewports (down to 1–2 columns on phones). Both filter chip bars (科目 and 稀有度) SHALL let their chips **flow freely into as many rows as needed** (free wrap — there SHALL be no artificial maximum-row cap, no horizontal scrolling, and no overflow clipping of chips) and SHALL remain usable at mobile widths; each bar's header label sits on its own row above the chips, so it never floats at the vertical center of a multi-row chip block.

#### Scenario: Slot grid reflows fewer columns as viewport narrows

- **GIVEN** the collection page renders across desktop and phone widths
- **THEN** the slot grid SHALL show several columns on desktop (e.g. ≥ 4 at ≥ 768px) and reflow to 1–2 columns on phone widths (≤ 414px)
- **AND** both filter chip bars SHALL wrap and remain usable at mobile widths

#### Scenario: Filter chips wrap freely into multiple rows on narrow viewports

- **WHEN** the collection page renders at a phone width (≤ 414px) where a bar's chips (全部 + 11 families, or 全部 + 6 tiers) cannot fit in two rows
- **THEN** the chips SHALL flow into as many rows as needed (three or more), with every chip fully visible
- **AND** no chip SHALL be clipped, horizontally scrolled, or hidden by a row cap

## ADDED Requirements

### Requirement: The dex SHALL provide a 稀有度 (P0–P5) filter bar composing with the 科目 filter

Below the 科目 bar the dex SHALL render a second 收藏-style filter bar (「依稀有度篩選」) with one chip per rarity tier in apex-first order — `P0 始源`, `P1 夯`, `P2 頂級`, `P3 人上人`, `P4 NPC`, `P5 拉完了` — using the same **inclusion model** (no selection = all rarities; selecting chips narrows to those tiers; a leading gold 「全部」 chip clears). Each tier chip SHALL carry that tier's accent color (the dex's `RARITY_COLOR`) — solid fill when included, dashed outline when excluded. The two bars SHALL compose as AND: a card renders only when its family passes the 科目 filter and its rarity passes the 稀有度 filter. While a 稀有度 narrowing is active, a family whose collected cards all fail the tier filter SHALL be hidden entirely (no empty header), and each family's fusion (tier-promote) buttons SHALL be narrowed to the shown tiers; when the combined filters match nothing, the page SHALL show an explanatory empty hint (not a blank page). The 稀有度 bar SHALL NOT render any `X / N` count readout.

#### Scenario: Narrowing to one tier shows only matching cards

- **GIVEN** a player who owns P1 and P3 variants across several families
- **WHEN** they select only the `P1 夯` chip
- **THEN** only cards of rarity P1 SHALL render, families with no held P1 SHALL be hidden (no empty headers), and fusion buttons for other tiers SHALL NOT show

#### Scenario: 科目 and 稀有度 filters compose

- **WHEN** the player selects the `藥理學` family chip and the `P5 拉完了` tier chip
- **THEN** only 藥理學's held P5 cards SHALL render

#### Scenario: Tier chips carry tier accent colors

- **WHEN** the 稀有度 chip bar renders
- **THEN** each tier chip SHALL use its rarity accent color — solid fill when included, dashed outline when excluded

#### Scenario: Zero-match filter state shows an empty hint

- **WHEN** the active 科目 + 稀有度 combination matches no held card
- **THEN** the page SHALL render an explanatory empty hint inviting the player to adjust the filters (not a blank family list)
