# neurons-variant-collection-view Specification

## Purpose

The `/collection` dex page for neurons-tw: a persistent surface to browse collected neuron variants. Open-ended — it renders ONLY the variants the player has collected (no uncollected silhouettes, no pre-shown rarity, no catalog-sized slot grid), grouped by family, with family-filter chips that default to all-shown. The finite catalog total is hidden from the player (no `X / N`, no 全部收集); counts render as pure counts (`🧬 X 隻`). Each collected card surfaces sprite / name / rarity / description / pity chip plus a reserved caption row that a later capability fills with provenance. A per-family pull control (study-earned neural energy) never disables on completion — a fully-collected family yields a dupe. The player may pick one collected variant per family as that family's representative, persisted in a `meta` key and synced cross-device (last-write-wins). This page is the prerequisite browse surface for `add-neurons-variant-provenance`.
## Requirements
### Requirement: A dedicated /collection route SHALL exist with a single navbar entry

The neurons mode SHALL register a `/collection` route rendering the variant dex page, reachable from exactly one navbar `NavLink` — the 圖鑑 group tab (alongside the 腦圖 / 收藏 / 題庫 / 社群 tabs, per `neurons-mode`'s five-tab consolidated navigation). Within the 圖鑑 group the page is the 神經元圖鑑 sub-tab (siblings: DMN / 成就). The page SHALL NOT be embedded inside the connectome homepage.

#### Scenario: Navbar link navigates to the collection page

- **WHEN** the player clicks the 圖鑑 navbar tab
- **THEN** the app SHALL navigate to `/collection`
- **AND** the variant dex page SHALL render under the 神經元圖鑑 sub-tab

#### Scenario: Direct navigation to /collection renders the dex

- **WHEN** the player loads `/collection` directly (fresh navigation or reload)
- **THEN** the variant dex page SHALL render without redirecting away

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

### Requirement: Each collected variant card SHALL show sprite, name, rarity, description, pity chip, and a reserved caption row

A collected card SHALL display the variant's sprite, `displayName`, rarity badge, the
catalog `description`, a `× N` copies badge when `copies > 1`, and a `保底` chip when
`wasPityFloor` is true (now meaning a P0 obtained via soft-pity). The card SHALL
include the reserved single-line caption row (filled by the provenance capability).
The card SHALL NOT show a slot-number label.

#### Scenario: Collected card renders baseline fields plus reserved caption row

- **GIVEN** a collected variant with `copies = 1` and `wasPityFloor = false`
- **WHEN** its card renders
- **THEN** the card SHALL show the sprite, `displayName`, rarity badge, and description
- **AND** include an empty reserved caption row, with no `× N` badge and no `保底` chip

#### Scenario: Duplicate count surfaces on the card

- **GIVEN** a collected variant with `copies = 3`
- **WHEN** its card renders
- **THEN** the card SHALL show a `× 3` copies badge

#### Scenario: P0 pity variant shows the 保底 chip

- **GIVEN** a collected P0 variant with `wasPityFloor = true`
- **WHEN** its card renders
- **THEN** the card SHALL show a `保底` chip

### Requirement: The player SHALL be able to set one representative variant per family, persisted and validated

The page SHALL let the player select one collected variant per family as that family's representative. The selection SHALL persist in a `meta` key (`representativeVariants`, a map `familyId → slotIndex`). Setting a representative SHALL be rejected (no-op) if that `(familyId, slotIndex)` is not collected. The current representative SHALL be visually marked on its card. A stored representative pointing at a slot that is no longer collected SHALL be treated as absent at read time.

#### Scenario: Selecting a collected variant sets it as representative

- **GIVEN** the player has collected `(familyId='藥理學', slotIndex=2)`
- **WHEN** the player sets it as the `藥理學` representative
- **THEN** the `representativeVariants` meta key SHALL map `藥理學 → 2`
- **AND** that card SHALL show the representative marker

#### Scenario: Cannot set an uncollected slot as representative

- **GIVEN** the player has NOT collected `(familyId='藥理學', slotIndex=5)`
- **WHEN** a set-representative is attempted for `藥理學 → 5`
- **THEN** the write SHALL be rejected (no-op)
- **AND** the prior representative (if any) SHALL be unchanged

#### Scenario: Stale representative is treated as absent

- **GIVEN** `representativeVariants` maps `藥理學 → 3` but that variant is not in the collected set
- **WHEN** the page reads representatives
- **THEN** `藥理學` SHALL be treated as having no representative

### Requirement: Representative selection SHALL sync cross-device via the neurons R2 bundle with last-write-wins

The `representativeVariants` meta key SHALL be included in the neurons R2 bundle's synced meta-key allowlist. The bundle `SCHEMA_VERSION` SHALL bump from 5 to 6. The persisted value SHALL be a timestamped envelope (`{ map, updatedAt }`) reconciled **last-write-wins** by an `onPullComplete` post-pass (the generic meta adapter is first-write-wins, which is insufficient for an editable preference). Cross-version reads SHALL remain tolerant (a client at a higher `SCHEMA_VERSION` reading a lower-version bundle, or vice versa, SHALL NOT error; unknown keys are dropped, absent keys preserved), reusing the existing `validateBundleMeta` tolerance.

#### Scenario: Representative selection round-trips through sync (last-write-wins)

- **GIVEN** the player sets a representative and the neurons bundle is pushed
- **WHEN** the same account pulls on another device whose local value is older
- **THEN** the pulled state SHALL reconcile to the newer `representativeVariants` mapping

#### Scenario: Older client tolerates the v6 bundle

- **GIVEN** a client at `SCHEMA_VERSION = 5` reads a bundle at `SCHEMA_VERSION = 6`
- **WHEN** the bundle is validated
- **THEN** no error SHALL be raised
- **AND** the unknown `representativeVariants` key SHALL be dropped by that older client without breaking the pull

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

### Requirement: The collection page SHALL display the neural-energy balance and provide a per-family pull control

The `/collection` page SHALL show the current neural-energy **balance** (earned −
spent) in a header HUD that updates live. Each family section SHALL provide a **pull**
control labeled with the `PULL_COST`. The control SHALL be disabled **only** when the
balance is below `PULL_COST`. The control SHALL NOT be disabled when the family is
fully collected — pulling a fully-collected family is permitted and yields a duplicate
(there SHALL be no 全部收集 disabled state). Activating the control SHALL invoke
`pullVariant(familyId)` and surface the pull reveal.

#### Scenario: Balance HUD reflects current energy

- **GIVEN** `neuralEnergyEarned = 50` and `neuralEnergySpent = 20`
- **WHEN** the collection page renders
- **THEN** the balance HUD SHALL show `30`

#### Scenario: Pull control disabled below cost

- **GIVEN** the balance is below `PULL_COST`
- **WHEN** the page renders a family's pull control
- **THEN** the control SHALL be disabled

#### Scenario: Pull control stays enabled when family fully collected

- **GIVEN** every variant of a family is collected AND the balance ≥ `PULL_COST`
- **WHEN** the page renders that family's pull control
- **THEN** the control SHALL remain enabled (no 全部收集 disabled state)
- **AND** activating it SHALL perform a pull that yields a duplicate

#### Scenario: Activating the control performs a pull

- **GIVEN** the balance ≥ `PULL_COST`
- **WHEN** the player activates the pull control for that family
- **THEN** `pullVariant(familyId)` SHALL be invoked and the pull reveal SHALL surface

### Requirement: The collection page SHALL render only collected variants and hide the catalog total

The `/collection` dex SHALL render **only the variants the player has collected** (the `neuronVariants` rows). It SHALL NOT render uncollected slots as silhouettes, SHALL NOT pre-show the rarity of un-pulled variants, and SHALL NOT size any grid to the catalog's per-family slot count. The page SHALL NOT display a denominator, progress bar, `X / N`, `100%`, or 全部收集 anywhere — the finite catalog total (77) SHALL be invisible to the player. A collection总覽 / count chip SHALL render as a **pure count** (`🧬 X 隻`), never `🧬 X / N`. Collected cards SHALL still display their own rarity (knowledge earned by pulling). An empty collection SHALL NOT leave the page blank — the energy HUD, family headers, and pull controls SHALL still render.

#### Scenario: Only collected variants render; no silhouettes

- **GIVEN** the player has collected 3 variants in `藥理學` whose pyramid total is 7
- **WHEN** the collection page renders the 藥理學 section
- **THEN** exactly 3 collected cards SHALL render
- **AND** no silhouette / dimmed placeholder / rarity-labeled empty slot SHALL render for the 4 uncollected ones

#### Scenario: No denominator or completion indicator is shown

- **WHEN** the collection page renders with any number of collected variants
- **THEN** no `X / N`, progress bar, `100%`, or 全部收集 indicator SHALL appear
- **AND** any count chip SHALL read `🧬 X 隻` (pure count, no denominator)

#### Scenario: Empty collection renders a non-blank page

- **GIVEN** the player has collected zero variants
- **WHEN** the page renders
- **THEN** the energy balance HUD, the family headers, and the per-family pull controls SHALL still render
- **AND** no silhouette dex SHALL be shown

### Requirement: The collection page SHALL host the 遠征隊 squad manager at the top of the page

The `/collection` page SHALL render a **遠征隊 (active squad) manager** (`SquadManager`) as a fixed section at the **top of the page, above the family-grouped dex**. The manager SHALL present a row of exactly `MAX_SQUAD_SIZE` slots plus a current-count readout (e.g. `3 / 5`). A **filled** slot SHALL show its member's `VariantSprite` + `displayName` + rarity badge + a remove (`×`) control. An **empty** slot SHALL show a dashed-frame placeholder labelled「選擇神經元」. Removing a member from a slot SHALL drop that key from `activeSquad.members` and stamp `updatedAt` (reusing the existing squad mutation). Members whose variant key is no longer collected SHALL be filtered at read time so no broken slot renders. This manager is the editing home for the squad; the homepage hosts only a read-only preview (per `neurons-study-squad`). The manager SHALL be responsive (the slot row wraps / horizontally reflows on narrow viewports, with each slot remaining legibly sized).

#### Scenario: Squad manager renders 5 slots with a count
- **WHEN** the `/collection` page renders with 3 collected variants in the active squad
- **THEN** a `SquadManager` renders at the top of the page above the dex, showing 3 filled slots (sprite + name + rarity + remove ×), 2 empty「選擇神經元」slots, and a `3 / 5` count

#### Scenario: Removing a member from a slot
- **WHEN** the player activates the remove (`×`) control on a filled slot
- **THEN** that member is dropped from `activeSquad.members` and `updatedAt` is stamped
- **AND** the slot reverts to the empty「選擇神經元」state and the count decrements

#### Scenario: Stale member is filtered in the manager
- **WHEN** `activeSquad` references a variant key that is no longer collected
- **THEN** the manager renders that slot as empty (the stale key is filtered), not a broken element

### Requirement: Each collected card SHALL carry an always-visible squad toggle distinct from the representative control

Each collected variant card on `/collection` SHALL render a **squad toggle** (`SquadCardAction`) in its top-right corner that is **always visible** (no separate「編輯隊伍」mode is required). The toggle SHALL reflect membership: **「＋加入隊伍」** when the variant is collected and the squad is below `MAX_SQUAD_SIZE` and not yet a member; **「✓已入隊」** (activating it removes the member) when the variant is already a squad member; and a **disabled-styled「隊伍已滿」** state when the squad is full and this variant is not a member. Activating「＋加入隊伍」SHALL append the variant's key to `activeSquad.members` (stamping `updatedAt`) and the top `SquadManager` SHALL update live. The squad toggle (a **global, cross-family** selection, placed top-right) SHALL be visually distinct from the per-family **「設為代表」** representative control (which stays in its existing position and framing) so the two are not conflated. Only currently-collected variants MAY be added; adding an uncollected variant SHALL be a no-op.

#### Scenario: Adding a variant to the squad from its card
- **GIVEN** the squad has fewer than `MAX_SQUAD_SIZE` members and a collected card is not yet a member
- **WHEN** the player activates that card's「＋加入隊伍」toggle
- **THEN** the variant's key is appended to `activeSquad.members`, `updatedAt` is stamped, and the top `SquadManager` shows it in a filled slot

#### Scenario: Removing a variant from its card
- **GIVEN** a collected card whose variant is already a squad member (toggle shows「✓已入隊」)
- **WHEN** the player activates the toggle
- **THEN** the variant is removed from `activeSquad.members` and the toggle reverts to「＋加入隊伍」

#### Scenario: Full squad disables non-member add controls
- **GIVEN** the squad already holds `MAX_SQUAD_SIZE` members
- **WHEN** a non-member card renders its toggle
- **THEN** the toggle shows a「隊伍已滿」state
- **AND** attempting to add a 6th member surfaces a「最多 5 隻，先移除一隻」hint (not a silent no-op)

#### Scenario: Squad toggle is visually separated from the representative control
- **WHEN** a collected card renders both its squad toggle and its「設為代表」representative control
- **THEN** the squad toggle is in the card's top-right (global selection) and the representative control stays in its existing per-family position, so the two actions are not conflated

### Requirement: The collection page SHALL accept a squad deep-link that scrolls the manager into view

The `/collection` route SHALL recognize a `?squad=1` query parameter and, on arrival, scroll the `SquadManager` section into view (so the homepage「到圖鑑編隊 →」link lands the player on the squad editor). Absent the parameter, the page SHALL render normally with the manager at the top in its default scroll position.

#### Scenario: Deep-link scrolls to the squad manager
- **WHEN** the player navigates to `/collection?squad=1`
- **THEN** the `SquadManager` section is scrolled into view on arrival

#### Scenario: Normal navigation does not force-scroll
- **WHEN** the player navigates to `/collection` without the `squad` parameter
- **THEN** the page renders normally with the manager at the top and no forced scroll

