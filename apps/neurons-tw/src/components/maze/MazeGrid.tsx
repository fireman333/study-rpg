/**
 * MazeGrid — the flat-grid maze homepage centerpiece.
 *
 * REBUILD (redesign-neurons-maze-brain-tileset D10): renders the committed
 * 3-region tilemap (BACKGROUND / WALL / PATH — see build-tilemap-maze.mjs) as
 * FLAT COLORS first (16px tile art per region drops in later without touching
 * this layout). The static tilemap is baked ONCE to an offscreen canvas (1px per
 * cell) and blitted per frame (viewport, imageSmoothing off → crisp chunky cells).
 * On top: thin colored family routes (fog = dim whole route / bright explored
 * prefix), lit variant nodes, read-only synapse sparks, the center core.
 *
 * It does NOT call useMaze itself — the page owns the single useMaze(pack)
 * subscription and passes the `view` down (double-mount → double pulls).
 *
 * Camera: a correct answer (maze-focus bus) zooms to that family's walker;
 * reading / idle frames the whole map. Manual wheel-zoom + drag-pan override.
 * Reduced-motion → instant cuts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import { FAMILY_IDS, FAMILY_COLOR } from '@study-rpg/content-neurons-tw'
import VariantSprite from '../VariantSprite'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import MazeExpedition from '../MazeExpedition'
import { db, type SynapseState } from '../../lib/db'
import { decodePairKey } from '../../lib/services/connectome'
import { useRespectsReducedMotion } from '../../lib/motion'
import { useReadingTimer } from '../../lib/hooks/useReadingTimer'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../../lib/expedition-visibility'
import {
  GRID_W, GRID_H, GRID_CENTER, CELL_KINDS, CELL_WALL, CELL_PATH,
  synapseCell, type Cell,
} from '../../lib/maze/graph'
import { onMazeFocus } from '../../lib/maze/maze-focus'
import type { FamilyViewState, MazeViewState } from '../../lib/maze/useMaze'
// DEV design-language switcher (maze-themes): 6 switchable looks for WALL / PATH / BG / NODE; the
// maze TOPOLOGY is untouched. Gold MYELIN routes are still drawn live per-route (never baked).
// Once the owner picks, collapse to the chosen styles + delete the switcher.
import {
  WALL_STYLES, PATH_STYLES, BG_STYLES, NODE_STYLES, THEME_PRESETS, DEFAULT_SEL, type MazeSel,
} from './maze-themes'
// Large textbook neuron-symbol landmarks at static hubs — the "obvious neuron" lever (locked via
// grilled-neurons-maze-looks-like-brain): the corridors are the wiring, these are the cells.
import { MAZE_LANDMARKS, landmarkImage, ALL_NODE_CELLS } from './maze-landmarks'
// Codex gpt-image-2 muted brain-silhouette + nerve-fiber texture — faint full-bleed BG so the maze
// reads as sitting inside a brain (owner: brain outline + fibers, colours not too loud). Alt = ghost.
import bgNeuropilUrl from '../../assets/maze/bg-neuropil.png'
const bgNeuropilImg = new Image()
bgNeuropilImg.src = bgNeuropilUrl
// Mode B "brain is hero" backdrop: codex gpt-image-2 top-down brain (two hemispheres + central fissure
// + branching white-matter fibers, muted teal/violet on navy — owner: brain outline + fibers, muted).
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

// --- 3-region brain-tissue colors (plain dark tissue; myelin lives on the routes, not here) ---
const REGION = {
  bg: [7, 11, 16], // BACKGROUND — quiet deep neuropil (behind the cover-image tissue slice)
  wall: [19, 27, 36], // WALL — dark glial boundary, slightly lighter so maze geometry reads
  path: [5, 7, 10], // PATH — near-black corridor floor (myelinated axon runs on top)
}
const OUTSIDE = '#0a0e14' // beyond the grid bounds
const OUTSIDE_T = 'rgba(10,14,20,0)' // OUTSIDE, fully transparent — for the edge-feather gradient
const SYNAPSE_COLOR = '#38e0d0'
const CORE_COLOR = '#f0a830'
// --- myelin sheath (shared gold for all routes; family identity lives in the axon core) ---
const MYELIN_GOLD = '#d8a83a'
const MYELIN_HI = '#f2d46b'
const NODE_GAP_INTERNODE_CELLS = 2.4 // gold internode length along the path (cells)
const NODE_GAP_CELLS = 0.7 // node-of-Ranvier gap length (cells)

const BASE_TILE = 13 // px per cell at zoom 1
const FOCUS_SPAN = 60 // cells across when zoomed to a family (bigger grid → wider focus)
// Mode-B brain backdrop: >1 enlarges the brain (centered on the grid) so its silhouette CONTAINS the
// whole maze node bounding box (owner: "迷宮都在腦的輪廓內") instead of an oval that leaves the corners
// outside. Higher = brain bleeds further past the panel edges (less whole-brain shape visible). The
// default scale is DEV-tunable live; BRAIN_HERO_ALPHA keeps the brain faint enough that the maze reads.
const BRAIN_SCALE_DEFAULT = 1.8 // owner: 放大到 1.8× so the enlarged brain spans the whole maze
const BRAIN_HERO_ALPHA = 0.82 // mode-B brain opacity (owner: 腦再淡一點 so the maze reads on top)

interface TileAssets {
  /** Whole-maze tile art baked (TILE_BAKE px/cell) → blitted at every zoom; re-baked on selection change. */
  tileBake: HTMLCanvasElement | null
}

