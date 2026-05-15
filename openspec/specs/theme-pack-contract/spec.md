# theme-pack-contract Specification

## Purpose
TBD - created by archiving change lock-theme-pack-contract. Update Purpose after archive.
## Requirements
### Requirement: ThemePack root shape is fixed

The exported `ThemePack` type from `@study-rpg/core` SHALL be exactly:

```ts
interface ThemePack {
  meta: ThemePackMeta
  designMd: string
  cssVars: Record<string, string>
  fonts: FontDef[]
  sprites: Record<string, string>
  itemCatalog: Item[]
  uiOverrides?: Record<string, unknown>
}
```

Adding new optional fields is non-breaking. Removing or renaming any required field requires a delta proposal.

#### Scenario: Default theme conforms

- **WHEN** `@study-rpg/theme-pixel-medical` exports `THEME_PIXEL_MEDICAL`
- **THEN** the exported object SHALL have all 6 required keys (`meta`, `designMd`, `cssVars`, `fonts`, `sprites`, `itemCatalog`)
- **AND** `meta` SHALL satisfy `ThemePackMeta` (next requirement)

### Requirement: ThemePackMeta has required fields

`ThemePackMeta` SHALL contain at minimum:

| Field | Type | Required |
|---|---|---|
| `id` | `string` (e.g. `"theme-pixel-medical"`) | yes |
| `displayName` | `string` | yes |
| `style` | `'pixel' \| 'modern' \| 'manga' \| 'custom'` | yes |

#### Scenario: Style enum is exhaustive

- **WHEN** `ThemePackMeta.style` is set
- **THEN** it SHALL be one of the four declared literal values
- **AND** new style families require a delta proposal that adds to the union

### Requirement: sprites map must cover character + slot placeholders + all artKeys

`ThemePack.sprites` SHALL contain at minimum:

- One key matching the engine's default character key (`'character-base'`); themes MAY also ship variants per `character-system` spec
- Four slot-placeholder keys: `slot-placeholder-head`, `slot-placeholder-body`, `slot-placeholder-weapon`, `slot-placeholder-charm`
- One entry per distinct `artKey` referenced by any item in `theme.itemCatalog`

Values SHALL be string URLs resolvable in browser context (Vite `?url` import output, data URI, or static URL).

#### Scenario: Coverage check

- **WHEN** the engine boots and consults `theme.sprites`
- **THEN** every `theme.itemCatalog[].artKey` SHALL have a non-empty string value in `theme.sprites`
- **AND** `theme.sprites['character-base']` SHALL be a non-empty string
- **AND** `theme.sprites['slot-placeholder-head' | 'slot-placeholder-body' | 'slot-placeholder-weapon' | 'slot-placeholder-charm']` SHALL all be non-empty strings

#### Scenario: Missing key is a fatal boot error

- **WHEN** any required sprite key is missing or empty in `theme.sprites`
- **THEN** the engine SHALL log a console error during render
- **AND** the affected `<img>` SHALL fall back to a 1×1 transparent placeholder (no broken-image icon)

### Requirement: cssVars must be valid CSS custom properties

Every key in `theme.cssVars` SHALL start with `--` and the value SHALL be a syntactically valid CSS token (color / length / font-family / etc.). The host app SHALL inject these as `:root { --key: value; ... }` at boot.

#### Scenario: Variable naming convention

- **WHEN** `theme.cssVars` is iterated
- **THEN** every key SHALL match the regex `^--[a-z][a-z0-9-]*$`
- **AND** values SHALL be non-empty strings

### Requirement: designMd embeds the theme's DESIGN.md as a string

`ThemePack.designMd` SHALL contain the verbatim markdown content of the theme's `DESIGN.md` file, embedded at build time. This lets the engine display theme-specific style guidance to AI agents (e.g. for future custom UI overrides) without resolving filesystem paths at runtime.

#### Scenario: Build-time inline

- **WHEN** the theme package's build emits `dist/index.js` (or the source consumes a `?raw` import)
- **THEN** `theme.designMd` SHALL be a string containing at minimum the headings of `DESIGN.md` (e.g. tokens table, color palette, font usage, sprite style anchor)
- **AND** SHALL NOT be a path or URL pointing to the file

