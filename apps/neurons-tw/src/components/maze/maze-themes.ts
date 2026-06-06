/**
 * maze-themes — DEV design-language switcher, v2 (Codex-ideated 2026-06-06, path-floor-hero reframe).
 *
 * Measured maze area: PATH 63.8% (dominant) · WALL 17.8% · BG 18.4% (accent). So the PATH FLOOR is
 * the hero — each theme gives the 64% of corridor cells a neural identity that HARMONISES with the
 * live gold myelin routes drawn on top, the WALL is the boundary element, and the BG is a cheap dark
 * accent. Goal: a med student instantly reads "neurons / brain". Topology is untouched.
 *
 * PATH + BG styles paint a seamless procedural `tile` (pattern-filled, continuous). WALL styles fill
 * per-cell (+ optional relief shadow on the receiving path cell). NODE styles draw live each frame.
 * Once the owner picks, collapse to the chosen styles + delete the switcher.
 */

export type BakeFill = (c: CanvasRenderingContext2D, bx: number, by: number, s: number) => void

export interface WallStyle {
  id: string
  label: string
  fill: BakeFill
  shadow?: (c: CanvasRenderingContext2D, bx: number, by: number, s: number, fromN: boolean, fromW: boolean) => void
}
export interface PathStyle {
  id: string
  label: string
  /** Seamless pattern tile (most styles). */
  tile?: (size: number) => HTMLCanvasElement
  /** OR neighbour-mask-aware per-cell render (wiring-diagram axon network). mask bits N=1 E=2 S=4 W=8. */
  render?: (c: CanvasRenderingContext2D, bx: number, by: number, s: number, mask: number) => void
}
export interface BgStyle { id: string; label: string; tile: (size: number) => HTMLCanvasElement; flat: string }
export interface NodeStyle {
  id: string
  label: string
  draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void
}

function h2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function makeTile(size: number, paint: (c: CanvasRenderingContext2D, n: number) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = size
  cv.height = size
  paint(cv.getContext('2d')!, size)
  return cv
}
function fillBg(c: CanvasRenderingContext2D, n: number, col: string): void { c.fillStyle = col; c.fillRect(0, 0, n, n) }
// seamless scatter: draw each splat at 9 wrap offsets so the tile repeats without seams
function scatter(c: CanvasRenderingContext2D, n: number, count: number, seed: number, paint: (cx: number, cy: number, r: number) => void): void {
  for (let i = 0; i < count; i++) {
    const cx = h2(i + seed, 1) * n, cy = h2(i + seed, 2) * n, r = 1 + h2(i + seed, 3) * 2.5
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { c.save(); c.translate(ox, oy); paint(cx, cy, r); c.restore() }
  }
}

