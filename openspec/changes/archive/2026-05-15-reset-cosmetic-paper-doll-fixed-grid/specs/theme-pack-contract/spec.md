## MODIFIED Requirements

### Requirement: Cosmetic-capable theme packs MAY expose cosmetic sprite keys

Theme packs participating in the `cosmetic-system` capability MAY include sprite keys for cosmetic items. The convention SHALL be:
- `cosmetic-head-<id>` — head cosmetic sprites (e.g. `cosmetic-head-knowledge-glasses`)
- `cosmetic-body-<id>` — body cosmetic sprites
- `cosmetic-accessory-<id>` — accessory cosmetic sprites
- `cosmetic-held-<id>` — held-item cosmetic sprites
- `cosmetic-background-<id>` — full-canvas dorm background sprites
- `dorm-default` — fallback dorm background when no background cosmetic equipped

Sprites SHALL be 384×384 transparent PNG, GBA pixel-art style matching the doctor + mentor sprite roster. Non-background cosmetic sprites SHALL render only the cosmetic itself (rest of canvas transparent) so they layer cleanly over the character-base sprite.

Non-background cosmetic sprites SHALL comply with the bbox-per-category convention defined in the `cosmetic-system` capability's "Cosmetic sprite bbox compliance" requirement. The cosmetic's main visual content SHALL fit within the bbox declared for its category; canvas outside the bbox SHALL be transparent (alpha = 0).

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

- **WHEN** a `cosmetic-head-*` / `cosmetic-body-*` / `cosmetic-accessory-*` / `cosmetic-held-*` sprite is rendered at its assigned z-index over a 384×384 transparent character-base sprite
- **THEN** the cosmetic SHALL visually align with the character's corresponding anatomy band (head / torso / chest level / left-hand grip)
- **AND** alignment SHALL be enforced by bbox compliance per the `cosmetic-system` capability's "Cosmetic sprite bbox compliance" requirement — bbox violation is a spec-level defect, not a visual-QA tolerance
