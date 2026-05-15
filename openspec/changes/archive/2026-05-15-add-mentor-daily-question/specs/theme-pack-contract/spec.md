## ADDED Requirements

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