const TILE_BAKE = 10 // px per cell in the baked tile-art canvas (384×10 = 3840² — Safari-safe < 4096²)

/**
 * Bake the maze tilemap for the active design selection (re-baked on switch): BACKGROUND tile →
 * per-cell PATH + WALL styles (+ optional relief cast-shadow on path cells adjacent to walls).
 * Gold myelin routes + pale neuropil are drawn live on top, never baked.
 */
function bakeTileArt(sel: MazeSel): HTMLCanvasElement | null {
  const ck = CELL_KINDS
  if (!ck) return null
  const S = TILE_BAKE
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

/** Bake the static 3-region tilemap to an offscreen canvas (1px per cell). */
function bakeTilemap(): HTMLCanvasElement | null {
  const ck = CELL_KINDS
  const cvs = document.createElement('canvas')
  if (!ck) return null
  cvs.width = ck.w
  cvs.height = ck.h
  const c = cvs.getContext('2d')
  if (!c) return null
  const img = c.createImageData(ck.w, ck.h)
  for (let i = 0; i < ck.data.length; i++) {
    const col = ck.data[i] === CELL_PATH ? REGION.path : ck.data[i] === CELL_WALL ? REGION.wall : REGION.bg
    const j = i * 4
    img.data[j] = col[0]
    img.data[j + 1] = col[1]
    img.data[j + 2] = col[2]
    img.data[j + 3] = 255
  }
  c.putImageData(img, 0, 0)
  return cvs
}

interface Cam { cx: number; cy: number; zoom: number }
interface SynapseDatum { pairKey: string; state: SynapseState; cell: Cell }

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
          out.push({ pairKey: s.pairKey, state: s.state, cell })
        }
        setData(out)
      },
      error: (err) => console.warn('[maze] synapse query failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])
  return data
}

