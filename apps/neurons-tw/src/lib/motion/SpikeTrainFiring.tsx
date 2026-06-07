/**
 * EEG spike-train firing — short peripheral burst rendered on quiz correct-answer.
 *
 * An SVG polyline shaped as a `spikes`-count action-potential train that draws in
 * (pathLength 0 → 1) then fades. Signal-cyan with glow, on transparent bg so it
 * overlays any surface. Returns null in reduced-motion (no DOM cost).
 *
 * Added by polish-neurons-clinical-machine-aesthetic (EEG anchor). Timing from
 * SPIKE_TRAIN_TIMING. MUST NOT block answer resolution — render it as a sibling
 * overlay, never gate the reward / next-question flow on its completion.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Spike-train firing and signal-oscillation primitives SHALL respect
 *    reduced-motion and be self-verifiable"
 */

import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'
import { SPIKE_TRAIN_TIMING } from './timings'

export interface SpikeTrainFiringProps {
  /** Overall width in px. Height is derived (width / 5). */
  width?: number
  /** Override stroke color; defaults to the signal-cyan token. */
  color?: string
  /**
   * Visual-intensity multiplier (default 1 = baseline). Scales stroke width +
   * glow ONLY — does NOT change any timing token. Driven by the current
   * correct-answer streak so the burst escalates with sustained correct answers
   * (neurons-motion-library: streak-scaled feedback intensity). Clamped 1–2.5.
   */
  intensity?: number
}

/**
 * Build an action-potential train polyline: flat baseline punctuated by
 * `spikes` sharp depolarization/repolarization peaks. Viewbox is 100 × 20.
 */
function buildSpikeTrainPoints(spikes: number): string {
  const W = 100
  const H = 20
  const baseline = H * 0.7
  const peak = H * 0.12
  const segment = W / (spikes + 1)
  const pts: string[] = [`0,${baseline}`]
  for (let i = 1; i <= spikes; i++) {
    const cx = segment * i
    pts.push(`${(cx - segment * 0.18).toFixed(1)},${baseline}`) // approach
    pts.push(`${(cx - segment * 0.06).toFixed(1)},${peak}`) // depolarize ↑
    pts.push(`${(cx + segment * 0.06).toFixed(1)},${(H * 0.95).toFixed(1)}`) // hyperpolarize ↓
    pts.push(`${(cx + segment * 0.18).toFixed(1)},${baseline}`) // return
  }
  pts.push(`${W},${baseline}`)
  return pts.join(' ')
}

export function SpikeTrainFiring({
  width = 160,
  color = 'var(--signal-cyan)',
  intensity = 1,
}: SpikeTrainFiringProps): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  if (reduced) return null

  const { burst, spikes, settle } = SPIKE_TRAIN_TIMING
  const points = buildSpikeTrainPoints(spikes)
  // Scale visual magnitude only (stroke width + glow blur); timing tokens and
  // layout width stay fixed so escalation never reflows the answer row.
  const i = Math.max(1, Math.min(2.5, intensity))
  const strokeWidth = 1.5 * i
  const glowBlur = 2 * i

  return (
    <motion.svg
      aria-hidden
      width={width}
      height={width / 5}
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      style={{ pointerEvents: 'none', overflow: 'visible' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: (burst + settle) / 1000, times: [0, burst / (burst + settle), 1] }}
    >
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: burst / 1000, ease: 'linear' }}
        style={{ filter: `drop-shadow(0 0 ${glowBlur.toFixed(1)}px ${color})` }}
      />
    </motion.svg>
  )
}
