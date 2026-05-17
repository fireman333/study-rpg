# Sprite Generation Log

Generation tooling: `codex exec --sandbox workspace-write "Generate <prompt>. Save the result to <abs-path>. \$imagegen" < /dev/null` per `~/.claude/imports/codex_image_gen.md`.

Each row records the accepted prompt + filename + generation timestamp + attempt count for reproducibility (so future maintainers can regenerate any sprite with the same prompt).

## Default-rarity fallback sprites

| Filename | Rarity | Pose descriptor | Generated | Attempts |
|---|---|---|---|---|
| `doctor-default-P5.png` | P5 拉完了 | wrinkled white coat, slumped tired posture, exhausted expression, dark circles, drooping shoulders | 2026-05-15 09:39 | 1 |
| `doctor-default-P4.png` | P4 NPC | white coat, neutral standing pose, blank expression, generic appearance, plain coat | 2026-05-15 09:51 | 1 |
| `doctor-default-P3.png` | P3 人上人 | white coat, alert competent posture, slight confident smile, well-kept coat | 2026-05-15 09:35 | 1 |
| `doctor-default-P2.png` | P2 頂級 | pristine white coat, confident pose, slight proud smile, faint gold-tinted glow, well-groomed | 2026-05-15 09:51 | 1 |
| `doctor-default-P1.png` | P1 夯 | gleaming white coat, dynamic heroic pose, intense charismatic gaze, glowing red/gold sparkle aura, dramatic lighting | 2026-05-15 09:53 | 1 |

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
| `doctor-內科-P3.png` | 內科 | stethoscope + patient chart | 2026-05-15 batch | 1 |
| `doctor-外科-P3.png` | 外科 | surgical mask + scalpel | 2026-05-15 batch | 1 |
| `doctor-小兒科-P3.png` | 小兒科 | small teddy bear + child-friendly stethoscope | 2026-05-15 batch | 1 |
| `doctor-婦產科-P3.png` | 婦產科 | ultrasound wand + clipboard | 2026-05-15 batch | 1 |
| `doctor-精神科-P3.png` | 精神科 | clipboard + thoughtful gesture | 2026-05-15 batch | 1 |
| `doctor-復健科-P3.png` | 復健科 | resistance band + walker icon | 2026-05-15 batch | 1 |
| `doctor-神經內科-P3.png` | 神經內科 | reflex hammer + brain diagram chart | 2026-05-15 batch | 1 |
| `doctor-家醫科-P3.png` | 家醫科 | doctor bag + family-friendly pose | 2026-05-15 batch | 1 |
| `doctor-皮膚科-P3.png` | 皮膚科 | magnifying glass + dermatoscope | 2026-05-15 batch | 1 |
| `doctor-麻醉科-P3.png` | 麻醉科 | anesthesia mask + IV bag | 2026-05-15 batch | 1 |
| `doctor-骨科-P3.png` | 骨科 | X-ray of bone + hammer | 2026-05-15 batch | 1 |
| `doctor-耳鼻喉科-P3.png` | 耳鼻喉科 | otoscope + tongue depressor | 2026-05-15 batch | 1 |
| `doctor-眼科-P3.png` | 眼科 | ophthalmoscope + eye chart | 2026-05-15 batch | 1 |
| `doctor-泌尿科-P3.png` | 泌尿科 | catheter symbol + clipboard | 2026-05-15 batch | 1 |

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

## Room scenes (StudySessionPage hero backdrop, 2026-05-17 §10 follow-up)

384×384 opaque interior scenes used as the StudySessionPage hero panel backdrop. Picked dynamically by most-represented assigned room type. Exported via `theme-pixel-hospital/src/room-scenes.ts` → `ROOM_SCENES` object.

| Filename | Room type | Generated | Attempts | Notes |
|---|---|---|---|---|
| `outpatient-scene.png` | outpatient | 2026-05-17 22:56 | 1 | Clean first-pass |
| `surgery-scene.png` | surgery | 2026-05-17 23:14 | 2 | First attempt (22:56) deliberation-looped past 13 min on patient-covered + anesthesia trigger — sanitized prompt removed all sensitive elements (empty room, no patient) and shipped in ~1 min |
| `ward-scene.png` | ward | 2026-05-17 23:08 | 1 | Clean first-pass |

Outpatient prompt:

