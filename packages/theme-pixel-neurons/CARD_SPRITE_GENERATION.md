# DMN fate-card sprite generation

> Companion to `SPRITE_GENERATION.md` (which documents the 11 neuron-family
> subject icons). This file covers the 21 DMN fate-card sprites shipped by
> `generate-dmn-card-artworks` (2026-05-28).

## Sprite inventory (which keys map to which file type)

| Sprite category | Count | Path pattern | Real / placeholder |
|---|---|---|---|
| Subject icons (neuron families) | 11 | `sprites/subjects/<id>.png` | **Real** (per `SPRITE_GENERATION.md`) |
| NT branch hubs | 4 | `sprites/branches/<nt>-icon.png` | **Real** |
| Root brain (Connectome center) | 1 | `sprites/root/*.png` | **Real** |
| **DMN fate cards (20 individual)** | **20** | **`sprites/cards/<cardId>.png`** | **Real (this doc)** |
| **DMN card back (shared)** | **1** | **`sprites/cards/card-back.png`** | **Real (this doc)** |
| Items / cosmetics / skill placeholders / variant gacha | 131 | (various) | Placeholder TRANSPARENT_PIXEL — pending per-consumer changes |

The 20 individual card sprite keys are `dmn:card:<cardId>` where `<cardId>` matches the `cardId` field declared in `@study-rpg/content-neurons-tw`'s `DMN_CARD_CATALOG`. The shared key `dmn:card-back` is rendered on every locked / not-yet-drawn card silhouette in `DmnCollectionPage`.

## Generation pipeline

1. **Gemini MCP** (`mcp__gemini__gemini_generate_image`) — fires 21 prompts in parallel batches (2 × 10 + 1 card-back) to `/tmp/dmn-card-sprites-raw/<cardId>/gemini_img_*.png` (2048×2048 RGBA, ~5 MB each)
2. **ImageMagick post-process** — chroma-key transparent background + nearest-neighbor downsample to 384×384 + 16-color quantize → `sprites/cards/<cardId>.png` (~15–60 KB each). Card-back skips chroma-key (opaque).
3. **Vite `import.meta.glob`** — auto-registers `sprites/cards/*.png` into `SPRITE_MAP` at build time. Production gets hashed asset URLs for cache-busting.

Per `~/.claude/imports/image_gen_routing.md`: Gemini-first for single-object icons (~5 sec / image, parallel-callable, ~30× faster than codex CLI). Codex CLI only as fallback when Gemini rejects a prompt (rare for DMN concepts; Gemini is permissive on neuroscience metaphors).

## Magick recipe

### For 20 individual cards (transparent background)

```bash
src=/tmp/dmn-card-sprites-raw/<cardId>/gemini_img_*.png
out=packages/theme-pixel-neurons/sprites/cards/<cardId>.png
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

`-filter point` = nearest-neighbor (preserves pixel-art sharpness through resize). `+dither` = no Floyd-Steinberg dithering (cleaner GBA aesthetic). `-fuzz 10%` allows 10% tolerance around the corner-pixel color when computing transparency mask.

### For shared card-back (opaque background)

```bash
src=/tmp/dmn-card-sprites-raw/card-back/gemini_img_*.png
out=packages/theme-pixel-neurons/sprites/cards/card-back.png
magick "$src" -filter point -resize 384x384! +dither -colors 16 "PNG32:$out"
```

No chroma-key — card-back represents a physical card flipped face-down, opaque is intentional.

## Prompt template (per design Decision 5)

Each individual card prompt follows this structure:

```
GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px
padding, transparent dark purple background.

Subject: <DMN concept from cardId — see catalog below>.

Color palette: <card-specific cool tones> with <rarity-color> accent at edges.

<rarity-tier> RARITY FRAME:
  - P1 鑽石 → thick ornate gold border with diamond shapes at all four corners
  - P2 金 → ornate gold border, slightly thinner than P1, no diamond corners
  - P3 銀 → silver border with simple geometric ornament
  - P4 銅 → thin bronze border, minimal ornament

