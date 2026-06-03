/**
 * /maze-beta — brain-maze exploration view, multi-branch
 * (expand-neurons-brain-maze-all-branches; generalizes the DA-only slice).
 *
 * Four NT regions (DA / 5HT / GABA / Glu) z-stacked on a shared brain outline
 * (always visible). Filter chips toggle each branch's tract layer + nodes + walker
 * (display-only — hidden branches still accrue/settle, design D11). Per branch the
 * dimmed basemap is fog; lit (collected) nodes reveal with their grown axon
 * (root→node walk) drawn bright; the walker (rarest collected variant of that
 * branch, or a growth-cone fallback) advances toward the next fogged node as growth
 * signal accrues. Colour-blind-safe encoding: colour + node-shape per branch (solid
 * pixelated tracts, all four distinct). Pure count chip 「🧠 已連線 X 個腦區」 — no
 * denominator, no completion milestone (open-collection paradigm, design D5).
 *
 * Independent route — does NOT touch the connectome / collection views (design D1).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { ContentPack } from '@study-rpg/core'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import VariantSprite from '../components/VariantSprite'
import MazeExpedition from '../components/MazeExpedition'
import { useMaze, type BranchViewState } from '../lib/maze/useMaze'
import { walkerFraction } from '../lib/maze/economy'
import { NT_BRANCHES, nodeKey, pointAtFraction, type MazeNode } from '../lib/maze/graph'

// SVG canvas units (3:2 to match the 1536×1024 base images; normalized → these).
const VW = 150
const VH = 100
const sx = (x: number) => x * VW
const sy = (y: number) => y * VH

const outlineUrl = new URL('../assets/maze/brain-outline.png', import.meta.url).href
/** Filled brain-silhouette mask (white = brain) — tracts clip to the actual brain shape. */
const maskUrl = new URL('../assets/maze/brain-mask.png', import.meta.url).href

type NodeShape = 'circle' | 'diamond' | 'square' | 'triangle'

/**
 * Colour-blind-friendly per-branch encoding (design D7): two redundant channels —
 * colour + node-shape (solid pixelated tracts) — so all four branches stay
 * distinguishable in grayscale.
 */
const ENCODING: Record<NtBranchId, { color: string; label: string; shape: NodeShape }> = {
  DA: { color: '#ffb33e', label: 'DA · 多巴胺', shape: 'circle' },
  '5HT': { color: '#ff5da2', label: '5HT · 血清素', shape: 'diamond' },
  GABA: { color: '#46d27a', label: 'GABA · γ-胺基丁酸', shape: 'square' },
  Glu: { color: '#43c6ff', label: 'Glu · 麩胺酸', shape: 'triangle' },
}

/** Pixel-grid cell size (viewBox units) for the GBA-style tract render. */
const PX = 0.45

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

/** Render a polyline as crisp solid pixel-block cells. */
function PixelPath({ points, color, opacity }: { points: [number, number][]; color: string; opacity: number }): JSX.Element {
  return (
    <g shapeRendering="crispEdges">
      {pixelCells(points).map(([gx, gy], i) => (
        <rect key={i} x={gx} y={gy} width={PX} height={PX} fill={color} fillOpacity={opacity} />
      ))}
    </g>
  )
}