```
A GBA-era pixel art interior of a clinic outpatient exam room, 384x384 pixels,
opaque background, 16-color palette matching Game Boy Advance medical RPG style.
Single small consultation room interior view: examination table on right side with
white sheet, doctor's desk on left with computer monitor and patient chart papers,
ophthalmoscope and stethoscope hanging on wall, blood pressure cuff on desk, small
medical poster on back wall, light wood floor, white walls. Top-down isometric or
3/4 perspective. Nearest-neighbor pixel rendering, no anti-aliasing, no smooth
gradients.
```

Surgery prompt (sanitized — empty room, no patient or procedure):

```
A GBA-era pixel art interior of an empty hospital operating room ready for procedures,
384x384 pixels, opaque background, 16-color palette matching Game Boy Advance medical
RPG style. Empty room with: large overhead surgical light dome ceiling fixture
(round multi-lamp design) hanging center, empty stainless steel operating table with
clean white sheet folded neatly, instrument tray cart on wheels with neatly arranged
tools, vital signs monitor on stand showing flat baseline, IV stand, blue medical
drapes folded on shelf, light teal sterile floor tiles, white tiled walls, large
clock on wall. Top-down isometric or 3/4 perspective. Clean, professional, no people
present. Nearest-neighbor pixel rendering, no anti-aliasing, no smooth gradients.
```

Ward prompt:

```
A GBA-era pixel art interior of a hospital inpatient ward room, 384x384 pixels,
opaque background, 16-color palette matching Game Boy Advance medical RPG style.
Wide view of a hospital ward with 2 patient beds parallel facing camera, each with
white linens and pillow, IV drip stands beside each bed with hanging clear bags and
tubes, vital signs monitors on rolling stands, privacy curtain rail above, large
window at back showing daylight, light blue tile floor, white walls with framed
medical certificate, nurse call buttons by each bed, bedside tables with water
pitcher and chart. Top-down isometric or 3/4 perspective. Nearest-neighbor pixel
rendering, no anti-aliasing, no smooth gradients.
```

**Gotcha for future regen** — codex `gpt-image-2` safety gate trips on certain medical scene compositions. If a prompt contains "patient covered with sheet" + "anesthesia machine" + "scalpel" together, the agent may deliberation-loop past 10 minutes without producing output. Workaround: split sensitive elements across prompts, or describe **empty / pre-procedure** rooms instead of mid-procedure scenes. Past 10 min wall, kill and retry with sanitized prompt.

## Event modal icons (EventModal header thumbnails, 2026-05-17 §6 follow-up)

`packages/theme-pixel-hospital/sprites/events/` — 192×192 transparent PNGs, one per modal event id. Wired into `EventModal` header next to the h2 title. Exported via `theme-pixel-hospital/src/event-icons.ts` → `EVENT_ICONS` object. Toast events (negative-news / peer-criticism / research-award) omit dedicated icons since their 5-sec auto-dismiss is too brief for icons to register.

| Filename | Event id | Theme | Generated | Attempts | Notes |
|---|---|---|---|---|---|
| `event-malpractice.png` | medical-malpractice | paperwork dispute (gavel + sealed docs) | 2026-05-17 23:30 | 1 | Clean first-pass |
| `event-vip.png` | vip-patient | crystal vase + VIP plaque, no people | 2026-05-17 23:33 | 1 | Clean first-pass (left a 1.4 MB pre-quantize source PNG in /tmp; removed during move) |
| `event-emergency.png` | emergency-shift | ER sign + ambulance silhouette, night | 2026-05-17 23:36 | 1 | Clean first-pass |
| `event-audit.png` | audit-event | clipboard + checklist + magnifying glass + stamp | 2026-05-17 23:39 | 1 | Clean first-pass |

Common prompt principles (all sanitized — **no people**, **no medical procedures**, **no body parts**):

```
A GBA-era pixel art icon of <object composition>, 192x192 pixels, transparent
background, 16-color palette matching Game Boy Advance medical RPG style.
Composition: <detailed object list>. No people. <mood descriptor>.
Top-down or 3/4 perspective. Nearest-neighbor pixel rendering, no
anti-aliasing, no smooth gradients.
```

Why sanitized: earlier surgery-scene gen with `patient covered + anesthesia + scalpels` deliberation-looped past 13 min before bring killed. For event icons we pre-emptively chose object-only compositions and got 4/4 clean first-pass results in ~10 min total.

## Fate-card pack art (FateCardPage card-back thumbnails, 2026-05-18 §7 follow-up)

