/**
 * Force-directed connectome viewer.
 *
 * Architecture:
 *  - Pure force-sim module (`force-sim.ts`) owns physics state and the tick loop
 *  - Graph builder (`graph-builder.ts`) constructs initial nodes/edges from the
 *    content pack + current synapse state
 *  - This component drives the requestAnimationFrame loop, captures user drag
 *    on individual nodes, and renders SVG from the latest position snapshot
 *
 * Interactions:
 *  - Drag any node (leaf / year sub-node) → fixes that node + re-energizes sim
 *  - Mouse / trackpad wheel + ctrl/cmd → zoom viewBox
 *  - 2-finger touch pinch → zoom viewBox
 *  - Drag empty canvas → pan viewBox
 *  - Buttons: − / + / 重置
 *
 * Spec: openspec/specs/connectome-collection/spec.md
 *   "Polished SVG Linnean phylogenetic tree SHALL render the connectome ..."
 *   "SVG tree synapse formation, strengthening, decay, and slot-unlock SHALL drive
 *    Framer Motion animations gated by useRespectsReducedMotion"
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { ContentPack } from '@study-rpg/core'
import {
  loadConnectome,
  subscribeConnectomeEvents,
  type ConnectomeSnapshot,
} from '../../lib/services/connectome'
import { initFamilyAccrualIfEmpty } from '../../lib/db'
import { initMasteryForPack } from '../../lib/services/connectome'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import { BranchRoot } from './BranchRoot'
import { EdgePulse } from './EdgePulse'
import { FamilyNode } from './FamilyNode'
import { SynapseEdge } from './SynapseEdge'
import { YearNode } from './YearNode'
import { NT_BRANCH_COLOR, NT_BRANCH_ORDER, type NtBranch } from './layout'
import { ForceSim, type Vec2 } from './force-sim'
import { buildGraph } from './graph-builder'

export interface ConnectomeTreeSvgProps {
  pack: ContentPack
  /**
   * When false, the tree is a presentational embed: no pan / zoom / wheel /
   * touch / drag bindings and no zoom toolbar, so it never intercepts page
   * scroll. Defaults to true (full interactivity). (revise-neurons-homepage-hero-real-tree)
   */
  interactive?: boolean
  /**
   * When set (e.g. `'min(72vh, 600px)'`), the SVG is rendered at this fixed CSS
   * height and `width:100%`; `preserveAspectRatio="xMidYMid meet"` fits the whole
   * tree into that bounded panel. Used by the homepage so the interactive tree is
   * a fixed-height centerpiece rather than a full-page-tall block. Touch uses
   * `pan-y` so single-finger vertical drag still scrolls the page (no scroll-trap);
   * pinch (2-finger) still zooms. (fuse-connectome-into-neurons-homepage)
   */
  panelHeight?: string
}

interface EdgeFlags {
  // pairKey → token incremented on formation / dormant→weak strengthen. A non-zero
  // token re-keys the edge so it re-mounts with the birth draw-in + burst.
  freshFormed: Map<string, number>
}

