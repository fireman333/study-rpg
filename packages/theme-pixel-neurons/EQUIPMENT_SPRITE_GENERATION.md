# Permanent equipment sprite generation

> Companion to `SPRITE_GENERATION.md` (11 subject icons + 55 variants) and
> `CARD_SPRITE_GENERATION.md` (DMN fate cards). This file covers the 12
> permanent equipment/companion sprites shipped by `generate-acceleration-sprites`
> (2026-06-04), the artwork follow-up to `add-neurons-acceleration-system`.

## Sprite inventory

| Sprite category | Count | Path pattern | Real / placeholder |
|---|---|---|---|
| **Permanent equipment** | **12** | **`sprites/equipment/<equipmentId>.png`** | **Real (this doc)** |
| DMN fate cards (22 individual + 1 back) | 23 | `sprites/cards/<id>.png` | Real (`CARD_SPRITE_GENERATION.md`) |
| Subject icons / variants | 66 | `sprites/{subjects,variants}/*.png` | Real (`SPRITE_GENERATION.md`) |
| Items / cosmetics / skill placeholders | 76 | (various) | Placeholder TRANSPARENT_PIXEL |

The 12 equipment keys are `equipment:<equipmentId>` where `<equipmentId>` matches the `equipmentId` field in `@study-rpg/content-neurons-tw`'s `EQUIPMENT_CATALOG`. `sprites.ts` globs `../sprites/equipment/*.png` and maps each `<stem>.png` → key `equipment:<stem>`, with a defensive `?? TRANSPARENT_PIXEL` fallback — so this change is **pure asset drop-in, no `sprites.ts` edit**.

## Generation pipeline

1. **Gemini MCP** (`mcp__gemini__gemini_generate_image`) — fires 12 prompts in parallel to `/tmp/accel-sprites-raw/equipment/<id>/` (the MCP `image_count: 0` bug was fixed in `gemini_server.py` via `Model.BASIC_FLASH`; confirmed live 2026-06-04).
2. **ImageMagick post-process** — corner-pixel chroma-key (solid white background) + nearest-neighbor downsample to 384×384 + 16-color quantize → `sprites/equipment/<id>.png` (~7–38 KB each).
3. **Vite `import.meta.glob`** — auto-registers `sprites/equipment/*.png` into `SPRITE_MAP` at build time.

Per `~/.claude/imports/image_gen_routing.md`: Gemini-first for single-object icons (~5 sec/image, parallel, ~30× faster than codex). Codex CLI is the fallback if Gemini rejects (it did not for any of these).

## Magick recipe (transparent background)

```bash
src=/tmp/accel-sprites-raw/equipment/<id>/gemini_img_*.png
out=packages/theme-pixel-neurons/sprites/equipment/<id>.png
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

`-filter point` = nearest-neighbor (keeps pixel-art sharp). `+dither` = no Floyd-Steinberg (clean GBA look). `-fuzz 10%` = tolerance around the corner pixel for the transparency mask.

## Art direction (per design Decision 3)

Common prompt skeleton: `GBA-era pixel art game sprite, 384x384 pixels, single object centered with 40px padding on a solid pure white background, flat shading, 16-color limited palette, Pokemon Red/Blue Gen-1 + Stardew Valley aesthetic, hard pixel edges, no anti-aliasing.` + subject + `No text, no letters, no watermark. Solid uniform white background for clean chroma-key.`

- **Rarity-aura ladder** (at-a-glance rarity, reinforcing the dex's rarity grouping): P1 = brilliant radiant aura + particle sparks; P2 = bright glow halo; P3 = moderate soft glow; P4 = faint glow; P5 = no aura, plain/humble.
- **Lane palette**: speed/myelin = gold `#d4a04d` + white myelin + electric cyan `#6aa0c4`; energy/metabolic = warm orange `#e08a3c` / amber `#d4a04d`.
- **Object vs creature**: object items keep `collectible companion item, NOT a creature with a face`; the two glial-cell entries (`eq-oligodendrocyte-companion-p3`, `eq-astrocyte-glycogen-p3`) are intentionally cute companion **creatures** (their `displayName` is literally a cell companion).

