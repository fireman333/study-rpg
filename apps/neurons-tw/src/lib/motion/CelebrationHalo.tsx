/**
 * Celebration halo — the enhanced cinematic layer shared by reward reveals and
 * celebratory toasts: one (or more) expanding glow ring(s) plus a sparkle ring,
 * scaled by `intensity`. Purely additive overlay (`pointer-events: none`) that
 * rides within the host's existing duration window — it introduces NO new
 * exported timing token and does not change `RARITY_TIMINGS` / `TOAST_AUTO_DISMISS_MS`.
 *
 * Returns null in reduced-motion so the base reveal + its end-state cue are
 * preserved with zero extra motion / DOM.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Reward reveal and toast primitives SHALL render an enhanced cinematic
 *    celebration layer without mutating published timing tokens"
 */

import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface CelebrationHaloProps {
  /** Ring / sparkle color. */
  color?: string
  /** 1 = subtle (toast), 2 = standard reveal, 3 = P1 spectacle. Clamps 1–3. */
  intensity?: number
  /** Expansion duration in ms (host keeps it within its own window). */
  durationMs?: number
}

export function CelebrationHalo({
  color = 'var(--signal-amber)',
  intensity = 2,
  durationMs = 700,
}: CelebrationHaloProps): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  if (reduced) return null

  const level = Math.max(1, Math.min(3, Math.round(intensity)))
  const rings = level // 1–3 concentric expanding rings
  const sparkleCount = level * 6
  const dur = durationMs / 1000

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {Array.from({ length: rings }, (_, i) => (
        <motion.span
          key={`ring-${i}`}
          initial={{ scale: 0.2, opacity: 0.55 }}
          animate={{ scale: 1 + level * 0.5, opacity: 0 }}
          transition={{ duration: dur, delay: i * 0.12, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 160,
            height: 160,
            marginLeft: -80,
            marginTop: -80,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            boxShadow: `0 0 12px ${color}`,
          }}
        />
      ))}
      {level >= 2 &&
        Array.from({ length: sparkleCount }, (_, i) => {
          const angle = (i / sparkleCount) * Math.PI * 2
          const dist = 70 + level * 18
          return (
            <motion.span
              key={`sparkle-${i}`}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                scale: 1,
                opacity: 0,
              }}
              transition={{ duration: dur, delay: i * 0.02, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: color,
                boxShadow: `0 0 4px ${color}`,
              }}
            />
          )
        })}
    </div>
  )
}
