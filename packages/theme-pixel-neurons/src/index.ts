/**
 * Theme pack: pixel-art neurons-themed reskin (M_3rd track).
 *
 * Provides 4-NT branch palette, fonts, item catalog (~20), cosmetic catalog
 * (~20), and skill tree (4 branches × 9 nodes). Sprite assets are placeholder
 * transparent PNGs until generate-neurons-sprites lands.
 *
 * Engine contract: satisfies all `theme-pack-contract` requirements (5 required
 * sprite keys + valid cssVars + fonts + non-empty itemCatalog with valid
 * EquipSlot / Rarity / effects per item).
 */

import type { ThemePack } from '@study-rpg/core'
import { ITEM_CATALOG } from './items'
import { SPRITE_MAP } from './sprites'
import { SKILL_TREE_PIXEL_NEURONS } from './skillTree'

export const THEME_PIXEL_NEURONS: ThemePack = {
  meta: {
    id: 'pixel-neurons',
    displayName: '像素神經元 — Long-term Potentiation Edition',
    style: 'pixel',
  },
  designMd: '', // populated at build by importing DESIGN.md as text (Vite ?raw)
  cssVars: {
    // 4 NT branch colors (anchor for sprite tint + skill tree branch + family group)
    '--nt-da': '#d4a04d',     // 多巴胺 — 亮黃 / 金 (reward / motivation)
    '--nt-5ht': '#c44d4d',    // 血清素 — 紅 / 珊瑚 (mood / endurance)
    '--nt-gaba': '#6a9bc4',   // GABA — 藍 / 青 (inhibition / focus)
    '--nt-glu': '#6a8c3f',    // 麩胺酸 — 綠 / 翠 (excitation / learning)

    // Clinical EEG signal layer (data surfaces: connectome edges / stats readouts / quiz firing
    // / data backdrops). Cold cyan/amber on near-black, evoking an EEG monitor. Added by
    // polish-neurons-clinical-machine-aesthetic; the warm base below is intentionally preserved.
    // These are the SINGLE SOURCE OF TRUTH for clinical-aesthetic colors — never hardcode the hex.
    '--signal-cyan': '#38e0d0',   // primary EEG trace / active signal
    '--signal-amber': '#f0a830',  // secondary trace / high-amplitude (mastered / alert)
    '--signal-dim': '#2a4a52',    // inactive / dormant trace on dark data-surface
    '--signal-bg': '#0c1418',     // deep data-surface backdrop (stats panels)
    '--signal-bg-dim': '#16242a', // dimmer instrument canvas (connectome — keeps warm labels legible)
    '--signal-ink': '#cfe8e2',    // light cream-cyan text on dark data surfaces
    '--grid-line': 'rgba(56,224,208,0.10)',  // faint instrument grid on data surfaces
    '--scanline': 'rgba(56,224,208,0.04)',   // CRT scanline overlay on data surfaces

    // Synapse state (Hebbian wiring layer in connectome view — wired in add-connectome-collection;
    // rewired to the signal layer by polish-neurons-clinical-machine-aesthetic so edges read as
    // EEG signal traces). 3 visually-distinct states preserved: dim / cyan / amber+glow.
    '--synapse-dormant': '#2a4a52',       // signal-dim (was #5a3f29 warm)
    '--synapse-forming': '#38e0d0',       // signal-cyan 虛線 (was #6a9bc4)
    '--synapse-potentiated': '#38e0d0',   // signal-cyan 實線亮 (was #d4a04d)
    '--synapse-mastered': '#f0a830',      // signal-amber + glow (was #6a8c3f)

    // Rarity frame (沿用 medical theme convention)
    '--rarity-n': '#ffffff',
    '--rarity-r': '#6a9bc4',
    '--rarity-sr': '#a06ac4',
    '--rarity-ssr': '#d4a04d',
    '--rarity-ur': '#c44d4d',

    // Base layout
    '--bg-cream': '#f4ecd8',
    '--bg-dark': '#2d1f1a',
    '--ink': '#1a1410',
    '--frame-cell-light': '#8c6d4a',
    '--frame-cell-dark': '#5a3f29',
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
      // Self-hosted by host app: woff2 at /fonts/Cubic_11.woff2 (loaded via @font-face).
      // Source: https://github.com/ACh-K/Cubic-11 (SIL OFL-1.1).
      fallback: "'Noto Sans TC', sans-serif",
    },
  ],
  sprites: SPRITE_MAP,
  itemCatalog: ITEM_CATALOG,
  skillTree: SKILL_TREE_PIXEL_NEURONS,
}

export { ITEM_CATALOG } from './items'
export { COSMETIC_CATALOG, COSMETIC_CATALOG_SIZE } from './cosmetics'
export { SPRITE_MAP, decorSpriteUrl } from './sprites'
export { SKILL_TREE_PIXEL_NEURONS } from './skillTree'
