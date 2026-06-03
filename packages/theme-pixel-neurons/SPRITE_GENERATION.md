# Neuron Sprite Generation

This document covers the 11 neuron family subject icons in `sprites/subjects/`
(§ below) and the 55 variant gacha sprites in `sprites/variants/` (§ Variant
gacha sprites). Other categories (items / cosmetics / skill placeholders / 6
core scaffold keys) remain on placeholder PNG until their respective consumer
capabilities ship.

## Status

| Category | Sprite count | Status |
|---|---|---|
| Subject icons (neuron families) | 11 | ✅ Real (§ 11 family prompts) |
| Variant gacha (11 families × 5 slots) | 55 | ✅ Real (§ Variant gacha sprites) — `variant:default` terminal fallback stays placeholder |
| Item art | 20 | ⏳ Placeholder until inventory consumer ships |
| Cosmetic art | 20 | ⏳ Placeholder until dorm-view consumer ships |
| Skill placeholders | 36 | ⏳ Placeholder until skill tree consumer ships |
| Core scaffold (character-base, slot-placeholder-*, dorm-default) | 6 | ⏳ Placeholder until character / dorm consumer ships |

## Generation tool

Codex CLI `gpt-image-2` via `codex exec` (per `~/.claude/imports/codex_image_gen.md`
recipe + `~/.claude/imports/image_gen_routing.md` routing rules).

**Note (2026-05-25)**: codex 0.128.0 requires `--skip-git-repo-check` when
running from `/tmp` — the `codex_image_gen.md` memo predates this and needs an
update. Recipe used:

```bash
cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
  "<prompt>. Save the result to /tmp/<filename>.png. \$imagegen" \
  < /dev/null
mv /tmp/<filename>.png <project>/packages/theme-pixel-neurons/sprites/subjects/<filename>.png
```

Wall time: ~2-3 min per sprite, ~35 min serial for all 11.

Why codex not Gemini MCP: Gemini hit auth "image creation not available in your
location" on 2026-05-25 attempt; codex fallback per `image_gen_routing.md`.

## Prompt template

```
GBA-era pixel art sprite, 384x384 centered, transparent background, flat shading,
16-color limited palette. Single creature centered: cute <neuron-type> neuron
creature with friendly round face. Body morphology echoes real <neuron-class>:
<morphology-hint>. Color theme: <NT-color-name> (<hex>) as primary body color.
Personality: <persona>. Accessories: <persona-accessory>. Style reference:
Pokemon Red/Blue Gen 1 sprites + Stardew Valley creature design. No text, no
watermark.
```

## 11 family prompts

| # | File | Neuron type | NT color | Morphology hint | Accessory |
|---|---|---|---|---|---|
| 1 | 藥理學.png | VTA Dopaminergic | gold #d4a04d | small spherical soma + short axon | Thrill-Seeker: aviator sunglasses + lightning bolt |
| 2 | 公共衛生學.png | SNc Dopaminergic | gold #d4a04d | pyramidal-ish soma + longer dendrite | Aging Guardian: gray beard + reading glasses + walking stick |
| 3 | 寄生蟲學.png | Enteric Serotonergic | red #c44d4d | small spherical body | Puppeteer's Puppet: marionette strings + cross-bar at top |
| 4 | 組織學.png | MRN Serotonergic | red #c44d4d | simple bipolar | Quiet Curator: magnifying glass + scroll + cardigan |
| 5 | 生物化學.png | Cerebellar Purkinje | blue #6a9bc4 | **huge fan-shaped dendritic tree above head** (defining feature) | Mathematician: abacus or chalkboard with equation |
| 6 | 病理學.png | Striatal MSN | blue #6a9bc4 | medium soma + spiny dendrites | Judge: gavel + powdered wig + judge robe |
| 7 | 免疫學.png | PV+ Cortical Interneuron | blue #6a9bc4 | compact dense soma | Sentry Under Siege: shield + spear + helmet |
| 8 | 解剖學.png | DRG Sensory Afferent | green #6a8c3f | pseudo-unipolar (one process splits into two) | Scout: compass + explorer hat + binoculars |
| 9 | 生理學.png | Cortical Pyramidal L5 | green #6a8c3f | **triangular soma + apical dendrite up** (defining feature) | CEO: business suit + briefcase + sunglasses |
| 10 | 胚胎學.png | Cajal-Retzius | green #6a8c3f | **horizontal bipolar, layer 1 cortex** (defining feature) | Pioneer Architect: blueprint scroll + hardhat + T-square |
| 11 | 微生物學.png | Olfactory Sensory | green #6a8c3f | **long apical dendrite + cilia tuft on top** (defining feature) | Sentinel: spyglass + tiny watchtower silhouette |

