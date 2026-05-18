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

import type { ThemePack, SlotPosition } from '@study-rpg/core'
import { SPRITES_MAP } from './sprites'
import { HOSPITAL_SCENES } from './scenes'

export { ROOM_SCENES } from './room-scenes'
export { EVENT_ICONS } from './event-icons'
export { FATE_CARD_ART } from './fate-card-art'

// Slot inventory satisfies `slot_count(tier, type) ≥ default_room_count(tier, type)
// + max_extension_cap(type)` so a maxed-out hospital (all defaults + 3 outpatient
// / 2 surgery / 2 ward extensions purchased) has a deterministic slot per assigned
// doctor. Sprites are 96×96 with `transform: translate(-50%,-50%)` so (x,y) is the
// sprite center on the 768×384 scene canvas.
const DOCTOR_SLOT_POSITIONS: NonNullable<ThemePack['doctorSlotPositions']> = {
  // 診所: 3 outpatient (3 default, 0 extension; no ward / no surgery rooms exist)
  tier1: [
    { room: 'outpatient', x: 180, y: 220 },
    { room: 'outpatient', x: 384, y: 220 },
    { room: 'outpatient', x: 588, y: 220 },
  ] satisfies SlotPosition[],

  // 區域醫院: 2 ward (0+2 ext) + 7 outpatient (4+3 ext) + 3 surgery (1+2 ext) = 12
  // Top row y=180 holds the 5 default rooms; bottom row y=300 holds extension overflow.
  tier2: [
    // top row — defaults (5 slots evenly across 768 px)
    { room: 'outpatient', x: 77,  y: 180 },
    { room: 'outpatient', x: 230, y: 180 },
    { room: 'outpatient', x: 384, y: 180 },
    { room: 'outpatient', x: 538, y: 180 },
    { room: 'surgery',    x: 691, y: 180 },
    // bottom row — extensions (7 slots evenly across 768 px)
    { room: 'ward',       x: 55,  y: 300 },
    { room: 'ward',       x: 165, y: 300 },
    { room: 'outpatient', x: 275, y: 300 },
    { room: 'outpatient', x: 385, y: 300 },
    { room: 'outpatient', x: 495, y: 300 },
    { room: 'surgery',    x: 605, y: 300 },
    { room: 'surgery',    x: 715, y: 300 },
  ] satisfies SlotPosition[],

  // 醫學中心: 3 ward (1+2 ext) + 7 outpatient (4+3 ext) + 4 surgery (2+2 ext) = 14
  tier3: [
    // top row — defaults (7 slots evenly)
    { room: 'outpatient', x: 55,  y: 180 },
    { room: 'outpatient', x: 165, y: 180 },
    { room: 'outpatient', x: 275, y: 180 },
    { room: 'outpatient', x: 385, y: 180 },
    { room: 'surgery',    x: 495, y: 180 },
    { room: 'surgery',    x: 605, y: 180 },
    { room: 'ward',       x: 715, y: 180 },
    // bottom row — extensions (7 slots evenly)
    { room: 'ward',       x: 55,  y: 300 },
    { room: 'ward',       x: 165, y: 300 },
    { room: 'outpatient', x: 275, y: 300 },
    { room: 'outpatient', x: 385, y: 300 },
    { room: 'outpatient', x: 495, y: 300 },
    { room: 'surgery',    x: 605, y: 300 },
    { room: 'surgery',    x: 715, y: 300 },
  ] satisfies SlotPosition[],

  // 國家級教學醫院: 4 ward (2+2 ext) + 8 outpatient (5+3 ext) + 5 surgery (3+2 ext) = 17
  tier4: [
    // top row — defaults + 1 ward (9 slots, 768/9 ≈ 85 px spacing; sprite at x=43
    // partially clips left edge — acceptable per design Decision 3)
    { room: 'outpatient', x: 43,  y: 180 },
    { room: 'outpatient', x: 128, y: 180 },
    { room: 'outpatient', x: 213, y: 180 },
    { room: 'outpatient', x: 299, y: 180 },
    { room: 'outpatient', x: 384, y: 180 },
    { room: 'surgery',    x: 469, y: 180 },
    { room: 'surgery',    x: 555, y: 180 },
    { room: 'surgery',    x: 640, y: 180 },
    { room: 'ward',       x: 725, y: 180 },
    // bottom row — remaining default ward + 2 ward ext + 3 outpatient ext + 2 surgery ext (8 slots)
    { room: 'ward',       x: 48,  y: 300 },
    { room: 'ward',       x: 144, y: 300 },
    { room: 'ward',       x: 240, y: 300 },
    { room: 'outpatient', x: 336, y: 300 },
    { room: 'outpatient', x: 432, y: 300 },
    { room: 'outpatient', x: 528, y: 300 },
    { room: 'surgery',    x: 624, y: 300 },
    { room: 'surgery',    x: 720, y: 300 },
  ] satisfies SlotPosition[],
}

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
  sprites: SPRITES_MAP,
  itemCatalog: [
    // Scaffold: empty. Hospital mode doesn't use the items system the same way one-階
    // does — doctors ARE the "items" (Doctor card type lives in hospital-management-mode
    // capability spec, not in core Item type). itemCatalog kept empty for contract compliance.
  ],
  scenes: HOSPITAL_SCENES,
  doctorSlotPositions: DOCTOR_SLOT_POSITIONS,
}
