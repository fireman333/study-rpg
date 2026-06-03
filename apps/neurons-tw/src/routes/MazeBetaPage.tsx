/**
 * /maze-beta — brain-maze exploration view (add-neurons-brain-maze-slice).
 *
 * Fog-of-war over a DA-pathway brain map: the base image is dimmed (fog); lit
 * (collected) nodes reveal their variant 立繪 with the grown axon (root→node walk
 * path) drawn bright; the walker (rarest collected DA variant, or a growth-cone
 * fallback for an empty team) advances along the current fiber toward the next
 * fogged node as growth signal accrues. Pure count chip 「🧠 已連線 X 個腦區」 — no
 * denominator, no completion milestone (open-collection paradigm, design D5).
 *
 * Independent route — does NOT touch the connectome / collection views (design D1).
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import type { ContentPack } from '@study-rpg/core'
import VariantSprite from '../components/VariantSprite'
import { useMaze } from '../lib/maze/useMaze'
import { walkerFraction } from '../lib/maze/economy'
import { MAZE_GRAPH, nodeKey, pointAtFraction, type MazeNode } from '../lib/maze/graph'

// SVG canvas units (3:2 to match the 1536×1024 base image); normalized → these.
const VW = 150
const VH = 100
const sx = (x: number) => x * VW
const sy = (y: number) => y * VH
const basemapUrl = new URL('../assets/maze/da-basemap.png', import.meta.url).href

/** Pixel-grid cell size (viewBox units) for the GBA-style tract render. Finer = subtler pixels. */
const PX = 0.45

/**
 * Rasterize a normalized polyline into grid-snapped pixel cells (top-left
 * corners), so the grown axon renders as chunky pixel blocks instead of a smooth
 * vector stroke. Step finer than the cell so diagonals don't gap. Memoized by the
 * points-array identity — each node's `path` is a stable reference from the
 * imported graph JSON, so this rasterizes once per node, not every render.
 */
const _pixelCache = new WeakMap<object, [number, number][]>()
function pixelCells(points: [number, number][]): [number, number][] {
  const cached = _pixelCache.get(points)
  if (cached) return cached
  const seen = new Set<string>()
  const cells: [number, number][] = []
  const snap = (px: number, py: number) => {
    const gx = Math.floor(px / PX) * PX
    const gy = Math.floor(py / PX) * PX
    const k = `${gx},${gy}`
    if (!seen.has(k)) { seen.add(k); cells.push([gx, gy]) }
  }
  for (let i = 1; i < points.length; i++) {
    const x0 = sx(points[i - 1][0]), y0 = sy(points[i - 1][1])
    const x1 = sx(points[i][0]), y1 = sy(points[i][1])
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (PX * 0.5)))
    for (let s = 0; s <= n; s++) snap(x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n)
  }
  _pixelCache.set(points, cells)
  return cells
}

/** Render a polyline as crisp pixel-block cells. */
function PixelPath({ points, color, opacity }: { points: [number, number][]; color: string; opacity: number }): JSX.Element {
  return (
    <g shapeRendering="crispEdges">
      {pixelCells(points).map(([gx, gy], i) => (
        <rect key={i} x={gx} y={gy} width={PX} height={PX} fill={color} fillOpacity={opacity} />
      ))}
    </g>
  )
}

/**
 * Color-blind-friendly team encoding (design D7): color + line-style + node-shape.
 * The slice has one team (DA); the table is structured so 4-region expansion adds
 * entries and the legend / render reuse it.
 */
const TEAM_ENCODING = {
  DA: { color: '#ffb33e', dash: 'none', label: 'DA · 多巴胺投射' },
} as const

/** Inline growth-cone fallback walker (empty team, 0 collected) — hand/filopodia glyph. */
function GrowthConeGlyph({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="生長錐">
      <g stroke="#ffd27a" strokeWidth={1.4} strokeLinecap="round" fill="none">
        <line x1="12" y1="13" x2="6" y2="5" />
        <line x1="12" y1="13" x2="12" y2="3" />
        <line x1="12" y1="13" x2="18" y2="5" />
        <line x1="12" y1="13" x2="20" y2="11" />
      </g>
      <circle cx="12" cy="15" r="4" fill="#ffb33e" stroke="#fff2cf" strokeWidth={1} />
    </svg>
  )
}

const pageStyle: CSSProperties = {
  padding: '1.25rem 1rem 3rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  color: '#e6e6fa',
  background: '#0b0a1f',
  minHeight: '100vh',
}
const stageStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 760,
  margin: '1rem auto 0',
  aspectRatio: '3 / 2',
  borderRadius: 12,
  overflow: 'hidden',
  background: '#070617',
  boxShadow: '0 0 0 1px #1d1b3a, 0 8px 30px #0008',
}