`packages/theme-pixel-hospital/sprites/fate-cards/` — 192×256 (3:4 portrait) transparent PNGs, one per fate-card tier. Wired into `FateCardPage` as the visual header above each tier's draw button. Exported via `theme-pixel-hospital/src/fate-card-art.ts` → `FATE_CARD_ART` object.

| Filename | Tier | Theme | Generated | Tool | Notes |
|---|---|---|---|---|---|
| `fate-card-common.png` | common | plain wooden frame + small gold star, soft brown | 2026-05-18 00:02 | Gemini MCP | Clean first-pass |
| `fate-card-rare.png` | rare | polished silver frame + crescent moon, cool blue | 2026-05-18 00:03 | Gemini MCP | Clean first-pass |
| `fate-card-epic.png` | epic | ornate gold frame + crown, gold/red filigree | 2026-05-18 00:04 | Gemini MCP | Clean first-pass |
| `fate-card-legendary.png` | legendary | platinum frame + rainbow gem + radial light beams | 2026-05-18 00:04 | Gemini MCP | Clean first-pass |

**Tool choice — Gemini-first for this batch**: simple frame + center icon composition, no people, no medical context → no codex content-gate risk. Gemini MCP gave 4 clean parallel first-passes in ~2 min total wallclock vs codex's ~12 min sequential estimate. See [~/.claude/imports/image_gen_routing.md](~/.claude/imports/image_gen_routing.md) for the general routing rule (simple-to-medium icons → Gemini, complex scenes → codex).

**Gemini-specific gotchas**:
- Native output is 1:1 / 2048×2048 with **solid pastel bg** (not transparent) — must chroma-key the corner pixel during post-process
- Renders true 3:4 portrait frame inside the 1:1 canvas; trim after chroma-key recovers the actual content bbox
- Not native pixel-art rendering — `magick -filter point` (nearest-neighbor) + `-colors 16` quantize required to match GBA aesthetic

**Post-process pipeline** (per fate-card, applied to raw Gemini PNG):
```bash
src="/tmp/gemini_img_<timestamp>_0.png"
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -fuzz 12% -transparent "$corner" -trim +repage \
  -filter point -resize 192x256! +dither -colors 16 \
  "PNG32:/tmp/fate-card-<tier>.png"
```

## Rarity Expansion Batch Plan (P1 + P2 + P4 + P5, in-flight 2026-05-18)

**Scope**: Fill in the remaining 112 doctor sprites to reach full 14 subjects × 5 rarities × 2 genders = 140 coverage. P3 (28) already shipped in codex. This expansion adds 112 new sprites with hybrid tooling.

| Rarity | Tool | Count | Status |
|---|---|---|---|
| P1 (夢級夯) | codex `gpt-image-2` | 14 × 2 = 28 | ⏳ Pending (canary V7/V8 validated) |
| P2 (頂級) | Gemini MCP | 14 × 2 = 28 | ⏳ Pending |
| P3 (人上人) | codex `gpt-image-2` | 14 × 2 = 28 | ✓ Shipped (2026-05-15 / 17) |
| P4 (NPC) | Gemini MCP | 14 × 2 = 28 | ⏳ Pending |
| P5 (拉完了) | Gemini MCP | 14 × 2 = 28 | ⏳ Pending |
| **Total new** | | **112 sprites** | |

### Tool routing rationale

- **codex for P1**: dramatic fire/flame aura looks more refined and high-end via codex `gpt-image-2`'s native rendering. Gemini iterations V5→V8 achieved close approximation (Japanese GBA RPG anime style + streamlined fire) but codex retains the edge for the dream-tier mood per 2026-05-18 user verdict.
- **Gemini for P2/P4/P5**: mid-rarity moods (elite halo / NPC mediocre / burnt-out) render well with V7 prompt template at parallel batch speed (~5 sec/sprite vs codex ~3 min/sprite). 84-sprite batch should complete in ~5-10 min wallclock with 8-parallel batches.

### Pipeline gotchas discovered during canary phase

These are the **hard-won lessons from the 2026-05-18 canary iteration (V1→V8)**. Future maintainers should follow them or expect rediscovery cost.