## Regenerate a single sprite

If a sprite needs tweaking (visual doesn't read right, persona accessory wrong, etc.):

```bash
cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
  "<edited-prompt>. Save the result to /tmp/<filename>.png. \$imagegen" \
  < /dev/null
# Verify
ls -la /tmp/<filename>.png
# Replace in project
mv /tmp/<filename>.png /Users/kangweiling/coding-scratch/study-rpg-neurons/packages/theme-pixel-neurons/sprites/subjects/<filename>.png
```

Vite dev server auto-reloads the sprite via HMR (`import.meta.glob` watches the
directory). Hashed URLs regenerate on next prod build.

## Why not Gemini MCP

Gemini was the planned tool per `image_gen_routing.md` Decision (simple icons →
Gemini-first, ~5 sec/image, parallel-callable). On 2026-05-25 attempt, all 11
parallel Gemini calls returned auth "image creation not available in your
location" — likely needs `nlm login` refresh. Codex CLI was the fallback per the
same routing memo; slower (~2-3 min/sprite sequential) but reliable.

For future regen, try Gemini first; if still failing, follow the codex recipe above.

## Bundle impact

11 PNG files, total ~440 KB on disk:

```
12 KB 胚胎學.png
21 KB 解剖學.png
23 KB 寄生蟲學.png
23 KB 組織學.png
28 KB 微生物學.png
29 KB 生物化學.png
29 KB 病理學.png
57 KB 生理學.png
61 KB 藥理學.png
65 KB 公共衛生學.png
98 KB 免疫學.png
```

Vite production build bundles each with hashed URL (cache-busting). Sprites are
loaded as `<img src>` URLs, not inlined to main bundle. Browser caches indefinitely
until hash changes.

---

# Variant gacha sprites

55 sprites = 11 families × 5 career-stage slots, in `sprites/variants/`. Generated
per the `generate-neuron-variant-sprites` change (2026-05-30). Filenames are
`<familyId>-<slotIndex>.png` (e.g. `藥理學-1.png`) → key `variant:<familyId>:<slotIndex>`
(family IDs are Chinese, contain no `-`, so `sprites.ts` splits on the LAST `-`).
Persona names + flavour blurbs are the single source of truth in
`@study-rpg/content-neurons-tw` `NEURON_VARIANT_CATALOG` (`src/variants.ts`).

## Art direction — within-family coherence

The 5 slots of a family MUST read as ONE neuron archetype *evolving* (slot 1
newcomer → slot 5 legendary apex), not 5 unrelated creatures. Each codex/Gemini
call is independent, so coherence is engineered into the prompt: a shared
**per-family base fragment** (neuron silhouette + NT color + persona) + a uniform
**per-slot stage modifier**. 55 prompts = 11 bases × 5 stages.

NT-branch color: DA gold `#d4a04d` (藥理學 / 公共衛生學) · 5HT red `#c44d4d`
(寄生蟲學 / 組織學) · GABA blue `#6a9bc4` (生物化學 / 病理學 / 免疫學) · Glu green
`#6a8c3f` (解剖學 / 生理學 / 胚胎學 / 微生物學).

## Generation tool

Same codex CLI recipe + magick post-process as the subject icons. Batched via the
generator script (concurrency 5, prompts assembled from per-family base + stage):

```bash
RAW=/tmp/neurons-variant-sprites-raw; OUT=<repo>/packages/theme-pixel-neurons/sprites/variants
( cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
    "<base> <stage> Save the result to $RAW/<fid>-<slot>.png. \$imagegen" < /dev/null )
corner=$(magick "$RAW/<fid>-<slot>.png" -format "%[pixel:p{0,0}]" info:)
magick "$RAW/<fid>-<slot>.png" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$OUT/<chineseFamily>-<slot>.png"
```

Note (2026-05-30): codex hit its usage limit at sprite 53/55, so 微生物學 slots 4–5
were finished via Gemini MCP (`mcp__gemini__gemini_generate_image`, same magick
post-process) once Gemini auth was restored. Both tools produce equivalent
384×384 16-color transparent output. The inline shell here is **zsh** — use
explicit arrays, not unquoted `$var` word-splitting.

## Shared per-slot stage modifiers

| Slot | Modifier |
|---|---|
| 1 | rookie NEWCOMER — small, plain body, wide-eyed eager rookie, minimal accessory |
| 2 | apprentice — slightly bigger, holding one simple persona tool, focused look |
| 3 | skilled mid-tier — confident pose, persona accessory clearly featured |
| 4 | master — larger and more ornate, glowing accents, commanding posture |
| 5 | LEGENDARY APEX — radiant aura + particle accents, regal mythic grandeur, most elaborate version of the SAME silhouette |

## 11 per-family base fragments

Common prefix: `GBA-era pixel-art creature sprite, 384x384, one cute monster centered on a solid pure white background, flat shading, 16-color limited palette, Pokemon Red Blue Gen-1 style.` Common suffix: `No text, no letters, no watermark, single centered creature, solid uniform white background for clean chroma-key.`

| Family | NT color | Silhouette + persona fragment |
|---|---|---|
| 藥理學 | gold | golden neuron, round soma face + dendrite tufts + trailing tail; energetic THRILL-SEEKER (sunglasses → crown across slots) |
| 公共衛生學 | gold | golden neuron; calm wise GUARDIAN — small round shield or glowing lantern |
| 寄生蟲學 | red | crimson neuron; mischievous PUPPETEER — thin marionette strings + puppet cross-bar |
| 組織學 | red | crimson neuron, calm half-closed sleepy eyes; serene CURATOR — small book/quill, crescent-moon |
| 生物化學 | blue | blue neuron with **elaborate fan-shaped dendritic tree** above face; MATHEMATICIAN — abacus / equation motifs |
| 病理學 | blue | blue neuron with short spiny dendrites, stern face; JUDGE — tiny gavel + balance scales |
| 免疫學 | blue | blue neuron with bushy dendrites, brave face; armored SENTRY — helmet + round shield |
| 解剖學 | green | green neuron with single long process splitting into a T; adventurous SCOUT — explorer hat + compass/map |
| 生理學 | green | green neuron with **triangular soma + tall apical dendrite spike**; EXECUTIVE CEO — necktie + briefcase |
| 胚胎學 | green | green neuron with **horizontal stretched body + bipolar dendrites**; ARCHITECT — hardhat + blueprint scroll |
| 微生物學 | green | green neuron with **cilia/antennae tuft on top**, alert face; SENTINEL — radar dish / scanning goggles |

## Regenerate a single variant sprite

```bash
cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
  "<base-fragment> <stage-modifier> <common-suffix> Save the result to /tmp/<fid>-<slot>.png. \$imagegen" < /dev/null
corner=$(magick /tmp/<fid>-<slot>.png -format "%[pixel:p{0,0}]" info:)
magick /tmp/<fid>-<slot>.png -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" \
  "PNG32:/Users/kangweiling/coding-scratch/study-rpg-neurons/packages/theme-pixel-neurons/sprites/variants/<chineseFamily>-<slot>.png"
```

Vite HMR auto-reloads via the `import.meta.glob('../sprites/variants/*.png')` watch.
