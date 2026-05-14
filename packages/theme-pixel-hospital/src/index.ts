/**
 * Theme pack: pixel-art hospital management (GBA-era vibe, forked from
 * @study-rpg/theme-pixel-medical).
 *
 * Scaffold placeholder — full 14-科 × P1–P5 doctor sprite roster + 三階段醫院場景
 * (診所 / 區域醫院 / 醫學中心) are pending under
 * `openspec/changes/add-doctor-sprite-roster` and `wire-clinic-level-up`.
 *
 * For now, cssVars + fonts mirror theme-pixel-medical (same GBA palette per
 * Decision 6 in add-hospital-mode-scaffold/design.md); sprites + itemCatalog
 * are empty placeholders.
 */

import type { ThemePack } from '@study-rpg/core'

export const THEME_PIXEL_HOSPITAL: ThemePack = {
  meta: {
    id: 'pixel-hospital',
    displayName: '像素醫院經營',
    style: 'pixel',
  },
  designMd: '', // populated at build via Vite ?raw import once design.md is authored
  cssVars: {
    // Same GBA palette as theme-pixel-medical for visual continuity per Decision 6.
    '--bg-cream': '#f4ecd8',
    '--bg-dark': '#2d1f1a',
    '--ink': '#1a1410',
    '--accent-leaf': '#6a8c3f',
    '--accent-rose': '#c44d4d',
    '--accent-gold': '#d4a04d',
    '--accent-sky': '#6a9bc4',
    '--frame-wood-light': '#8c6d4a',
    '--frame-wood-dark': '#5a3f29',

    // Rarity frame colors — mapped to P1–P5 (per Decision 5).
    '--rarity-p5': '#ffffff',   // 拉完了
    '--rarity-p4': '#6a9bc4',   // NPC
    '--rarity-p3': '#a06ac4',   // 人上人
    '--rarity-p2': '#d4a04d',   // 頂級
    '--rarity-p1': '#c44d4d',   // 夯

    // Hospital tier accent (TBD — placeholder vars, refined in wire-clinic-level-up)
    '--clinic-tier-1': '#a8d8a8',  // 診所
    '--clinic-tier-2': '#d8b06a',  // 區域醫院
    '--clinic-tier-3': '#c44d4d',  // 醫學中心
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
      // Self-hosted by host app (same convention as theme-pixel-medical).
      fallback: "'Noto Sans TC', sans-serif",
    },
  ],
  sprites: {
    // Scaffold: empty. Real roster populated by add-doctor-sprite-roster change.
  },
  itemCatalog: [
    // Scaffold: empty. Hospital mode doesn't use the items system the same way one-階
    // does — doctors ARE the "items" (Doctor card type lives in hospital-management-mode
    // capability spec, not in core Item type). itemCatalog kept empty for contract compliance.
  ],
}