Style: ethereal, luminous, dreamlike (Stardew Valley dream sequence + Pokemon
Mystery Dungeon ghost-type). 16-color limited palette, flat shading, hard
pixel edges. NOT another anatomical neuron sprite.
```

The "NOT another anatomical neuron sprite" negative constraint is necessary because Gemini defaults to drawing literal neurons when prompted with neuroscience terms; DMN cards are conceptual / functional, not anatomical.

## Catalog (20 individual prompts + 1 card-back)

### P1 鑽石 × 2

#### `dmn-default-mode-awakening-p1` (預設模式覺醒 / family-buff)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: dreamlike scene of a brain silhouette viewed from the side with FOUR Default Mode Network hubs simultaneously lighting up in soft white-gold glow — mPFC at front, PCC at back, precuneus at center top, angular gyrus on side. Synchronized firing depicted as concentric ripples spreading from all 4 hubs at once. Color palette: deep purple #4a2a6a wash with brilliant gold-white glow at hubs. P1 RARITY FRAME: thick ornate gold border with diamond shapes at all four corners. Style: ethereal, luminous, dreamlike (Stardew Valley dream sequence + Pokemon Mystery Dungeon ghost-type). 16-color limited palette, flat shading, hard pixel edges. NOT another anatomical neuron sprite.

#### `dmn-stream-of-consciousness-p1` (意識洪流 / variant-rate-up)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a luminous river of glowing word-light flowing through the medial prefrontal cortex and temporal pole region of a brain silhouette — like a stream of consciousness made visible. Words dissolve into pure light particles flowing in a curving river shape. Color palette: indigo #3a4a8a wash with pearl-white luminous stream. P1 RARITY FRAME: thick ornate gold border with diamond shapes at four corners. Style: ethereal, luminous, dreamlike. 16-color palette, flat shading, hard pixel edges. NOT another anatomical neuron sprite.

### P2 金 × 4

#### `dmn-hippocampal-ripples-p2` (海馬迴漣漪 / quick-review-batch)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: cross-section view of a seahorse-shaped hippocampus with concentric cyan ripple waves emanating outward, depicting sharp-wave ripple memory replay. Tiny memory fragments visible riding the wave-fronts. Color palette: deep navy background with bright cyan ripples. P2 RARITY FRAME: ornate gold border, slightly thinner than P1, no diamond corners. Style: ethereal, luminous. 16-color palette, flat shading, hard pixel edges.

#### `dmn-pcc-pulse-p2` (後扣帶皮層脈動 / streak-shield)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: central PCC (posterior cingulate cortex) region of a brain silhouette pulsing in steady warm cyan-violet baseline rhythm, depicted as concentric circular pulse rings expanding outward. A faint shield silhouette overlay in the background suggests protective continuity. Color palette: deep purple wash with steady cyan-violet pulse. P2 RARITY FRAME: ornate gold border. Style: ethereal, luminous, steady. 16-color palette, flat shading.

#### `dmn-mpfc-reverberation-p2` (內側前額葉迴響 / family-buff)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: medial prefrontal cortex area of a brain silhouette (front of brain) with concentric reverberation rings echoing outward like ripples in a pond, depicting self-referential network resonance. Each ring slightly thicker and dimmer than the previous. Color palette: indigo wash with golden reverberation rings. P2 RARITY FRAME: ornate gold border. Style: ethereal, luminous, resonant. 16-color palette.

#### `dmn-rem-pruning-p2` (REM 突觸雕琢 / variant-rate-up)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a moonlit sleeping figure silhouette (just head and shoulders) with sparkling synaptic connections dissolving and being pruned away into stardust particles drifting upward into a crescent moon. Deep night-blue mood. Color palette: deep blue night with silver-pearl synapse sparkles and pale gold moonlight. P2 RARITY FRAME: ornate gold border. Style: ethereal, dreamlike, dissolving. 16-color palette.

### P3 銀 × 6

#### `dmn-angular-association-p3` (角迴聯想 / hidden-reveal)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: angular gyrus region of a brain silhouette (parietal-temporal junction) with a glowing vertical crack splitting open and revealing a hidden ghostly card silhouette behind, depicting semantic-association light leak. Color palette: dark purple with pearl-white crack-light revealing ghostly silhouette behind. P3 RARITY FRAME: silver border with simple geometric ornament. Style: ethereal, luminous, revealing. 16-color palette.

#### `dmn-daydream-drift-p3` (白日夢遊蕩 / hidden-reveal)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: drifting cloud-like ethereal patterns floating over a brain silhouette in profile, with one faint ghostly card outline barely visible peeking through the mist. Mind-wandering daydream aesthetic. Color palette: soft pink ethereal mist over deep purple. P3 RARITY FRAME: silver border. Style: dreamlike, drifting, hazy. 16-color palette.

#### `dmn-temporal-pole-anchor-p3` (顳極記憶錨點 / streak-shield)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: temporal pole region of a brain silhouette (front of temporal lobe) anchored by a glowing golden chain extending downward like a memory anchor, holding steady. Warm steady glow. Color palette: warm amber anchor chain over deep purple. P3 RARITY FRAME: silver border. Style: ethereal, steady, grounded. 16-color palette.

#### `dmn-dln-switch-p3` (背外側網絡切換 / variant-rate-up)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: two overlapping abstract brain network patterns toggling — DMN network glowing soft cyan and dorsal attention network glowing orange — with a switch icon / arrow motif between them showing the toggle action. Color palette: cyan-orange dual networks on deep purple. P3 RARITY FRAME: silver border. Style: networked, abstract, switching. 16-color palette.

#### `dmn-resting-state-ripple-p3` (靜息態 fMRI 蕩漾 / family-buff)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: smooth fMRI-style resting-state activity ripples flowing horizontally across a brain silhouette, depicting BOLD signal waves at rest. Calm, meditative ripple lines. Color palette: soft cyan undulating ripples on deep purple. P3 RARITY FRAME: silver border. Style: serene, undulating, calm. 16-color palette, flat shading.

#### `dmn-spontaneous-discharge-p3` (大腦自發放電 / quick-review-batch)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: cortical surface of a brain silhouette with scattered spontaneous burst firing sparks — small yellow-orange star-bursts at random points across the cortex. Color palette: dark purple background with bright yellow-orange spontaneous sparks. P3 RARITY FRAME: silver border. Style: scattered, lively, electric. 16-color palette.

### P4 銅 × 8

#### `dmn-micro-mind-wander-p4` (微 mind-wander / family-buff)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: small drift of soft pale cyan light moving across a portion of a brain silhouette, depicting brief micro mind-wandering. Minimal composition, lots of negative space. Color palette: pale cyan drift on deep purple. P4 RARITY FRAME: thin bronze border, minimal ornament. Style: subtle, brief, sparse. 16-color palette.

#### `dmn-mini-self-reference-p4` (小型自我參照 / variant-rate-up)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a single small bright spark of gold light in the medial prefrontal area (front) of a brain silhouette, depicting a brief self-referential thought. Tiny, focused, minimal. Color palette: gold spark on deep purple. P4 RARITY FRAME: thin bronze border. Style: brief, focused, minimal. 16-color palette.

#### `dmn-posteromedial-pulse-p4` (小幅後縱列脈衝 / quick-review-batch)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: small soft pulse emerging from the posteromedial region (back-center) of a brain silhouette, depicted as a single small expanding ring. Color palette: soft violet pulse ring on deep purple. P4 RARITY FRAME: thin bronze border. Style: minimal, brief, gentle. 16-color palette.

#### `dmn-brief-swr-p4` (短陣 SWR / quick-review-batch)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a brief cyan ripple emanating from a small seahorse-shaped hippocampus, single short ripple wave only, smaller and dimmer than a P2 version. Color palette: dark navy background with single cyan ripple. P4 RARITY FRAME: thin bronze border. Style: minimal, brief, small. 16-color palette.

#### `dmn-micro-context-guard-p4` (微脈絡保護 / streak-shield)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a small bronze shield motif hovering over a tiny abstract context-map fragment (like a stylized scene representation made of small geometric tiles), depicting micro context preservation guarding a streak. Color palette: bronze shield on deep purple, with cyan map tiles. P4 RARITY FRAME: thin bronze border. Style: protective, small, sturdy. 16-color palette.

#### `dmn-small-circuit-immunity-p4` (小迴路免疫 / streak-shield)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a small closed-loop circuit pattern glowing in protective cyan-violet, a tiny defense ring within a brain silhouette, suggesting circuit-level immunity. Color palette: cyan-violet circuit loop on deep purple. P4 RARITY FRAME: thin bronze border. Style: protective, compact, electronic. 16-color palette.

#### `dmn-cue-glimmer-p4` (線索閃光 / hidden-reveal)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a small bright white glimmer / spark at the angular gyrus location (parietal-temporal junction) of a brain silhouette, with a very faint ghostly card-outline silhouette barely visible nearby through faint mist. Color palette: white glimmer on deep purple with faint ghostly silhouette. P4 RARITY FRAME: thin bronze border. Style: subtle hint, brief reveal. 16-color palette.

#### `dmn-premonition-glow-p4` (預感微光 / hidden-reveal)

> GBA-era pixel art trading card sprite, 384x384 pixels, centered with 40px padding, transparent dark purple background. Subject: a small soft pale violet glow on a brain silhouette revealing the faint outline of a future card silhouette in ghostly mist beside it, depicting a precognition micro-glimpse. Color palette: pale violet glow on deep purple with ghostly card outline. P4 RARITY FRAME: thin bronze border. Style: prescient, faint, gentle. 16-color palette.

### Shared `card-back` (opaque)

> GBA-era pixel art trading card BACK design, 384x384 pixels, opaque background (not transparent). A stylized brain silhouette in dark navy color #2a3a5a viewed from above, with 4 Default Mode Network hubs glowing in soft pulsing cyan and violet: mPFC at front, PCC at back, precuneus at center, angular gyrus on the sides. Symmetrical mandala-like ornament wraps the edges with thin gold trim and small four-pointed stars at corners. Style reference: tarot card back meets Pokemon TCG card back. Limited 16-color palette, flat shading, no anti-aliasing, hard pixel edges. Centered composition with even padding.

## Regen procedure (single card)

If you want to re-roll a single sprite (e.g., chroma-key bit into sprite interior, or visual identity needs tweaking):

```bash
# 1. Identify the cardId you want to re-roll
ID=dmn-mpfc-reverberation-p2

