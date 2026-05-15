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

## Regeneration procedure

To regenerate any sprite:

```bash
codex exec --sandbox workspace-write \
  "Generate <prompt from the row above>. Save the result to $PWD/packages/theme-pixel-hospital/sprites/<filename>. \$imagegen" \
  < /dev/null
```

Output overwrites the existing file. After regen, update the "Generated" timestamp + "Attempts" column above.
