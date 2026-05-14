# @study-rpg/theme-pixel-hospital

Pixel-art theme pack for the **二階國考經營 RPG** (hospital management tycoon mode), forked from `@study-rpg/theme-pixel-medical`.

## Status

🚧 **Scaffold only** — full sprite roster (14 specialties × P1–P5 doctors = 70 sprites + 三階段醫院 scenes) is pending under:

- `openspec/changes/add-doctor-sprite-roster` — doctor sprite generation
- `openspec/changes/wire-clinic-level-up` — 三階段醫院 scenes (診所 / 區域 / 醫學中心)

Currently exports `THEME_PIXEL_HOSPITAL` with:
- GBA palette identical to theme-pixel-medical (per Decision 6 in scaffold change)
- Rarity frame colors mapped to P1–P5 (per Decision 5)
- Empty `sprites` and `itemCatalog` (placeholders)

## Visual style

GBA-era pixel art — 16-color palette, nearest-neighbor scaling. **Not** Theme Hospital isometric sim style, **not** anime portrait gacha style (both explicitly rejected per Decision 6).

## Consumer

`apps/medexam2-hospital-tw` (二階國考經營 RPG).

## License

AGPL-3.0-or-later (same as theme-pixel-medical).