# 2. Clear old raw output
rm -rf /tmp/dmn-card-sprites-raw/$ID

# 3. Re-fire Gemini (manual via Claude Code, paste prompt from catalog above)
# (Claude Code: mcp__gemini__gemini_generate_image with save_dir = /tmp/dmn-card-sprites-raw/$ID/)

# 4. Post-process (transparent variant; use opaque variant for card-back only)
SRC=$(ls /tmp/dmn-card-sprites-raw/$ID/gemini_img_*.png | head -1)
OUT=packages/theme-pixel-neurons/sprites/cards/$ID.png
CORNER=$(magick "$SRC" -format "%[pixel:p{0,0}]" info:)
magick "$SRC" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$CORNER" "PNG32:$OUT"

# 5. Verify size 15-50 KB
ls -la $OUT

# 6. Trigger Vite hot-reload (dev) or rebuild for prod
pnpm --filter @study-rpg/neurons-tw dev   # dev
# or
pnpm --filter @study-rpg/neurons-tw build # prod
```

## Codex CLI fallback

If Gemini rejects a particular DMN prompt (rare but possible — they're permissive on neuroscience, but content-safety classifier is non-deterministic), per `~/.claude/imports/codex_image_gen.md`:

```bash
cd /tmp && codex exec --sandbox workspace-write \
  "Generate <prompt from catalog above>. Save the result to /tmp/dmn-rescue/$ID.png. \$imagegen" \
  < /dev/null

