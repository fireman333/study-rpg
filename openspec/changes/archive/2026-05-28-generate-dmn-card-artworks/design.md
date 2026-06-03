## Context

`add-neurons-dmn-fate-card` (archived 2026-05-28 `5ba7b89`) shipped 21 DMN fate-card sprite keys all pointing at a 1×1 transparent PNG data URI (`TRANSPARENT_PIXEL`). Real artwork was deferred to this follow-up so the original change could ship within one session.

This change is a direct application of the **proven pipeline** from `generate-neurons-sprites` (archived 2026-05-25): `mcp__gemini__gemini_generate_image` parallel calls → `/tmp/` raw output → `magick` chroma-key + nearest-neighbor downsample + 16-color quantize → `packages/theme-pixel-neurons/sprites/<subfolder>/<id>.png` → Vite `import.meta.glob` wire-up in `SPRITE_MAP`. The only differences from the sibling are the **prompt content** (DMN concepts vs neuron morphology) and the **rarity-tier framing** (cards need P1-P4 visible border styling).

The 20 cards span 4 rarity tiers (P1 鑽石 × 2 / P2 金 × 4 / P3 銀 × 6 / P4 銅 × 8) and 5 event kinds (family-buff / variant-rate-up / quick-review-batch / streak-shield / hidden-reveal). Each card has a Chinese `displayName` (e.g., 「預設模式覺醒」, 「海馬迴漣漪」) and a Chinese `description` rooted in well-established DMN neuroscience anchors (mPFC, PCC, precuneus, angular gyrus, hippocampal sharp-wave ripples, REM consolidation). The shared `dmn:card-back` is a single sprite reused on every locked / not-yet-drawn card silhouette.

## Goals / Non-Goals

**Goals:**

- Ship 21 real GBA-era pixel-art card sprites that replace the placeholder transparent PNG mappings
- Each sprite communicates: (a) the DMN concept named in the card (visual metaphor for mPFC reverberation, hippocampal ripples, angular gyrus association, REM pruning, etc.); (b) **rarity tier** visible at a glance via border / glow / framing color; (c) a dreamlike / abstract / luminous aesthetic distinct from the concrete neuron-morphology sprites (DMN = spontaneous resting-state activity, not anatomy)
- Pattern reproducible via documented prompts + regen procedure for future contributors / re-generation
- Production build: sprites become Vite hashed URLs (cache-bustable), not inlined base64 (bundle stays lean)
- Identity-locking spec requirement protects against future accidental regression to placeholder

**Non-Goals:**

- **不** generate variant gacha sprites (`variant:<subjectId>:<slot>` × 55) — separate future change `generate-neuron-variant-sprites`
- **不** generate cosmetic / item / skill placeholder sprites — separate future per-consumer changes
- **不** ship animated sprites (idle bounce, hover glow, etc.) — static frames only; UI animations live in framer-motion via the existing `DmnDrawModal` reveal sequence
- **不** ship rarity-tier framing as a **separate compositor layer** (e.g., one card sprite + one frame sprite drawn on top) — rarity styling lives inside each card sprite via prompt-encoded border / glow
- **不**改 sprite size from 384×384 GBA convention
- **不**用 codex CLI path unless Gemini rejects (per `image_gen_routing.md` Gemini-first rule for single-object icons)
- **不**生 retina @2x — 384×384 single-resolution sufficient for all current viewport scales

## Decisions

### Decision 1: Gemini MCP for generation, not codex CLI

**Choice**: All 21 sprites via `mcp__gemini__gemini_generate_image` parallel batches (2 batches of ~10 calls + 1 batch with the card-back).

**Why**:

- Per `~/.claude/imports/image_gen_routing.md`: single-object / medium-complexity icon → Gemini-first
- 21 calls × ~5 sec wallclock each, parallel-callable in 2-3 batches → ~15-30 sec total wallclock vs codex CLI 21 × 2-4 min = 42-84 min
- Gemini does not consume codex Plus trial quota
- Per the existing `image_gen_routing.md` pixel-art recipes: ImageMagick post-process (chroma-key + nearest-neighbor + 16-color quantize) gives GBA aesthetic comparable to codex's native pixel-art output
- `generate-neurons-sprites` (2026-05-25) already proved this exact pipeline at 11-sprite batch size