// ============================ PATH-FLOOR styles (the 64% hero; kept dark) ============================
export const PATH_STYLES: Record<string, PathStyle> = {
  // 0 — WIRING DIAGRAM: every corridor renders as a faint cool myelinated AXON following the corridor
  //     direction (axon core + pale myelin sleeve + node-of-Ranvier gaps). The 11 gold routes stay the
  //     bright "activated" layer on top. mask = which N/E/S/W neighbours are also PATH.
  wiring: {
    id: 'wiring', label: '髓鞘軸突接線',
    render: (c, bx, by, s, mask) => {
      const cx = bx + s / 2, cy = by + s / 2
      const ext = s / 2 + 0.75
      c.fillStyle = '#0a0c1a'; c.fillRect(bx, by, s, s) // dark inter-tract substrate
      const dirs: [number, number, number][] = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]
      const isNode = h2(Math.floor(bx / s), Math.floor(by / s)) > 0.76 // periodic node of Ranvier
      const limb = (w: number, col: string) => {
        c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'
        for (const [dx, dy, bit] of dirs) {
          if (!(mask & bit)) continue
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + dx * ext, cy + dy * ext); c.stroke()
        }
        c.fillStyle = col; c.beginPath(); c.arc(cx, cy, w * 0.5, 0, Math.PI * 2); c.fill()
      }
      if (!isNode) limb(s * 0.64, '#39496b') // pale cool myelin sleeve (faint; gold routes still pop)
      limb(s * 0.26, '#0e1326') // dark axon core
      if (isNode) { c.fillStyle = 'rgba(95,215,209,0.45)'; c.beginPath(); c.arc(cx, cy, Math.max(1, s * 0.16), 0, Math.PI * 2); c.fill() } // Ranvier glint
    },
  },
  // 1 — inactive myelin lamellae: transverse internode bands (gold routes = "activated" tracts on top)
  myelin: {
    id: 'myelin', label: '靜止髓鞘節段',
    tile: (n) => makeTile(n, (c) => {
      fillBg(c, n, '#141531')
      for (let y = 0; y < n; y += 10) {
        c.fillStyle = '#262947'; c.fillRect(0, y, n, 4)
        c.fillStyle = '#343657'; c.fillRect(0, y + 1, n, 1)
        c.fillStyle = '#0e0f24'; c.fillRect(0, y + 6, n, 2) // node-of-Ranvier-ish dark gap
      }
    }),
  },
  // 2 — presynaptic boutons packed with vesicles
  vesicle: {
    id: 'vesicle', label: '突觸囊泡終末',
    tile: (n) => makeTile(n, (c) => {
      fillBg(c, n, '#0e1024')
      c.fillStyle = '#334267'; scatter(c, n, 16, 4, (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() })
      c.fillStyle = '#4b5f86'; scatter(c, n, 5, 9, (x, y, r) => { c.beginPath(); c.arc(x, y, r * 0.7, 0, Math.PI * 2); c.fill() })
    }),
  },
  // 3 — dendritic shafts: smooth centerline shading + sparse branch scars
  dendrite: {
    id: 'dendrite', label: '樹突幹',
    tile: (n) => makeTile(n, (c) => {
      const g = c.createLinearGradient(0, 0, 0, n)
      g.addColorStop(0, '#10101f'); g.addColorStop(0.5, '#24324d'); g.addColorStop(1, '#10101f')
      c.fillStyle = g; c.fillRect(0, 0, n, n)
      c.strokeStyle = '#171b31'; c.lineWidth = 2
      scatter(c, n, 4, 7, (x, y) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6, y - 4); c.stroke() })
    }),
  },
  // 4 — axon cross-section: chunky myelin donuts + cores
  xsection: {
    id: 'xsection', label: '軸突橫切',
    tile: (n) => makeTile(n, (c) => {
      fillBg(c, n, '#0d0f22')
      for (let i = 0; i < 7; i++) {
        const x = h2(i, 7) * n, y = h2(i, 9) * n, r = 5 + h2(i, 11) * 4
        for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
          c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fillStyle = '#2c3152'; c.fill()
          c.beginPath(); c.arc(x + ox, y + oy, r * 0.55, 0, Math.PI * 2); c.fillStyle = '#0d0f22'; c.fill()
          c.beginPath(); c.arc(x + ox, y + oy, r * 0.28, 0, Math.PI * 2); c.fillStyle = '#45486c'; c.fill()
        }
      }
    }),
  },
  // 5 — growth-cone navigation: axon substrate + sparse arrowhead fans
  growthcone: {
    id: 'growthcone', label: '生長錐導航',
    tile: (n) => makeTile(n, (c) => {
      fillBg(c, n, '#0c1021')
      c.fillStyle = '#223455'
      scatter(c, n, 6, 5, (x, y, r) => { c.beginPath(); c.moveTo(x, y - r * 1.6); c.lineTo(x + r * 1.4, y + r); c.lineTo(x - r * 1.4, y + r); c.closePath(); c.fill() })
      c.strokeStyle = '#33486c'; c.lineWidth = 1
      scatter(c, n, 8, 13, (x, y) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 5); c.stroke() })
    }),
  },
}

