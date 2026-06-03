/**
 * Single-shot glowing pulse traveling along a straight edge from `from` to `to`.
 * Simulates an action-potential signal propagating from a child node to its
 * parent in the connectome hierarchy (year → leaf → branch → root).
 *
 * Uses Framer Motion for the cx/cy interpolation; an SVG `<filter>` produces
 * the soft glow. Respects `prefers-reduced-motion` by collapsing to a single
 * flash at the destination.
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from '../../lib/motion'
import { neonForFamily } from './colors'

export interface EdgePulseProps {
  id: string
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** Family color hint. Pulse picks a neon variant from the fixed palette
   * keyed on the closest match (DA / 5HT / GABA / Glu) rather than using the
   * literal family color, so pulses always read as bright neon regardless of
   * the parent leaf's muted hex. */
  color: string
  /** Travel duration in ms. */
  durationMs?: number
  onComplete?: () => void
}


// HSL utils + neon palette moved to ./colors.ts (shared with FamilyNode).

export function EdgePulse({
  id,
  from,
  to,
  color,
  durationMs = 700,
  onComplete,
}: EdgePulseProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const filterId = `pulse-glow-${id}`

  // Safety: fire onComplete via timeout even if Framer's onAnimationComplete misfires.
  useEffect(() => {
    const t = window.setTimeout(() => onComplete?.(), durationMs + 80)
    return () => window.clearTimeout(t)
  }, [durationMs, onComplete])

  const { core: coreColor, halo: haloColor } = neonForFamily(color)

  return (
    <g aria-hidden>
      <defs>
        <filter id={filterId} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Outer halo — biggest, lowest opacity, slight delay */}
      {!reduced && (
        <motion.circle
          r={30}
          fill={haloColor}
          fillOpacity={0.32}
          initial={{ cx: from.x, cy: from.y, opacity: 0 }}
          animate={{ cx: to.x, cy: to.y, opacity: [0, 0.9, 0] }}
          transition={{ duration: durationMs / 1000, ease: 'easeOut', delay: 0.05 }}
        />
      )}
      {/* Bright neon core */}
      <motion.circle
        r={14}
        fill={coreColor}
        filter={`url(#${filterId})`}
        initial={{ cx: from.x, cy: from.y, opacity: 0 }}
        animate={
          reduced
            ? { cx: to.x, cy: to.y, opacity: [0, 1, 0] }
            : { cx: to.x, cy: to.y, opacity: [0, 1, 1, 0] }
        }
        transition={{
          duration: durationMs / 1000,
          ease: 'easeOut',
          times: reduced ? [0, 0.5, 1] : [0, 0.08, 0.85, 1],
        }}
      />
      {/* White-hot center */}
      {!reduced && (
        <motion.circle
          r={7}
          fill="#ffffff"
          filter={`url(#${filterId})`}
          initial={{ cx: from.x, cy: from.y, opacity: 0 }}
          animate={{ cx: to.x, cy: to.y, opacity: [0, 1, 1, 0] }}
          transition={{
            duration: durationMs / 1000,
            ease: 'easeOut',
            times: [0, 0.08, 0.85, 1],
          }}
        />
      )}
      {/* Trailing dots — same path, staggered delay + smaller + fading. Creates
          an axon-pulse "comet tail" effect behind the bright leading core. */}
      {!reduced &&
        [0, 1, 2].map((i) => {
          const delay = (i + 1) * 0.07
          const fade = 0.6 - i * 0.15
          const r = 9 - i * 2
          return (
            <motion.circle
              key={`trail-${i}`}
              r={r}
              fill={coreColor}
              fillOpacity={fade}
              filter={`url(#${filterId})`}
              initial={{ cx: from.x, cy: from.y, opacity: 0 }}
              animate={{ cx: to.x, cy: to.y, opacity: [0, fade, fade, 0] }}
              transition={{
                duration: durationMs / 1000,
                ease: 'easeOut',
                delay,
                times: [0, 0.12, 0.85, 1],
              }}
            />
          )
        })}
    </g>
  )
}
