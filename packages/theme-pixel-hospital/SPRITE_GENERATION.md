# Sprite Generation Log

Generation tooling: `codex exec --sandbox workspace-write "Generate <prompt>. Save the result to <abs-path>. \$imagegen" < /dev/null` per `~/.claude/imports/codex_image_gen.md`.

Each row records the accepted prompt + filename + generation timestamp + attempt count for reproducibility (so future maintainers can regenerate any sprite with the same prompt).

## Default-rarity fallback sprites

| Filename | Rarity | Pose descriptor | Generated | Attempts |
|---|---|---|---|---|
| `doctor-default-P5.png` | P5 拉完了 | wrinkled white coat, slumped tired posture, exhausted expression, dark circles, drooping shoulders | 2026-05-15 09:39 | 1 |
| `doctor-default-P4.png` | P4 NPC | white coat, neutral standing pose, blank expression, generic appearance, plain coat | _pending_ | — |
| `doctor-default-P3.png` | P3 人上人 | white coat, alert competent posture, slight confident smile, well-kept coat | 2026-05-15 09:35 | 1 |
| `doctor-default-P2.png` | P2 頂級 | pristine white coat, confident pose, slight proud smile, faint gold-tinted glow, well-groomed | _pending_ | — |
| `doctor-default-P1.png` | P1 夯 | gleaming white coat, dynamic heroic pose, intense charismatic gaze, glowing red/gold sparkle aura, dramatic lighting | _pending_ | — |

Common prompt stem (all default-rarity sprites):

```
a GBA-era pixel art doctor sprite, 384x384 pixels, transparent background, 16-color
palette matching Game Boy Advance medical RPG style. A {pose descriptor + rarity tier
phrase}. Nearest-neighbor pixel rendering, no anti-aliasing, no smooth gradients.
Front-facing, centered, full body visible.
```

## Per-subject P3 baseline sprites

14 sprites, one per 二階國考 subject at P3 rarity. Common stem + specialty prop injection per design.md Decision 4.

| Filename | Subject | Specialty prop | Generated | Attempts |
|---|---|---|---|---|
| `doctor-內科-P3.png` | 內科 | stethoscope + patient chart | _pending_ | — |
| `doctor-外科-P3.png` | 外科 | surgical mask + scalpel | _pending_ | — |
| `doctor-小兒科-P3.png` | 小兒科 | small teddy bear + child-friendly stethoscope | _pending_ | — |
| `doctor-婦產科-P3.png` | 婦產科 | ultrasound wand + clipboard | _pending_ | — |
| `doctor-精神科-P3.png` | 精神科 | clipboard + thoughtful gesture | _pending_ | — |
| `doctor-復健科-P3.png` | 復健科 | resistance band + walker icon | _pending_ | — |
| `doctor-神經內科-P3.png` | 神經內科 | reflex hammer + brain diagram chart | _pending_ | — |
| `doctor-家醫科-P3.png` | 家醫科 | doctor bag + family-friendly pose | _pending_ | — |
| `doctor-皮膚科-P3.png` | 皮膚科 | magnifying glass + dermatoscope | _pending_ | — |
| `doctor-麻醉科-P3.png` | 麻醉科 | anesthesia mask + IV bag | _pending_ | — |
| `doctor-骨科-P3.png` | 骨科 | X-ray of bone + hammer | _pending_ | — |
| `doctor-耳鼻喉科-P3.png` | 耳鼻喉科 | otoscope + tongue depressor | _pending_ | — |
| `doctor-眼科-P3.png` | 眼科 | ophthalmoscope + eye chart | _pending_ | — |
| `doctor-泌尿科-P3.png` | 泌尿科 | catheter symbol + clipboard | _pending_ | — |

Common prompt stem (all per-subject P3 sprites):

```
a GBA-era pixel art doctor sprite, 384x384 pixels, transparent background, 16-color
palette matching Game Boy Advance medical RPG style. A {subject} specialist, alert
competent posture, slight confident smile, well-kept white coat. Specialty props:
{specialty prop}. Nearest-neighbor pixel rendering, no anti-aliasing, no smooth
gradients. Front-facing, centered, full body visible.
```

## Per-subject P3 female sprites (DEI expansion 2026-05-17)

14 sprites, one per subject — `doctor-{subject}-P3-female.png`. Generated via `expand-doctor-roster-dei-and-tier4-scene` change to balance gender representation in the doctor roster. Recruitment gacha picks male / female variant 50 / 50 at roll time (see `services/recruitment.ts` `resolveSpriteKey`).