1. **chroma-key fuzz: use `3%`, not `12%`**. Gemini renders solid pastel cream backgrounds whose RGB is close to light skin highlight tones. `fuzz 12%` ate face skin pixels → forehead transparent `srgba(0,0,0,0)` → in dark app theme the face appears as "skull holes". Verified by `magick -format "%[pixel:p{x,y}]"` sampling. Fix: `fuzz 3%` keeps face solid.
2. **Watermark removal**: Gemini outputs include a small diamond watermark in bottom-right corner. Without masking, `trim` includes the watermark bbox → character ends up offset left. Fix: `-fill "$corner" -draw "rectangle $((W-280)),$((H-280)) $W,$H"` BEFORE chroma-key.
3. **No `-colors N` quantize**: Gemini renders as continuous-tone illustration. Forcing 16-color quantize destroys skin tone shading (skin merged with shadow bucket). Skip `-colors`, accept ~10K-50K colors per sprite (~70-100KB file). codex sprites are native 16-color so no contradiction in mixing.
4. **`-filter point` for downsample**: nearest-neighbor preserves pixel-art aesthetic. Lanczos/Mitchell smooth-anti-alias → breaks GBA crisp pixel-art look.
5. **Background guard**: explicit "completely plain solid pastel cream color, NO grid pattern, NO sketch lines, NO geometric shapes, NO floor tiles, NO wireframe" — Gemini sometimes renders extra background artifacts (V7 P1 female render had a wireframe grid that chroma-key couldn't fully remove).
6. **Text hallucination guard**: "ABSOLUTELY no text, letters, labels, or writing anywhere" — Gemini hallucinates "P1 NERD" or chart text otherwise (V1 canary had this).
7. **Fire shape (P1 only)**: "narrow streamlined flame tongues licking dynamically UPWARD, slim elegant calligraphic strokes, NOT a bulky enveloping fire cloud" — without this, V6 rendered a fire blob. Streamlined fire matches codex P1 reference.
8. **Japanese GBA RPG style anchor**: explicit "Pokemon Emerald, Fire Emblem GBA, Final Fantasy Tactics Advance aesthetic" — V4 (no style anchor) rendered Western comic style; V5+ (with anchor) rendered the right Japanese anime pixel-art mood.
9. **Adult anime proportions**: "head-to-body about 1:6, slightly larger expressive anime eyes" — without this Gemini drifts toward Western realistic 1:7-1:8 (per its own self-analysis of codex refs via gemini-cli vision).

### Gemini V7 prompt template (final, for P2 / P4 / P5)

```
Pixel art sprite of a {gender} doctor specializing in {specialty_zh} ({specialty_en}), in
classic Japanese RPG art style — Pokemon Emerald, Fire Emblem GBA, Final Fantasy Tactics
Advance aesthetic. Full body, centered, front-facing. BACKGROUND MUST BE SIMPLE: completely
plain solid pastel cream color, absolutely NO grid pattern, NO sketch lines, NO geometric
shapes, NO floor tiles, NO wireframe, NO background details whatsoever. Detailed pixel art
with crisp dark outlines, multi-tone cell shading with hard-edged transitions, {palette}.
Adult anime-style proportions (head-to-body about 1:6, slightly larger expressive anime
eyes). {rarity_descriptor}. {visual_traits}. Specialty props: {props}. Absolutely no text,
letters, labels, or writing anywhere.
```

**Rarity slot fillers**:

| Rarity | `{palette}` | `{rarity_descriptor}` | `{visual_traits}` |
|---|---|---|---|
| P2 | "vivid saturated color palette, slightly more muted than dream-tier" | "P2 elite-tier rarity" | "gleaming clean white lab coat over blue scrubs, subtle golden glow halo or shimmer around the body (much smaller than full P1 flame), confident smile, sharp focused gaze, polished stance" |
| P4 | "standard moderate color palette, neither vivid nor muted" | "P4 NPC-tier rarity (forgettable mid-rank)" | "plain white lab coat (slightly creased) over blue scrubs, neutral expression with mild disinterest, average stance, no aura, no special effects, generic doctor demeanor" |
| P5 | "muted desaturated melancholy color palette" | "P5 burnt-out rarity" | "wrinkled stained white lab coat (still clearly white) with one tiny faded coffee stain, blue-grey scrubs underneath, slumped exhausted posture with drooping shoulders, hollow tired sunken eyes with prominent dark circles, disheveled hair, hollow tired expression" |

**Gender slot**:
- `{gender}` = "male" — typically short or spiky hair (color: black / brown / dark)
- `{gender}` = "female" — typically shoulder-length or longer hair (color: black / brown / auburn)

**Subject slot** (`{specialty_zh}` / `{specialty_en}` / `{props}`): reuse the canonical 14-subject mapping from the "Per-subject P3 baseline sprites" table above. Props text identical per subject across P2/P4/P5.

### codex P1 prompt template (final, for P1 batch via codex)

Run via canonical `~/.claude/imports/codex_image_gen.md` pattern. Per-sprite invocation:

```bash
cd /tmp && codex exec --skip-git-repo-check --sandbox workspace-write \
  "Generate a GBA-era pixel art doctor sprite, 384x384 pixels, transparent background, 16-color palette matching Game Boy Advance medical RPG style. A {gender} {specialty_zh} ({specialty_en}) specialist at P1 dream-tier hero rarity: gleaming pure white lab coat worn open over a dark formal vest, blue scrubs underneath, dynamic action-pose with feet planted shoulder-width apart, intense confident piercing gaze. {hair_descriptor}. {fire_descriptor}. Specialty props: {props}. Absolutely no text, letters, labels anywhere. Nearest-neighbor pixel rendering, no anti-aliasing, no smooth gradients. Front-facing, centered, full body visible head to feet. Save the result to /tmp/doctor-{specialty_zh}-P1{gender_suffix}.png. \$imagegen" \
  < /dev/null
mv /tmp/doctor-{specialty_zh}-P1{gender_suffix}.png $PROJECT_ROOT/packages/theme-pixel-hospital/sprites/
```

**Slot fillers**:

| Slot | male value | female value |
|---|---|---|
| `{hair_descriptor}` | "spiky black hair with prominent white streak highlights" | "long flowing dark hair with prominent crimson red streak highlights" |
| `{gender_suffix}` | (empty) | "-female" |

**`{fire_descriptor}` (same both genders)**:
> "intense streamlined fire aura behind and around the character — narrow elongated flame tongues with sharp pointed tips licking dynamically UPWARD, slim elegant calligraphic flame strokes, NOT a bulky enveloping fire cloud, NOT a circular blob. Inner yellow-white hot core at brightest centers, outer flames are slim red-orange tongues"

**`{specialty_zh}` / `{specialty_en}` / `{props}`**: reuse 14-subject mapping from "Per-subject P3 baseline sprites" table.

### Post-process pipeline (Gemini sprites only)

codex outputs are native 384×384 transparent 16-color → no post-process, just `mv` to sprites/.

Gemini outputs need this pipeline:

```bash
src="/tmp/gemini_img_<ts>_0.png"  # raw from Gemini MCP
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
W=$(magick identify -format "%w" "$src")
H=$(magick identify -format "%h" "$src")
magick "$src" \
  -fill "$corner" -draw "rectangle $((W-280)),$((H-280)) $W,$H" \
  -fuzz 3% -transparent "$corner" -trim +repage \
  -filter point -resize 384x384 \
  -background none -gravity center -extent 384x384 \
  "PNG32:$PROJECT_ROOT/packages/theme-pixel-hospital/sprites/doctor-{specialty_zh}-{rarity}{gender_suffix}.png"
```

**No `+dither -colors 16`** in this pipeline (deliberate per gotcha #3 above).

### Canary visual baselines (kept in /tmp for next-session reference)

Visual reference of what the V7 Gemini template produces (NOT used as final sprites — codex will replace for P1):

- `/tmp/v7-p1m.png` — male P1 內科 with streamlined fire + spiky black/white-streak hair + dark vest under open coat
- `/tmp/v8-p1f.png` — female P1 內科 with streamlined fire + long dark/red-streak hair + dark vest under open coat (V8 = V7 + stronger bg guard to avoid grid artifact)

If `/tmp` is cleared, regenerate by running the V7 Gemini prompt for 內科 P1 male/female.

### Stale outputs (do NOT use)

`/tmp/sprite-batch/` (2026-05-18 ~01:08) contains 8 Gemini sprites generated with an OLDER prompt template (pre-V5, pre-Japanese-GBA-style pivot). They are stylistically inconsistent with the V7 template — **discard when re-batching**:

- doctor-內科-P1-female.png, doctor-內科-P5.png
- doctor-外科-P1.png, doctor-外科-P1-female.png, doctor-外科-P5.png, doctor-外科-P5-female.png
- doctor-婦產科-P1.png, doctor-婦產科-P1-female.png

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