## Catalog (12 prompts)

### Speed lane (myelin / conduction)

#### `eq-fully-myelinated-axon-p1` (全髓鞘化軸突, P1)

> ...Subject: a glowing fully-myelinated nerve axon segment depicted as a horizontal cable wrapped in many smooth concentric white-and-gold myelin sheath layers, radiant golden energy aura around it signifying top-tier legendary quality, tiny speed motion-lines suggesting ultra-fast electrical conduction. Color palette: brilliant gold #d4a04d and white myelin with electric cyan #6aa0c4 conduction sparks. Collectible companion item, NOT a creature with a face.

#### `eq-saltatory-conduction-p2` (跳躍式傳導, P2)

> ...Subject: a bright cyan-white electric action-potential spark LEAPING in an arc between two glowing gaps along a gold myelinated nerve axon — depicting saltatory conduction jumping node to node, the lightning bolt arcs over a gold myelin segment, small motion speed-lines. Bright golden glow halo. Color palette: gold #d4a04d myelin + electric cyan #6aa0c4 leaping spark. Collectible companion item, NOT a creature with a face.

#### `eq-oligodendrocyte-companion-p3` (寡突膠細胞夥伴, P3) — companion creature

> ...Subject: a cute friendly oligodendrocyte glial-cell companion creature — a round teal-blue cell body with several little arm-tendrils, each arm lovingly wrapping a small segment of golden myelin around a nerve fiber, big friendly eyes, eager helpful expression. Moderate soft glow halo. Color palette: teal #6aa0c4 cell body + gold #d4a04d myelin wraps. A cute helper companion creature.

#### `eq-myelin-thickening-p3` (髓鞘增厚, P3)

> ...Subject: a circular cross-section view of a nerve axon wrapped in MANY thick concentric myelin lamellae layers, like dense tree rings or a tightly rolled scroll, emphasizing increased sheath thickness, with a small dark axon core at the very center. Moderate gold glow. Color palette: gold #d4a04d and cream-white concentric rings + dark core. Collectible item, NOT a creature with a face.

#### `eq-node-of-ranvier-p4` (蘭氏結, P4)

> ...Subject: a single small Node of Ranvier — a tiny exposed gap between two gold myelin segments along a nerve fiber, where dense sodium channels glow as a small cluster of cyan dots, a modest single bright spark at the gap. Faint subtle glow only. Color palette: gold #d4a04d myelin segments + small cyan #6aa0c4 channel dots. Small collectible item, NOT a creature with a face.

#### `eq-single-myelin-wrap-p5` (單層髓鞘, P5)

> ...Subject: a single thin loose wrap of pale myelin sheath around a short segment of nerve fiber — modest, humble, just one translucent cream-white layer loosely coiled on a thin gray axon, no aura, plain and unassuming starter item. Color palette: muted cream-white wrap + thin gray axon, very subdued. Plain low-grade collectible item, NOT a creature with a face.

### Energy lane (pump / mitochondria / metabolic reserve)

#### `eq-mitochondrial-powerhouse-p1` (粒線體發電廠, P1)

> ...Subject: a glowing legendary mitochondrion organelle shaped like a rounded bean/capsule with internal folded cristae membranes glowing like a power core, a radiant orange-amber energy aura, floating golden ATP energy sparks around it, top-tier powerhouse. Brilliant orange radiant aura with particle sparks. Color palette: warm orange #e08a3c + amber #d4a04d cristae glow + small golden ATP sparks. Precious collectible item, NOT a creature with a face.

#### `eq-sodium-potassium-pump-p2` (Na⁺/K⁺ 幫浦, P2)

