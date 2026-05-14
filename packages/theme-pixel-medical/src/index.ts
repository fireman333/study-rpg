/**
 * Theme pack: pixel-art medical adventure RPG (GBA-era vibe).
 *
 * Sprites are currently NOT bundled — `sprites` map keys are sprite IDs that
 * the host app resolves at runtime (e.g. by importing PNGs from `./sprites/`
 * or substituting CSS-rendered placeholders for the MVP).
 */

import type { ThemePack } from '@study-rpg/core'
import { ITEM_CATALOG } from './items'
import { SPRITE_MAP } from './sprites'

export const THEME_PIXEL_MEDICAL: ThemePack = {
  meta: {
    id: 'pixel-medical',
    displayName: '像素醫學冒險',
    style: 'pixel',
  },
  designMd: '', // populated at build by importing design.md as text (Vite ?raw)
  cssVars: {
    '--bg-cream': '#f4ecd8',
    '--bg-dark': '#2d1f1a',
    '--ink': '#1a1410',
    '--accent-leaf': '#6a8c3f',
    '--accent-rose': '#c44d4d',
    '--accent-gold': '#d4a04d',
    '--accent-sky': '#6a9bc4',
    '--frame-wood-light': '#8c6d4a',
    '--frame-wood-dark': '#5a3f29',

    // Rarity frame colors
    '--rarity-n': '#ffffff',
    '--rarity-r': '#6a9bc4',
    '--rarity-sr': '#a06ac4',
    '--rarity-ssr': '#d4a04d',
    '--rarity-ur': '#c44d4d',
  },
  fonts: [
    {
      family: 'Press Start 2P',
      url: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
      fallback: "'Courier New', monospace",
    },
    {
      family: 'VT323',
      url: 'https://fonts.googleapis.com/css2?family=VT323&display=swap',
      fallback: "'Courier New', monospace",
    },
    {
      family: 'Cubic 11',
      // Self-hosted by host app: woff2 at /fonts/Cubic_11.woff2 (loaded via @font-face in styles/global.css).
      // Source: https://github.com/ACh-K/Cubic-11 (SIL OFL-1.1).
      fallback: "'Noto Sans TC', sans-serif",
    },
  ],
  sprites: SPRITE_MAP,
  itemCatalog: ITEM_CATALOG,
}

export { ITEM_CATALOG } from './items'
export { SPRITE_MAP } from './sprites'
