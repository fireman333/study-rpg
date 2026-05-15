# dorm-view Specification

## Purpose
TBD - created by archiving change add-cosmetic-and-dorm. Update Purpose after archive.

## Requirements

### Requirement: Dorm view route renders character with cosmetic overlay

The system SHALL provide a `/dorm` React Router route that renders:
- The player's base character sprite (sprite key from `player.characterSpriteKey` or default `'character-base'`) at canvas center
- A background layer using `equipment['cosmetic-background']`'s sprite if set, else the default dorm background sprite key `'dorm-default'`
- 4 cosmetic overlay layers stacked above the character: body, head, accessory, held — only rendered for cosmetic slots that have an equipped item

Layer z-index ordering (bottom → top):
1. background (z-index: 0)
2. character-base (z-index: 1)
3. cosmetic-body (z-index: 2)
4. cosmetic-head (z-index: 3)
5. cosmetic-accessory (z-index: 4)
6. cosmetic-held (z-index: 5)

#### Scenario: Empty equipment shows base character on default background

- **WHEN** the player has no cosmetic equipment set
- **THEN** the dorm view SHALL render only the base character sprite over the `dorm-default` background
- **AND** no cosmetic layer SHALL appear

#### Scenario: Equipped cosmetic renders as transparent overlay

- **WHEN** the player has `equipment['cosmetic-head']` set to a glasses cosmetic
- **THEN** the dorm view SHALL render the glasses sprite at z-index 3, positioned at the same canvas coordinates as the character-base sprite (aligned on top)
- **AND** the glasses sprite's transparent areas SHALL show the base character beneath

### Requirement: Dorm view exposes a 装扮間 picker for cosmetic equip / unequip

The `/dorm` route SHALL include a "裝扮間" (changing room) section listing all entries from `COSMETIC_CATALOG`, grouped by category (head / body / accessory / held / background). For each entry:
- **Unlocked** (cosmetic in player.inventory): full-color sprite + name + "穿上" / "脫下" button reflecting current equip state
- **Locked**: silhouette (CSS `filter: brightness(0)` or equivalent) + "?" overlay + unlock condition description text

Clicking "穿上" SHALL invoke `equipCosmetic` and persist. Clicking "脫下" SHALL invoke `unequipCosmetic`. Clicking a locked entry SHALL show a tooltip with the unlock condition (no equip action).

#### Scenario: Unlocked cosmetic shows equip button

- **WHEN** a cosmetic's `unlockCondition(player) === true` AND its `ItemInstance` exists in `player.inventory`
- **THEN** the picker SHALL render the full-color sprite + name + a button labeled "穿上" (if not equipped) or "脫下" (if equipped in matching slot)

#### Scenario: Locked cosmetic shows silhouette with unlock hint

- **WHEN** a cosmetic's `unlockCondition(player) === false`
- **THEN** the picker SHALL render a silhouette (brightness 0) + "?" overlay
- **AND** the caption SHALL display `cosmetic.unlockDescription` (e.g. "達 level 5 解鎖")
- **AND** clicking SHALL NOT trigger equipCosmetic

#### Scenario: Picker is categorized

- **WHEN** the picker mounts
- **THEN** entries SHALL be grouped under 5 category headers in this order: head / body / accessory / held / background
- **AND** each category SHALL show a header label like "頭飾" / "身體" / "配飾" / "持物" / "背景"

### Requirement: Dorm view has no game mechanics (display only)

The `/dorm` route SHALL NOT trigger any XP gain, stat increase, streak update, SRS card creation, or other gameplay state mutation aside from cosmetic equip / unequip operations. Time spent on the dorm view SHALL NOT affect `todayProgress.readingMinutes` or `todayProgress.questionsAnswered`.

#### Scenario: Time on dorm does not increase reading minutes

- **WHEN** the player navigates to `/dorm` and stays for 10 minutes
- **THEN** `player.todayProgress.readingMinutes` SHALL NOT change as a result of dorm view time
- **AND** any reading-loop timer SHALL pause for the duration of `/dorm` (per existing mock-exam reading-loop gate pattern)

#### Scenario: Equip / unequip do not affect stats

- **WHEN** the player equips or unequips any cosmetic
- **THEN** `effectiveStats(player, instances, catalog)` SHALL produce the same result as before the equip
- **AND** no `applyXp` / `addStat` call SHALL be triggered by the equip itself

### Requirement: Home view CharCard does not display cosmetics

The existing `CharCard` component in the home view SHALL continue to render only the base character sprite + 4 functional equipment slots. Cosmetic equipment SHALL NOT appear in `CharCard`. Cosmetic visualization SHALL be exclusive to the `/dorm` route.

#### Scenario: Home view ignores cosmetic equipment

- **WHEN** the home view renders with the player having cosmetic items equipped
- **THEN** `CharCard` SHALL NOT show cosmetic sprites
- **AND** the 4-slot equipment grid SHALL only display functional `equipment.head` / `equipment.body` / `equipment.weapon` / `equipment.charm` items

### Requirement: Dorm entry button on home view

The home view SHALL include a "🏠 宿舍" button that navigates to `/dorm`. The button SHALL be always enabled (no gating, no level requirement) — players can visit dorm from session 1.

#### Scenario: Dorm button always enabled

- **WHEN** the home view renders
- **THEN** the "🏠 宿舍" button SHALL be present and enabled
- **AND** clicking it SHALL navigate to `/dorm`