export function ConnectomeTreeSvg({ pack, interactive = true, panelHeight }: ConnectomeTreeSvgProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<ConnectomeSnapshot | null>(null)
  const [flags, setFlags] = useState<EdgeFlags>(() => ({
    freshFormed: new Map(),
  }))
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  // Active EdgePulses — auto-cleared on completion. Each pulse travels along
  // one parent-child edge from child → parent (visualizing signal propagation
  // up the year → leaf → branch → root chain).
  const [pulses, setPulses] = useState<
    Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string; durationMs: number }>
  >([])
  // Tick counter only — used to flush React renders at ~30fps as sim ticks.
  const [, forceRender] = useState(0)
  const initOnceRef = useRef(false)

  const refresh = (): void => {
    void loadConnectome().then((s) => setSnapshot(s))
  }

  // Bootstrap + event subscription.
  useEffect(() => {
    if (initOnceRef.current) {
      refresh()
      return
    }
    initOnceRef.current = true
    void Promise.all([initFamilyAccrualIfEmpty(pack), initMasteryForPack(pack)]).then(() => {
      refresh()
    })

    const sub = subscribeConnectomeEvents({
      'connectome.synapseFormed': (payload) => {
        setFlags((prev) => {
          const next: EdgeFlags = { freshFormed: new Map(prev.freshFormed) }
          next.freshFormed.set(payload.pairKey, (prev.freshFormed.get(payload.pairKey) ?? 0) + 1)
          return next
        })
        refresh()
      },
      'connectome.synapseStrengthened': (payload) => {
        if (payload.fromState === 'dormant') {
          setFlags((prev) => {
            const next: EdgeFlags = { freshFormed: new Map(prev.freshFormed) }
            next.freshFormed.set(payload.pairKey, (prev.freshFormed.get(payload.pairKey) ?? 0) + 1)
            return next
          })
        }
        refresh()
      },
      // Decay no longer fades/removes the edge — dormant renders (thin + recency
      // brightness), so a decay just re-renders with the new state's thinner width.
      'connectome.synapseDecayed': () => refresh(),
      'connectome.variantSlotUnlocked': () => refresh(),
    })
    return () => sub.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])

  // Build the force-sim from pack + current synapse state. Re-built when
  // synapses change so new edges enter the simulation.
  const { sim, bounds, yearsByFamily } = useMemo(() => {
    const synapses = snapshot?.synapses ?? []
    const built = buildGraph({ pack, synapses })
    // Outward-radiating layout: very mild central gravity, stronger repulsion
    // with longer cutoff so nodes spread out and don't pile on each other.
    const newSim = new ForceSim({
      bounds: built.bounds,
      centerK: 0.003,
      repelK: 2600,
      repelCutoff: 200,
    })
    for (const n of built.nodes) newSim.addNode(n)
    for (const e of built.edges) newSim.addEdge(e)
    return { sim: newSim, bounds: built.bounds, yearsByFamily: built.yearsByFamily }
  }, [pack, snapshot?.synapses])

  // Run the force sim until settled. Cap React re-renders at ~30fps so we don't
  // burn the main thread on a 60fps state churn.
  const lastRenderRef = useRef(0)
  useEffect(() => {
    let raf = 0
    let running = true
    const loop = (): void => {
      if (!running) return
      const stillMoving = sim.step()
      const now = performance.now()
      if (now - lastRenderRef.current > 33) {
        lastRenderRef.current = now
        forceRender((n) => (n + 1) % 1_000_000)
      }
      if (stillMoving) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [sim])

  const positions = sim.snapshot()

  // Helpers for derived render state.
  const accrualByFamily = new Map(
    (snapshot?.familyAccrual ?? []).map((r) => [r.familyId, r]),
  )

  // ─── Drag handling ────────────────────────────────────────────────────────
  // Two drag modes:
  //   - On a node: pin that sim node + drag it
  //   - On empty canvas: pan the whole viewBox (no sim impact)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const panRef = useRef(pan)
  panRef.current = pan
  const dragStateRef = useRef<
    | {
        kind: 'node'
        nodeId: string
        startClientX: number
        startClientY: number
        startNodePos: Vec2
        pointerId: number
      }
    | {
        kind: 'pan'
        startClientX: number
        startClientY: number
        basePan: { dx: number; dy: number }
        pointerId: number
      }
    | null
  >(null)
  const pinchStateRef = useRef<{ initialDist: number; initialZoom: number } | null>(null)

  const setZoomClamped = (next: number): void => setZoom(Math.max(0.4, Math.min(3, next)))
  const svgReady = snapshot != null

  // Convert client-pixel delta to viewBox-unit delta given current zoom + svg size.
  function pxDeltaToVbDelta(dxPx: number, dyPx: number): Vec2 {
    const svg = svgRef.current
    if (!svg) return { x: dxPx, y: dyPx }
    const rect = svg.getBoundingClientRect()
    const vbW = bounds.width / zoomRef.current
    const vbH = bounds.height / zoomRef.current
    return {
      x: rect.width > 0 ? dxPx * (vbW / rect.width) : dxPx,
      y: rect.height > 0 ? dyPx * (vbH / rect.height) : dyPx,
    }
  }

  // Native event binding so we can preventDefault on wheel + touch.
  // Skipped entirely in non-interactive embed mode so the hero never intercepts
  // page scroll. (revise-neurons-homepage-hero-real-tree)
  useEffect(() => {
    if (!interactive) return
    const svg = svgRef.current
    if (!svg) return

    function dist(touches: TouchList): number {
      const [a, b] = [touches[0], touches[1]]
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    }

    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const step = Math.max(-0.1, Math.min(0.1, -e.deltaY * 0.01))
      setZoomClamped(zoomRef.current + step)
    }

    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length !== 2) return
      pinchStateRef.current = { initialDist: dist(e.touches), initialZoom: zoomRef.current }
    }
    const onTouchMove = (e: TouchEvent): void => {
      if (e.touches.length !== 2 || !pinchStateRef.current) return
      e.preventDefault()
      const ratio = dist(e.touches) / pinchStateRef.current.initialDist
      setZoomClamped(pinchStateRef.current.initialZoom * ratio)
    }
    const onTouchEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) pinchStateRef.current = null
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('touchstart', onTouchStart, { passive: true })
    svg.addEventListener('touchmove', onTouchMove, { passive: false })
    svg.addEventListener('touchend', onTouchEnd, { passive: true })
    svg.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('touchstart', onTouchStart)
      svg.removeEventListener('touchmove', onTouchMove)
      svg.removeEventListener('touchend', onTouchEnd)
      svg.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [svgReady, interactive])

  // React-bridged pointer event handlers for drag (handles both node + canvas).
  const onSvgPointerDown = (e: React.PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (pinchStateRef.current) return

    // If the pointer target descends from a node group with [data-sim-id],
    // treat as node drag. Otherwise pan canvas.
    const target = e.target as Element
    const nodeGroup = target.closest('[data-sim-id]') as HTMLElement | null
    const nodeId = nodeGroup?.getAttribute('data-sim-id') ?? null

    if (nodeId) {
      const node = sim.nodes.get(nodeId)
      if (!node) return
      dragStateRef.current = {
        kind: 'node',
        nodeId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startNodePos: { x: node.pos.x, y: node.pos.y },
        pointerId: e.pointerId,
      }
      sim.pinAt(nodeId, node.pos)
      svgRef.current?.setPointerCapture(e.pointerId)
    } else {
      dragStateRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        basePan: { ...panRef.current },
        pointerId: e.pointerId,
      }
      svgRef.current?.setPointerCapture(e.pointerId)
    }
  }

  const onSvgPointerMove = (e: React.PointerEvent): void => {
    const s = dragStateRef.current
    if (!s || s.pointerId !== e.pointerId) return
    if (s.kind === 'node') {
      const d = pxDeltaToVbDelta(e.clientX - s.startClientX, e.clientY - s.startClientY)
      const newPos = { x: s.startNodePos.x + d.x, y: s.startNodePos.y + d.y }
      sim.pinAt(s.nodeId, newPos)
      // Wake the sim so connectors update.
      forceRender((n) => (n + 1) % 1_000_000)
    } else {
      const d = pxDeltaToVbDelta(e.clientX - s.startClientX, e.clientY - s.startClientY)
      setPan({ dx: s.basePan.dx - d.x, dy: s.basePan.dy - d.y })
    }
  }

  const onSvgPointerUp = (e: React.PointerEvent): void => {
    const s = dragStateRef.current
    if (!s || s.pointerId !== e.pointerId) return
    if (s.kind === 'node') {
      sim.release(s.nodeId)
    }
    dragStateRef.current = null
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    // Re-energize loop in case it had settled.
    forceRender((n) => (n + 1) % 1_000_000)
  }

  if (!snapshot) {
    return (
      <p style={{ margin: '0.5rem 0', color: '#5a3f29' }}>正在繪製 connectome 樹…</p>
    )
  }

  const zoomedViewBox = (() => {
    const w = bounds.width / zoom
    const h = bounds.height / zoom
    const cx = bounds.width / 2
    const cy = bounds.height / 2
    return `${cx - w / 2 + pan.dx} ${cy - h / 2 + pan.dy} ${w} ${h}`
  })()

  const rootPos = positions.get('root') ?? { x: bounds.width / 2, y: bounds.height / 2 }

  return (
    <section style={containerStyle} aria-label="Connectome 連結組樹狀視覺">
      {interactive && (
        <div style={zoomBarStyle}>
          <button type="button" style={zoomBtnStyle} onClick={() => setZoomClamped(zoom - 0.25)} aria-label="縮小">−</button>
          <span style={zoomLabelStyle}>{Math.round(zoom * 100)}%</span>
          <button type="button" style={zoomBtnStyle} onClick={() => setZoomClamped(zoom + 0.25)} aria-label="放大">＋</button>
          <button
            type="button"
            style={zoomResetBtnStyle}
            onClick={() => {
              setZoom(1)
              setPan({ dx: 0, dy: 0 })
            }}
            aria-label="重置縮放與位置"
          >
            重置
          </button>
          <span style={hintStyle}>拖拉節點移動・捏合 / Ctrl+滾輪縮放</span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={zoomedViewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Connectome — 4 NT 分支根節點 / 11 家族葉節點 / 年份節點 / synapse 邊"
        style={{
          width: '100%',
          height: panelHeight ?? 'auto',
          display: 'block',
          // panelHeight (homepage): pan-y lets single-finger vertical drag scroll
          // the page (no touch scroll-trap); pinch (2-finger) is still preventDefault'd
          // to zoom. Without panelHeight + interactive: 'none' (legacy canvas behavior).
          touchAction: interactive ? (panelHeight ? 'pan-y' : 'none') : 'auto',
          cursor: interactive ? 'grab' : 'pointer',
        }}
        onPointerDown={interactive ? onSvgPointerDown : undefined}
        onPointerMove={interactive ? onSvgPointerMove : undefined}
        onPointerUp={interactive ? onSvgPointerUp : undefined}
        onPointerCancel={interactive ? onSvgPointerUp : undefined}
      >
        {/* Skeleton edges — under everything */}
        <g aria-hidden>
          {Array.from(sim.edges).map((e, idx) => {
            if (e.kind === 'synapse') return null // rendered as <SynapseEdge> below
            const sNode = positions.get(e.source)
            const tNode = positions.get(e.target)
            if (!sNode || !tNode) return null
            const isParentChild = e.kind === 'parent-child'
            const stroke = isParentChild
              ? guessEdgeColor(e.target, pack)
              : 'var(--signal-dim)'
            const strokeOpacity = isParentChild ? 0.45 : 0.6
            return (
              <path
                key={`skel-${idx}-${e.source}-${e.target}`}
                d={`M ${sNode.x.toFixed(2)},${sNode.y.toFixed(2)} L ${tNode.x.toFixed(2)},${tNode.y.toFixed(2)}`}
                fill="none"
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={1.25}
                strokeLinecap="round"
              />
            )
          })}
        </g>

        {/* Synapse edges — all formed synapses render a visible edge (incl. dormant).
            Stroke WIDTH encodes accumulated strength (state); BRIGHTNESS encodes
            recency (daysSinceCoFire → 0 brightest, ≥7 dim floor). */}
        <g aria-hidden>
          {snapshot.synapses.map((syn) => {
            const [a, b] = syn.pairKey.split('|')
            const aPos = positions.get(`leaf:${a}`)
            const bPos = positions.get(`leaf:${b}`)
            if (!aPos || !bPos) return null
            const freshToken = flags.freshFormed.get(syn.pairKey) ?? 0
            const daysSince = daysBetween(syn.lastCoFireDate, snapshot.today)
            const recency = Math.max(0, 1 - daysSince / 7)
            const aName = pack.subjects.find((s) => s.id === a)?.displayName ?? a
            const bName = pack.subjects.find((s) => s.id === b)?.displayName ?? b
            const tooltip = `${aName} ⇄ ${bName}・上次共激發 ${syn.lastCoFireDate}（${daysSince} 天前）`
            const pathD = `M ${aPos.x.toFixed(2)},${aPos.y.toFixed(2)} Q ${((aPos.x + bPos.x) / 2 + (bPos.y - aPos.y) * 0.18).toFixed(2)},${((aPos.y + bPos.y) / 2 - (bPos.x - aPos.x) * 0.18).toFixed(2)} ${bPos.x.toFixed(2)},${bPos.y.toFixed(2)}`
            return (
              <SynapseEdge
                key={`${syn.pairKey}-${freshToken}`}
                pathKey={`${syn.pairKey}-${freshToken}`}
                pathD={pathD}
                state={syn.state}
                recency={recency}
                isFreshlyFormed={freshToken > 0}
                title={tooltip}
              />
            )
          })}
        </g>

        {/* Year sub-nodes */}
        <g>
          {pack.subjects.flatMap((family) => {
            const years = yearsByFamily.get(family.id) ?? []
            return years.map((year) => {
              const id = `year:${family.id}:${year}`
              const pos = positions.get(id)
              if (!pos) return null
              return (
                <g key={id} data-sim-id={id}>
                  <YearNode year={year} pos={pos} parentColor={family.color ?? '#888'} />
                </g>
              )
            })
          })}
        </g>

        {/* Root — central brain icon with white frame + breathing aura. Bigger
            than the NT hubs (r=68 vs hub r=50) so the hierarchy reads center →
            hubs → leaves → years from biggest to smallest. */}
        <g aria-hidden transform={`translate(${rootPos.x}, ${rootPos.y})`} role="group" aria-label="Neuron Connectome — 中央根節點">
          <defs>
            <filter id="root-aura-blur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          {/* 4 NT-color rings emitted concentrically from the root, one after
              another. Each ring starts small at root center, expands outward
              (scale 0.5 → 2.4), and fades to transparent — like ripples on a
              pond. Stagger by 0.6s in a 2.4s cycle so a steady stream of
              multi-color rings radiates from the brain. */}
          {(() => {
            const RIPPLES = [
              { color: '#ffe14a', delay: 0 }, // DA gold
              { color: '#3ec6ff', delay: 0.6 }, // GABA cyan
              { color: '#84ff3a', delay: 1.2 }, // Glu green
              { color: '#ff4d8d', delay: 1.8 }, // 5HT pink
            ]
            return RIPPLES.map(({ color, delay }, idx) => (
              <motion.circle
                key={idx}
                r={55}
                fill="none"
                stroke={color}
                strokeWidth={8}
                filter="url(#root-aura-blur)"
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 0.7, 0], scale: [0.55, 1.55, 1.7] }}
                transition={{
                  duration: 2.4,
                  ease: 'easeOut',
                  repeat: Infinity,
                  delay,
                  times: [0, 0.5, 1],
                }}
                style={{ originX: 0.5, originY: 0.5 }}
              />
            ))
          })()}
          {/* White disc + warm brown frame */}
          <circle r={68} fill="#fff" stroke="#3b2a18" strokeWidth={3.5} />
          <circle r={64} fill="#f8a5a5" fillOpacity={0.12} />
          {/* Brain icon (or fallback dot until the codex sprite lands) */}
          {THEME_PIXEL_NEURONS.sprites['root:brain'] &&
          THEME_PIXEL_NEURONS.sprites['root:brain'].startsWith('data:') ? (
            <circle r={14} fill="#3b2a18" />
          ) : (
            <image
              href={THEME_PIXEL_NEURONS.sprites['root:brain']}
              x={-46}
              y={-46}
              width={92}
              height={92}
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          <text
            y={92}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="var(--signal-ink)"
            style={{ userSelect: 'none' }}
          >
            Neuron Connectome
          </text>
        </g>

        {/* Branch sub-roots */}
        <g>
          {NT_BRANCH_ORDER.map((branch) => {
            const pos = positions.get(`branch:${branch}`)
            if (!pos) return null
            return (
              <g key={branch} data-sim-id={`branch:${branch}`}>
                <BranchRoot branch={branch} pos={pos} mode="horizontal" />
              </g>
            )
          })}
        </g>

        {/* Family leaves */}
        <g>
          {pack.subjects.map((family) => {
            const id = `leaf:${family.id}`
            const pos = positions.get(id)
            if (!pos) return null
            const accrual = accrualByFamily.get(family.id)
            const labelSide: 'left' | 'right' = pos.x < rootPos.x ? 'left' : 'right'
            return (
              <g key={family.id} data-sim-id={id}>
                <FamilyNode
                  family={family}
                  pos={pos}
                  ap={accrual?.ap ?? 0}
                  firedToday={accrual?.firedToday ?? false}
                  labelSide={labelSide}
                />
              </g>
            )
          })}
        </g>

        {/* Edge pulses — TOPMOST layer so they read clearly over nodes / labels. */}
        <g aria-hidden>
          {pulses.map((p) => (
            <EdgePulse
              key={p.id}
              id={p.id}
              from={p.from}
              to={p.to}
              color={p.color}
              durationMs={p.durationMs}
              onComplete={() => setPulses((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </g>
      </svg>
    </section>
  )
}

function guessEdgeColor(targetId: string, pack: ContentPack): string {
  if (targetId.startsWith('branch:')) {
    const b = targetId.slice('branch:'.length) as NtBranch
    return NT_BRANCH_COLOR[b] ?? '#8c6d4a'
  }
  if (targetId.startsWith('leaf:')) {
    const famId = targetId.slice('leaf:'.length)
    const fam = pack.subjects.find((s) => s.id === famId)
    return fam?.color ?? '#8c6d4a'
  }
  if (targetId.startsWith('year:')) {
    const famId = targetId.slice('year:'.length).split(':')[0]
    const fam = pack.subjects.find((s) => s.id === famId)
    return fam?.color ?? '#888'
  }
  return '#8c6d4a'
}

// Whole-days between two ISO date strings (floored, clamped ≥ 0). Used to derive
// synapse-edge recency for the brightness channel.
function daysBetween(earlier: string, later: string): number {
  const ms = Date.parse(later) - Date.parse(earlier)
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

// Dim instrument canvas (EEG-monitor read) — dimmer than the deep #0c1418 stats
// surface so the warm pixel tree labels (relit to --signal-ink) stay legible.
// Grid + scanline via signal-layer overlay tokens. Thick warm frame keeps it
// reading as an in-world device, not a second app. (polish-neurons-clinical-aesthetic)
const containerStyle: React.CSSProperties = {
  background: 'var(--signal-bg-dim)',
  backgroundImage:
    'linear-gradient(var(--grid-line) 1px, transparent 1px),' +
    'linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),' +
    'repeating-linear-gradient(0deg, var(--scanline) 0px, var(--scanline) 1px, transparent 1px, transparent 3px)',
  backgroundSize: '22px 22px, 22px 22px, 100% 3px',
  border: '2px solid var(--frame-cell-dark)',
  padding: '0.85rem 1rem',
  borderRadius: '4px',
  marginBottom: '1rem',
  // Keep any internal scroll/zoom gestures from chaining out to the page scroll
  // when the tree is mounted inside the homepage's fixed-height panel. Plain wheel
  // still scrolls the page (zoom is ctrl/⌘+wheel / pinch / toolbar — no trap).
  overscrollBehavior: 'contain',
}

const zoomBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  marginBottom: '0.5rem',
  fontSize: '0.85rem',
  color: 'var(--signal-ink)',
  flexWrap: 'wrap',
}

const zoomBtnStyle: React.CSSProperties = {
  width: 32,
  height: 28,
  border: '1px solid #8c6d4a',
  borderRadius: 3,
  background: '#f4ecd8',
  color: '#5a3f29',
  cursor: 'pointer',
  fontSize: '1rem',
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const zoomResetBtnStyle: React.CSSProperties = {
  ...zoomBtnStyle,
  width: 'auto',
  padding: '0 0.5rem',
  fontSize: '0.8rem',
}

const zoomLabelStyle: React.CSSProperties = {
  minWidth: '3rem',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
}

const hintStyle: React.CSSProperties = {
  marginLeft: '0.5rem',
  color: 'var(--signal-ink)',
  opacity: 0.7,
  fontSize: '0.75rem',
  fontStyle: 'italic',
}
