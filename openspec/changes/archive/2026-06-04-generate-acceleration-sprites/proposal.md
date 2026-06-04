## Why

`add-neurons-acceleration-system` (archived 2026-06-04 `4f5b99d`) shipped the 加速系統 — 12 permanent equipment/companion definitions (`EQUIPMENT_CATALOG`) plus 6 new DMN surge/bolus consumable cards — with **placeholder sprites**. Every `equipment:<equipmentId>` key resolves to the 1×1 transparent PNG (`TRANSPARENT_PIXEL`), and the 6 new `dmn:card:<surge|bolus cardId>` keys do too (the streak-shield removal also left 4 orphaned card PNGs on disk). Real artwork was explicitly deferred to this follow-up (see `add-neurons-acceleration-system` design + the closing session-bus handoff). Until real sprites land, the `/dmn` backpack + equipment dex read as wireframes — neuroscience-flavoured names with empty rectangles where the art should be.

Per `~/.claude/imports/image_gen_routing.md`, single-object pixel-art icons are Gemini-first territory (~5 sec / image, parallel-callable, ~30× faster than codex CLI). The sibling changes `generate-neurons-sprites` (11 family icons), `generate-dmn-card-artworks` (21 card sprites), and `generate-neuron-variant-sprites` (55 variant sprites) already proved this exact Gemini MCP + ImageMagick post-process pipeline at scale. This change is a direct application of that proven pattern to the 18 missing acceleration assets.

## What Changes

- Generate **12 GBA-era pixel-art equipment/companion sprites** (`packages/theme-pixel-neurons/sprites/equipment/<equipmentId>.png`) — one per `EQUIPMENT_CATALOG` entry. Each reflects: (a) its neuroscience anchor (myelin / saltatory conduction / oligodendrocyte / node of Ranvier for the speed lane; mitochondria / Na⁺/K⁺ pump / astrocyte glycogen / creatine-kinase / lactate / glucose for the energy lane); (b) **rarity-scaled aura** (P1 radiant aura + particles → P5 plain, no aura); (c) **lane-distinct palette** (speed = gold/white myelin + cyan conduction sparks; energy = warm amber/orange metabolic). These are **independent following-companion / aura sprites** (NOT body-worn equipment), so a few read as cute companion creatures (oligodendrocyte, astrocyte) and the rest as collectible objects (mitochondrion, pump, battery, fuel barrel, myelin rings).
- Generate **6 DMN consumable card sprites** for the surge/bolus cards added by `add-neurons-acceleration-system` (`packages/theme-pixel-neurons/sprites/cards/<cardId>.png`): `dmn-locus-coeruleus-burst-p2`, `dmn-lactate-shuttle-p2`, `dmn-dopamine-gain-p3`, `dmn-astrocyte-fuel-p3`, `dmn-noradrenaline-spray-p4`, `dmn-glycogen-burst-p4`. Same `generate-dmn-card-artworks` template (dreamlike / abstract / luminous, transparent dark-purple bg, rarity-tier framing P2 gold / P3 silver / P4 bronze). Surge cards lean neuromodulator blue/magenta (NE/DA phasic gain → speed); bolus cards lean warm amber metabolic (astrocyte-neuron lactate shuttle → energy).
- Save raw Gemini output to `/tmp/accel-sprites-raw/`, post-process via the documented ImageMagick recipe (corner-pixel chroma-key + nearest-neighbor downsample to 384×384 + 16-color quantize) into the theme package.
- **Clean up 4 orphaned streak-shield card PNGs** left behind by the acceleration change's streak-shield removal (no catalog entry references them; they are dead bundle weight globbed into `cardSprites` but never surfaced into `SPRITE_MAP`): `dmn-pcc-pulse-p2.png`, `dmn-temporal-pole-anchor-p3.png`, `dmn-micro-context-guard-p4.png`, `dmn-small-circuit-immunity-p4.png`.
- Document the equipment prompts + recipe in a new `packages/theme-pixel-neurons/EQUIPMENT_SPRITE_GENERATION.md`; append the 6 surge/bolus card prompts to the existing `CARD_SPRITE_GENERATION.md`.