// ============================ WALL styles (18% boundary) ============================
function reliefShadow(c: CanvasRenderingContext2D, bx: number, by: number, s: number, fromN: boolean, fromW: boolean, a: number): void {
  c.fillStyle = `rgba(5,4,16,${a})`
  if (fromN) c.fillRect(bx, by, s, Math.max(1, s * 0.32))
  if (fromW) c.fillRect(bx, by, Math.max(1, s * 0.32), s)
}
export const WALL_STYLES: Record<string, WallStyle> = {
  // subdued tract boundary for the wiring-diagram (frames the axon corridors; must not compete)
  tractedge: {
    id: 'tractedge', label: '神經束邊界',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#161a2c'; c.fillRect(bx, by, s, s)
      c.fillStyle = '#222a40'; c.fillRect(bx, by, s, Math.max(1, s * 0.22)) // faint top edge
    },
    shadow: (c, bx, by, s, n, w) => reliefShadow(c, bx, by, s, n, w, 0.3),
  },
  myelinrim: {
    id: 'myelinrim', label: '髓鞘邊界',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#20243d'; c.fillRect(bx, by, s, s)
      c.fillStyle = '#3a3f61'; c.fillRect(bx, by, s, Math.max(1, s * 0.5))
      c.fillStyle = '#070817'; c.fillRect(bx, by + s - Math.max(1, s * 0.18), s, Math.max(1, s * 0.18))
    },
    shadow: (c, bx, by, s, n, w) => reliefShadow(c, bx, by, s, n, w, 0.45),
  },
  psd: {
    id: 'psd', label: '突觸後緻密帶',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#35264f'; c.fillRect(bx, by, s, s)
      c.fillStyle = '#4b376b'; c.fillRect(bx, by + s * 0.3, s, s * 0.4)
      if (h2(bx, by) > 0.5) { c.fillStyle = '#6b568f'; c.fillRect(bx + s * 0.4, by, Math.max(1, s * 0.16), Math.max(1, s * 0.3)) } // receptor tick
    },
    shadow: (c, bx, by, s, n, w) => reliefShadow(c, bx, by, s, n, w, 0.35),
  },
  spine: {
    id: 'spine', label: '樹突棘膜',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#26304b'; c.fillRect(bx, by, s, s)
      if (h2(bx, by) > 0.45) { c.fillStyle = '#3c5274'; c.beginPath(); c.arc(bx + s / 2, by + s * 0.4, s * 0.34, 0, Math.PI * 2); c.fill() } // mushroom head
    },
    shadow: (c, bx, by, s, n, w) => reliefShadow(c, bx, by, s, n, w, 0.4),
  },
  septa: {
    id: 'septa', label: '神經束膜隔',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#2d2946'; c.fillRect(bx, by, s, s)
      c.fillStyle = '#51496f'; c.fillRect(bx, by, s, Math.max(1, s * 0.22))
      c.fillStyle = '#51496f'; c.fillRect(bx, by, Math.max(1, s * 0.22), s)
    },
    shadow: (c, bx, by, s, n, w) => reliefShadow(c, bx, by, s, n, w, 0.6),
  },
  rail: {
    id: 'rail', label: '導引膠軌',
    fill: (c, bx, by, s) => {
      c.fillStyle = '#1a1d2e'; c.fillRect(bx, by, s, s)
      c.fillStyle = '#4b5c7c'; c.fillRect(bx, by + s * 0.4, s, Math.max(1, s * 0.2))
    },
  },
}

// ============================ BACKGROUND styles (18% accent — cheap) ============================
function dotsTile(base: string, dot: string, count: number, seed: number): (n: number) => HTMLCanvasElement {
  return (n) => makeTile(n, (c) => {
    fillBg(c, n, base)
    c.fillStyle = dot
    scatter(c, n, count, seed, (x, y, r) => { c.beginPath(); c.arc(x, y, Math.min(1.4, r * 0.5), 0, Math.PI * 2); c.fill() })
  })
}
export const BG_STYLES: Record<string, BgStyle> = {
  glialdots: { id: 'glialdots', label: '膠細胞核點', flat: '#080817', tile: dotsTile('#080817', '#101126', 10, 1) },
  cleft: { id: 'cleft', label: '突觸間隙', flat: '#0a0a18', tile: dotsTile('#0a0a18', '#16182e', 6, 2) },
  calcium: { id: 'calcium', label: '鈣火花微塵', flat: '#070817', tile: dotsTile('#070817', '#1a2740', 8, 3) },
  tissue: { id: 'tissue', label: '暗組織袋', flat: '#0b0a1f', tile: dotsTile('#0b0a1f', '#17152b', 5, 4) },
  cue: { id: 'cue', label: '導引線索點', flat: '#080918', tile: dotsTile('#080918', '#111522', 7, 5) },
}