/** A lit node mark — branch-coloured shape with a white edge (the redundant shape channel). */
function NodeMark({ x, y, color, shape }: { x: number; y: number; color: string; shape: NodeShape }): JSX.Element {
  const r = 0.85
  const cx = sx(x), cy = sy(y)
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={0.4} />
  if (shape === 'square') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={color} stroke="#fff" strokeWidth={0.4} />
  if (shape === 'diamond') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={color} stroke="#fff" strokeWidth={0.4} transform={`rotate(45 ${cx} ${cy})`} />
  const h = r * 1.5 // triangle
  return <polygon points={`${cx},${cy - h} ${cx - h},${cy + h * 0.75} ${cx + h},${cy + h * 0.75}`} fill={color} stroke="#fff" strokeWidth={0.4} />
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

/** Inline growth-cone fallback walker (empty team) — hand/filopodia glyph in branch colour. */
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

const overlayAt = (x: number, y: number, size: number): CSSProperties => ({
  position: 'absolute',
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: size,
  height: size,
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
})

export default function MazeBetaPage({ pack }: { pack: ContentPack }): JSX.Element {
  const view = useMaze(pack)
  const [visible, setVisible] = useState<Set<NtBranchId>>(() => new Set(NT_BRANCHES))
  const [expeditionOn, setExpeditionOn] = useState(() => {
    try { return localStorage.getItem('neurons:maze:expeditionShown') === '1' } catch { return false }
  })
  // Persist show/hide so hiding the animation (distracting while reading / answering)
  // sticks across reloads; turning it on likewise sticks.
  const setExpedition = (on: boolean) => {
    setExpeditionOn(on)
    try { localStorage.setItem('neurons:maze:expeditionShown', on ? '1' : '0') } catch { /* private mode */ }
  }
  const prevCount = useRef(view.totalConnectedCount)

  // Soft "connect" chime on a newly-lit node (settle reveal) — WebAudio, no asset.
  useEffect(() => {
    if (view.totalConnectedCount > prevCount.current) playConnectChime()
    prevCount.current = view.totalConnectedCount
  }, [view.totalConnectedCount])

  const toggle = (b: NtBranchId) =>
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(b)) next.delete(b)
      else next.add(b)
      return next
    })

  const branchById = useMemo(() => {
    const m = {} as Record<NtBranchId, BranchViewState>
    for (const b of view.branches) m[b.branch] = b
    return m
  }, [view.branches])

  const shownBranches = view.branches.filter((b) => visible.has(b.branch))

  return (
    <section style={pageStyle}>
      <header style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>
          🧠 腦內迷宮 <span style={{ fontSize: '0.7rem', color: '#ffb33e' }}>BETA</span>
        </h1>
        <p style={{ color: '#9a96c8', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
          唸書與答對讓各神經傳導物路徑的 growth cone 沿白質束探索 — 抵達腦區點亮收集。四套系統交織於同一顆腦。
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
            🧠 已連線 {view.totalConnectedCount} 個腦區
          </span>
          <button
            type="button"
            aria-pressed={expeditionOn}
            onClick={() => setExpedition(!expeditionOn)}
            style={{
              border: `1px solid ${expeditionOn ? '#ffb33e' : '#2a2750'}`,
              background: expeditionOn ? '#ffb33e22' : '#120f29',
              color: expeditionOn ? '#ffd98a' : '#9a96c8',
              borderRadius: 999,
              padding: '4px 14px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {expeditionOn ? '🚀 隱藏遠征動畫' : '🚀 顯示遠征動畫'}
          </button>
        </div>

        {/* Branch filter chips — toggle each NT region's layer (display-only). */}
        <div role="group" aria-label="神經傳導物路徑篩選" style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {view.branches.map((b) => {
            const enc = ENCODING[b.branch]
            const on = visible.has(b.branch)
            return (
              <button
                key={b.branch}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(b.branch)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: `1px solid ${on ? enc.color : '#2a2750'}`,
                  background: on ? `${enc.color}22` : '#120f29',
                  color: on ? '#fff' : '#6f79ad',
                  borderRadius: 999,
                  padding: '3px 11px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity: on ? 1 : 0.7,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: enc.color, display: 'inline-block' }} />
                {enc.label.split(' · ')[0]} · {b.connectedCount}
              </button>
            )
          })}
        </div>
      </header>

      {/* 遠征動畫帶 — 按「顯示遠征動畫」顯示，與 maze 同時播放；純裝飾，旅程本身一直在跑 */}
      {expeditionOn && <MazeExpedition onHide={() => setExpedition(false)} />}

      <div style={stageStyle}>
        {/* always-on shared brain outline (never hidden by chips) */}
        <img
          src={outlineUrl}
          alt="腦區輪廓"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }}
        />
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            <mask id="maze-brain-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={VW} height={VH}>
              <image href={maskUrl} x="0" y="0" width={VW} height={VH} preserveAspectRatio="none" />
            </mask>
          </defs>
          <g mask="url(#maze-brain-mask)">
          {shownBranches.map((b) => {
            const enc = ENCODING[b.branch]
            return (
              <g key={`layer-${b.branch}`}>
                {/* all tracts from the graph: dim = unexplored fog, bright = lit (solid pixel) */}
                {b.graph.nodes.map((n) => (
                  <PixelPath
                    key={`tract-${n.familyId}-${n.slotIndex}`}
                    points={n.path}
                    color={enc.color}
                    opacity={b.collectedKeys.has(nodeKey(n.familyId, n.slotIndex)) ? 0.9 : 0.11}
                  />
                ))}
                {/* walker trail toward the current fogged target (fainter pixels) */}
                {b.target && <WalkerTrail target={b.target} frac={walkerFraction(b.signal)} color={enc.color} />}
                {/* lit nodes: branch-coloured shape with white edge (fog-of-war — unexplored hidden) */}
                {b.litNodes.map((n) => (
                  <NodeMark key={`node-${n.familyId}-${n.slotIndex}`} x={n.x} y={n.y} color={enc.color} shape={enc.shape} />
                ))}
                {/* hub root: a chunky pixel block */}
                <g shapeRendering="crispEdges">
                  <rect x={sx(b.graph.root[0]) - PX} y={sy(b.graph.root[1]) - PX} width={PX * 2} height={PX * 2} fill={enc.color} fillOpacity={0.8} />
                </g>
              </g>
            )
          })}
          </g>
        </svg>

        {/* HTML overlay: one frontier explorer sprite per visible branch */}
        {shownBranches.map((b) => (
          <div
            key={`walker-${b.branch}`}
            style={{ ...overlayAt(b.walkerPos[0], b.walkerPos[1], 30), transition: 'left 240ms linear, top 240ms linear', zIndex: 5 }}
          >
            {b.walkerVariant ? (
              <VariantSprite row={b.walkerVariant} size={30} alt={`${ENCODING[b.branch].label} 探索領頭變體`} />
            ) : (
              <GrowthConeGlyph size={26} color={ENCODING[b.branch].color} />
            )}
          </div>
        ))}
      </div>

      <footer style={{ maxWidth: 760, margin: '12px auto 0', color: '#6f79ad', fontSize: '0.78rem' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {view.branches.map((b) => {
            const enc = ENCODING[b.branch]
            return (
              <span key={`legend-${b.branch}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: visible.has(b.branch) ? 1 : 0.45 }}>
                <span style={{ width: 12, height: 12, borderRadius: enc.shape === 'circle' ? '50%' : 2, background: enc.color, display: 'inline-block', transform: enc.shape === 'diamond' ? 'rotate(45deg)' : undefined }} />
                {enc.label} · {branchById[b.branch]?.speedMultiplier.toFixed(2)}×
              </span>
            )
          })}
        </div>
        <p style={{ margin: '6px 0 0' }}>
          霧中的腦區尚未探索 — 不預顯形狀或稀有度。抵達後揭曉並點亮。用上方晶片切換顯示的路徑。
        </p>
      </footer>
    </section>
  )
}

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
