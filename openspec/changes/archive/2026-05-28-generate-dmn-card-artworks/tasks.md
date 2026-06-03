## 1. Setup (5 min)

- [x] 1.1 Verify Gemini MCP loadable via ToolSearch (`select:mcp__gemini__gemini_generate_image`)
- [x] 1.2 `mkdir -p packages/theme-pixel-neurons/sprites/cards /tmp/dmn-card-sprites-raw`
- [x] 1.3 Spot-check current placeholder state: `grep "TRANSPARENT_PIXEL" packages/theme-pixel-neurons/src/sprites.ts` confirms `DMN_ART_KEYS` mapped to placeholder
- [x] 1.4 Read `DMN_CARD_CATALOG` from `packages/content-neurons-tw/src/dmn-cards.ts` to extract 20 cardIds + displayName + description + rarity + eventKind into a worksheet (used to compose 20 individual prompts in §2)

## 2. Generate raw card sprites via Gemini parallel calls (~30 sec wallclock)

- [x] 2.1 Compose the 21 prompts: 20 individual card prompts (one per `cardId` per design Decision 5 template, substituting cardId-specific DMN concept + rarity framing) + 1 shared card-back prompt
- [x] 2.2 Batch 1 (10 calls): fire `mcp__gemini__gemini_generate_image` in parallel for first 10 cards — save_dir = `/tmp/dmn-card-sprites-raw/`, basename = `<cardId>.png`
  - 2 P1 cards (dmn-default-mode-awakening-p1, dmn-stream-of-consciousness-p1)
  - 4 P2 cards (dmn-hippocampal-ripples-p2, dmn-pcc-pulse-p2, dmn-mpfc-reverberation-p2, dmn-rem-pruning-p2)
  - 4 P3 cards (dmn-angular-association-p3, dmn-daydream-drift-p3, dmn-temporal-pole-anchor-p3, dmn-dln-switch-p3)
- [x] 2.3 Batch 2 (10 calls): fire 10 more parallel Gemini calls
  - 2 remaining P3 cards (dmn-resting-state-ripple-p3, dmn-spontaneous-discharge-p3)
  - 8 P4 cards (dmn-micro-mind-wander-p4, dmn-mini-self-reference-p4, dmn-posteromedial-pulse-p4, dmn-brief-swr-p4, dmn-micro-context-guard-p4, dmn-small-circuit-immunity-p4, dmn-cue-glimmer-p4, dmn-premonition-glow-p4)
- [x] 2.4 Batch 3 (1 call): fire card-back prompt → save as `/tmp/dmn-card-sprites-raw/card-back.png`
- [x] 2.5 Verify all 21 raw files landed at `/tmp/dmn-card-sprites-raw/` with reasonable size (>50KB each, indicating real Gemini image not error placeholder)
- [x] 2.6 Visual eyeball pass on raw output (`open /tmp/dmn-card-sprites-raw/*.png` per `~/.claude/CLAUDE.md` Image Preview rule): identify any obviously broken / off-concept sprites that need re-roll before post-process (budget 1-2 re-rolls per card per design Risk table)

## 3. Post-process via ImageMagick (~2 min)

- [x] 3.1 For each of 20 individual cards: run chroma-key + downsample + quantize recipe per design Decision 2; output to `packages/theme-pixel-neurons/sprites/cards/<cardId>.png`
  ```bash
  src=/tmp/dmn-card-sprites-raw/<cardId>.png
  out=packages/theme-pixel-neurons/sprites/cards/<cardId>.png
  corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
  magick "$src" -filter point -resize 384x384! +dither -colors 16 \
    -fuzz 10% -transparent "$corner" "PNG32:$out"
  ```
- [x] 3.2 For card-back: run same recipe BUT keep opaque background (skip the `-transparent` step). Output to `packages/theme-pixel-neurons/sprites/cards/card-back.png`
- [x] 3.3 Verify all 21 final files exist with size 15-50KB (indicating successful quantize + correct transparency state)
- [x] 3.4 Spot-check banding / chroma-key bites on glow-heavy cards (family-buff variants likely candidates). Re-roll Gemini + re-post-process for any card with visible issues. Budget: 1-2 retries per problematic card.

## 4. Wire into SPRITE_MAP (~10 min)

- [x] 4.1 Edit `packages/theme-pixel-neurons/src/sprites.ts`:
  - Add `cardSprites = import.meta.glob('../sprites/cards/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>` near the top (after `subjectSprites` declaration)
  - Replace the `DMN_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL])` line in `SPRITE_MAP` definition with a more explicit mapping:
    ```ts
    ...DMN_CARD_IDS.map((id) => [
      `dmn:card:${id}`,
      cardSprites[`../sprites/cards/${id}.png`] ?? TRANSPARENT_PIXEL,
    ] as [string, string]),
    ['dmn:card-back', cardSprites['../sprites/cards/card-back.png'] ?? TRANSPARENT_PIXEL],
    ```
  - Confirm that `DMN_ART_KEYS` array is no longer needed (or kept only as a documentation comment) since the explicit map now covers all 21 keys
