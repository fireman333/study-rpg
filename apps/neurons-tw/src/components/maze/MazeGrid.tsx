/**
 * MazeGrid — the flat-grid maze homepage centerpiece (redesign-neurons-maze-rotjs-grid).
 *
 * Presentational canvas render of the single square weave grid: 11 family
 * corridors wind from the border to a shared center; each cell is drawn as a
 * chunky GBA-style pixel tile on a dark neural-tissue field (design D12 — the
 * map reads as a brain). It does NOT call useMaze itself — the page owns the
 * single useMaze(pack) subscription and passes the `view` down (double-mount →
 * double pulls; promote-maze-to-home lesson).
 *
 * Camera is activity-contextual (design D-camera): a correct answer (via the
 * maze-focus bus) zooms to the answered family's walker; reading / idle frames
 * the whole map. Manual wheel-zoom + drag-pan override the auto-framing briefly.
 * Reduced-motion → instant camera cuts. Fog-of-war: a family's winding corridor
 * is faintly visible, but its variant nodes stay fogged until the frontier lights
 * them (cleared progressively inward from the border). Synapse crossings render as
 * read-only synaptic-bouton glyphs, weight by connectome state, toggleable.
 *
 * Tile drawing is procedural pixel-art (crisp, palette-limited) via `drawCell`;
 * a future authored/AI tile atlas can swap in behind the same call site without
 * touching the camera / fog / walker logic.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import VariantSprite from '../VariantSprite'
import MazeExpedition from '../MazeExpedition'
import { db, type SynapseState } from '../../lib/db'
import { decodePairKey } from '../../lib/services/connectome'
import { useRespectsReducedMotion } from '../../lib/motion'
import { useReadingTimer } from '../../lib/hooks/useReadingTimer'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../../lib/expedition-visibility'
import { GRID_W, GRID_H, GRID_CENTER, GRID_SYNAPSES, synapseCell, type Cell } from '../../lib/maze/graph'
import { onMazeFocus } from '../../lib/maze/maze-focus'
import type { FamilyViewState, MazeViewState } from '../../lib/maze/useMaze'

// --- neutral per-family encoding (color + node-shape redundancy; no NT claim) ---
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
    out[f] = { color: FAMILY_COLORS[i % FAMILY_COLORS.length], shape: NODE_SHAPES[i % NODE_SHAPES.length] }
  })
  return out
})()

// --- brain-tissue palette (signal layer) ---
const BG = '#0a1014' // deep data-surface
const TISSUE_A = '#10191e'
const TISSUE_B = '#0d1418'
const FIBER_DIM = 0.16
const SYNAPSE_COLOR = '#38e0d0'
const CORE_COLOR = '#f0a830'

const SYNAPSE_WEIGHT: Record<SynapseState, { op: number; r: number }> = {
  dormant: { op: 0.2, r: 0.32 },
  weak: { op: 0.5, r: 0.42 },
  strong: { op: 0.95, r: 0.6 },
}

const BASE_TILE = 13 // px per cell at zoom 1
const FOCUS_SPAN = 26 // cells across when zoomed to a family
const cellKey = (x: number, y: number) => `${x},${y}`

interface Cam {
  cx: number
  cy: number
  zoom: number
}

interface SynapseDatum {
  pairKey: string
  state: SynapseState
  cell: Cell
}

/** Live read-only synapse rows → drawable bouton glyphs at their crossing cells. */
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const walkerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // Camera state lives in refs (mutated per-frame in the rAF loop; no React churn).
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
  const readingRef = useRef(reading.status === 'reading')
  readingRef.current = reading.status === 'reading'

  // Soft "connect" chime on a newly-lit node (settle reveal).
  const prevCount = useRef(view.totalConnectedCount)
  useEffect(() => {
    if (view.totalConnectedCount > prevCount.current) playConnectChime()
    prevCount.current = view.totalConnectedCount
  }, [view.totalConnectedCount])

  // Contextual focus: a correct answer zooms to that family's walker for ~4.5s.
  useEffect(() => {
    return onMazeFocus((familyId) => {
      focusRef.current = { familyId, until: performance.now() + 4500 }
    })
  }, [])

  // The render + camera-animation loop.
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
      // Focus mode: a recent correct answer zooms to that family's walker.
      if (focus.familyId && now < focus.until && now > manualUntilRef.current) {
        const fam = viewRef.current.families.find((f) => f.familyId === focus.familyId)
        if (fam) {
          const zoom = Math.min(w, h) / (FOCUS_SPAN * BASE_TILE)
          return { cx: fam.walkerCell[0], cy: fam.walkerCell[1], zoom }
        }
      }
      // Whole-map framing (reading / idle / manual-expired).
      const zoom = (Math.min(w, h) / (Math.max(GRID_W, GRID_H) * BASE_TILE)) * 0.96
      return { cx: GRID_CENTER[0], cy: GRID_CENTER[1], zoom }
    }

    const draw = () => {
      const w = stage.clientWidth || 1
      const h = stage.clientHeight || 1
      const now = performance.now()

      // Camera lerp (instant on reduced-motion or manual control).
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

      // Background neural tissue (checker-dither for a chunky pixel field).
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)
      const step = Math.max(2, Math.round(tile))
      for (let py = 0; py < h; py += step) {
        for (let px = 0; px < w; px += step) {
          ctx.fillStyle = ((px / step + py / step) & 1) === 0 ? TISSUE_A : TISSUE_B
          ctx.fillRect(px, py, step, step)
        }
      }

      const fams = viewRef.current.families
      // synapse over/under per crossing cell (gap the under fiber → weave look).
      const underAt = SYNAPSE_UNDER_BY_CELL

      // 1) Corridors — full path faint (fog: route visible), explored prefix bright.
      for (const fam of fams) {
        const enc = FAMILY_ENC[fam.familyId]
        const path = fam.graph?.path ?? []
        if (path.length < 2) continue
        const exploredIdx = exploredPathIndex(fam)
        for (let i = 1; i < path.length; i++) {
          const [x, y] = path[i]
          // gap the segment if this family is the UNDER party at a crossing cell.
          if (underAt.get(cellKey(x, y)) === fam.familyId) continue
          const lit = i <= exploredIdx
          drawFiberCell(ctx, toX(x), toY(y), tile, enc.color, lit ? 0.92 : FIBER_DIM)
        }
      }

      // 2) Variant nodes — only LIT nodes render a glyph (fog hides the rest).
      for (const fam of fams) {
        const enc = FAMILY_ENC[fam.familyId]
        for (const node of fam.litNodes) {
          drawNodeGlyph(ctx, toX(node.cell[0]), toY(node.cell[1]), tile, enc.color, enc.shape)
        }
      }

      // 3) Synapse bouton overlay (read-only; weight by connectome state).
      if (synapseOnRef.current) {
        for (const s of synapseRef.current) {
          const wgt = SYNAPSE_WEIGHT[s.state]
          drawBouton(ctx, toX(s.cell[0]), toY(s.cell[1]), tile, wgt.op, wgt.r)
        }
      }

      // 4) Center synaptic core.
      drawCore(ctx, toX(GRID_CENTER[0]), toY(GRID_CENTER[1]), tile)

      // 5) Position the HTML walker overlays from the same camera.
      for (const fam of fams) {
        const el = walkerRefs.current.get(fam.familyId)
        if (!el) continue
        el.style.transform = `translate(${toX(fam.walkerCell[0])}px, ${toY(fam.walkerCell[1])}px) translate(-50%, -50%)`
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    // --- manual pan/zoom ---
    const markManual = () => {
      manualUntilRef.current = performance.now() + 6000
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      markManual()
      const t = targetRef.current
      const factor = Math.exp(-e.deltaY * 0.0015)
      t.zoom = Math.max(0.18, Math.min(2.2, t.zoom * factor))
    }
    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      markManual()
    }
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
    const onUp = () => {
      dragging = false
    }
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
  }, [reducedMotion])

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

      <p style={hintStyle}>
        唸書與答對讓各科的 growth cone 沿軸突束（axon tract）由邊界向中心推進 — 抵達節點點亮並抽出一隻神經元。11 條路徑在同一張腦圖上交織，交叉處共同放電會長出 synapse（LTP）。滾輪縮放、拖曳平移；答對會自動聚焦該科。
      </p>

      {!expeditionHidden && (
        <MazeExpedition onHide={() => setExpeditionHide(true)} paused={reading.status !== 'reading'} />
      )}

      <div ref={stageRef} style={stageStyle}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
        {/* HTML walker overlays (one per family) — positioned by the rAF loop. */}
        {view.families.map((fam) => (
          <div
            key={`walker-${fam.familyId}`}
            ref={(el) => walkerRefs.current.set(fam.familyId, el)}
            style={{ position: 'absolute', left: 0, top: 0, width: 26, height: 26, pointerEvents: 'none', zIndex: 5, willChange: 'transform' }}
          >
            {fam.walkerVariant ? (
              <VariantSprite row={fam.walkerVariant} size={26} alt={`${fam.familyId} 探索領頭變體`} />
            ) : (
              <GrowthConeGlyph size={22} color={FAMILY_ENC[fam.familyId]?.color ?? '#fff'} />
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

// --- per-family explored prefix (walker's path index) ---
function exploredPathIndex(fam: FamilyViewState): number {
  // Explored up to the current frontier target's path index (or the last lit
  // node's index in 二週目). litNodes carry pathIndex; the walker sits between
  // the last lit node and the target.
  if (fam.target) return fam.target.pathIndex
  const lit = fam.litNodes
  return lit.length > 0 ? lit[lit.length - 1].pathIndex : 0
}

// --- crossing under-family map (gap the under fiber for the weave look) ---
const SYNAPSE_UNDER_BY_CELL: Map<string, string> = (() => {
  const out = new Map<string, string>()
  for (const s of GRID_SYNAPSES) out.set(`${s.cell[0]},${s.cell[1]}`, s.under)
  return out
})()

// --- procedural pixel-tile drawing (swap for an atlas later behind these calls) ---
function drawFiberCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number, color: string, op: number): void {
  const r = Math.max(1, Math.round(tile * 0.34))
  ctx.globalAlpha = op
  ctx.fillStyle = color
  ctx.fillRect(Math.round(cx - r), Math.round(cy - r), r * 2, r * 2)
  // myelin highlight pixel (node-of-Ranvier nod) on lit fibers
  if (op > 0.5 && tile > 6) {
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffffff'
    const h = Math.max(1, Math.round(tile * 0.12))
    ctx.fillRect(Math.round(cx - h), Math.round(cy - h), h * 2, h * 2)
  }
  ctx.globalAlpha = 1
}

function drawNodeGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number, color: string, shape: NodeShape): void {
  const r = Math.max(2, Math.round(tile * 0.5))
  ctx.fillStyle = color
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1, tile * 0.08)
  ctx.beginPath()
  if (shape === 'circle') ctx.arc(cx, cy, r, 0, Math.PI * 2)
  else if (shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2)
  else if (shape === 'diamond') {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath()
  } else if (shape === 'triangle') {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath()
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2
      const px = cx + r * Math.cos(a)
      const py = cy + r * Math.sin(a)
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
}

function drawBouton(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number, op: number, rFrac: number): void {
  const r = Math.max(2, Math.round(tile * rFrac))
  ctx.globalAlpha = op
  ctx.fillStyle = SYNAPSE_COLOR
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = Math.min(1, op + 0.2)
  ctx.strokeStyle = '#bff7f0'
  ctx.lineWidth = Math.max(1, tile * 0.06)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawCore(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: number): void {
  const r = Math.max(3, Math.round(tile * 0.9))
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r)
  grad.addColorStop(0, '#ffe6b0')
  grad.addColorStop(0.5, CORE_COLOR)
  grad.addColorStop(1, 'rgba(240,168,48,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function GrowthConeGlyph({ size, color }: { size: number; color: string }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="生長錐">
      <g stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.85}>
        <line x1="12" y1="13" x2="6" y2="5" />
        <line x1="12" y1="13" x2="12" y2="3" />
        <line x1="12" y1="13" x2="18" y2="5" />
        <line x1="12" y1="13" x2="20" y2="11" />
      </g>
      <circle cx="12" cy="15" r="4" fill={color} stroke="#fff2cf" strokeWidth={1} />
    </svg>
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
  background: BG,
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
