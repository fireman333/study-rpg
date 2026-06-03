/**
 * Signal-oscillation — looping sine-trace loading / pending motif.
 *
 * A horizontally-scrolling EEG-style sine wave (signal-cyan with glow) that loops
 * for the OSCILLATION_TIMING.period. Use in place of / alongside a generic spinner
 * on data surfaces. In reduced-motion it renders a static flat trace (no loop).
 *
 * Added by polish-neurons-clinical-machine-aesthetic (EEG anchor).
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Spike-train firing and signal-oscillation primitives SHALL respect
 *    reduced-motion and be self-verifiable"
 */

import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'
import { OSCILLATION_TIMING } from './timings'

export interface SignalOscillationProps {
  /** Overall width in px. */
  width?: number
  /** Overall height in px. */
  height?: number
  /** Override stroke color; defaults to the signal-cyan token. */
  color?: string
  /** Accessible label for the loading state. */
  label?: string
}

/**
 * Build a sine path spanning two full periods across the viewbox so the scrolling
 * translate loop is seamless. Viewbox is 200 × 20 (we render width 100 window).
 */
function buildSinePath(amplitude: number): string {
  const W = 200
  const H = 20
  const mid = H / 2
  const steps = 80
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = (W / steps) * i
    // two full periods over width W
    const y = mid - Math.sin((x / W) * Math.PI * 4) * amplitude
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M ${pts.join(' L ')}`
}

export function SignalOscillation({
  width = 100,
  height = 20,
  color = 'var(--signal-cyan)',
  label = '載入中…',
}: SignalOscillationProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const { period, amplitude } = OSCILLATION_TIMING
  const d = buildSinePath(amplitude)

  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width,
        height,
        overflow: 'hidden',
        verticalAlign: 'middle',
      }}
    >
      <svg
        width={width * 2}
        height={height}
        viewBox="0 0 200 20"
        preserveAspectRatio="none"
        aria-hidden
        style={{ display: 'block' }}
      >
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 2px ${color})` }}
          initial={false}
          animate={reduced ? { x: 0 } : { x: [0, -100] }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: period / 1000, ease: 'linear', repeat: Infinity }
          }
        />
      </svg>
    </span>
  )
}
