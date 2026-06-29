## ADDED Requirements

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

Each collected variant card on `/collection` SHALL render a **squad toggle** (`SquadCardAction`) in its top-right corner that is **always visible** (no separate「編輯隊伍」mode is required). The toggle SHALL reflect membership: **「＋加入隊伍」** when the variant is collected and the squad is below `MAX_SQUAD_SIZE` and not yet a member; **「✓已入隊」** (activating it removes the member) when the variant is already a squad member; and a **disabled「隊伍已滿」** state when the squad is full and this variant is not a member. Activating「＋加入隊伍」SHALL append the variant's key to `activeSquad.members` (stamping `updatedAt`) and the top `SquadManager` SHALL update live. The squad toggle (a **global, cross-family** selection, placed top-right) SHALL be visually distinct from the per-family **「設為代表」** representative control (which stays in its existing position and framing) so the two are not conflated. Only currently-collected variants MAY be added; adding an uncollected variant SHALL be a no-op.

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
- **THEN** the toggle shows a disabled「隊伍已滿」state
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
