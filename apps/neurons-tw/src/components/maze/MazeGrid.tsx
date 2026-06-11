/**
 * MazeGrid — the flat-grid maze homepage centerpiece.
 *
 * RENDER ARCHITECTURE (redesign-neurons-maze-static-render §1): the maze is a STATIC PANORAMA, not a
 * per-frame live canvas. The full scene (3-region tile art + family axon tracts + neuron-symbol
 * landmarks + node pins + lit variant nodes + read-only synapse sparks + center core) is baked ONCE
 * into a maze-resolution OFFSCREEN canvas (SCENE_SCALE px/cell, never in the DOM), re-baked only on a
 * DISCRETE change (settle / explore / synapse wiring / DEV switch). A small VIEWPORT-sized canvas is
 * the only displayed canvas; the "camera" blits the relevant slice of the offscreen scene into it via
 * a single `drawImage` ON EACH INPUT EVENT (wheel / drag / pinch) — bitmap blits are cheap even on
 * Safari (the old per-frame cost was the VECTOR redraw + gradient/path churn, now hoisted into the
 * one-time bake). There is NO steady-state `requestAnimationFrame` repaint loop.
 *
 * Why not a CSS-transformed full-resolution canvas (the first §1 cut): a 3840² element with
 * `will-change: transform` is promoted to one composited layer and rasterized at devicePixelRatio →
 * a ~hundreds-of-MB GPU layer that OOM-kills the iOS Safari content process on scroll-into-view. The
 * viewport-blit model keeps the displayed layer viewport-sized, so it stays within the iOS budget.
 * (§2 walker glide / §4 synapse pulse / §5 focus fly / §6 ambient / §8 colour bands are event-driven
 * follow-ups; §1 transitions are instant.)
 *
 * It does NOT call useMaze itself — the page owns the single useMaze(pack) subscription and passes the
 * `view` down. Camera framing: a correct answer (maze-focus bus) frames that family's walker; reading
 * / idle frames the whole map. Manual wheel-zoom + drag-pan override.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import { FAMILY_IDS, FAMILY_COLOR, CONNECTOME_CONDUCTION_EPOCH } from '@study-rpg/content-neurons-tw'
import VariantSprite from '../VariantSprite'
import { EmojiIcon } from '../EmojiIcon'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import MazeExpedition from '../MazeExpedition'
import { db, type SynapseState } from '../../lib/db'
import { decodePairKey, subscribeConnectomeEvents } from '../../lib/services/connectome'
import { getWireConductionStatuses, type WireConductionStatus } from '../../lib/maze/economy'
import { useReadingTimer } from '../../lib/hooks/useReadingTimer'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../../lib/expedition-visibility'
import {
  GRID_W, GRID_H, GRID_CENTER, CELL_KINDS, CELL_WALL, CELL_PATH,
  synapseCell, type Cell,
} from '../../lib/maze/graph'
import { onMazeFocus, onMazeRecenter, emitMazeRecenter } from '../../lib/maze/maze-focus'
import type { FamilyViewState, MazeViewState } from '../../lib/maze/useMaze'
// DEV design-language switcher (maze-themes): 6 switchable looks for WALL / PATH / BG / NODE; the
// maze TOPOLOGY is untouched. Gold MYELIN routes are still drawn per-route (now baked, not per-frame).
// Once the owner picks, collapse to the chosen styles + delete the switcher.
import {
  WALL_STYLES, PATH_STYLES, BG_STYLES, NODE_STYLES, THEME_PRESETS, DEFAULT_SEL, type MazeSel,
} from './maze-themes'
// Large textbook neuron-symbol landmarks at static hubs — the "obvious neuron" lever (locked via
// grilled-neurons-maze-looks-like-brain): the corridors are the wiring, these are the cells.
import { MAZE_LANDMARKS, landmarkImage, ALL_NODE_CELLS } from './maze-landmarks'
// Codex gpt-image-2 muted brain-silhouette + nerve-fiber backdrop — a faint full-bleed layer so the
// maze reads as sitting inside a brain (owner: brain outline + fibers, muted teal/violet on navy). It
// is blitted into the viewport per camera draw (its 1.8× silhouette extends beyond the grid bounds).
import bgBrainHeroUrl from '../../assets/maze/bg-brain-hero.png'
const bgBrainHeroImg = new Image()
bgBrainHeroImg.src = bgBrainHeroUrl

// --- neutral per-family encoding (color + node-shape redundancy; no NT claim) ---
// Color = the canonical per-subject accent (FAMILY_COLOR, single source from the content pack via
// decouple-neurons-subjects-from-nt-branches) so the 11 tracts/nodes match the FamilyPicker accents.
// FAMILY_COLORS below is only a positional fallback for a family id missing from FAMILY_COLOR.
type NodeShape = 'circle' | 'diamond' | 'square' | 'triangle' | 'hex'
const FAMILY_COLORS = [
  '#e0524d', '#e08a3c', '#d8c23a', '#7fb84e', '#43b59a',
  '#3f9bd8', '#5d6fd8', '#9b5dd8', '#d85db0', '#8a8f99', '#5a6b3a',
]
const NODE_SHAPES: NodeShape[] = ['circle', 'diamond', 'square', 'triangle', 'hex']
interface FamEnc { color: string; shape: NodeShape }
const FAMILY_ENC: Record<string, FamEnc> = (() => {
  const out: Record<string, FamEnc> = {}
  FAMILY_IDS.forEach((f, i) => {
    out[f] = { color: FAMILY_COLOR[f] ?? FAMILY_COLORS[i % FAMILY_COLORS.length], shape: NODE_SHAPES[i % NODE_SHAPES.length] }
  })
  return out
})()

const OUTSIDE = '#0a0e14' // beyond the grid bounds / stage backdrop
const SYNAPSE_COLOR = '#38e0d0'
const CORE_COLOR = '#f0a830'
// --- myelin sheath (shared gold for all routes; family identity lives in the axon core) ---
const MYELIN_GOLD = '#d8a83a'
const MYELIN_HI = '#f2d46b'
const NODE_GAP_INTERNODE_CELLS = 2.4 // gold internode length along the path (cells)
const NODE_GAP_CELLS = 0.7 // node-of-Ranvier gap length (cells)

// Offscreen bake resolution: px per cell in the static scene canvas (= the tile-bake scale, so tiles
// blit 1:1). 384 cells × 8 = 3072² (~37 MB) — a 2D bitmap, NOT a composited layer, so this is bounded
// canvas memory, not GPU-layer memory. Kept modest (8, not 10) to stay well within the iOS canvas
// budget alongside the tile bake. Crisp at the whole-map default + family-focus; mildly soft only at
// extreme manual zoom (the §1.x zoom-bucket fallback if the owner finds it too soft).
const SCENE_SCALE = 8
const WORLD_W = GRID_W * SCENE_SCALE
const WORLD_H = GRID_H * SCENE_SCALE
// Camera zoom = on-screen px per cell. Whole-grid default fit sits near Z_MIN; Z_MAX matches the prior
// 6× ceiling (≈ 78 px/cell). The displayed viewport canvas is the only DOM canvas → small layer.
const Z_MIN = 1.4
const Z_MAX = 80
const FOCUS_SPAN = 60 // cells across when framed to a family

// Pan boundary (owner: 限制 pan 邊界, don't hard-crop the brain backdrop, 留空間多一點). The
// camera centre is clamped so the visible rect never strays beyond the maze + this margin of
// cells — you can pan to a brain ring at the maze edge, but never past it to reveal the whole
// head or the OUTSIDE void. When the visible rect is wider than (maze + margin), it locks to
// centre. z is untouched; Z_MIN already keeps the content covering the viewport (no void).
const MAZE_PAN_MARGIN = 40
function clampPan(cam: { cx: number; cy: number; z: number }, vw: number, vh: number): { cx: number; cy: number; z: number } {
  const halfW = vw / cam.z / 2
  const halfH = vh / cam.z / 2
  const minX = -MAZE_PAN_MARGIN, maxX = GRID_W + MAZE_PAN_MARGIN
  const minY = -MAZE_PAN_MARGIN, maxY = GRID_H + MAZE_PAN_MARGIN
  const loX = minX + halfW, hiX = maxX - halfW
  const loY = minY + halfH, hiY = maxY - halfH
  const cx = loX > hiX ? (minX + maxX) / 2 : Math.min(Math.max(cam.cx, loX), hiX)
  const cy = loY > hiY ? (minY + maxY) / 2 : Math.min(Math.max(cam.cy, loY), hiY)
  return { cx, cy, z: cam.z }
}

// Safari / iOS: cap the displayed viewport canvas's backing-store DPR so its compositing-layer memory
// stays small (the device may report 3× — a 760px stage at 3× is a 2280² layer). The blit is
// imageSmoothing-off pixel-art, so a lower backing DPR is imperceptible.
const IS_SAFARI_OR_IOS = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1) // iPadOS reports as Mac
  const isSafari = /^((?!chrome|crios|chromium|android|edg|fxios).)*safari/i.test(ua)
  return isIOS || isSafari
})()
const VIEW_DPR_CAP = IS_SAFARI_OR_IOS ? 1.75 : 2

// Mode-B brain backdrop: >1 enlarges the brain (centered on the grid) so its silhouette CONTAINS the
// whole maze (owner: "迷宮都在腦的輪廓內"). DEV-tunable; BRAIN_HERO_ALPHA keeps it faint enough that
// the maze reads on top.
const BRAIN_SCALE_DEFAULT = 1.8 // owner: 放大到 1.8× so the enlarged brain spans the whole maze
const BRAIN_HERO_ALPHA = 0.82 // mode-B brain opacity (owner: 腦再淡一點 so the maze reads on top)
const BRAIN_GLOW_ALPHA = 0.42 // mode-A faint screen-blend brain glow over the opaque maze

/**
 * Bake the maze tilemap for the active design selection (re-baked on switch): BACKGROUND tile →
 * per-cell PATH + WALL styles (+ optional relief cast-shadow on path cells adjacent to walls).
 * Gold myelin routes + neuron landmarks are drawn into the scene on top, never into this tile bake.
 */
