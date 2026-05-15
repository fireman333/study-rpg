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