**不做**：

- 不改 `packages/theme-pixel-neurons/src/sprites.ts` — the `import.meta.glob('../sprites/equipment/*.png')` + `import.meta.glob('../sprites/cards/*.png')` globs and `EQUIPMENT_ART_KEYS` / `DMN_CARD_IDS` arrays are **already wired** by the acceleration change. Dropping PNGs in resolves the keys automatically.
- 不 generate item / cosmetic / skill placeholder sprites — separate future per-consumer changes.
- 不 re-generate the 16 existing DMN card arts (real since `generate-dmn-card-artworks` 2026-05-28) — only the 6 new surge/bolus cards.
- 不 ship rarity framing as a separate compositor layer — styling baked into each sprite (mirrors `generate-dmn-card-artworks` Decision 6).
- 不改 sprite size (384×384 GBA convention preserved); 不 ship @2x; 不 wire animation.
- 不 bump Dexie / R2 bundle SCHEMA_VERSION / Worker / D1 / Supabase — pure asset + docs + spec delta.

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neurons-acceleration-system`: ADD one identity-locking requirement (`### Requirement: Permanent equipment SHALL have real artwork registered in theme-pixel-neurons`) — every `equipment:<equipmentId>` key in `SPRITE_MAP` SHALL resolve to a real PNG, not the transparent placeholder. Mirrors the precedent set by `generate-neurons-sprites` / `generate-dmn-card-artworks`.
- `neurons-dmn-fate-cards`: MODIFY the existing artwork requirement (`### Requirement: DMN fate cards SHALL have real artwork registered in theme-pixel-neurons`) — its count is stale (says "20 entries ... total 21", predating the acceleration change's 20→22 card shift). Update to **22 cards + card-back = 23**, explicitly covering the 6 surge/bolus cards added by `add-neurons-acceleration-system`, and note the 4 streak-shield card sprites were removed in lockstep with their catalog removal.

## Impact

- **Code**:
  - `packages/theme-pixel-neurons/sprites/equipment/<12 files>.png` (new; ~7–40 KB each after 16-color quantize)
  - `packages/theme-pixel-neurons/sprites/cards/<6 surge/bolus files>.png` (new) + 4 orphaned streak-shield PNGs deleted
  - `packages/theme-pixel-neurons/EQUIPMENT_SPRITE_GENERATION.md` (new) + `CARD_SPRITE_GENERATION.md` (appended)
  - `packages/theme-pixel-neurons/src/sprites.ts` — **unchanged** (globs already wired)
- **APIs**: none
- **Dependencies**: none (existing Vite glob + system `magick`)
- **Data / Sync**: no Dexie / R2 / event schema changes; sprite URLs are build-time hashed asset refs, not persisted state
- **Backwards compat**: pure asset replacement. Any client reading `SPRITE_MAP['equipment:...']` / `SPRITE_MAP['dmn:card:...']` upgrades from the transparent placeholder data URI to a real Vite-bundled hashed URL on next deploy. No state migration.
- **Bundle delta**: ~18 sprites × ~25 KB avg ≈ ~450 KB raw (minus ~140 KB freed by deleting 4 orphan PNGs). Vite emits hashed `<img>` URLs; not inlined into main JS bundle. Network impact on `/dmn` page load only.
- **Deploy path**: standard `pnpm deploy:cf` (CF Pages direct-upload) + GH Actions auto-deploy. No new env vars, no Worker / D1 / KV / Supabase change.
- **Cross-track impact**: `track-neurons`-only; `theme-pixel-neurons` is not consumed by 一階 / 二階. Merge to `main` only touches `packages/theme-pixel-neurons/` + `openspec/`.
