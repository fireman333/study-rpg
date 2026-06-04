/**
 * MazeBrainMap — the homepage centerpiece (promote-maze-to-home / Model A).
 *
 * Presentational render of the four-region brain-maze, extracted from the former
 * /maze-beta page so it can mount inside the homepage. It does NOT call useMaze
 * itself — the page owns the single useMaze(pack) subscription and passes the
 * `view` down (calling useMaze twice would double-fire reconcileSettles → double
 * pulls). This component owns only view-only UI state (branch-filter visibility,
 * expedition-animation toggle, synapse-overlay toggle) + the settle reveal chime.
 *
 * Phase 5 — the connectome synapse network is rendered as a read-only overlay on
 * the brain frame: each formed synapse is an edge between its two families'
 * node-cluster centroids, edge weight reflecting state (dormant/weak/strong). The
 * overlay is render-only (never mutates synapse state) and toggleable, consistent
 * with the branch-filter chip model (design D2; OE-grounded — functional
 * connectivity overlaid on the structural tract map).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import type { NtBranchId } from '@study-rpg/content-neurons-tw'
import VariantSprite from '../VariantSprite'
import MazeExpedition from '../MazeExpedition'
import { db, type SynapseState } from '../../lib/db'
import { decodePairKey } from '../../lib/services/connectome'
import { useRespectsReducedMotion } from '../../lib/motion'
import { useReadingTimer } from '../../lib/hooks/useReadingTimer'
import { getExpeditionHidden, setExpeditionHiddenPref } from '../../lib/expedition-visibility'
import { walkerFraction } from '../../lib/maze/economy'
import { MAZE_GRAPHS, NT_BRANCHES, nodeKey, pointAtFraction, type MazeNode } from '../../lib/maze/graph'
import type { BranchViewState, MazeViewState } from '../../lib/maze/useMaze'

// SVG canvas units (3:2 to match the 1536×1024 base images; normalized → these).
const VW = 150
const VH = 100
const sx = (x: number) => x * VW
const sy = (y: number) => y * VH

const outlineUrl = new URL('../../assets/maze/brain-outline.png', import.meta.url).href
/** Filled brain-silhouette mask (white = brain) — tracts clip to the actual brain shape. */
const maskUrl = new URL('../../assets/maze/brain-mask.png', import.meta.url).href

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

// --- Synapse overlay: family node-cluster centroids on the shared brain frame ---
// Static (graphs never move at runtime). Each family's centroid = mean of its
// nodes' normalized (x,y) in the canonical brain frame; the overlay draws an edge
// between the two co-firing families' centroids per formed synapse.
const FAMILY_CENTROIDS: Map<string, [number, number]> = (() => {
  const acc = new Map<string, { x: number; y: number; n: number }>()
  for (const branch of NT_BRANCHES) {
    for (const node of MAZE_GRAPHS[branch].nodes) {
      const cur = acc.get(node.familyId) ?? { x: 0, y: 0, n: 0 }
      cur.x += node.x
      cur.y += node.y
      cur.n += 1
      acc.set(node.familyId, cur)
    }
  }
  const out = new Map<string, [number, number]>()
  for (const [fam, v] of acc) out.set(fam, [v.x / v.n, v.y / v.n])
  return out
})()

/** Edge visual weight per synapse state (functional-connectivity overlay). */
const SYNAPSE_EDGE: Record<SynapseState, { opacity: number; width: number }> = {
  dormant: { opacity: 0.16, width: 0.35 },
  weak: { opacity: 0.45, width: 0.7 },
  strong: { opacity: 0.85, width: 1.15 },
}
const SYNAPSE_COLOR = '#a9e8ff' // bright cyan-white — functional links, distinct from coloured structural tracts

interface SynapseEdgeDatum {
  pairKey: string
  state: SynapseState
  a: [number, number]
  b: [number, number]
}