function bakeTileArt(sel: MazeSel): HTMLCanvasElement | null {
  const ck = CELL_KINDS
  if (!ck) return null
  const S = SCENE_SCALE
  const cvs = document.createElement('canvas')
  cvs.width = ck.w * S
  cvs.height = ck.h * S
  const c = cvs.getContext('2d')
  if (!c) return null
  const bg = BG_STYLES[sel.bg] ?? BG_STYLES.glialdots
  const wall = WALL_STYLES[sel.wall] ?? WALL_STYLES.myelinrim
  const path = PATH_STYLES[sel.path] ?? PATH_STYLES.myelin
  // BACKGROUND (accent) — cheap procedural seamless tile across the whole bake.
  const bgPat = c.createPattern(bg.tile(128), 'repeat')
  c.fillStyle = bgPat ?? bg.flat
  c.fillRect(0, 0, cvs.width, cvs.height)
  // PATH-floor (the 64% hero) — seamless neural-tissue pattern, anchored at 0,0 so corridors tile
  // continuously. WALL (boundary) fills per-cell (+ optional relief shadow onto adjacent path cells).
  const pathPat = path.tile ? c.createPattern(path.tile(64), 'repeat') : null
  const w = ck.w, h = ck.h, d = ck.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const kind = d[y * w + x]
      if (kind === CELL_PATH) {
        if (path.render) { // wiring-diagram: render an axon following the corridor (neighbour mask)
          let mask = 0
          if (y > 0 && d[(y - 1) * w + x] === CELL_PATH) mask |= 1
          if (x < w - 1 && d[y * w + x + 1] === CELL_PATH) mask |= 2
          if (y < h - 1 && d[(y + 1) * w + x] === CELL_PATH) mask |= 4
          if (x > 0 && d[y * w + x - 1] === CELL_PATH) mask |= 8
          path.render(c, x * S, y * S, S, mask)
        } else if (pathPat) { c.fillStyle = pathPat; c.fillRect(x * S, y * S, S, S) }
        if (wall.shadow) {
          const fromN = y > 0 && d[(y - 1) * w + x] === CELL_WALL
          const fromW = x > 0 && d[y * w + x - 1] === CELL_WALL
          if (fromN || fromW) wall.shadow(c, x * S, y * S, S, fromN, fromW)
        }
      } else if (kind === CELL_WALL) {
        wall.fill(c, x * S, y * S, S)
      }
    }
  }
  return cvs
}

// `isLegacy` = a pre-epoch same-day-co-fire wire (early connection, not re-validated):
// rendered quieter / grey-blue + excluded from the stable-link stat (rework-neurons-
// connectome-expedition-driven D12).
interface SynapseDatum { pairKey: string; state: SynapseState; cell: Cell; isLegacy: boolean }

const SYNAPSE_WEIGHT: Record<SynapseState, { op: number; r: number }> = {
  dormant: { op: 0.3, r: 0.4 },
  weak: { op: 0.6, r: 0.55 },
  strong: { op: 1, r: 0.8 },
}

