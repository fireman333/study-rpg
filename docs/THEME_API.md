# THEME_API — Writing a theme pack

A theme pack defines the **visual language** of a study-rpg installation: palette, fonts, sprites, item catalog, and (optionally) component overrides.

## Minimum viable theme pack

```
packages/theme-<your-style>/
├── package.json
├── design.md                  # full DESIGN.md following Google Stitch format
├── styles/
│   └── global.css             # CSS variables + utilities
├── sprites/                   # PNG / SVG assets (image-rendering: pixelated)
├── fonts/                     # webfonts (optional)
└── src/
    ├── index.ts               # exports a ThemePack object
    └── items.ts               # theme-specific item catalog
```

## TypeScript interface

```ts
interface ThemePack {
  meta: { id: string; displayName: string; style: 'pixel' | 'modern' | 'manga' | 'custom' }
  designMd: string                          // full DESIGN.md content (Vite: `?raw` import)
  cssVars: Record<string, string>           // resolved at <html> root
  fonts: { family: string; url?: string; fallback: string }[]
  sprites: Record<string, string>           // sprite key → URL / data URI
  itemCatalog: Item[]                       // 10–20 items spanning N..UR rarity
  uiOverrides?: Record<string, unknown>     // optional component overrides (future)
}
```

## Rules

1. **`id` matches the package suffix.** `@study-rpg/theme-pixel-medical` → `id: "pixel-medical"`
2. **`cssVars` keys start with `--`.** Engine injects them via inline `<style>` on the root.
3. **Rarity tokens are required.** `--rarity-n` through `--rarity-ur` — every theme must define them.
4. **`sprites` keys are referenced by `Item.artKey`.** If a key is missing, engine falls back to a placeholder.
5. **`itemCatalog` should cover all 5 rarity buckets.** Recommended distribution: N=8, R=6, SR=4, SSR=1, UR=1.
6. **Each rarity bucket should have items across `slot` types** (head/body/weapon/charm/consumable) — otherwise the loot roll falls back aggressively.

## Example: modern dark theme (sketch)

```ts
import type { ThemePack } from '@study-rpg/core'

export const THEME_MODERN_DARK: ThemePack = {
  meta: { id: 'modern-dark', displayName: 'Modern Dark', style: 'modern' },
  designMd: '# modern dark...',
  cssVars: {
    '--bg-cream': '#1a1a1a',
    '--ink': '#e8e8e8',
    '--accent-leaf': '#4ade80',
    // ...
  },
  fonts: [{ family: 'Inter', url: '...', fallback: 'system-ui' }],
  sprites: {},
  itemCatalog: [/* 10–20 items */],
}
```

## Pixel-art asset sourcing

For pixel themes, recommended CC0 sources:

- [OpenGameArt CC0](https://opengameart.org/art-search-advanced?keys=&field_art_type_tid%5B%5D=10&sort_by=score&sort_order=DESC)
- [Kenney.nl Asset Packs](https://kenney.nl/assets) — fully public domain
- [Itch.io free pixel](https://itch.io/game-assets/free/tag-pixel-art)
- Self-drawn with [Aseprite](https://www.aseprite.org/) or [Piskel](https://www.piskelapp.com/)

Run all PNGs through optipng before committing.

## Webfont strategy

- Latin pixel fonts: load from Google Fonts (free) — `Press Start 2P`, `VT323`, `Pixelify Sans`
- CJK pixel fonts: **self-host** (Google Fonts doesn't carry them well)
  - [Cubic 11](https://github.com/ACh-K/Cubic-11) — 11px CJK pixel
  - [不点字體 (boutique-bitmap-9x9)](https://github.com/scott0107000/BoutiqueBitmap9x9) — 9px CJK pixel
- Always specify a system fallback in `fonts[i].fallback`

## Future: `uiOverrides`

Reserved for swapping core React components (e.g. provide your own `DialogueBox` or `CardReveal` sprite-based versions). Not exposed in 0.x.