export default function MazeGrid({ view }: { view: MazeViewState }): JSX.Element {
  const reducedMotion = useRespectsReducedMotion()
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
  const [zoomBoost, setZoomBoost] = useState(1.0)
  const [bgFibers, setBgFibers] = useState(true)
  const [unlitPins, setUnlitPins] = useState(true)
  // recede = "brain is hero" mode (owner B): the brain image becomes a near-opaque backdrop and the
  // maze tiles blit TRANSLUCENT on top, so the brain outline + fibers actually show through the dense
  // maze (a crisp silhouette can't survive behind opaque tiles). OFF = mode A (faint screen-blend BG).
  const [recede, setRecede] = useState(false) // owner: 腦當主角 OFF (maze fully visible; brain a faint enlarged backdrop)
  const [brainScale, setBrainScale] = useState(BRAIN_SCALE_DEFAULT)
  const [softEdge, setSoftEdge] = useState(true) // owner: 迷宮方形邊界不要那麼明顯 → feather the panel edges
  // 1.0 = whole brain/maze visible (brain silhouette reads); >1.0 pulls in (landmarks bigger).

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const walkerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const tilemap = useMemo(() => bakeTilemap(), [])
  const tilesRef = useRef<TileAssets>({ tileBake: null })
  const selRef = useRef(sel)
  selRef.current = sel
  const landmarksOnRef = useRef(landmarksOn)
  landmarksOnRef.current = landmarksOn
  const zoomBoostRef = useRef(zoomBoost)
  zoomBoostRef.current = zoomBoost
  const bgFibersRef = useRef(bgFibers)
  bgFibersRef.current = bgFibers
  const unlitPinsRef = useRef(unlitPins)
  unlitPinsRef.current = unlitPins
  const recedeRef = useRef(recede)
  recedeRef.current = recede
  const brainScaleRef = useRef(brainScale)
  brainScaleRef.current = brainScale
  const softEdgeRef = useRef(softEdge)
  softEdgeRef.current = softEdge
  const rebake = useCallback(() => { tilesRef.current.tileBake = bakeTileArt(selRef.current) }, [])

  // Bake the tilemap on mount + every design switch (fully procedural — no async assets). The rAF
  // loop reads tilesRef.tileBake each frame. Gold myelin routes are drawn live per-route, never baked.
  useEffect(() => { rebake() }, [sel, rebake])

  const camRef = useRef<Cam>({ cx: GRID_CENTER[0], cy: GRID_CENTER[1], zoom: 0.5 })
  const targetRef = useRef<Cam>({ cx: GRID_CENTER[0], cy: GRID_CENTER[1], zoom: 0.5 })
  const focusRef = useRef<{ familyId: string | null; until: number }>({ familyId: null, until: 0 })
  const manualUntilRef = useRef(0)
  const viewRef = useRef(view)
  viewRef.current = view
  const synapseRef = useRef(synapseData)
  synapseRef.current = synapseData
  const synapseOnRef = useRef(synapseOverlayOn)
  synapseOnRef.current = synapseOverlayOn

  const prevCount = useRef(view.totalConnectedCount)
  useEffect(() => {
    if (view.totalConnectedCount > prevCount.current) playConnectChime()
    prevCount.current = view.totalConnectedCount
  }, [view.totalConnectedCount])

  useEffect(() => {
    return onMazeFocus((familyId) => {
      focusRef.current = { familyId, until: performance.now() + 4500 }
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = stage.clientWidth
      const h = stage.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)

    const computeTarget = (): Cam => {
      const w = stage.clientWidth || 1
      const h = stage.clientHeight || 1
      const now = performance.now()
      const focus = focusRef.current
      if (focus.familyId && now < focus.until && now > manualUntilRef.current) {
        const fam = viewRef.current.families.find((f) => f.familyId === focus.familyId)
        if (fam) {
          const zoom = Math.min(w, h) / (FOCUS_SPAN * BASE_TILE)
          return { cx: fam.walkerCell[0], cy: fam.walkerCell[1], zoom }
        }
      }
      // Pull in past the whole-maze fit so the neuron landmarks read big (owner locked "拉近預設 zoom").
      const zoom = (Math.min(w, h) / (Math.max(GRID_W, GRID_H) * BASE_TILE)) * 0.98 * zoomBoostRef.current
      return { cx: GRID_CENTER[0], cy: GRID_CENTER[1], zoom }
    }

    const draw = () => {
      const w = stage.clientWidth || 1
      const h = stage.clientHeight || 1
      const now = performance.now()

      if (now > manualUntilRef.current) targetRef.current = computeTarget()
      const tgt = targetRef.current
      const cam = camRef.current
      const k = reducedMotion ? 1 : 0.12
      cam.cx += (tgt.cx - cam.cx) * k
      cam.cy += (tgt.cy - cam.cy) * k
      cam.zoom += (tgt.zoom - cam.zoom) * k

      const tile = BASE_TILE * cam.zoom
      const toX = (wx: number) => (wx - cam.cx) * tile + w / 2
      const toY = (wy: number) => (wy - cam.cy) * tile + h / 2

      // Layer ① — 3-region tile art: ONE scaled blit of the baked tile map, so the
      // tiles render continuously at every zoom (no LOD seam). Falls back to the
      // flat-color tilemap only until the bake finishes.
      ctx.fillStyle = OUTSIDE
      ctx.fillRect(0, 0, w, h)
      const tiles = tilesRef.current
      const baked = tiles.tileBake
      const brainImg = bgBrainHeroImg.complete && bgBrainHeroImg.naturalWidth > 0 ? bgBrainHeroImg : bgNeuropilImg
      const brainReady = bgFibersRef.current && brainImg.complete && brainImg.naturalWidth > 0
      // Brain backdrop dest rect: enlarged BRAIN_SCALE× and centered on the grid so the silhouette
      // contains the whole maze (corners included), not just an inscribed oval.
      const brainW = GRID_W * tile * brainScaleRef.current
      const brainH = GRID_H * tile * brainScaleRef.current
      const brainX = toX(GRID_W / 2) - brainW / 2
      const brainY = toY(GRID_H / 2) - brainH / 2
      // Mode B (recede / "brain is hero"): paint the brain UNDER the maze, then blit the tiles
      // TRANSLUCENT so the brain outline + fibers read through the dense maze.
      const recedeOn = recedeRef.current && brainReady

      if (recedeOn) {
        ctx.save()
        ctx.globalAlpha = BRAIN_HERO_ALPHA
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(brainImg, brainX, brainY, brainW, brainH)
        ctx.restore()
      }

      ctx.imageSmoothingEnabled = false
      ctx.globalAlpha = recedeOn ? 0.4 : 1 // recede: maze translucent so the brain shows through
      if (baked) {
        const S = TILE_BAKE
        ctx.drawImage(baked, (cam.cx - w / 2 / tile) * S, (cam.cy - h / 2 / tile) * S, (w / tile) * S, (h / tile) * S, 0, 0, w, h)
      } else if (tilemap) {
        ctx.drawImage(tilemap, cam.cx - w / 2 / tile, cam.cy - h / 2 / tile, w / tile, h / tile, 0, 0, w, h)
      }
      ctx.globalAlpha = 1

      // Mode A (recede OFF) — neuropil: muted brain-silhouette + nerve-fiber texture screen-blended at
      // low alpha OVER the opaque maze → soft brain glow behind. (Mode B already painted it as hero.)
      if (!recedeOn && brainReady) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.42
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(brainImg, brainX, brainY, brainW, brainH)
        ctx.restore()
      }

      const fams = viewRef.current.families

      // Layer ①·⑤ — neuron-symbol landmarks at static hubs, drawn UNDER the gold routes so each axon
      // tract flows continuously THROUGH the cell (Codex: route over sprite = continuity, no occlusion).
      // soma origins (always-visible anchors → fresh save still reads as a brain) / center synapses /
      // off-route glia, anatomically placed (OE consult 2026-06-06). See maze-landmarks.ts.
      if (landmarksOnRef.current) {
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
      }

      // Layer ② — each family route = one continuous MYELINATED AXON: a dashed gold myelin sheath
      // (internodes + nodes of Ranvier) with the family-colored axon core drawn SOLID over it, so the
      // axon stays continuous through the node gaps (never "severed"). Dim gold ahead, bright where
      // explored — the route myelinates as you progress.
      const sheathW = Math.max(2, 1.05 * tile) // myelin sheath ≈ one corridor cell wide
      const coreW = Math.max(1, 0.4 * tile) // family-colored axon core / signal on top
      const hiW = Math.max(1, sheathW * 0.42) // pale-gold sheath highlight
      const dashGold = Math.max(2, NODE_GAP_INTERNODE_CELLS * tile)
      const dashGap = Math.max(1, NODE_GAP_CELLS * tile)
      ctx.lineJoin = 'round'
      // Rounded bends (arcTo at each vertex) so the gold tracts read biological, not circuit-board.
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
        // Route 1 (border entry → center, always) + Route 2 (center → far border,
        // 二回目 — add-neurons-maze-second-lap-variants). Each draws a faint
        // unexplored baseline + a bright explored prefix (per-route progress).
        const routes = [
          { path: fam.graph.path, explored: exploredOnRoute(fam, 1) },
          { path: fam.graph.path2, explored: exploredOnRoute(fam, 2) },
        ]
        for (const route of routes) {
          const path = route.path
          if (!path || path.length < 2) continue
          const last = path.length - 1
          const exploredIdx = Math.min(last, route.explored)

          // (a) unexplored baseline — faint gold myelinated axon over the whole route. Kept dim so the
          // neuron landmarks (not the gold) are the hero (owner: gold no longer sacred).
          ctx.lineCap = 'butt'
          ctx.setLineDash([dashGold, dashGap])
          ctx.globalAlpha = 0.2
          ctx.strokeStyle = MYELIN_GOLD
          ctx.lineWidth = sheathW
          trace(path, last)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.lineCap = 'round'
          ctx.globalAlpha = 0.4
          ctx.strokeStyle = enc.color
          ctx.lineWidth = coreW
          trace(path, last)
          ctx.stroke()

          // (b) explored prefix — full bright myelin sheath + highlight + solid (continuous) axon core
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

      // Layer ③a — faint unlit node POSITION pins (reveals position only, NOT shape/rarity → fog-of-war
      // preserved) so the tracts read as populated with neurons even before exploration.
      if (unlitPinsRef.current) {
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
      const nodeDraw = (NODE_STYLES[selRef.current.node] ?? NODE_STYLES.ranvier).draw
      for (const fam of fams) {
        for (const node of fam.litNodes) nodeDraw(ctx, toX(node.cell[0]), toY(node.cell[1]), nodeSize)
      }

      // Layer ④ — read-only synapse sparks.
      if (synapseOnRef.current) {
        for (const s of synapseRef.current) {
          const wgt = SYNAPSE_WEIGHT[s.state]
          drawSpark(ctx, toX(s.cell[0]), toY(s.cell[1]), Math.max(3, tile), wgt.op, wgt.r)
        }
      }

      // Layer ⑤ — center core.
      drawCore(ctx, toX(GRID_CENTER[0]), toY(GRID_CENTER[1]), Math.max(3, tile))

      // Layer ⑥ — brain-silhouette CONTOUR overlay (mode A only): the same brain texture re-drawn ON TOP
      // very faintly, so only its brightest fibers (the brain outline) glow over the maze. In mode B the
      // brain is already the hero backdrop, so no over-draw is needed.
      if (!recedeOn && brainReady) {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.18
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(brainImg, brainX, brainY, brainW, brainH)
        ctx.restore()
      }

      // Layer ⑦ — edge feather: fade all four canvas edges to the dark panel colour so the maze's
      // hard SQUARE boundary dissolves into the frame (owner: 迷宮的方形邊界不要那麼明顯). The whole
      // maze still shows; only the rectangular cut-off softens.
      if (softEdgeRef.current) {
        const f = Math.min(w, h) * 0.16 // feather band width
        ctx.save()
        let g = ctx.createLinearGradient(0, 0, f, 0)
        g.addColorStop(0, OUTSIDE); g.addColorStop(1, OUTSIDE_T); ctx.fillStyle = g; ctx.fillRect(0, 0, f, h)
        g = ctx.createLinearGradient(w, 0, w - f, 0)
        g.addColorStop(0, OUTSIDE); g.addColorStop(1, OUTSIDE_T); ctx.fillStyle = g; ctx.fillRect(w - f, 0, f, h)
        g = ctx.createLinearGradient(0, 0, 0, f)
        g.addColorStop(0, OUTSIDE); g.addColorStop(1, OUTSIDE_T); ctx.fillStyle = g; ctx.fillRect(0, 0, w, f)
        g = ctx.createLinearGradient(0, h, 0, h - f)
        g.addColorStop(0, OUTSIDE); g.addColorStop(1, OUTSIDE_T); ctx.fillStyle = g; ctx.fillRect(0, h - f, w, f)
        ctx.restore()
      }

      // Walker sprites are fixed-px HTML overlays; scale them with zoom so they grow WITH the maze
      // instead of staying 26px (which reads as shrinking on zoom-in). Self-calibrated to the
      // whole-maze fit tile → scale = 1.0 at the default zoom (look unchanged), grows past it.
      const fitTile = (Math.min(w, h) / Math.max(GRID_W, GRID_H)) * 0.98
      const walkerScale = fitTile > 0 ? tile / fitTile : 1
      for (const fam of fams) {
        const el = walkerRefs.current.get(fam.familyId)
        if (!el) continue
        el.style.transform = `translate(${toX(fam.walkerCell[0])}px, ${toY(fam.walkerCell[1])}px) translate(-50%, -50%) scale(${walkerScale})`
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const markManual = () => { manualUntilRef.current = performance.now() + 6000 }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      markManual()
      const t = targetRef.current
      const factor = Math.exp(-e.deltaY * 0.0015)
      t.zoom = Math.max(0.12, Math.min(6, t.zoom * factor))
    }
    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; markManual() }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      markManual()
      const tile = BASE_TILE * camRef.current.zoom
      targetRef.current.cx -= (e.clientX - lastX) / tile
      targetRef.current.cy -= (e.clientY - lastY) / tile
      camRef.current.cx = targetRef.current.cx
      camRef.current.cy = targetRef.current.cy
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => { dragging = false }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [reducedMotion, tilemap])

  const legend = useMemo(() => view.families.map((f) => f.familyId), [view.families])

  return (
    <section style={panelStyle} aria-label="腦內迷宮（互動）">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={countChipStyle}>🧠 已連線 {view.totalConnectedCount} 個腦區</span>
        <button
          type="button"
          aria-pressed={synapseOverlayOn}
          onClick={() => setSynapseOverlayOn((v) => !v)}
          style={chipToggleStyle(synapseOverlayOn, SYNAPSE_COLOR)}
          title="顯示／隱藏 synapse 功能連結覆蓋層"
        >
          🔗 {synapseOverlayOn ? '隱藏連結' : '顯示連結'}
        </button>
        <button
          type="button"
          aria-pressed={!expeditionHidden}
          onClick={() => setExpeditionHide(!expeditionHidden)}
          style={chipToggleStyle(!expeditionHidden, '#ffb33e')}
        >
          {expeditionHidden ? '🚀 顯示遠征動畫' : '🚀 隱藏遠征動畫'}
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

      <p style={hintStyle}>
        唸書與答對讓各科的 growth cone 沿軸突束（axon tract）由邊界向中心推進 — 抵達節點點亮並抽出一隻神經元。11 條路徑在同一張腦圖上交織，交叉處共同放電會長出 synapse（LTP）。滾輪縮放、拖曳平移；答對會自動聚焦該科。
      </p>

      {!expeditionHidden && (
        <MazeExpedition onHide={() => setExpeditionHide(true)} paused={reading.status !== 'reading'} />
      )}

      <div ref={stageRef} style={stageStyle}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
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
        <p style={{ margin: '6px 0 0' }}>
          霧中的節點尚未探索 — 不預顯形狀或稀有度。抵達後揭曉並點亮。🔗 連結是各科共同放電長出的 synapse。
        </p>
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

/** Spark-in-circle synapse glyph: cyan halo + yellow rays + white core. */
function drawSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number, op: number, rFrac: number): void {
  const r = Math.max(3, tile * (1 + rFrac))
  ctx.save()
  ctx.globalAlpha = op
  const halo = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
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
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
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
