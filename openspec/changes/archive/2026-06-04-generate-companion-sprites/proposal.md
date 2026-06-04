## Why

`add-neurons-living-companion-render` shipped the living-cell glial companions as expedition-band marchers, but with **placeholder art** — they reuse the static `equipment:<id>` dex sprite (framed as a collectible *item*, not a band marcher) and render at the **same size** as the neuron squad marchers. The owner wants dedicated, cuter glial-cell marcher art and a **smaller** marcher footprint so the glia read as little companions tagging along, not equals of the squad.

## What Changes

- **Dedicated companion marcher sprites**: generate 2 transparent pixel-art **glial-cell companion** sprites — `eq-oligodendrocyte-companion-p3` (myelinating glia) + `eq-astrocyte-glycogen-p3` (star-shaped astrocyte) — in the band's clean-transparent-creature style (NOT the dex item framing). Registered under `companion:<id>` in `theme-pixel-neurons`; the band already resolves `companion:<id>` first, so they swap in automatically. The `equipment:<id>` fallback is preserved for robustness (only *present* `companion/*.png` files get a SPRITE_MAP key — no TRANSPARENT_PIXEL hardcode that would shadow the fallback).
- **Smaller marchers**: companion marchers render at ~0.6× the squad marcher size (a single tunable scale constant in `MazeExpedition.tsx`), so the glia are visibly smaller companions.
- **Single-frame, not per-frame animation**: the band animates all marchers via CSS `exp-bob` (no frame sheets). Companion sprites are single transparent images like the variant marchers — consistent with the band; the earlier `generate-companion-animation-frames` framing is superseded.

## Capabilities

### Modified Capabilities
- `neurons-living-companion`: the companion marcher now uses **dedicated `companion:<id>` art** (the static `equipment:<id>` sprite drops to a fallback) and renders at a **reduced size** relative to the squad marchers.

## Impact

- **Assets (new)**: `packages/theme-pixel-neurons/sprites/companion/{eq-oligodendrocyte-companion-p3,eq-astrocyte-glycogen-p3}.png` (384×384, transparent, 16-color, Gemini/codex-gen + magick post-process).
- **Code (neurons-tw / theme only, `track-neurons`)**: `packages/theme-pixel-neurons/src/sprites.ts` — add a `companion/*.png` glob → `companion:<stem>` keys spread into `SPRITE_MAP` (present files only). `apps/neurons-tw/src/components/MazeExpedition.tsx` — a `COMPANION_MARCHER_SCALE` const applied to the companion marcher size.
- **Zero schema/sync change**: assets + one render constant + one glob. No Dexie/R2/content change.
- **Out of scope**: the brain-map (companions are band-only, unchanged), the equipment dex art (`equipment:<id>` stays the dex sprite), acceleration math.