### Requirement: Theme/content cross-reference invariants

The theme's `itemCatalog` SHALL satisfy:

- Every item's `slot` SHALL be one of the engine's declared `EquipSlot` enum values (`'head' | 'body' | 'weapon' | 'charm' | 'consumable'`)
- Every item's `rarity` SHALL be one of `'N' | 'R' | 'SR' | 'SSR' | 'UR'`
- Every item's `artKey` SHALL resolve in `theme.sprites` (see "sprites map" requirement)
- Every item's `effects[]` SHALL contain at least one `stat` or `multiplier` entry (no empty-effect items)

#### Scenario: Theme bootstrap check at boot time

- **WHEN** the engine resolves `theme.itemCatalog` at boot
- **THEN** all four invariants above SHALL hold
- **AND** violations SHALL fail loudly in console (theme pack bug), not silently drop the item from loot pool

#### Scenario: Cross-theme portability check

- **WHEN** an app swaps theme (e.g. `theme-pixel-medical` → a future `theme-modern-medical`)
- **THEN** as long as both themes ship `itemCatalog` satisfying these invariants, no engine code change SHALL be required
- **AND** existing `Player.equipment[slot] = <ItemInstanceId>` refs SHALL still resolve via the new catalog (provided item IDs are preserved across themes per `item-catalog` spec's stable ID rule)



### Requirement: Mentor-capable theme packs MAY expose mentor-* sprite keys

Theme packs that participate in `mentor-daily` mode MAY include optional sprite keys for the daily-mentor NPC. If included, the keys SHALL be named `mentor-male` and/or `mentor-female`, with both being optional individually (a pack may ship one, both, or neither).

If a host app surfaces mentor-daily mode but the bound theme pack provides NEITHER `mentor-male` nor `mentor-female`, the app SHALL fall back to displaying a text-only NPC label "今日導師" without a portrait — the mentor flow SHALL NOT be blocked by missing sprites.

For `theme-pixel-medical`, both `mentor-male` and `mentor-female` SHALL be provided as ≥ 256×256 px sprites in GBA pixel-art style matching the doctor sprite roster.

#### Scenario: theme-pixel-medical ships both mentor sprites

- **WHEN** `THEME_PIXEL_MEDICAL.sprites` is inspected
- **THEN** both keys `'mentor-male'` and `'mentor-female'` SHALL be present
- **AND** each SHALL resolve to a non-empty URL or data URI

#### Scenario: Theme without mentor sprites does not break flow

- **WHEN** a theme pack omits both `mentor-male` and `mentor-female`
- **THEN** the host app's MentorDialog SHALL render with a text-only NPC label
- **AND** no sprite-missing error SHALL be thrown
- **AND** the mentor-daily flow SHALL function (selection / answer / reward / backlog)

#### Scenario: Sprite ownership is theme-level not app-level

- **WHEN** a contributor wants to add mentor sprites for a new content pack
- **THEN** the sprites SHALL be added to the corresponding theme pack's `sprites` map
- **AND** SHALL NOT be hard-coded inside the host app's components


### Requirement: Cosmetic-capable theme packs MAY expose cosmetic sprite keys

Theme packs participating in the `cosmetic-system` capability MAY include sprite keys for cosmetic items. The convention SHALL be:
- `cosmetic-head-<id>` — head cosmetic sprites (e.g. `cosmetic-head-knowledge-glasses`)
- `cosmetic-body-<id>` — body cosmetic sprites
- `cosmetic-accessory-<id>` — accessory cosmetic sprites
- `cosmetic-held-<id>` — held-item cosmetic sprites
- `cosmetic-background-<id>` — full-canvas dorm background sprites
- `dorm-default` — fallback dorm background when no background cosmetic equipped

Sprites SHALL be 384×384 transparent PNG, GBA pixel-art style matching the doctor + mentor sprite roster. Non-background cosmetic sprites SHALL render only the cosmetic itself (rest of canvas transparent) so they layer cleanly over the character-base sprite.

If a host app surfaces dorm-view but the bound theme provides NO cosmetic sprites, the dorm view SHALL still render the base character + dorm-default background — cosmetic-system gracefully degrades to milestone-toast-only without visual change.

#### Scenario: theme-pixel-medical ships 20+ cosmetic sprite keys

- **WHEN** `THEME_PIXEL_MEDICAL.sprites` is inspected
- **THEN** ≥ 20 keys matching `cosmetic-*-<id>` patterns SHALL be present
- **AND** the `dorm-default` key SHALL also be present
- **AND** each SHALL resolve to a non-empty URL

#### Scenario: Theme without cosmetic sprites does not break dorm

- **WHEN** a theme pack lacks all `cosmetic-*` and `dorm-default` keys
- **THEN** the dorm view SHALL render a placeholder background + the base character
- **AND** the picker SHALL show all catalog entries as "[sprite missing]" placeholders
- **AND** no sprite-missing error SHALL be thrown

#### Scenario: Cosmetic sprite alignment with character-base

- **WHEN** a `cosmetic-head-*` sprite is rendered at z-index 3 over a 384×384 character-base sprite
- **THEN** the head cosmetic SHALL visually align with where the character's head appears (centered horizontally, top quarter of canvas)
- **AND** alignment SHALL be checked by visual QA during sprite generation (≤ 10 px tolerance)

### Requirement: ThemePack SHALL accept optional hospital-mode scene fields

The `ThemePack` type SHALL accept two optional fields — `scenes` and `doctorSlotPositions` — to support tier-based scene rendering in hospital management mode. Theme packs targeting hospital mode (e.g. `theme-pixel-hospital`) SHALL populate both fields; theme packs not used in hospital mode (e.g. `theme-pixel-medical`) MAY omit them. Adding these fields is non-breaking per the existing rule "Adding new optional fields is non-breaking".

```ts
interface ThemePack {
  // ...existing required fields
  scenes?: {
    tier1: string  // asset path for 診所 scene
    tier2: string  // asset path for 區域醫院 scene
    tier3: string  // asset path for 醫學中心 scene
  }
  doctorSlotPositions?: {
    tier1: SlotPosition[]  // 2 slots for 診所
    tier2: SlotPosition[]  // 5 slots for 區域醫院
    tier3: SlotPosition[]  // 8 slots for 醫學中心
  }
}

interface SlotPosition {
  room: 'ward' | 'outpatient' | 'surgery'
  x: number  // 0–768 (scene PNG width)
  y: number  // 0–384 (scene PNG height)
}
```

#### Scenario: Hospital theme provides scenes and slot positions

- **GIVEN** `@study-rpg/theme-pixel-hospital` exports `THEME_PIXEL_HOSPITAL`
- **WHEN** the exported object is inspected
- **THEN** it SHALL include `scenes` field with `tier1`, `tier2`, `tier3` asset paths
- **AND** it SHALL include `doctorSlotPositions` field with `tier1` (2 slots), `tier2` (5 slots), `tier3` (8 slots)
- **AND** every slot SHALL have `room` ∈ `{'ward', 'outpatient', 'surgery'}`
- **AND** every slot SHALL have integer `x` ∈ [0, 768], `y` ∈ [0, 384]

#### Scenario: Non-hospital theme omits scene fields

- **GIVEN** `@study-rpg/theme-pixel-medical` exports `THEME_PIXEL_MEDICAL` (used by 一階 medexam-tw, not hospital mode)
- **WHEN** the exported object is inspected
- **THEN** the `scenes` and `doctorSlotPositions` fields MAY be absent
- **AND** the absence SHALL NOT cause TypeScript compile errors elsewhere (fields are optional)

#### Scenario: Hospital scene component consumes theme fields

- **GIVEN** `<HospitalScene>` is imported in `apps/medexam2-hospital-tw`
- **WHEN** the component renders
- **THEN** it SHALL read scene asset path from `theme.scenes[currentTier]`
- **AND** it SHALL read slot positions from `theme.doctorSlotPositions[currentTier]`
- **AND** if either field is undefined (theme pack missing them), the component SHALL render nothing without crashing
