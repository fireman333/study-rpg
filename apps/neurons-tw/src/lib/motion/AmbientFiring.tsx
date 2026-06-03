/**
 * Ambient resting-state firing — a small constellation of neuron nodes joined by
 * edges that gently pulse + carry travelling signal sparks. Intended as the
 * "the network is alive" decorative layer for the homepage connectome hero.
 *
 * Implemented with CSS `@keyframes` (classes `.neuron-firing-node` /
 * `.neuron-signal-edge` in `apps/neurons-tw/src/styles.css`) — compositor-driven
 * (opacity / transform only), NOT a per-frame JS rAF loop. This is intentional:
 * CSS animations keep running in a backgrounded tab (so verification never sees
 * a "frozen" hero) and stay cheap at 60fps. Reduced-motion is handled twice —
 * the media query in styles.css disables the keyframes, and this component drops
 * the animated DOM entirely so there is zero motion + minimal DOM cost.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "An ambient resting-state firing primitive SHALL be available, CSS-driven
 *    and reduced-motion gated"
 */

import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface AmbientFiringProps {
  /** Overall width in px. Height derived as width × 0.42. */
  width?: number
  /** Stroke / node color; defaults to the signal-cyan token. */
  color?: string
  /** Number of nodes in the resting constellation (3–6 reads best). */
  nodeCount?: number
}

// Stable, hand-placed node positions in a 100 × 42 viewbox so the layout is
// deterministic (no force-sim, no randomness that would break across renders).
const NODE_LAYOUT: ReadonlyArray<{ x: number; y: number }> = [
  { x: 14, y: 30 },
  { x: 34, y: 12 },
  { x: 52, y: 32 },
  { x: 72, y: 14 },
  { x: 88, y: 30 },
  { x: 50, y: 6 },
]

export function AmbientFiring({
  width = 120,
  color = 'var(--signal-cyan)',
  nodeCount = 5,
}: AmbientFiringProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const nodes = NODE_LAYOUT.slice(0, Math.max(2, Math.min(NODE_LAYOUT.length, nodeCount)))
  const edges = nodes.slice(1).map((n, i) => ({ a: nodes[i], b: n, key: i }))

  return (
    <svg
      aria-hidden
      width={width}
      height={width * 0.42}
      viewBox="0 0 100 42"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible', pointerEvents: 'none' }}
    >
      {edges.map((e) => (
        <line
          key={`edge-${e.key}`}
          x1={e.a.x}
          y1={e.a.y}
          x2={e.b.x}
          y2={e.b.y}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.35}
        />
      ))}
      {!reduced &&
        edges.map((e) => (
          <line
            key={`spark-${e.key}`}
            className="neuron-signal-edge"
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            style={{
              // Stagger each edge's spark so the train ripples across the net.
              animationDelay: `${e.key * 0.35}s`,
              filter: `drop-shadow(0 0 2px ${color})`,
            }}
          />
        ))}
      {nodes.map((n, i) => (
        <circle
          key={`node-${i}`}
          className={reduced ? undefined : 'neuron-firing-node'}
          cx={n.x}
          cy={n.y}
          r={2.4}
          fill={color}
          style={
            reduced
              ? { opacity: 0.7 }
              : { animationDelay: `${i * 0.4}s`, filter: `drop-shadow(0 0 2px ${color})` }
          }
        />
      ))}
    </svg>
  )
}
