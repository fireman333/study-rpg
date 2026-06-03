/**
 * Connectome color utilities — fixed neon palette + HSL helpers used by both
 * EdgePulse (axon-signal pulse) and FamilyNode (firedToday breathing glow) so
 * the "lit up" visual reads as a true neon halo rather than the muted family
 * color stroke.
 */

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return [255, 255, 255]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [h * 60, s, l]
}

/**
 * Fixed neon palette keyed by NT-branch hue. Each entry maps to the 4 NT
 * families' bright variants. Pulse + breathing-glow consumers look up the
 * closest entry by hue distance from the input color.
 */
const NEON_PALETTE: Array<{ hue: number; core: string; halo: string }> = [
  { hue: 45, core: '#fff066', halo: '#ffe14a' }, // DA gold → electric yellow
  { hue: 0, core: '#ff6aa8', halo: '#ff4d8d' }, // 5HT red → hot pink
  { hue: 210, core: '#5edcff', halo: '#3ec6ff' }, // GABA blue → cyber cyan
  { hue: 130, core: '#9eff70', halo: '#84ff3a' }, // Glu green → fluorescent green
]

/** Pick the closest neon variant for a given hex color via hue distance. */
export function neonForFamily(color: string): { core: string; halo: string } {
  const [r, g, b] = parseHex(color)
  const [h] = rgbToHsl(r, g, b)
  return NEON_PALETTE.reduce((best, cur) => {
    const cd = Math.min(Math.abs(h - cur.hue), 360 - Math.abs(h - cur.hue))
    const bd = Math.min(Math.abs(h - best.hue), 360 - Math.abs(h - best.hue))
    return cd < bd ? cur : best
  }, NEON_PALETTE[0])
}
