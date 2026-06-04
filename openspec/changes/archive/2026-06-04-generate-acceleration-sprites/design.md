## Context

`add-neurons-acceleration-system` shipped two new asset categories with placeholder sprites:

1. **12 permanent equipment** (`EQUIPMENT_CATALOG` in `@study-rpg/content-neurons-tw`) — 6 speed/myelin lane + 6 energy/metabolic lane, across P1–P5 rarity. Each carries an `artworkId = equipment:<equipmentId>`.
2. **6 new DMN consumable cards** (surge × 3 + bolus × 3) added to `DMN_CARD_CATALOG` when `streak-shield` (4 cards) was removed for integrity. Each carries `artworkId = dmn:card:<cardId>`.

The theme package's `sprites.ts` already globs `../sprites/equipment/*.png` and `../sprites/cards/*.png` and hardcodes `EQUIPMENT_ART_KEYS` (12) + `DMN_CARD_IDS` (22) with the defensive `?? TRANSPARENT_PIXEL` fallback. **No `sprites.ts` edit is needed** — this change is pure asset drop-in (+ cleanup + docs + spec delta). This is the lightest variant of the proven `generate-neurons-sprites` / `generate-dmn-card-artworks` pattern.

## Goals / Non-Goals

**Goals:**

- Ship 18 real GBA-era pixel-art sprites (12 equipment + 6 surge/bolus cards) replacing the placeholder mappings.
- Equipment sprites communicate (a) neuroscience anchor, (b) rarity tier via aura intensity, (c) lane via palette — and read as **independent companion/aura objects**, not body-worn gear.
- Surge/bolus card sprites match the established DMN card aesthetic (dreamlike, dark-purple, rarity-framed) with surge=neuromodulator-cool / bolus=metabolic-warm differentiation.
- Remove the 4 orphaned streak-shield card PNGs (finish the acceleration change's streak-shield removal at the asset layer).
- Lock visual identity via two spec requirements (one new on `neurons-acceleration-system`, one MODIFIED on `neurons-dmn-fate-cards`) to guard against regression to placeholder.

**Non-Goals:**

- 不 touch `sprites.ts` (globs already wired); 不 generate item / cosmetic / skill / variant sprites (own future changes); 不 re-generate the 16 pre-existing DMN cards; 不 separate frame layer; 不改 384×384; 不 @2x; 不 animation; 不 schema/sync/Worker change.

## Decisions

### Decision 1: Gemini MCP for generation (not codex CLI)

**Choice**: All 18 sprites via `mcp__gemini__gemini_generate_image` parallel batches.

**Why**: Per `image_gen_routing.md`, single-object icons → Gemini-first. The MCP `image_count: 0` bug (predicted Flash-Lite default) was fixed in `gemini_server.py` (`Model.BASIC_FLASH`); confirmed live this session (`image_count: 1` on every call). 18 calls × ~5 sec parallel ≈ ~2 min total vs codex 18 × 2–4 min serial. Gemini does not consume codex Plus trial quota. Codex CLI stays the documented fallback if Gemini rejects a prompt (none did).

### Decision 2: Post-process = ImageMagick chroma-key + nearest-neighbor + 16-color quantize (identical to siblings)

```bash
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

**Why**: Documented in `image_gen_routing.md`, proven on all 3 prior neurons sprite batches. `-filter point` preserves pixel-art sharpness; `+dither` keeps a clean GBA look; corner-pixel chroma-key removes Gemini's solid background (equipment prompts request "solid pure white background"; card prompts request "transparent dark purple background" — both key cleanly off the corner pixel).

### Decision 3: Equipment art direction — companion/aura object, rarity-scaled aura, lane-distinct palette

**Choice**: Each equipment prompt = `GBA-era pixel art game sprite, 384x384, single object/creature centered, solid white background, flat shading, 16-color` + neuroscience-anchor subject + rarity aura + lane palette + `collectible companion item, NOT a creature with a face` (except the two literal cell companions: oligodendrocyte + astrocyte, which ARE cute creatures per their `displayName`).

- **Rarity aura ladder**: P1 = brilliant radiant aura + particle sparks (legendary); P2 = bright glow halo; P3 = moderate soft glow; P4 = faint glow; P5 = no aura, plain/humble. This is the at-a-glance rarity cue (the dex also groups by rarity, so the aura is reinforcement not the sole signal).
- **Lane palette**: speed/myelin = gold `#d4a04d` + white myelin + electric cyan `#6aa0c4` conduction sparks; energy/metabolic = warm orange `#e08a3c` / amber `#d4a04d` + warm tones. Speed cool-gold vs energy warm-orange keeps the two lanes visually separable in the dex.

**Why**: The catalog flavour text is the differentiator — each anchor (myelinated axon cable / saltatory lightning arc / oligodendrocyte wrapping myelin / concentric lamellae rings / Ranvier node / single thin wrap // bean-shaped mitochondrion with cristae / membrane pump moving Na⁺K⁺ ions / star astrocyte with glycogen beads / phosphocreatine battery / lactate fuel barrel / trace glucose crystal) is visually distinct. Per project `CLAUDE.md` "Neuroscience design verification" the anchors are textbook-grounded (oligodendrocyte myelin = durable conduction speed; Na⁺/K⁺-ATPase = endurance not speed; astrocyte-neuron lactate shuttle = metabolic support) — but these are **visual flavour** of already-OE-anchored mechanics from the acceleration change, not new design facts, so no fresh OE query is required.

### Decision 4: Surge/bolus card art — extends `generate-dmn-card-artworks` template

**Choice**: 6 cards follow the existing DMN card template (dreamlike/abstract, transparent dark-purple bg, P2 ornate gold / P3 silver / P4 thin bronze frame, "NOT another anatomical neuron sprite"). Surge cards depict neuromodulator phasic bursts (locus coeruleus NE burst / VTA dopamine gain / NE mist) in electric-blue / magenta; bolus cards depict astrocyte-neuron lactate/glycogen fuel transfer in warm amber. **Card prompts MUST include an explicit "ABSOLUTELY NO TEXT" constraint** — omitting it produced unwanted captions ("ASTROCYTE: GLYCOGEN BURST") and a "P3" rarity-badge glyph on the first pass; both were re-rolled clean with the constraint added.

**Why**: Visual consistency with the 16 existing DMN cards in the same `/dmn` dex. The surge/bolus colour split (cool neuromodulator vs warm metabolic) maps to their speed-vs-energy effect, giving a readable hint of what the consumable does.

### Decision 5: Clean up 4 orphaned streak-shield card PNGs

**Choice**: `git rm` the 4 streak-shield card sprites (`dmn-pcc-pulse-p2`, `dmn-temporal-pole-anchor-p3`, `dmn-micro-context-guard-p4`, `dmn-small-circuit-immunity-p4`).

**Why**: The acceleration change removed `streak-shield` from `DMN_CARD_CATALOG` and `DMN_CARD_IDS`, so these PNGs are no longer referenced by any catalog entry or `SPRITE_MAP` key (they remain globbed into the `cardSprites` map but never surfaced). They are ~140 KB of dead bundle weight. Per `coding_principles` §3, orphans caused by a related change should be cleaned — this sprite follow-up is the natural owner of the acceleration change's asset-layer footprint. Files-only deletion; no code reference to update.

### Decision 6: No separate frame layer; styling baked into each sprite

Same as `generate-dmn-card-artworks` Decision 6 — single `<img src={SPRITE_MAP[artworkId]} />` everywhere; rarity baked into each PNG. Equipment dex (`EquipmentDexPanel`) + draw modal (`DmnDrawModal`) already resolve `def.artworkId` → `SPRITE_MAP[...]` with a `variant:default` fallback.

### Decision 7: Acceptance bar = two identity-locking spec requirements

- `neurons-acceleration-system` ADDED: every `equipment:<equipmentId>` key resolves to a real PNG (not placeholder); each sprite communicates its lane + rarity; permits other categories to stay placeholder.
- `neurons-dmn-fate-cards` MODIFIED: the stale "20 entries ... total 21" artwork requirement updated to 22 cards (+ card-back = 23), covering the 6 surge/bolus cards; notes the 4 streak-shield sprites removed.

Mirrors the identity-locking precedent from `generate-neurons-sprites` / `generate-dmn-card-artworks`. Future `sprites.ts` refactors are checked against these via `openspec validate`.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Gemini adds unwanted text/labels to card frames | Add explicit "ABSOLUTELY NO TEXT, no letters, no numbers, no labels" to card prompts. Hit on first pass (2 cards); re-rolled clean. Documented in `CARD_SPRITE_GENERATION.md`. |
| Chroma-key bites into sprite interior | Prompts request high-contrast solid backgrounds (pure white for equipment, dark purple for cards) + 40px padding. `-fuzz 10%` tolerance. Re-roll if a sprite's body matches the corner. |
| 16-color quantize banding on glow gradients (P1 auras) | Re-roll and pick a clean-quantizing variant, or bump to `-colors 24` for that sprite. Not hit this batch. |
| Two energy-lane astrocyte cards (`dmn-lactate-shuttle-p2` bolus + `dmn-astrocyte-fuel-p3`) look similar | Different rarity frames (gold vs silver) + different composition (handoff conduit vs radial fuel beads). Acceptable; both clearly "astrocyte fuels neuron". |
| Equipment companion creatures (oligodendrocyte/astrocyte) blur the "item not creature" line | Intentional — their `displayName` is literally a glial **cell** companion. The object items (mito/pump/battery/barrel/rings) keep the "NOT a creature with a face" constraint. |
| Bundle bloat | ~450 KB added − ~140 KB freed (orphan deletion). Vite-hashed, cached indefinitely, loaded only on `/dmn`. Negligible. |

## Migration Plan

**Deploy**: standard `pnpm deploy:cf` + GH Actions on push to `main`. No env vars, no Worker / D1 / KV / Supabase change.

**Rollback**: revert the asset additions; `sprites.ts` is unchanged so the keys fall back to `TRANSPARENT_PIXEL` automatically once the PNGs are gone (defensive `?? TRANSPARENT_PIXEL`). The two spec requirements would be reverted via follow-up.

**Cross-track**: `track-neurons`-only. Merge to `main` touches only `packages/theme-pixel-neurons/` + `openspec/`. Coordinate the shared-worktree commit via session-bus explicit per-file `git add` (multi-agent git safety).

## Open Questions

None. Direct application of the proven sprite-generation pattern; tool (Gemini) validated live; all 18 sprites generated + visually QA'd; acceptance locked via the two identity requirements.