**Alternatives considered**:

- Codex CLI `gpt-image-2`: rejected per routing rule (only used for complex scenes or when Gemini rejects); slower; consumes trial quota
- Hand-drawing in Aseprite: rejected — owner is not a pixel-art illustrator; would take days; no precedent in repo

### Decision 2: Post-process pipeline = ImageMagick chroma-key + downsample + quantize (identical to sibling)

**Choice**: For each Gemini output (typically 1024×1024 PNG with solid-color background), run:

```bash
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

**Why**:

- Identical to `generate-neurons-sprites` Decision 2; the recipe is documented in `~/.claude/imports/image_gen_routing.md` and proven on study-rpg-m2 hospital-fate-card sprites + the 11 neuron family sprites
- Nearest-neighbor (`-filter point`) preserves pixel-art sharpness through resize (no anti-alias blur)
- 16-color quantize (`-colors 16`) hits GBA palette aesthetic
- Chroma-key (`-fuzz 10% -transparent <corner-pixel>`) removes Gemini's solid background without harming sprite interior

**Edge cases**:

- If a card's prompt yields a fully-edge-to-edge composition where corner-pixel is part of the sprite content → chroma-key may bite into the sprite. Mitigation: re-prompt with explicit "centered composition, 40 px padding around all edges" wording (already in template per Decision 5).
- 16-color quantize occasionally introduces banding on smooth gradients (DMN glow effects). Mitigation: re-roll the offending card with Gemini and pick the variant that quantizes cleanly. Budget: 1-2 re-rolls per card is normal.

### Decision 3: Sprite files live at `packages/theme-pixel-neurons/sprites/cards/<cardId>.png` (subfolder, English kebab-case filenames matching cardId)

**Choice**:

- 21 files: 20 cards at `<cardId>.png` (e.g., `dmn-default-mode-awakening-p1.png`, `dmn-hippocampal-ripples-p2.png`) + 1 shared `card-back.png`
- Subfolder `cards/` namespaces away from `subjects/` (where neuron family sprites live) and from future `cosmetics/` / `items/` subfolders

**Why**:

- Mirrors subfolder precedent established by `generate-neurons-sprites` (`subjects/`) and `add-hospital-equipment-medexam2` (`equipment/`) and `add-doctor-sprite-roster` (`doctor-<id>-<rarity>.png` flat naming)
- Glob `'../sprites/cards/*.png'` cleanly scoped to card sprites only
- English kebab-case filenames mirror the `cardId` field exactly — `subject:<chinese-name>` precedent doesn't apply because `cardId` itself is already English kebab-case (`dmn-mpfc-reverberation-p2`, etc.). This keeps the artKey-to-filename mapping trivially obvious (key `dmn:card:dmn-mpfc-reverberation-p2` → file `cards/dmn-mpfc-reverberation-p2.png`).
- No filename munging / no transliteration table needed

### Decision 4: `import.meta.glob` with `?url` query — Vite hashed URL bundling (identical to sibling)

**Choice**:

```ts
const cardSprites = import.meta.glob('../sprites/cards/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// Map glob result keys ('../sprites/cards/dmn-mpfc-reverberation-p2.png')
// to SPRITE_MAP keys ('dmn:card:dmn-mpfc-reverberation-p2' or 'dmn:card-back')
```

Then in `SPRITE_MAP`:

```ts
// Card back (single shared sprite)
['dmn:card-back', cardSprites[cardBackKey] ?? TRANSPARENT_PIXEL],
// 20 individual card sprites
...DMN_CARD_IDS.map((id) => [
  `dmn:card:${id}`,
  cardSprites[`../sprites/cards/${id}.png`] ?? TRANSPARENT_PIXEL,
]),
```

**Why**:

- Identical mechanism to `generate-neurons-sprites` for SUBJECT_IDS — proven pattern
- `?url` query → Vite emits hashed filename URL → cache-busts on rebuild
- `eager: true` → all sprites loaded at module init (no async lazy import surprises)
- Production: PNG files become `assets/dmn-mpfc-reverberation-p2-<hash>.png` referenced via `<img src>` — browser caches indefinitely until hash changes
- Defensive `?? TRANSPARENT_PIXEL` fallback ensures the app doesn't crash if a sprite file is missing during dev / partial regen (matches existing SUBJECT_IDS / BRANCH_KEYS lines in sprites.ts)

### Decision 5: Prompt template — DMN concept × rarity-tier framing × dreamlike aesthetic

**Choice**: Each card prompt follows a fixed template structure:

```
GBA-era pixel art trading card sprite, 384×384 centered with 40px padding,
transparent background, flat shading, 16-color limited palette.

Subject: Abstract dreamlike depiction of <DMN concept from card displayName /
description>. Examples:
  - "預設模式覺醒" (Default Mode Awakening) → glowing 4-region brain silhouette
    with mPFC + PCC + precuneus + angular gyrus lighting up simultaneously
  - "海馬迴漣漪" (Hippocampal Ripples) → cross-section of curled hippocampus
    with cyan ripple waves emanating outward
  - "REM 突觸雕琢" (REM Synaptic Pruning) → moon-lit sleeping silhouette with
    sparkling synaptic fragments dissolving

Style: ethereal / luminous / introspective. NOT another anatomical neuron
sprite (those belong to family icons). Think Stardew Valley dream sequence
+ Pokemon Mystery Dungeon ghost-type cards.

Rarity framing (visible at card edges):
  - P1 鑽石 → white/gold inner glow + thin gold border with diamond corners
  - P2 金 → solid gold ornate border, slightly thicker than P3
  - P3 銀 → silver border with simpler ornament
  - P4 銅 → thin bronze border, minimal ornament

Color palette: dominant cool tones (deep purple #4a2a6a, indigo #3a4a8a,
soft cyan #6aa0c4, ethereal pink #c47a9a) with rarity-color accent at edges.
```

**Card-back prompt** (one-shot, separate):

```
GBA-era pixel art trading card BACK design, 384×384, opaque (not transparent).
A stylized brain silhouette in dark navy (#2a3a5a) viewed from above, with
the 4 DMN hubs (mPFC front, PCC back, precuneus center, angular gyrus sides)
glowing in soft pulsing cyan/violet. Symmetrical mandala-like ornament around
the edges, gold trim. Style: tarot-card back meets Pokemon TCG back.
```

**Why this template**:

- DMN is conceptual / functional, not anatomical — prompts must steer away from "draw a neuron" defaults toward dream/glow/abstract metaphors
- Rarity framing visible at a glance is critical UX — when user opens `/dmn` collection page they need to scan 20 cards by tier without reading labels
- Cool palette differentiates DMN cards from the warm-toned neuron family sprites (which use DA gold / 5HT red / Glu green / GABA blue per NT branch); cards live in a different visual register
- 40 px edge padding protects the chroma-key step from biting into sprite content
- "NOT another anatomical neuron sprite" is an explicit negative constraint because Gemini tends to default to drawing literal neurons when prompted with neuroscience terms; the abstract dreamlike directive is necessary

### Decision 6: No separate frame layer; rarity styling baked into each card sprite

**Choice**: Each card sprite ships with its rarity-tier border / glow already drawn into the PNG. UI components do NOT composite a separate frame sprite on top.

**Why**:

- Simpler runtime — single `<img src={spriteMap['dmn:card:xxx']} />` works everywhere
- One sprite = one fetch; no synchronization between card-fill and frame-overlay sprites
- Rarity is already encoded in `cardId` suffix (`-p1` / `-p2` / `-p3` / `-p4`), so re-rendering a card with a different frame would require regenerating the sprite anyway
- Avoids needing 4 separate frame sprites (`frame-p1.png`, `frame-p2.png`, ...) that consumers would need to remember to composite

**Trade-off**:

- If owner later wants to change the visual style of all P3 borders (e.g., "make silver more brushed-metal"), every P3 card must be regenerated. Acceptable — re-running 6 P3 prompts takes ~2 min and is rare in practice
- Re-roll cost is per-card (Gemini + magick) rather than per-frame layer

### Decision 7: Acceptance bar = identity-locking spec requirement on `neurons-dmn-fate-cards`

**Choice**: Add one `### Requirement: DMN fate cards SHALL have real artwork registered in theme-pixel-neurons` to `neurons-dmn-fate-cards` (delta spec ADDED Requirements section).

**Why**:

- Mirrors `generate-neurons-sprites` which added the same kind of identity-locking requirement to `neurons-mode`
- Protects against future agents accidentally reverting `dmn:card:*` keys to placeholder (e.g., during a refactor that simplifies `SPRITE_MAP` construction)
- Test surface: any future change that touches sprites.ts will be checked against this requirement via `openspec validate`

**Scope of requirement**:

- Each `dmn:card:<cardId>` key MUST resolve to a real PNG (not `TRANSPARENT_PIXEL`)
- `dmn:card-back` MUST resolve to a real PNG
- Sprite must visually communicate (a) the DMN concept named in the card and (b) the rarity tier (P1/P2/P3/P4)
- Permits other sprite categories (variants / items / cosmetics / skills) to remain placeholder pending their own consumer changes

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Gemini rejects DMN prompts (less likely than codex; Gemini is permissive on neuroscience metaphors) | Per `image_gen_routing.md`: fallback to codex CLI for rejected cards. Document the codex fallback recipe in `CARD_SPRITE_GENERATION.md`. |
| 16-color quantize causes banding on glow gradients (most likely on `family-buff` cards with luminous halos) | Re-roll with Gemini and pick variant that quantizes cleanly. Budget 1-2 re-rolls per card. If still banded, increase to 24 colors (`-colors 24`) for that specific card. |
| Visual identity collision between cards in the same event-kind family (e.g., two `quick-review-batch` cards look too similar) | Each prompt must include the **specific neuroscience anchor** from the card's `description` field — that's the differentiator (sharp-wave ripples vs spontaneous cortical discharge vs posteromedial pulse all visually distinguishable). |
| Chroma-key bites into sprite interior because Gemini chose a background color matching part of the sprite | Re-prompt with explicit "high-contrast background, dark purple #2a1a3a wash" instruction. Template already includes 40 px padding to provide a chroma-key safe margin. |
| Vite glob doesn't pick up new files because dev server cached the old empty state | `pnpm --filter @study-rpg/theme-pixel-neurons build` to refresh; dev server restart if needed. Sibling change verified this works. |
| Bundle bloat — 21 sprites × ~25 KB = ~525 KB | Acceptable — these are Vite-hashed and cache indefinitely; only loaded when `/dmn` page opens. Compare: theme-pixel-hospital has 70+ doctor sprites (~2 MB total) with no perf issue. |
| Sprite filenames using Chinese cardId pieces could trip filesystem encoding edge cases | N/A — DMN cardIds are pure English kebab-case (`dmn-mpfc-reverberation-p2`); only family sprites used Chinese filenames and worked fine. |

## Migration Plan

**Deploy path**: standard `pnpm deploy:cf` (CF Pages direct-upload) + GH Actions auto-deploy on push to `main`. No new env vars. No Worker / D1 / KV change. No Supabase migration.

**Rollback**: if real sprites cause issues (e.g., layout shift on a card that doesn't fit the expected 384×384 bounds), revert the `sprites.ts` change to map `DMN_ART_KEYS` back to `TRANSPARENT_PIXEL`. Files in `sprites/cards/` can stay (orphaned but harmless). The capability spec ADDED Requirement would need to be reverted via a follow-up change (or revert PR).

**Cross-track impact**: `track-m2` (二階) and `main` (一階) do not consume `theme-pixel-neurons`, so this change has zero cross-track conflict risk. The merge from `track-neurons` → `main` only touches files under `packages/theme-pixel-neurons/`, `openspec/changes/`, `openspec/specs/neurons-dmn-fate-cards/`.

## Open Questions

None. Design is a direct application of the proven `generate-neurons-sprites` pattern with documented adjustments (rarity framing, dreamlike aesthetic, English filenames). Acceptance bar locked via the new identity requirement.