export default function MazeBetaPage({ pack }: { pack: ContentPack }): JSX.Element {
  const view = useMaze(pack)
  const prevCount = useRef(view.connectedCount)

  // Soft "connect" chime on a newly-lit node (settle reveal) — WebAudio, no asset.
  useEffect(() => {
    if (view.connectedCount > prevCount.current) playConnectChime()
    prevCount.current = view.connectedCount
  }, [view.connectedCount])

  const litNodes = view.nodes.filter((n) => view.collectedKeys.has(nodeKey(n.familyId, n.slotIndex)))
  const enc = TEAM_ENCODING.DA
  const walkPos = view.walkerPos

  return (
    <section style={pageStyle}>
      <header style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>
          🧠 腦內迷宮 <span style={{ fontSize: '0.7rem', color: '#ffb33e' }}>BETA</span>
        </h1>
        <p style={{ color: '#9a96c8', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
          唸書與答對 DA 科目（藥理 / 公衛）讓 growth cone 沿多巴胺白質束探索，抵達腦區點亮收集。
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              background: '#15132e',
              border: '1px solid #2a2750',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: '0.95rem',
            }}
          >
            🧠 已連線 {view.connectedCount} 個腦區
          </span>
          <span style={{ color: '#7f8ac0', fontSize: '0.8rem' }}>
            探索速度 ×{view.speedMultiplier.toFixed(2)}
            {view.speedMultiplier > 1 ? '（收集加速中）' : '（基礎速度）'}
          </span>
        </div>
      </header>

      <div style={stageStyle}>
        {/* fog: the base map dimmed — region outline + tracts sensed but in mist */}
        <img
          src={basemapUrl}
          alt="DA 腦區迷宮底圖"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.42 }}
        />

        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* grown axons: bright pixel-block walk path to each lit node */}
          {litNodes.map((n) => (
            <PixelPath key={`grown-${n.familyId}-${n.slotIndex}`} points={n.path} color={enc.color} opacity={0.92} />
          ))}
          {/* walker trail: in-progress fiber toward the current fogged target (fainter pixels) */}
          {view.target && (
            <WalkerTrail target={view.target} frac={walkerFraction(view.signal)} color={enc.color} />
          )}
          {/* lit nodes: two-layer dot — inner DA-color fill, outer white edge (no per-node sprite) */}
          {litNodes.map((n) => (
            <circle
              key={`node-${n.familyId}-${n.slotIndex}`}
              cx={sx(n.x)}
              cy={sy(n.y)}
              r={0.8}
              fill={enc.color}
              stroke="#ffffff"
              strokeWidth={0.4}
            />
          ))}
          {/* hub root: a chunky pixel block + faint halo */}
          <g shapeRendering="crispEdges">
            <rect x={sx(MAZE_GRAPH.root[0]) - PX} y={sy(MAZE_GRAPH.root[1]) - PX} width={PX * 2} height={PX * 2} fill="#fff2cf" />
            <rect x={sx(MAZE_GRAPH.root[0]) - PX * 2} y={sy(MAZE_GRAPH.root[1]) - PX} width={PX} height={PX} fill="#ffb33e" fillOpacity={0.7} />
            <rect x={sx(MAZE_GRAPH.root[0]) + PX} y={sy(MAZE_GRAPH.root[1]) - PX} width={PX} height={PX} fill="#ffb33e" fillOpacity={0.7} />
            <rect x={sx(MAZE_GRAPH.root[0]) - PX} y={sy(MAZE_GRAPH.root[1]) - PX * 2} width={PX} height={PX} fill="#ffb33e" fillOpacity={0.7} />
            <rect x={sx(MAZE_GRAPH.root[0]) - PX} y={sy(MAZE_GRAPH.root[1]) + PX} width={PX} height={PX} fill="#ffb33e" fillOpacity={0.7} />
          </g>
        </svg>

        {/* HTML overlay: only the frontier explorer — the representative neuron sprite
            (rarest collected DA variant) or a growth-cone fallback for an empty team. */}
        <div style={{ ...overlayAt(walkPos[0], walkPos[1], 34), transition: 'left 240ms linear, top 240ms linear', zIndex: 5 }}>
          {view.walkerVariant ? (
            <VariantSprite row={view.walkerVariant} size={34} alt="探索領頭變體" />
          ) : (
            <GrowthConeGlyph size={30} />
          )}
        </div>
      </div>

      <footer style={{ maxWidth: 760, margin: '12px auto 0', color: '#6f79ad', fontSize: '0.78rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: enc.color, display: 'inline-block' }} />
          {enc.label}（同心圓節點 · 像素白質束）
        </span>
        <p style={{ margin: '6px 0 0' }}>
          霧中的腦區尚未探索 — 不預顯形狀或稀有度。抵達後揭曉並點亮。
        </p>
      </footer>
    </section>
  )
}

/** Walker trail = the current target's path truncated at the frontier fraction (faint pixels). */
function WalkerTrail({ target, frac, color }: { target: MazeNode; frac: number; color: string }): JSX.Element {
  const tip = pointAtFraction(target, frac)
  const pts: [number, number][] = []
  const budget = frac * target.pathLen
  for (let i = 0; i < target.path.length; i++) {
    if (target.arc[i] <= budget) pts.push(target.path[i])
    else break
  }
  pts.push(tip)
  return <PixelPath points={pts} color={color} opacity={0.4} />
}

const overlayAt = (x: number, y: number, size: number): CSSProperties => ({
  position: 'absolute',
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: size,
  height: size,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
})

let audioCtx: AudioContext | null = null
function playConnectChime(): void {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const ctx = audioCtx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12) // → G5
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.32)
  } catch {
    /* audio is best-effort cosmetic; ignore (e.g. autoplay-gated) */
  }
}
