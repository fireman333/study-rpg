## Why

`add-neurons-dmn-fate-card` (archived 2026-05-28) shipped the 12th neurons capability with 21 placeholder sprite keys (`dmn:card:<cardId>` × 20 + `dmn:card-back`) all mapped to a 1×1 transparent PNG. Real artwork was explicitly deferred to this follow-up. Until real sprites land, the `/dmn` collection page reads as a wireframe — neuroscience-flavored card names with empty rectangles where the art should be. This is the last bottleneck before the M_3rd track is genuinely ship-ready for the planned Threads public intro post (per `add-neurons-dmn-fate-card` design Decision 6).

Per `~/.claude/imports/image_gen_routing.md`, single-object pixel-art icons are Gemini-first territory (~5 sec / image, parallel-callable, ~30× faster than codex CLI). The sibling change `generate-neurons-sprites` (archived 2026-05-25) already proved this exact pipeline at scale for 11 neuron family sprites — same Gemini MCP + ImageMagick post-process recipe. This change is a direct application of that proven pattern to a new 21-sprite batch.

## What Changes

- Generate 21 GBA-era pixel-art sprites for DMN fate cards (20 named cards + 1 shared card-back design) via `mcp__gemini__gemini_generate_image` parallel batches
  - Each card sprite reflects: (a) the neuroscience anchor in the card's `displayName` / `description` (mPFC reverberation, hippocampal sharp-wave ripples, angular gyrus association, etc.); (b) rarity-tier color framing (P1 鑽石 = white/gold inner glow, P2 金 = gold border, P3 銀 = silver border, P4 銅 = bronze border); (c) abstract / luminous / dreamlike aesthetic (DMN = resting-state spontaneous activity, NOT another anatomical neuron)
  - The shared card-back design = generic DMN motif (4-region brain silhouette with PCC / mPFC / precuneus / angular gyrus glow) usable on every locked / not-yet-drawn card slot
- Save raw Gemini output to `/tmp/dmn-card-sprites-raw/` then post-process via documented ImageMagick recipe (chroma-key transparent background, nearest-neighbor downsample to 384×384, 16-color quantize) to `packages/theme-pixel-neurons/sprites/cards/<cardId>.png`
- Refactor `packages/theme-pixel-neurons/src/sprites.ts`:
  - Add `cardSprites = import.meta.glob('../sprites/cards/*.png', { eager: true, query: '?url', import: 'default' })`
  - Replace the `DMN_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL])` line in `SPRITE_MAP` with `DMN_ART_KEYS.map((k) => [k, cardSprites[k] ?? TRANSPARENT_PIXEL])` — defensive fallback pattern matching the existing SUBJECT_IDS / BRANCH_KEYS lines
  - Keep all other sprite categories (items / cosmetics / skill placeholders / variants / core scaffold) on TRANSPARENT_PIXEL unchanged
- Document the 21 prompts + magick post-process recipe + regen procedure in `packages/theme-pixel-neurons/CARD_SPRITE_GENERATION.md` (mirroring `SPRITE_GENERATION.md` precedent from `generate-neurons-sprites`)

**不做**：

- 不 generate variant gacha sprites (`variant:<subjectId>:<slot>` × 55) — they live in their own future change `generate-neuron-variant-sprites`
- 不 generate item / cosmetic / skill placeholder sprites — separate future per-consumer changes
- 不改 sprite size (384×384 GBA convention preserved)
- 不 ship per-rarity card frame as a separate sprite — rarity styling lives **inside** each card sprite (Gemini prompt directs border color); UI components do not composite a frame layer on top
- 不 wire animation (`AnimatePresence` reveal already exists in `DmnDrawModal`; sprite is static PNG)
- 不 walk codex CLI route unless Gemini rejects (per image_gen_routing.md fallback order)

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neurons-dmn-fate-cards`: add one identity-locking requirement (`### Requirement: DMN fate cards SHALL have real artwork registered in theme-pixel-neurons`) that formalizes the visual identity contract — every `dmn:card:<cardId>` key in `SPRITE_MAP` SHALL resolve to a real PNG (not the transparent placeholder). Mirrors the precedent set by `generate-neurons-sprites` which added the same kind of identity-locking requirement to `neurons-mode`. This protects against future regressions to placeholder sprites.

## Impact

- **Code**:
  - `packages/theme-pixel-neurons/sprites/cards/<21 files>.png` (new; each ~15–40 KB after 16-color quantize)
  - `packages/theme-pixel-neurons/src/sprites.ts` (modified: add `cardSprites` glob constant + change one line in `SPRITE_MAP` Object.fromEntries call from `TRANSPARENT_PIXEL` to `cardSprites[k] ?? TRANSPARENT_PIXEL`)
  - `packages/theme-pixel-neurons/CARD_SPRITE_GENERATION.md` (new; documents prompts + regen procedure)
- **APIs**: none
- **Dependencies**: no new npm packages (uses existing `@vite` glob mechanism + system `magick` CLI)
- **Data**: no Dexie / R2 / event schema changes
- **Backwards compat**: pure asset replacement. Any client already using `SPRITE_MAP['dmn:card:<id>']` to fetch a URL will naturally upgrade from `data:image/png;base64,...` (transparent placeholder) to `/assets/<cardId>-<hash>.png` (real Vite-bundled URL) on next deploy. No state migration needed.
- **Sync**: untouched (sprite URLs are not persisted to Dexie or R2; they are build-time hashed asset references)
- **Spec touched**: none (no delta spec; no `## ADDED Requirements` / `## MODIFIED Requirements` files)
- **Bundle delta**: ~21 sprites × ~25 KB avg = ~525 KB raw. Vite emits hashed URLs for `<img>` lazy-load, NOT inlined into main JS bundle. Network impact is on `/dmn` page load only (browser caches sprites indefinitely until next deploy bumps hashes).
- **Deploy path**: standard `pnpm deploy:cf` (CF Pages direct-upload) + GH Actions auto-deploy. No new env vars, no Worker change, no D1 / KV change.