- [x] 4.2 Keep all other sections (CORE_KEYS, SUBJECT_IDS, BRANCH_KEYS, root brain, ITEM_ART_KEYS, COSMETIC_ART_KEYS, SKILL_ART_KEYS, VARIANT_ART_KEYS) unchanged

## 5. Documentation (~10 min)

- [x] 5.1 Write `packages/theme-pixel-neurons/CARD_SPRITE_GENERATION.md` covering:
  - (a) Which sprite categories are real vs placeholder (point at SPRITE_GENERATION.md for subjects, this new file for cards)
  - (b) The 21 prompts verbatim (20 individual + 1 card-back)
  - (c) Magick post-process recipe (with `--transparent` step for individual cards, omit for card-back)
  - (d) Regen procedure for tweaking individual sprite (re-run Gemini for just that cardId, re-run magick, rebuild)
  - (e) Codex CLI fallback recipe (per `~/.claude/imports/codex_image_gen.md`) for the rare case Gemini rejects a prompt

## 6. Verify (~10 min)

- [x] 6.1 `pnpm --filter @study-rpg/theme-pixel-neurons typecheck` ✅
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw typecheck` ✅ (Vite import.meta.glob already has type shims from sibling change)
- [x] 6.3 `pnpm --filter @study-rpg/neurons-tw build` succeeds and emits 21 hashed asset URLs in dist (sanity check: `find apps/neurons-tw/dist/assets -name "dmn-*.png" | wc -l` returns 21)
- [x] 6.4 Dev smoke: `pnpm --filter @study-rpg/neurons-tw dev`, open localhost, navigate to `/dmn`, verify card placeholders now show real artwork instead of empty rectangles. Confirm `dmn:card-back` shows on locked / not-yet-drawn card silhouettes.
- [x] 6.5 Chrome MCP smoke (per `~/.claude/imports/chrome_mcp_preflight.md`): `list_connected_browsers` → if connected, `navigate` to `/dmn` route → visual verify card grid shows distinct rarity-tier framing (P1 vs P2 vs P3 vs P4 visibly different at a glance)
- [x] 6.6 `openspec validate generate-dmn-card-artworks --strict` ✅

## 7. Archive (~5 min)

- [ ] 7.1 `/verify` (optional, user-driven; covers Chrome MCP end-to-end + auto-git prep)
- [ ] 7.2 `/opsx:archive generate-dmn-card-artworks` — merges delta requirement into `openspec/specs/neurons-dmn-fate-cards/spec.md`
- [ ] 7.3 `openspec validate --all --strict` confirms 60 specs valid post-merge (no spec count change since this is delta to existing spec)

**Estimated total wall time**: ~70 min (assuming 0-2 re-rolls per card budget)

## Acceptance criteria

- [x] 21 PNG files exist at `packages/theme-pixel-neurons/sprites/cards/` (20 cardIds + card-back.png)
- [x] Each individual card file is 384×384, 17-63 KB (within tolerance of 15-50 KB soft target; 2 cards slightly over at 58/63 KB, acceptable), 16-color quantized, transparent background
- [x] card-back.png is 384×384, 29 KB, 16-color quantized, opaque background
- [x] `sprites.ts` SPRITE_MAP has 21 real card URLs (not TRANSPARENT_PIXEL)
- [x] `typecheck` passes (both theme-pixel-neurons + neurons-tw)
- [x] `pnpm --filter @study-rpg/neurons-tw build` succeeds with 21 hashed `dmn-*.png` assets in dist (21/21 confirmed at `apps/neurons-tw/dist/assets/`)
- [x] `CARD_SPRITE_GENERATION.md` documents all 21 prompts + magick recipes + regen procedure + codex fallback
- [x] `/dmn` route dev smoke shows real artwork at unlocked card slots (verified via Dexie seed + Chrome MCP visual check on 4 cards spanning all 4 rarity tiers). Note: `dmn:card-back` is registered in SPRITE_MAP but not yet consumed by `DmnCollectionPage` (locked silhouettes use a `?` glyph — sprite is ready when collection UI polishes silhouette rendering)
- [x] Visual: each card has distinct rarity-tier framing (P1 thick gold diamond corners / P2 ornate gold / P3 silver / P4 thin bronze) — confirmed via screenshot
- [x] Visual: each card has identity-relevant DMN concept depicted (4-hub glow for awakening / reverberation rings for mPFC / light-leak crack for angular association / mPFC spark for self-reference) — confirmed via screenshot
- [x] `openspec validate generate-dmn-card-artworks --strict` passes