mv /tmp/dmn-rescue/$ID.png /tmp/dmn-card-sprites-raw/$ID/
# Then run magick post-process as above
```

Codex CLI takes ~2-4 min per call (slower than Gemini's ~5 sec) and consumes Codex Plus trial token quota. Only use when Gemini fails.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Chroma-key bites into sprite interior | Gemini chose a background color matching part of the sprite | Re-roll with explicit "high-contrast dark purple wash background" wording, or lower fuzz: `-fuzz 5%` |
| Sprite shows visible color banding on glow gradients | 16-color quantize too aggressive for smooth gradients (most often on `family-buff` and `streak-shield` cards) | Increase to 24 colors for that specific card: `-colors 24` (still GBA-acceptable) |
| Multiple cards look too similar | Prompts didn't differentiate the specific neuroscience anchor | Re-prompt with stronger anchor-specific wording (e.g., "seahorse-shaped" for hippocampus, "concentric rings" for PCC pulse, etc.) |
| Raw Gemini output 50–500 KB instead of ~5 MB | Sparse composition (mostly flat color → PNG compresses well) | OK as long as visible content is correct; not always a degraded output |
| Vite doesn't pick up new file in dev | Module cache | Restart dev server: kill + `pnpm --filter @study-rpg/neurons-tw dev` |

## Cross-reference

- Capability spec: `openspec/specs/neurons-dmn-fate-cards/spec.md`
- Original DMN fate-card change: `openspec/changes/archive/2026-05-28-add-neurons-dmn-fate-card/`
- This artwork change: `openspec/changes/generate-dmn-card-artworks/` (archive path post-merge)
- Sibling generation: `SPRITE_GENERATION.md` (11 subject icons, same Gemini + magick pipeline)
- Image gen routing rules: `~/.claude/imports/image_gen_routing.md`
- Codex CLI gotchas: `~/.claude/imports/codex_image_gen.md`