/** Live read-only synapse rows → drawable edges between family centroids. */
function useSynapseEdges(): SynapseEdgeDatum[] {
  const [edges, setEdges] = useState<SynapseEdgeDatum[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.synapses.toArray()).subscribe({
      next: (rows) => {
        const out: SynapseEdgeDatum[] = []
        for (const s of rows) {
          let pair: [string, string]
          try {
            pair = decodePairKey(s.pairKey)
          } catch {
            continue
          }
          const a = FAMILY_CENTROIDS.get(pair[0])
          const b = FAMILY_CENTROIDS.get(pair[1])
          if (!a || !b) continue // family not on the brain frame (unmapped) — skip
          out.push({ pairKey: s.pairKey, state: s.state, a, b })
        }
        setEdges(out)
      },
      error: (err) => console.warn('[maze] synapse overlay query failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])
  return edges
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

export default function MazeBrainMap({ view }: { view: MazeViewState }): JSX.Element {
  const reducedMotion = useRespectsReducedMotion()
  const synapseEdges = useSynapseEdges()
  const [visible, setVisible] = useState<Set<NtBranchId>>(() => new Set(NT_BRANCHES))
  const [synapseOverlayOn, setSynapseOverlayOn] = useState(true)
  // Opt-out visibility (rework-neurons-squads): the band shows by default and
  // auto-animates while reading is active; a persisted「關閉動畫」preference hides it.
  const [expeditionHidden, setExpeditionHidden] = useState(getExpeditionHidden)
  const setExpeditionHide = (hidden: boolean) => {
    setExpeditionHidden(hidden)
    setExpeditionHiddenPref(hidden)
  }
  // Reading-active drives the band animation (static otherwise). Read-only signal.
  const reading = useReadingTimer()
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
        唸書與答對讓各神經傳導物路徑的 growth cone 沿白質束探索 — 抵達腦區點亮並抽出一隻神經元。四套系統交織於同一顆腦。
      </p>

      {/* Branch filter chips — toggle each NT region's layer (display-only). */}
      <div role="group" aria-label="神經傳導物路徑篩選" style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
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

      {/* 神經元遠征隊動畫帶 — 預設顯示，閱讀進行時自動播；純裝飾，旅程本身一直在跑 */}
      {!expeditionHidden && (
        <MazeExpedition
          onHide={() => setExpeditionHide(true)}
          paused={reading.status !== 'reading'}
        />
      )}

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
                {b.target && <WalkerTrail target={b.target} frac={walkerFraction(b.energy)} color={enc.color} />}
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

          {/* Synapse functional-connectivity overlay (render-only; design D2). Drawn
              above the structural tracts, between co-firing families' centroids. */}
          {synapseOverlayOn && (
            <g aria-label="synapse 功能連結覆蓋層">
              {synapseEdges.map((e) => {
                const w = SYNAPSE_EDGE[e.state]
                return (
                  <line
                    key={`syn-${e.pairKey}`}
                    x1={sx(e.a[0])}
                    y1={sy(e.a[1])}
                    x2={sx(e.b[0])}
                    y2={sy(e.b[1])}
                    stroke={SYNAPSE_COLOR}
                    strokeWidth={w.width}
                    strokeOpacity={w.opacity}
                    strokeLinecap="round"
                    style={{ transition: reducedMotion ? 'none' : 'stroke-opacity 240ms ease, stroke-width 240ms ease' }}
                  />
                )
              })}
            </g>
          )}
        </svg>

        {/* HTML overlay: one frontier explorer sprite per visible branch */}
        {shownBranches.map((b) => (
          <div
            key={`walker-${b.branch}`}
            style={{ ...overlayAt(b.walkerPos[0], b.walkerPos[1], 30), transition: reducedMotion ? 'none' : 'left 240ms linear, top 240ms linear', zIndex: 5 }}
          >
            {b.walkerVariant ? (
              <VariantSprite row={b.walkerVariant} size={30} alt={`${ENCODING[b.branch].label} 探索領頭變體`} />
            ) : (
              <GrowthConeGlyph size={26} color={ENCODING[b.branch].color} />
            )}
          </div>
        ))}
      </div>

      <div style={legendStyle}>
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
          霧中的腦區尚未探索 — 不預顯形狀或稀有度。抵達後揭曉並點亮。🔗 連結是各科共同放電長出的 synapse。
        </p>
      </div>
    </section>
  )
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
  aspectRatio: '3 / 2',
  borderRadius: 12,
  overflow: 'hidden',
  background: '#070617',
  boxShadow: '0 0 0 1px #1d1b3a, 0 8px 30px #0008',
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