> ...Subject: a barrel-shaped sodium-potassium pump protein machine embedded in a slice of tan lipid-bilayer membrane, actively moving small ion spheres — three orange Na+ ions pumping out one side, two violet K+ ions pumping in the other, with little directional arrows, a sturdy reliable machine. Bright glow halo. Color palette: warm orange #e08a3c Na ions + violet #8a6ac4 K ions + tan membrane + steel pump. Collectible item, NOT a creature with a face.

#### `eq-astrocyte-glycogen-p3` (星形膠細胞糖原庫, P3) — companion creature

> ...Subject: a gentle star-shaped astrocyte glial-cell companion with several pointed arms, its rounded cell body cradling a cluster of round amber glycogen-granule fuel stores like little glowing beads, calm storage-keeper expression. Moderate warm glow. Color palette: soft warm orange-pink #e0a07c astrocyte body + amber #d4a04d glycogen beads. A gentle companion cell creature.

#### `eq-creatine-kinase-buffer-p3` (肌酸激酶緩衝, P3)

> ...Subject: a battery-like phosphocreatine energy buffer — a glowing rechargeable energy-cell battery icon with a small lightning-bolt and phosphate-cluster motif on it, buffering and steadying an energy reserve. Moderate glow. Color palette: warm amber #d4a04d battery shell + orange #e08a3c charge glow + small cyan phosphate sparks. Collectible item, NOT a creature with a face.

#### `eq-lactate-reserve-p4` (乳酸儲備, P4)

> ...Subject: a small wooden-and-glass fuel canister or vial filled with glowing amber lactate liquid, a modest emergency fuel reserve, a little portable fuel barrel with a cork. Faint glow only. Color palette: amber #d4a04d glowing lactate liquid + warm brown wooden barrel + glass. Small collectible item, NOT a creature with a face.

#### `eq-trace-glucose-p5` (微量葡萄糖, P5)

> ...Subject: a single tiny glucose sugar molecule — a small hexagonal-ring sugar crystal with a faint sparkle, humble and minimal, just a trace amount, plain low-grade starter fuel. No aura. Color palette: pale warm yellow-white sugar crystal, very subdued. Plain small collectible item, NOT a creature with a face.

## Regenerate a single equipment sprite

```bash
ID=eq-mitochondrial-powerhouse-p1
rm -rf /tmp/accel-sprites-raw/equipment/$ID
# Re-fire Gemini (Claude Code: mcp__gemini__gemini_generate_image, paste prompt above, save_dir=/tmp/accel-sprites-raw/equipment/$ID/)
SRC=$(ls /tmp/accel-sprites-raw/equipment/$ID/gemini_img_*.png | head -1)
OUT=packages/theme-pixel-neurons/sprites/equipment/$ID.png
CORNER=$(magick "$SRC" -format "%[pixel:p{0,0}]" info:)
magick "$SRC" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$CORNER" "PNG32:$OUT"
ls -la $OUT   # expect ~7–38 KB
# Vite HMR auto-reloads via the equipment glob watch
```

## Codex CLI fallback

If Gemini rejects a prompt (rare on neuroscience metaphors), per `~/.claude/imports/codex_image_gen.md`:

```bash
cd /tmp && codex exec -m gpt-5.5 --sandbox workspace-write --skip-git-repo-check \
  "Generate <prompt above>. Save the result to /tmp/$ID.png. \$imagegen" < /dev/null
mv /tmp/$ID.png /tmp/accel-sprites-raw/equipment/$ID/   # then run the magick post-process
```

## Cross-reference

- Capability spec: `openspec/specs/neurons-acceleration-system/spec.md`
- Acceleration change: `openspec/changes/archive/2026-06-04-add-neurons-acceleration-system/`
- This artwork change: `openspec/changes/generate-acceleration-sprites/` (archive path post-merge)
- Sibling generation docs: `SPRITE_GENERATION.md`, `CARD_SPRITE_GENERATION.md`
- Image gen routing: `~/.claude/imports/image_gen_routing.md`; codex gotchas: `~/.claude/imports/codex_image_gen.md`
