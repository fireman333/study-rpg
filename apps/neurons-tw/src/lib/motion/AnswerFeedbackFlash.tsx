/**
 * Answer-resolution feedback flash — a brief tinted overlay played the instant a
 * quiz answer resolves: green firing pulse on correct, red dim on incorrect.
 *
 * Rendered as a `pointer-events: none` sibling overlay so it NEVER blocks answer
 * resolution or the next-question transition. Auto-clears after FLASH_MS. In
 * reduced-motion it degrades to a single static colour end-state cue (no motion).
 *
 * Complements the existing peripheral `SpikeTrainFiring` (cyan EEG burst on
 * correct) by adding the green/red correctness colour-coding + an incorrect-answer
 * cue, which the spike-train alone does not provide.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "An answer-resolution feedback-flash primitive SHALL be available,
 *    non-blocking and reduced-motion gated"
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface AnswerFeedbackFlashProps {
  /** Outcome to signal. */
  outcome: 'correct' | 'incorrect'
  /** Fires when the flash finishes (host can clear its trigger state). Optional. */
  onComplete?: () => void
}

const FLASH_MS = 520

const OUTCOME_COLOR: Record<AnswerFeedbackFlashProps['outcome'], string> = {
  correct: 'rgba(77, 140, 77, 0.30)', // green
  incorrect: 'rgba(196, 77, 77, 0.26)', // red
}

export function AnswerFeedbackFlash({
  outcome,
  onComplete,
}: AnswerFeedbackFlashProps): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDone(true)
      onComplete?.()
    }, reduced ? 280 : FLASH_MS)
    return () => clearTimeout(t)
  }, [reduced, onComplete])

  if (done) return null

  const tint = OUTCOME_COLOR[outcome]

  // Reduced-motion: static colour cue, no keyframed motion.
  if (reduced) {
    return (
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 5,
          background: `radial-gradient(circle at 50% 45%, ${tint}, transparent 70%)`,
        }}
      />
    )
  }

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: FLASH_MS / 1000, times: [0, 0.25, 1], ease: 'easeOut' }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        background: `radial-gradient(circle at 50% 45%, ${tint}, transparent 70%)`,
      }}
    />
  )
}