| Filename | Subject | Specialty prop | Generated | Attempts |
|---|---|---|---|---|
| `doctor-內科-P3-female.png` | 內科 | stethoscope + patient chart | 2026-05-17 batch | 1 |
| `doctor-外科-P3-female.png` | 外科 | surgical mask + scalpel | 2026-05-17 batch | 1 |
| `doctor-小兒科-P3-female.png` | 小兒科 | small teddy bear + child-friendly stethoscope | 2026-05-17 batch | 1 |
| `doctor-婦產科-P3-female.png` | 婦產科 | ultrasound wand + clipboard | 2026-05-17 batch | 1 |
| `doctor-精神科-P3-female.png` | 精神科 | clipboard + thoughtful gesture | 2026-05-17 batch | 1 |
| `doctor-復健科-P3-female.png` | 復健科 | resistance band + walker icon | 2026-05-17 batch | 1 |
| `doctor-神經內科-P3-female.png` | 神經內科 | reflex hammer + brain diagram chart | 2026-05-17 batch | 1 |
| `doctor-家醫科-P3-female.png` | 家醫科 | doctor bag + family-friendly pose | 2026-05-17 batch | 1 |
| `doctor-皮膚科-P3-female.png` | 皮膚科 | magnifying glass + dermatoscope | 2026-05-17 batch | 1 |
| `doctor-麻醉科-P3-female.png` | 麻醉科 | anesthesia mask + IV bag | 2026-05-17 batch | 1 |
| `doctor-骨科-P3-female.png` | 骨科 | X-ray of bone + reflex hammer | 2026-05-17 batch | 1 |
| `doctor-耳鼻喉科-P3-female.png` | 耳鼻喉科 | otoscope + tongue depressor | 2026-05-17 batch | 1 |
| `doctor-眼科-P3-female.png` | 眼科 | ophthalmoscope + eye chart | 2026-05-17 batch | 1 |
| `doctor-泌尿科-P3-female.png` | 泌尿科 | catheter symbol + clipboard | 2026-05-17 batch | 1 |

Common prompt stem (P3 female):

```
a GBA-era pixel art FEMALE doctor sprite, 384x384 pixels, transparent background,
16-color palette matching Game Boy Advance medical RPG style. A female {subject}
specialist with shoulder-length hair, alert competent posture, slight confident
smile, well-kept white coat. Specialty props: {specialty prop}. Nearest-neighbor
pixel rendering, no anti-aliasing, no smooth gradients. Front-facing, centered,
full body visible.
```

## Hospital scenes

`packages/theme-pixel-hospital/sprites/scenes/` — full-art 768×384 PNGs, one per tier.

| Filename | Tier | Generated | Attempts |
|---|---|---|---|
| `hospital-tier1-clinic.png` | 診所 | 2026-05-15 (`add-hospital-home-pixel-scene` change) | 1 |
| `hospital-tier2-regional.png` | 區域醫院 | 2026-05-15 | 1 |
| `hospital-tier3-medical-center.png` | 醫學中心 | 2026-05-15 | 1 |
| `hospital-tier4-national.png` | 國家級教學醫院 | 2026-05-17 (`expand-doctor-roster-dei-and-tier4-scene` change) | 1 |

Tier 4 prompt:

```
A GBA-era pixel art panoramic view of a prestigious national academic medical center,
768x384 pixels, 16-color palette matching Game Boy Advance medical RPG style.
Imposing modern multi-tower hospital complex with university research wings, grand
entrance lined with national flags, rooftop helipad with helicopter, manicured plaza
with central sculpture, glass-walled lobby visible at ground level. Nearest-neighbor
pixel rendering, no anti-aliasing, no smooth gradients. Wide landscape composition.
```

## Regeneration procedure

To regenerate any sprite, run codex from a non-project directory (per
`~/.claude/imports/codex_image_gen.md`) with `--skip-git-repo-check`:

```bash
cd /tmp && codex exec --skip-git-repo-check --sandbox workspace-write \
  "Generate <prompt from the row above>. Save the result to /tmp/<filename>.png. \$imagegen" \
  < /dev/null
mv /tmp/<filename>.png <project-root>/packages/theme-pixel-hospital/sprites/<filename>
```

Output overwrites the existing file. After regen, update the "Generated" timestamp + "Attempts" column above.