/** Live read-only synapse rows → drawable spark glyphs at their crossing cells. */
function useSynapseData(): SynapseDatum[] {
  const [data, setData] = useState<SynapseDatum[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.synapses.toArray()).subscribe({
      next: (rows) => {
        const out: SynapseDatum[] = []
        for (const s of rows) {
          let pair: [string, string]
          try {
            pair = decodePairKey(s.pairKey)
          } catch {
            continue
          }
          const cell = synapseCell(pair[0], pair[1])
          if (!cell) continue
          out.push({
            pairKey: s.pairKey,
            state: s.state,
            cell,
            isLegacy: s.lastCoFireDate < CONNECTOME_CONDUCTION_EPOCH,
          })
        }
        setData(out)
      },
      error: (err) => console.warn('[maze] synapse query failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])
  return data
}

interface SceneFlags { landmarksOn: boolean; unlitPins: boolean; synapseOn: boolean }

/**
 * Bake the maze "ink" layer (landmarks + family axon tracts + node pins + lit nodes + synapse sparks +
 * center core) into the OFFSCREEN `canvas` in MAZE-SPACE (SCENE_SCALE px/cell, no camera), on a
 * TRANSPARENT background. Runs ONCE on mount + on each discrete change (settle / explore / synapse /
 * DEV switch) — never per-frame. The 3-region TILE floor is a separate bake (`tileBakeRef`) blitted
 * UNDER this ink at draw time, with the brain wash sandwiched between (tiles → brain → ink) so the
 * tracts stay crisp over the faint brain glow — matching the prior per-frame layering. The brain
 * backdrop + edge feather + walkers are NOT drawn here.
 */
function drawScene(
  canvas: HTMLCanvasElement,
  sel: MazeSel,
  fams: readonly FamilyViewState[],
  synapses: readonly SynapseDatum[],
  flags: SceneFlags,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const tile = SCENE_SCALE
  const toX = (wx: number) => wx * tile
  const toY = (wy: number) => wy * tile

  ctx.clearRect(0, 0, WORLD_W, WORLD_H) // transparent — tiles are a separate layer blitted under this
  ctx.imageSmoothingEnabled = false

  // Layer ① — neuron-symbol landmarks at static hubs, drawn UNDER the gold routes so each axon tract
  // flows continuously THROUGH the cell (route over sprite = continuity, no occlusion).
  if (flags.landmarksOn) {
    ctx.imageSmoothingEnabled = true
    for (const lm of MAZE_LANDMARKS) {
      const img = landmarkImage(lm.src)
      if (!img.complete || img.naturalWidth === 0) continue
      const cx = toX(lm.cell[0])
      const cy = toY(lm.cell[1])
      const dh = lm.cells * tile
      const dw = dh * (img.naturalWidth / img.naturalHeight)
      if (lm.halo > 0) {
        const r = Math.max(4, dh * 0.5)
        const glow = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
        glow.addColorStop(0, `rgba(255,210,90,${lm.halo})`)
        glow.addColorStop(1, 'rgba(255,190,70,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = lm.alpha
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
    }
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = false
  }

  // Layer ② — each family route = one continuous MYELINATED AXON: a dashed gold myelin sheath
  // (internodes + nodes of Ranvier) with the family-colored axon core drawn SOLID over it, so the
  // axon stays continuous through the node gaps. Dim ahead, bright where explored.
  const sheathW = Math.max(2, 1.05 * tile)
  // Family-colored axon core is the corridor's DOMINANT band (tune-neurons-maze-path-colors).
  const coreW = Math.max(1, 0.6 * tile)
  const hiW = Math.max(1, sheathW * 0.42) // pale-gold sheath highlight
  const dashGold = Math.max(2, NODE_GAP_INTERNODE_CELLS * tile)
  const dashGap = Math.max(1, NODE_GAP_CELLS * tile)
  ctx.lineJoin = 'round'
  const cornerR = Math.max(1.5, tile * 0.7)
  const trace = (path: readonly Cell[], n: number): void => {
    ctx.beginPath()
    ctx.moveTo(toX(path[0][0]), toY(path[0][1]))
    for (let i = 1; i < n; i++) {
      ctx.arcTo(toX(path[i][0]), toY(path[i][1]), toX(path[i + 1][0]), toY(path[i + 1][1]), cornerR)
    }
    if (n >= 1) ctx.lineTo(toX(path[n][0]), toY(path[n][1]))
  }
  for (const fam of fams) {
    const enc = FAMILY_ENC[fam.familyId]
    if (!enc || !fam.graph) continue
    const routes = [
      { path: fam.graph.path, explored: exploredOnRoute(fam, 1) },
      { path: fam.graph.path2, explored: exploredOnRoute(fam, 2) },
    ]
    for (const route of routes) {
      const path = route.path
      if (!path || path.length < 2) continue
      const last = path.length - 1
      const exploredIdx = Math.min(last, route.explored)

      // (a) unexplored baseline — faint gold sheath framing a clearly-tinted family-colour core.
      ctx.lineCap = 'butt'
      ctx.setLineDash([dashGold, dashGap])
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = MYELIN_GOLD
      ctx.lineWidth = sheathW
      trace(path, last)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineCap = 'round'
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = enc.color
      ctx.lineWidth = coreW
      trace(path, last)
      ctx.stroke()

      // (b) explored prefix — full bright sheath + highlight + solid family-colour core.
      if (exploredIdx >= 1) {
        ctx.globalAlpha = 1
        ctx.lineCap = 'butt'
        ctx.setLineDash([dashGold, dashGap])
        ctx.strokeStyle = MYELIN_GOLD
        ctx.lineWidth = sheathW
        trace(path, exploredIdx)
        ctx.stroke()
        ctx.strokeStyle = MYELIN_HI
        ctx.lineWidth = hiW
        trace(path, exploredIdx)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineCap = 'round'
        ctx.strokeStyle = enc.color
        ctx.lineWidth = coreW
        trace(path, exploredIdx)
        ctx.stroke()
      }
    }
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.lineCap = 'round'

  // Layer ③a — faint unlit node POSITION pins (reveals position only, not shape/rarity → fog-of-war
  // preserved) so the tracts read as populated with neurons even before exploration.
  if (flags.unlitPins) {
    const lit = new Set<string>()
    for (const fam of fams) for (const n of fam.litNodes) lit.add(`${n.cell[0]},${n.cell[1]}`)
    ctx.fillStyle = 'rgba(150,160,190,0.16)'
    for (const cell of ALL_NODE_CELLS) {
      if (lit.has(`${cell[0]},${cell[1]}`)) continue
      ctx.beginPath(); ctx.arc(toX(cell[0]), toY(cell[1]), Math.max(1, tile * 0.5), 0, Math.PI * 2); ctx.fill()
    }
  }

  // Layer ③ — lit variant nodes, styled per the active design selection (neuron-seed glyph).
  const nodeSize = Math.max(6, tile * 3.2)
  const nodeDraw = (NODE_STYLES[sel.node] ?? NODE_STYLES.ranvier).draw
  for (const fam of fams) {
    for (const node of fam.litNodes) nodeDraw(ctx, toX(node.cell[0]), toY(node.cell[1]), nodeSize)
  }

  // Layer ④ — read-only synapse sparks (+ legacy grey-blue). The transient conduction-pulse glow is a
  // §4 event-driven follow-up; the static spark is baked here so the connectome stays visible.
  if (flags.synapseOn) {
    for (const s of synapses) {
      const wgt = SYNAPSE_WEIGHT[s.state]
      drawSpark(ctx, toX(s.cell[0]), toY(s.cell[1]), Math.max(3, tile), wgt.op, wgt.r, s.isLegacy)
    }
  }

  // Layer ⑤ — center core.
  drawCore(ctx, toX(GRID_CENTER[0]), toY(GRID_CENTER[1]), Math.max(3, tile))
}

export default function MazeGrid({ view }: { view: MazeViewState }): JSX.Element {
  const synapseData = useSynapseData()
  const reading = useReadingTimer()
  const [synapseOverlayOn, setSynapseOverlayOn] = useState(true)
  const [expeditionHidden, setExpeditionHidden] = useState(getExpeditionHidden)
  const setExpeditionHide = (hidden: boolean) => {
    setExpeditionHidden(hidden)
    setExpeditionHiddenPref(hidden)
  }
  // DEV design-language switcher selection (which WALL/PATH/BG/NODE style is active).
  const [sel, setSel] = useState<MazeSel>(DEFAULT_SEL)
  // Neuron landmark layer (the "obvious neuron" lever) + pulled-in default zoom — DEV-tunable for A/B.
  const [landmarksOn, setLandmarksOn] = useState(true)
  // Collapsed-by-default how-to panel (owner: the full instructions + legend prose ate
  // too much vertical space above/below the map). Toggle reveals both blurbs.
  const [helpOpen, setHelpOpen] = useState(false)
  const [zoomBoost, setZoomBoost] = useState(1.0)
  const [bgFibers, setBgFibers] = useState(true)
  const [unlitPins, setUnlitPins] = useState(true)
  // recede = "brain is hero" mode (owner B): the brain becomes a near-opaque backdrop and the maze
  // blits TRANSLUCENT on top, so the brain outline + fibers show through the dense maze. OFF = mode A
  // (faint screen-blend brain glow over an opaque maze).
  const [recede, setRecede] = useState(false) // owner: 腦當主角 OFF (maze fully visible; brain a faint enlarged backdrop)
  const [brainScale, setBrainScale] = useState(BRAIN_SCALE_DEFAULT)
  const [softEdge, setSoftEdge] = useState(true) // owner: 迷宮方形邊界不要那麼明顯 → feather the panel edges
  // Bumped when a landmark / brain image finishes loading so the scene re-bakes + re-blits with it.
  const [assetsVersion, setAssetsVersion] = useState(0)

  const viewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const walkerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  // Offscreen baked scene (created once) + cached tile bake (re-baked only on design-switch).
  const sceneRef = useRef<HTMLCanvasElement | null>(null)
  const tileBakeRef = useRef<{ sel: MazeSel | null; canvas: HTMLCanvasElement | null }>({ sel: null, canvas: null })

  const viewRef = useRef(view)
  viewRef.current = view
  const synapseRef = useRef(synapseData)
  synapseRef.current = synapseData
  const zoomBoostRef = useRef(zoomBoost)
  zoomBoostRef.current = zoomBoost
  const bgFibersRef = useRef(bgFibers)
  bgFibersRef.current = bgFibers
  const recedeRef = useRef(recede)
  recedeRef.current = recede
  const brainScaleRef = useRef(brainScale)
  brainScaleRef.current = brainScale

  // Camera: maze-space center cell (cx, cy) + zoom (on-screen px per cell). Mutated directly on input
  // events; the blit reads it. No React state on pan/zoom.
  const camRef = useRef<{ cx: number; cy: number; z: number }>({ cx: GRID_CENTER[0], cy: GRID_CENTER[1], z: 2 })
  // Focus state: `sticky` = manual focus from the family picker / reading start (held until the next
  // interaction); otherwise `until` time-boxes the answer-driven auto-focus.
  const focusRef = useRef<{ familyId: string | null; until: number; sticky: boolean }>({
    familyId: null, until: 0, sticky: false,
  })
  const manualUntilRef = useRef(0)
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-wire tooltip (polish-neurons-connectome-visual): `wireStatuses` is the read-only conduction
  // projection shown in the tooltip; `hoveredWire` is the currently-shown wire (hover desktop / tap touch).
  const [wireStatuses, setWireStatuses] = useState<Map<string, WireConductionStatus>>(new Map())
  const [hoveredWire, setHoveredWire] = useState<{ pairKey: string; x: number; y: number } | null>(null)
  const hoveredPairRef = useRef<string | null>(null)
  hoveredPairRef.current = hoveredWire?.pairKey ?? null

  const ensureTileBake = useCallback((s: MazeSel): HTMLCanvasElement | null => {
    if (tileBakeRef.current.sel !== s) tileBakeRef.current = { sel: s, canvas: bakeTileArt(s) }
    return tileBakeRef.current.canvas
  }, [])

  // --- camera blit (no rAF; called on input event + settle + focus + resize) ---
  const positionWalkers = useCallback((vw: number, vh: number) => {
    const { cx, cy, z } = camRef.current
    const fitTile = (Math.min(vw, vh) / Math.max(GRID_W, GRID_H)) * 0.98
    const walkerScale = fitTile > 0 ? z / fitTile : 1
    for (const fam of viewRef.current.families) {
      const el = walkerRefs.current.get(fam.familyId)
      if (!el) continue
      const sx = vw / 2 + (fam.walkerCell[0] - cx) * z
      const sy = vh / 2 + (fam.walkerCell[1] - cy) * z
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${walkerScale})`
    }
  }, [])

  // One-shot rAF coalescer (Fable audit P2-1): pan/zoom/pinch fire faster than the display refreshes,
  // so a burst of input events is collapsed into AT MOST ONE drawCamera per animation frame. The rAF
  // exists only while a redraw is pending and self-cancels — it is NOT a steady-state loop, so the
  // no-steady-state-rAF invariant holds. Also the shared frame scheduler for §2–§8 animated layers.
  const drawRafRef = useRef<number | null>(null)
  const viewCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  const drawCamera = useCallback(() => {
    const stage = stageRef.current
    const canvas = viewCanvasRef.current
    const scene = sceneRef.current
    if (!stage || !canvas) return
    const vw = stage.clientWidth || 1
    const vh = stage.clientHeight || 1
    const dpr = Math.min(VIEW_DPR_CAP, window.devicePixelRatio || 1)
    const needW = Math.round(vw * dpr)
    const needH = Math.round(vh * dpr)
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW
      canvas.height = needH
      canvas.style.width = `${vw}px`
      canvas.style.height = `${vh}px`
    }
    const ctx = viewCtxRef.current ?? (viewCtxRef.current = canvas.getContext('2d'))
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { cx, cy, z } = camRef.current
    const toX = (wx: number) => vw / 2 + (wx - cx) * z
    const toY = (wy: number) => vh / 2 + (wy - cy) * z

    ctx.fillStyle = OUTSIDE
    ctx.fillRect(0, 0, vw, vh)

    const tileBake = tileBakeRef.current.canvas
    const brainReady = bgFibersRef.current && bgBrainHeroImg.complete && bgBrainHeroImg.naturalWidth > 0
    const brainW = GRID_W * z * brainScaleRef.current
    const brainH = GRID_H * z * brainScaleRef.current
    const brainX = toX(GRID_W / 2) - brainW / 2
    const brainY = toY(GRID_H / 2) - brainH / 2
    const recedeOn = recedeRef.current && brainReady
    const mazeAlpha = recedeOn ? 0.4 : 1

    // Shared scene→viewport slice (clamped to scene bounds so out-of-range src is never passed to
    // drawImage; the OUTSIDE fill shows beyond the grid). Tiles + ink share the same maze-space rect.
    const scale = z / SCENE_SCALE // scene px → screen px
    let sx = cx * SCENE_SCALE - (vw / 2) / scale
    let sy = cy * SCENE_SCALE - (vh / 2) / scale
    let ssw = vw / scale
    let ssh = vh / scale
    let dx = 0, dy = 0, dw = vw, dh = vh
    if (sx < 0) { dx = -sx * scale; dw -= -sx * scale; ssw += sx; sx = 0 }
    if (sy < 0) { dy = -sy * scale; dh -= -sy * scale; ssh += sy; sy = 0 }
    if (sx + ssw > WORLD_W) { const cut = sx + ssw - WORLD_W; dw -= cut * scale; ssw -= cut }
    if (sy + ssh > WORLD_H) { const cut = sy + ssh - WORLD_H; dh -= cut * scale; ssh -= cut }
    const sliceOk = ssw > 0 && ssh > 0
    const blit = (layer: HTMLCanvasElement | null): void => { if (layer && sliceOk) ctx.drawImage(layer, sx, sy, ssw, ssh, dx, dy, dw, dh) }
    const drawBrain = (alpha: number, composite: GlobalCompositeOperation): void => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = composite
      ctx.imageSmoothingEnabled = true; ctx.drawImage(bgBrainHeroImg, brainX, brainY, brainW, brainH); ctx.restore()
    }

    // Layer order (matches the prior per-frame model): [recede: brain under] → tiles → [mode-A brain
    // glow, screen] → ink (tracts/nodes/sparks stay crisp over the wash) → [mode-A faint contour].
    // imageSmoothing is per-LAYER: OFF for the pixel-art tile floor (crisp chunky cells), but ON for
    // the ink layer — its neuron-symbol landmark sprites + vector axon tracts are smooth (not pixel
    // art), and at the whole-map default the 8px/cell scene is downscaled ~4.4×, so nearest-neighbor
    // aliases the sprites badly. Smoothing the ink downscale fixes the sprite quality (the source
    // sprites are higher-res than the bake, so this is a clean filtered downscale, not a blur).
    if (recedeOn) drawBrain(BRAIN_HERO_ALPHA, 'source-over')
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = mazeAlpha
    blit(tileBake)
    ctx.globalAlpha = 1
    if (!recedeOn && brainReady) drawBrain(BRAIN_GLOW_ALPHA, 'screen')
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = mazeAlpha
    blit(scene)
    ctx.globalAlpha = 1
    if (!recedeOn && brainReady) drawBrain(0.16, 'screen') // faint brain-silhouette contour on top

    positionWalkers(vw, vh)
  }, [positionWalkers])

  // Coalesced redraw for the high-frequency input paths (pan / wheel / pinch): at most one blit per
  // frame regardless of event rate. One-shot, self-cancelling — no steady-state loop.
  const scheduleDraw = useCallback(() => {
    if (drawRafRef.current != null) return // a blit is already queued for the next frame
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null
      drawCamera()
    })
  }, [drawCamera])

  // Cancel any pending coalesced blit on unmount.
  useEffect(() => () => {
    if (drawRafRef.current != null) cancelAnimationFrame(drawRafRef.current)
  }, [])

  // Whole-map default fit (pulled in past the exact fit so the neuron landmarks read big) or, when a
  // family is focused, that family's cluster. Mutates camRef and blits.
  const frameContextual = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const vw = stage.clientWidth || 1
    const vh = stage.clientHeight || 1
    const focus = focusRef.current
    if (focus.familyId && (focus.sticky || performance.now() < focus.until)) {
      const fam = viewRef.current.families.find((f) => f.familyId === focus.familyId)
      if (fam) {
        camRef.current = clampPan({
          cx: fam.walkerCell[0], cy: fam.walkerCell[1],
          z: Math.min(Math.max(Math.min(vw, vh) / FOCUS_SPAN, Z_MIN), Z_MAX),
        }, vw, vh)
        drawCamera()
        return
      }
    }
    const fitZ = (Math.min(vw, vh) / Math.max(GRID_W, GRID_H)) * 0.98 * zoomBoostRef.current
    camRef.current = clampPan({ cx: GRID_CENTER[0], cy: GRID_CENTER[1], z: Math.min(Math.max(fitZ, Z_MIN), Z_MAX) }, vw, vh)
    drawCamera()
  }, [drawCamera])

  const markManual = useCallback(() => {
    manualUntilRef.current = performance.now() + 6000
    if (focusRef.current.familyId) focusRef.current = { familyId: null, until: 0, sticky: false }
    if (autoRevertTimerRef.current) { clearTimeout(autoRevertTimerRef.current); autoRevertTimerRef.current = null }
    if (hoveredPairRef.current) setHoveredWire(null) // a pan/zoom would drift the tooltip → dismiss
  }, [])

  // Re-bake the offscreen scene whenever the rendered content changes (explored progress / lit nodes /
  // synapses / design switch / a landmark image arriving) — a discrete event, never per-frame — then
  // re-blit. `bakeKey` coalesces these into one signature.
  const bakeKey = useMemo(() => {
    const famSig = view.families
      .map((f) => `${f.familyId}:${exploredOnRoute(f, 1)}:${exploredOnRoute(f, 2)}:${f.litNodes.length}`)
      .join(';')
    const synSig = synapseData.map((s) => `${s.pairKey}:${s.state}`).join(';')
    return `${sel.wall},${sel.path},${sel.bg},${sel.node}|lm${landmarksOn ? 1 : 0}|up${unlitPins ? 1 : 0}|sy${synapseOverlayOn ? 1 : 0}|av${assetsVersion}|${famSig}|${synSig}`
  }, [view.families, synapseData, sel, landmarksOn, unlitPins, synapseOverlayOn, assetsVersion])

  useEffect(() => {
    let scene = sceneRef.current
    if (!scene) { scene = document.createElement('canvas'); scene.width = WORLD_W; scene.height = WORLD_H; sceneRef.current = scene }
    ensureTileBake(sel) // populate tileBakeRef for the draw-time tile layer (re-baked only on sel change)
    drawScene(scene, sel, view.families ?? [], synapseData ?? [], {
      landmarksOn, unlitPins, synapseOn: synapseOverlayOn,
    })
    drawCamera()
    // bakeKey captures every input above; re-running on it (not the raw deps) coalesces re-bakes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bakeKey, ensureTileBake, drawCamera])

  // Re-bake/re-blit when a landmark or the brain image finishes loading (they decode async).
  useEffect(() => {
    const onLoad = () => setAssetsVersion((v) => v + 1)
    const targets = [...new Set(MAZE_LANDMARKS.map((l) => l.src))].map(landmarkImage).concat(bgBrainHeroImg)
    const cleanups = targets.map((img) => {
      if (img.complete && img.naturalWidth > 0) return () => {}
      img.addEventListener('load', onLoad)
      return () => img.removeEventListener('load', onLoad)
    })
    return () => cleanups.forEach((fn) => fn())
  }, [])

  // Initial frame + reframe on resize (unless the user just interacted manually).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    frameContextual()
    const ro = new ResizeObserver(() => {
      if (performance.now() > manualUntilRef.current) frameContextual()
      else drawCamera()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [frameContextual, drawCamera])

  // A walker step (view tick) that doesn't change bakeKey needs only the walker DOM overlays
  // repositioned — NOT a full tiles+brain+scene reblit (Fable audit P2-3). Scene content changes go
  // through the bakeKey bake effect (which ends in drawCamera); here we just move the walkers. This is
  // the foundation §2 walker-glide builds on (frame-rate walker ticks must not reblit the static stack).
  useEffect(() => {
    const stage = stageRef.current
    if (stage) positionWalkers(stage.clientWidth || 1, stage.clientHeight || 1)
  }, [view, positionWalkers])

  // Focus / recenter bus (family-picker tap, correct-answer auto-focus, 🔭 recenter).
  useEffect(() => {
    const offFocus = onMazeFocus((familyId, manual) => {
      if (manual) {
        focusRef.current = { familyId, until: Infinity, sticky: true }
        manualUntilRef.current = 0
        if (autoRevertTimerRef.current) { clearTimeout(autoRevertTimerRef.current); autoRevertTimerRef.current = null }
        frameContextual()
      } else {
        if (focusRef.current.sticky) return
        focusRef.current = { familyId, until: performance.now() + 4500, sticky: false }
        frameContextual()
        // No rAF to expire the time-box → schedule the revert as a one-shot timer.
        if (autoRevertTimerRef.current) clearTimeout(autoRevertTimerRef.current)
        autoRevertTimerRef.current = setTimeout(() => {
          if (!focusRef.current.sticky && focusRef.current.familyId === familyId) {
            focusRef.current = { familyId: null, until: 0, sticky: false }
            if (performance.now() > manualUntilRef.current) frameContextual()
          }
        }, 4600)
      }
    })
    const offRecenter = onMazeRecenter(() => {
      focusRef.current = { familyId: null, until: 0, sticky: false }
      manualUntilRef.current = 0
      if (autoRevertTimerRef.current) { clearTimeout(autoRevertTimerRef.current); autoRevertTimerRef.current = null }
      frameContextual()
    })
    return () => {
      offFocus()
      offRecenter()
      if (autoRevertTimerRef.current) { clearTimeout(autoRevertTimerRef.current); autoRevertTimerRef.current = null }
    }
  }, [frameContextual])

  const prevCount = useRef(view.totalConnectedCount)
  useEffect(() => {
    if (view.totalConnectedCount > prevCount.current) playConnectChime()
    prevCount.current = view.totalConnectedCount
  }, [view.totalConnectedCount])

  // Per-wire tooltip data: refresh on conduction pulse + when the synapse set changes (form/strengthen/decay).
  useEffect(() => {
    const sub = subscribeConnectomeEvents({
      'connectome.conductionPulse': () => { void getWireConductionStatuses().then(setWireStatuses) },
    })
    return () => sub.dispose()
  }, [])
  useEffect(() => {
    let alive = true
    void getWireConductionStatuses().then((m) => { if (alive) setWireStatuses(m) })
    return () => { alive = false }
  }, [synapseData])

  // --- pointer / wheel / touch input → camera blit (no rAF) ---
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const clampZ = (z: number) => Math.min(Math.max(z, Z_MIN), Z_MAX)
    // Per-wire tooltip hit-test: nearest synapse cell within a ~16px tap radius (mapped to cells).
    const findWireAt = (clientX: number, clientY: number): { pairKey: string; x: number; y: number } | null => {
      const rect = stage.getBoundingClientRect()
      const { cx, cy, z } = camRef.current
      const wx = cx + (clientX - rect.left - rect.width / 2) / z
      const wy = cy + (clientY - rect.top - rect.height / 2) / z
      const rCells = Math.max(1.4, 16 / z)
      let best: SynapseDatum | null = null
      let bestD = Infinity
      for (const s of synapseRef.current) {
        const d = Math.hypot(wx - s.cell[0], wy - s.cell[1])
        if (d <= rCells && d < bestD) { bestD = d; best = s }
      }
      if (!best) return null
      return {
        pairKey: best.pairKey,
        x: rect.width / 2 + (best.cell[0] - cx) * z,
        y: rect.height / 2 + (best.cell[1] - cy) * z,
      }
    }
    const zoomAround = (factor: number, clientX: number, clientY: number) => {
      const rect = stage.getBoundingClientRect()
      const cam = camRef.current
      const newZ = clampZ(cam.z * factor)
      const sx = clientX - rect.left - rect.width / 2
      const sy = clientY - rect.top - rect.height / 2
      const wx = cam.cx + sx / cam.z
      const wy = cam.cy + sy / cam.z
      camRef.current = clampPan({ cx: wx - sx / newZ, cy: wy - sy / newZ, z: newZ }, rect.width, rect.height)
      scheduleDraw()
    }

    let dragging = false
    let lastX = 0, lastY = 0, downX = 0, downY = 0
    let pinching = false
    let pinchDist = 0
    let lastTapAt = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      markManual()
      zoomAround(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)
    }
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY }
    const onMove = (e: PointerEvent) => {
      if (!dragging && !pinching && e.pointerType !== 'touch') {
        const hit = findWireAt(e.clientX, e.clientY)
        if ((hit?.pairKey ?? null) !== hoveredPairRef.current) setHoveredWire(hit)
      }
      if (!dragging || pinching) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 3) markManual()
      camRef.current.cx -= (e.clientX - lastX) / camRef.current.z
      camRef.current.cy -= (e.clientY - lastY) / camRef.current.z
      camRef.current = clampPan(camRef.current, stage.clientWidth, stage.clientHeight)
      lastX = e.clientX
      lastY = e.clientY
      scheduleDraw()
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      if (e.pointerType === 'touch' && Math.hypot(e.clientX - downX, e.clientY - downY) <= 6) {
        const hit = findWireAt(e.clientX, e.clientY)
        setHoveredWire(hit && hit.pairKey === hoveredPairRef.current ? null : hit)
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && hoveredPairRef.current) setHoveredWire(null)
    }

    const touchDist = (t: TouchList): number => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching = true
        pinchDist = touchDist(e.touches)
        markManual()
        e.preventDefault()
      } else if (e.touches.length === 1) {
        const now = performance.now()
        if (now - lastTapAt < 300) { emitMazeRecenter(); e.preventDefault() }
        lastTapAt = now
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (pinching && e.touches.length === 2) {
        const d = touchDist(e.touches)
        if (pinchDist > 0) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
          zoomAround(d / pinchDist, midX, midY)
        }
        pinchDist = d
        e.preventDefault()
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) { pinching = false; pinchDist = 0 }
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    stage.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    stage.addEventListener('pointerleave', onLeave)
    stage.addEventListener('touchstart', onTouchStart, { passive: false })
    stage.addEventListener('touchmove', onTouchMove, { passive: false })
    stage.addEventListener('touchend', onTouchEnd)
    return () => {
      stage.removeEventListener('wheel', onWheel)
      stage.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointerleave', onLeave)
      stage.removeEventListener('touchstart', onTouchStart)
      stage.removeEventListener('touchmove', onTouchMove)
      stage.removeEventListener('touchend', onTouchEnd)
    }
  }, [scheduleDraw, markManual])

  // DEV switches that change framing (zoom boost) need a reframe when toggled.
  useEffect(() => { if (performance.now() > manualUntilRef.current) frameContextual() }, [zoomBoost, frameContextual])

  const legend = useMemo(() => view.families.map((f) => f.familyId), [view.families])

  return (
    <section style={panelStyle} aria-label="腦內迷宮（互動）">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={countChipStyle}><EmojiIcon char="🧠" size={15} /> 已連線 {view.totalConnectedCount} 個腦區</span>
        <button
          type="button"
          aria-pressed={synapseOverlayOn}
          onClick={() => setSynapseOverlayOn((v) => !v)}
          style={chipToggleStyle(synapseOverlayOn, SYNAPSE_COLOR)}
          title="顯示／隱藏 synapse 功能連結覆蓋層"
        >
          <EmojiIcon char="🔗" size={15} /> {synapseOverlayOn ? '隱藏連結' : '顯示連結'}
        </button>
      </div>

      {import.meta.env.DEV && (
        <div style={devPanelStyle}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ opacity: 0.7 }}>🎨 設計切換（dev）</span>
            {THEME_PRESETS.map((p) => {
              const active = sel.wall === p.wall && sel.path === p.path && sel.bg === p.bg && sel.node === p.node
              return (
                <button key={p.id} type="button" style={devBtnStyle(active)}
                  onClick={() => setSel({ wall: p.wall, path: p.path, bg: p.bg, node: p.node })}>{p.label}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.72rem' }}>
            <label style={devSelLabel}>牆 <select value={sel.wall} style={devSelStyle} onChange={(e) => setSel((s) => ({ ...s, wall: e.target.value }))}>
              {Object.values(WALL_STYLES).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label style={devSelLabel}>路 <select value={sel.path} style={devSelStyle} onChange={(e) => setSel((s) => ({ ...s, path: e.target.value }))}>
              {Object.values(PATH_STYLES).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label style={devSelLabel}>背景 <select value={sel.bg} style={devSelStyle} onChange={(e) => setSel((s) => ({ ...s, bg: e.target.value }))}>
              {Object.values(BG_STYLES).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label style={devSelLabel}>節點 <select value={sel.node} style={devSelStyle} onChange={(e) => setSel((s) => ({ ...s, node: e.target.value }))}>
              {Object.values(NODE_STYLES).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: '0.72rem' }}>
            <button type="button" style={devBtnStyle(landmarksOn)} onClick={() => setLandmarksOn((v) => !v)}>
              🧠 神經元地標 {landmarksOn ? 'ON' : 'OFF'}
            </button>
            <span style={{ opacity: 0.7 }}>｜拉近預設</span>
            {[1.0, 1.25, 1.6, 2.2].map((z) => (
              <button key={z} type="button" style={devBtnStyle(Math.abs(zoomBoost - z) < 0.01)} onClick={() => setZoomBoost(z)}>{z.toFixed(1)}×</button>
            ))}
            <span style={{ opacity: 0.7 }}>｜</span>
            <button type="button" style={devBtnStyle(bgFibers)} onClick={() => setBgFibers((v) => !v)}>🧬 BG 纖維 {bgFibers ? 'ON' : 'OFF'}</button>
            <button type="button" style={devBtnStyle(recede)} onClick={() => setRecede((v) => !v)}>🧠 腦當主角(B) {recede ? 'ON' : 'OFF'}</button>
            <span style={{ opacity: 0.7 }}>｜腦放大</span>
            {[1.0, 1.2, 1.34, 1.55, 1.8].map((s) => (
              <button key={s} type="button" style={devBtnStyle(Math.abs(brainScale - s) < 0.01)} onClick={() => setBrainScale(s)}>{s.toFixed(2)}×</button>
            ))}
            <button type="button" style={devBtnStyle(softEdge)} onClick={() => setSoftEdge((v) => !v)}>▢ 柔化邊界 {softEdge ? 'ON' : 'OFF'}</button>
            <button type="button" style={devBtnStyle(unlitPins)} onClick={() => setUnlitPins((v) => !v)}>◦ 未亮節點 {unlitPins ? 'ON' : 'OFF'}</button>
          </div>
        </div>
      )}

      <button
        type="button"
        style={helpToggleStyle}
        onClick={() => setHelpOpen((v) => !v)}
        aria-expanded={helpOpen}
      >
        ⓘ 怎麼玩 {helpOpen ? '▴' : '▾'}
      </button>
      {helpOpen && (
        <>
          <p style={hintStyle}>
            唸書與答對讓各科的 growth cone 沿軸突束（axon tract）由邊界向中心推進 — 抵達節點點亮並抽出一隻神經元。11 條路徑在同一張腦圖上交織，交叉處是跨科連線生長的位置 — 出征一起修復不同科的錯題會在這裡 wire 起來。滾輪／雙指縮放、拖曳平移；點下方科目卡片聚焦該科、🔭 全覽 回到整體；答對會自動聚焦該科。
          </p>
          <p style={hintStyle}>
            霧中的節點尚未探索 — 不預顯形狀或稀有度。抵達後揭曉並點亮。🔗 連結由「出征一起修復不同科的錯題」長出。
          </p>
        </>
      )}

      {!expeditionHidden && (
        <MazeExpedition onHide={() => setExpeditionHide(true)} paused={reading.status !== 'reading'} />
      )}

      <div ref={stageRef} style={stageStyle}>
        <canvas
          ref={viewCanvasRef}
          style={{ position: 'absolute', inset: 0, display: 'block', touchAction: 'none' }}
        />

        {softEdge && <div aria-hidden style={featherOverlayStyle} />}

        <button
          type="button"
          onClick={() => emitMazeRecenter()}
          style={recenterButtonStyle}
          aria-label="回到全覽"
          title="回到全覽（縮放/聚焦後重置視角）"
        >
          <EmojiIcon char="🔭" size={15} /> 全覽
        </button>
        {view.families.map((fam) => (
          <div
            key={`walker-${fam.familyId}`}
            ref={(el) => walkerRefs.current.set(fam.familyId, el)}
            style={{ position: 'absolute', left: 0, top: 0, width: 26, height: 26, pointerEvents: 'none', zIndex: 5, willChange: 'transform' }}
          >
            {fam.walkerVariant ? (
              <VariantSprite row={fam.walkerVariant} size={26} alt={`${fam.familyId} 路徑代表神經元`} />
            ) : (
              <NeuronSilhouette size={24} alt={`${fam.familyId} 尚未解鎖代表（答題後出現）`} />
            )}
          </div>
        ))}
        {hoveredWire && (() => {
          const st = wireStatuses.get(hoveredWire.pairKey)
          if (!st) return null
          const below = hoveredWire.y < 56
          return (
            <div
              role="tooltip"
              style={{
                ...wireTooltipStyle,
                left: hoveredWire.x,
                top: hoveredWire.y,
                transform: below ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 12px))',
              }}
            >
              <strong>{st.subjects[0]} ↔ {st.subjects[1]}</strong>
              <span>
                {st.isLegacy
                  ? '早期連線 · 不傳導'
                  : `${st.state === 'strong' ? '強' : '弱'}連線 +${st.ratePct}% · 今日傳導 ${st.todayUsed}/${st.cap}`}
              </span>
            </div>
          )
        })()}
      </div>

      <div style={legendStyle}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {legend.map((fam) => {
            const enc = FAMILY_ENC[fam]
            return (
              <span key={`legend-${fam}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <ShapeSwatch color={enc.color} shape={enc.shape} />
                {fam}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * Explored prefix index along a family's route `route` (1 = path, 2 = path2),
 * for the bright "已走過" highlight. The frontier target's `pathIndex` is an index
 * along ITS OWN route, so route 1 and route 2 must be resolved separately
 * (add-neurons-maze-second-lap-variants):
 *  - route 1: frontier on route 1 → its pathIndex; once 二回目 begins (target on
 *    route 2) or both routes done → path1 fully explored (all route-1 nodes lit).
 *  - route 2: frontier on route 2 → its pathIndex; both routes done → path2 full;
 *    not yet in 二回目 → 0 (only the faint baseline shows).
 */
function exploredOnRoute(fam: FamilyViewState, route: 1 | 2): number {
  const g = fam.graph
  if (!g) return 0
  if (route === 1) {
    if (fam.target && fam.target.route === 1) return fam.target.pathIndex
    const anyR1Lit = fam.litNodes.some((n) => n.route === 1)
    return anyR1Lit ? Math.max(0, g.path.length - 1) : (fam.litNodes[0]?.pathIndex ?? 0)
  }
  if (fam.target && fam.target.route === 2) return fam.target.pathIndex
  const anyR2Lit = fam.litNodes.some((n) => n.route === 2)
  if (!fam.target && anyR2Lit) return Math.max(0, (g.path2?.length ?? 1) - 1)
  return 0
}

/**
 * Spark-in-circle synapse glyph: cyan halo + yellow rays + white core.
 * `legacy` → quiet grey-blue, no rays (early connection, not re-validated).
 */
function drawSpark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tile: number,
  op: number,
  rFrac: number,
  legacy = false,
): void {
  const r = Math.max(3, tile * (1 + rFrac))
  ctx.save()
  ctx.globalAlpha = op
  const halo = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
  if (legacy) {
    // Early connection: muted slate-blue, no spikes — reads as historical.
    halo.addColorStop(0, 'rgba(150,170,205,0.55)')
    halo.addColorStop(0.55, 'rgba(120,140,180,0.22)')
    halo.addColorStop(1, 'rgba(120,140,180,0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(210,220,235,0.7)'
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1.5, r * 0.22), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  halo.addColorStop(0, 'rgba(150,247,238,0.85)')
  halo.addColorStop(0.55, 'rgba(56,224,208,0.35)')
  halo.addColorStop(1, 'rgba(56,224,208,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffe66d'
  ctx.lineWidth = Math.max(1, tile * 0.14)
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i + Math.PI / 6
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5)
    ctx.lineTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1)
    ctx.stroke()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(1.5, r * 0.26), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number): void {
  const r = Math.max(3, tile * 1.4)
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r)
  grad.addColorStop(0, '#ffe6b0')
  grad.addColorStop(0.5, CORE_COLOR)
  grad.addColorStop(1, 'rgba(240,168,48,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Grayscale-silhouette placeholder shown at a family's tract head before its
 * first-pull (add-neurons-first-pull-path-rep): a desaturated, faint default
 * neuron sprite reading as "this subject's representative is not unlocked yet".
 */
function NeuronSilhouette({ size, alt }: { size: number; alt: string }): JSX.Element {
  return (
    <img
      src={SPRITE_MAP['variant:default'] ?? ''}
      alt={alt}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        filter: 'grayscale(1) opacity(0.4)',
        pointerEvents: 'none',
      }}
    />
  )
}

function ShapeSwatch({ color, shape }: { color: string; shape: NodeShape }): JSX.Element {
  const style: CSSProperties = {
    width: 11,
    height: 11,
    display: 'inline-block',
    background: color,
    borderRadius: shape === 'circle' ? '50%' : 2,
    transform: shape === 'diamond' ? 'rotate(45deg)' : undefined,
    clipPath:
      shape === 'triangle'
        ? 'polygon(50% 0, 100% 100%, 0 100%)'
        : shape === 'hex'
          ? 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)'
          : undefined,
  }
  return <span style={style} />
}

const panelStyle: CSSProperties = {
  background: '#0b0a1f',
  border: '2px solid #1d1b3a',
  borderRadius: 12,
  padding: '0.85rem 1rem 1rem',
  marginBottom: '1rem',
  color: '#e6e6fa',
  fontFamily: 'var(--font-pixel-cjk)',
}
const countChipStyle: CSSProperties = {
  background: '#15132e',
  border: '1px solid #2a2750',
  borderRadius: 999,
  padding: '4px 12px',
  fontSize: '0.95rem',
}
const chipToggleStyle = (on: boolean, accent: string): CSSProperties => ({
  border: `1px solid ${on ? accent : '#2a2750'}`,
  background: on ? `${accent}22` : '#120f29',
  color: on ? '#fff' : '#9a96c8',
  borderRadius: 999,
  padding: '4px 14px',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
})
const hintStyle: CSSProperties = {
  color: '#9a96c8',
  fontSize: '0.82rem',
  margin: '0.55rem 0 0',
  lineHeight: 1.5,
}
const helpToggleStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  margin: '0.55rem 0 0',
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: '#9a96c8',
  fontSize: '0.8rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const wireTooltipStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 7,
  pointerEvents: 'none',
  transform: 'translate(-50%, calc(-100% - 12px))',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '6px 9px',
  borderRadius: 7,
  background: 'rgba(16, 12, 30, 0.94)',
  border: `1px solid ${SYNAPSE_COLOR}`,
  color: '#f3eede',
  fontSize: '0.72rem',
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
  boxShadow: '0 4px 14px #000a',
}
const stageStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 760,
  margin: '0.75rem auto 0',
  aspectRatio: '1 / 1',
  borderRadius: 12,
  overflow: 'hidden',
  background: OUTSIDE,
  boxShadow: '0 0 0 1px #1d1b3a, 0 8px 30px #0008',
  touchAction: 'none',
  cursor: 'grab',
}
// Screen-space edge feather: soften the maze's hard square boundary into the panel (owner: 迷宮的方形
// 邊界不要那麼明顯). An inset shadow vignette — cheap, static, no per-frame cost.
const featherOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 4,
  borderRadius: 12,
  boxShadow: `inset 0 0 90px 30px ${OUTSIDE}`,
}
const recenterButtonStyle: CSSProperties = {
  position: 'absolute',
  right: 8,
  bottom: 8,
  zIndex: 6,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #2c2a52',
  background: '#161430cc',
  color: '#c7cdf2',
  fontSize: '0.72rem',
  cursor: 'pointer',
  backdropFilter: 'blur(2px)',
}
const legendStyle: CSSProperties = {
  maxWidth: 760,
  margin: '12px auto 0',
  color: '#6f79ad',
  fontSize: '0.78rem',
}

// --- DEV-only design switcher styles (stripped from prod via import.meta.env.DEV) ---
const devPanelStyle: CSSProperties = {
  margin: '0.5rem 0', padding: '8px 10px', borderRadius: 8,
  background: '#120f29', border: '1px dashed #3a3570', color: '#cfcaf0', fontSize: '0.74rem',
}
const devBtnStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? '#9b8cff' : '#2a2750'}`,
  background: active ? '#9b8cff33' : '#1a1738',
  color: active ? '#fff' : '#9a96c8',
  borderRadius: 6, padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
})
const devSelLabel: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9a96c8' }
const devSelStyle: CSSProperties = {
  background: '#1a1738', color: '#e6e6fa', border: '1px solid #2a2750', borderRadius: 5, padding: '2px 4px', fontSize: '0.72rem',
}

let audioCtx: AudioContext | null = null
function playConnectChime(): void {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const ctx = audioCtx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.32)
  } catch {
    /* best-effort cosmetic */
  }
}
