/**
 * SVG edge for one synapse row. Renders as `<motion.path>` with TWO orthogonal
 * visual channels (fuse-connectome-into-neurons-homepage):
 *   - Channel 1 — stroke WIDTH encodes accumulated strength (internal SynapseState):
 *       dormant = thin, weak = medium, strong = thick. This is a RENDER-LAYER read
 *       of the state; the state machine / decay rule / Dexie are untouched.
 *   - Channel 2 — BRIGHTNESS (opacity + glow) encodes recency of co-firing, passed
 *       in as `recency` (0..1, 1 = co-fired today, 0 = ≥7 days idle). A fresh edge
 *       (dormant, recency 1) renders BRIGHTEST; an idle edge dims toward the floor.
 *
 * Dormant edges now RENDER (reversing the old "dormant → hidden"). Decay weak→dormant
 * just morphs the stroke width down and stays in the DOM (no removal).
 *
 * Animation contract per openspec/specs/connectome-collection/spec.md:
 *   - formation (isFreshlyFormed): pathLength 0 → 1 + a brief width-overshoot birth
 *     burst over SYNAPSE_TIMINGS.formation, settling to thin dormant brightest
 *   - strengthen (width morph up) / decay (width morph down): SYNAPSE_TIMINGS morph
 *   - recency dimming: opacity re-animates as `recency` changes (render / daily reset)
 *   - reduced motion: instant end-state, dormant still visible
 */

import { motion } from 'framer-motion'
import { SYNAPSE_TIMINGS, useRespectsReducedMotion } from '../../lib/motion'
import type { SynapseState } from '../../lib/db'

export interface SynapseEdgeProps {
  pathKey: string
  pathD: string
  state: SynapseState
  /** Recency of last co-fire, 0..1 (1 = co-fired today / freshest, 0 = ≥7 days idle). Drives brightness. */
  recency: number
  /** True for the first frame after `connectome.synapseFormed` (or dormant→weak strengthen) so the edge draws in + bursts. */
  isFreshlyFormed: boolean
  /** Optional native hover tooltip text (lastCoFireDate + days-since). */
  title?: string
}

interface StateStyle {
  strokeWidth: number
  stroke: string
  glow: boolean
}

// Stroke WIDTH = accumulated strength; COLOR = state token (EEG aesthetic, retained
// per spec). dormant now has a visible thin width (was opacity 0 + hidden).
const STATE_STYLE: Record<SynapseState, StateStyle> = {
  dormant: { strokeWidth: 1.75, stroke: 'var(--synapse-dormant)', glow: false },
  weak: { strokeWidth: 3, stroke: 'var(--synapse-forming)', glow: false },
  strong: { strokeWidth: 5, stroke: 'var(--synapse-mastered)', glow: true },
}

// Brightness floor (≥7 days idle) → max (co-fired today). Never 0 so dormant/idle
// edges stay legible.
const BRIGHT_MIN = 0.3
const BRIGHT_MAX = 1

export function SynapseEdge({
  pathKey,
  pathD,
  state,
  recency,
  isFreshlyFormed,
  title,
}: SynapseEdgeProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const style = STATE_STYLE[state]
  const r = Math.max(0, Math.min(1, recency))
  const targetOpacity = BRIGHT_MIN + (BRIGHT_MAX - BRIGHT_MIN) * r

  const morphDurationS = reduced ? 0 : SYNAPSE_TIMINGS.strengthen / 1000

  return (
    <motion.path
      key={pathKey}
      d={pathD}
      fill="none"
      pathLength={1}
      strokeLinecap="round"
      // stroke color is a CSS var (signal-layer token) — kept OUT of `animate`
      // because framer-motion can't interpolate var() colors; it snaps on state change.
      stroke={style.stroke}
      initial={
        isFreshlyFormed
          ? { pathLength: reduced ? 1 : 0, opacity: 0, strokeWidth: style.strokeWidth }
          : false
      }
      animate={
        isFreshlyFormed && !reduced
          ? {
              // Birth burst: draw in + over-thicken briefly + flash to brightest, then settle.
              pathLength: 1,
              opacity: [0, BRIGHT_MAX, targetOpacity],
              strokeWidth: [style.strokeWidth * 1.8, style.strokeWidth * 1.8, style.strokeWidth],
            }
          : {
              pathLength: 1,
              opacity: targetOpacity,
              strokeWidth: style.strokeWidth,
            }
      }
      transition={
        isFreshlyFormed
          ? { duration: reduced ? 0 : SYNAPSE_TIMINGS.formation / 1000, ease: 'easeOut' }
          : { duration: morphDurationS, ease: 'easeInOut' }
      }
      style={{
        filter: style.glow
          ? `drop-shadow(0 0 ${(3 + 4 * r).toFixed(1)}px var(--synapse-mastered))`
          : 'none',
      }}
    >
      {title ? <title>{title}</title> : null}
    </motion.path>
  )
}