// ============================ NODE styles (live) ============================
function radial(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, stops: [number, string][]): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  for (const [p, col] of stops) g.addColorStop(p, col)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
}
export const NODE_STYLES: Record<string, NodeStyle> = {
  // "collected neuron seed" — a small multipolar-neuron glyph (Codex consult 2026-06-06): radiating
  // dendrites + soma + amber nucleus. Neutral silhouette (same for every node → fog-of-war keeps
  // rarity/identity hidden); ties the lit node art to "this node = a neuron you collected".
  neuronseed: {
    id: 'neuronseed', label: '神經元種子',
    draw: (ctx, cx, cy, size) => {
      const s = Math.max(6, size)
      ctx.strokeStyle = 'rgba(150,245,255,0.5)'
      ctx.lineWidth = Math.max(1, s * 0.1)
      ctx.lineCap = 'round'
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i - Math.PI / 2
        const ex = cx + Math.cos(a) * s * 0.95, ey = cy + Math.sin(a) * s * 0.95
        const mx = cx + Math.cos(a) * s * 0.5 + Math.cos(a + 1.2) * s * 0.2
        const my = cy + Math.sin(a) * s * 0.5 + Math.sin(a + 1.2) * s * 0.2
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke()
      }
      ctx.fillStyle = 'rgba(115,235,255,0.92)'
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(230,250,255,0.7)'; ctx.lineWidth = Math.max(1, s * 0.08)
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(255,194,77,0.95)'
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, s * 0.16), 0, Math.PI * 2); ctx.fill()
    },
  },
  ranvier: {
    id: 'ranvier', label: 'Ranvier 節點',
    draw: (ctx, cx, cy, size) => {
      const r = Math.max(3, size * 0.5)
      ctx.strokeStyle = '#bfeeff'; ctx.lineWidth = Math.max(1, size * 0.16); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, r * 0.4), 0, Math.PI * 2); ctx.fill()
    },
  },
  bouton: {
    id: 'bouton', label: '突觸終扣',
    draw: (ctx, cx, cy, size) => {
      const r = Math.max(3, size * 0.55)
      radial(ctx, cx, cy, r, [[0, '#8ffcff'], [0.5, '#35d7d0'], [1, 'rgba(22,110,114,0)']])
      ctx.fillStyle = '#ffd86b'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 1, 2, 2)
    },
  },
  spinehead: {
    id: 'spinehead', label: '棘頭',
    draw: (ctx, cx, cy, size) => {
      const r = Math.max(3, size * 0.5)
      ctx.strokeStyle = '#7fe6ff'; ctx.lineWidth = Math.max(1, size * 0.12); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#7fe6ff'; ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy + r * 1.6); ctx.stroke()
    },
  },
  axonxs: {
    id: 'axonxs', label: '選定軸突',
    draw: (ctx, cx, cy, size) => {
      const r = Math.max(3, size * 0.55)
      ctx.strokeStyle = '#5fd7d1'; ctx.lineWidth = Math.max(1, size * 0.2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ffc24d'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillRect(cx + r * 0.3, cy - r * 0.4, 1.5, 1.5)
    },
  },
  growthcone: {
    id: 'growthcone', label: '生長錐',
    draw: (ctx, cx, cy, size) => {
      const r = Math.max(3, size * 0.6)
      ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.7, cy + r * 0.6); ctx.lineTo(cx - r * 0.7, cy + r * 0.6); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#8ffcff'; ctx.lineWidth = Math.max(1, size * 0.1)
      ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy + r * 0.6); ctx.lineTo(cx - r * 0.8, cy + r * 1.1); ctx.moveTo(cx + r * 0.5, cy + r * 0.6); ctx.lineTo(cx + r * 0.8, cy + r * 1.1); ctx.stroke()
    },
  },
}

// ============================ PRESETS (5 new, path-floor hero) ============================
export interface ThemePreset { id: string; label: string; wall: string; path: string; bg: string; node: string }
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'wiring', label: '0 · 髓鞘軸突接線圖 ⭐⭐', path: 'wiring', wall: 'tractedge', bg: 'glialdots', node: 'neuronseed' },
  { id: 'tract', label: '1 · 髓鞘白質束', path: 'myelin', wall: 'myelinrim', bg: 'glialdots', node: 'ranvier' },
  { id: 'synapse', label: '2 · 突觸終末毯', path: 'vesicle', wall: 'psd', bg: 'cleft', node: 'bouton' },
  { id: 'spine', label: '3 · 樹突棘峽谷', path: 'dendrite', wall: 'spine', bg: 'tissue', node: 'spinehead' },
  { id: 'xsection', label: '4 · 軸突橫切場', path: 'xsection', wall: 'septa', bg: 'calcium', node: 'axonxs' },
  { id: 'growth', label: '5 · 生長錐導航圖', path: 'growthcone', wall: 'rail', bg: 'cue', node: 'growthcone' },
]

export interface MazeSel { wall: string; path: string; bg: string; node: string }
export const DEFAULT_SEL: MazeSel = { path: 'wiring', wall: 'tractedge', bg: 'glialdots', node: 'neuronseed' }
