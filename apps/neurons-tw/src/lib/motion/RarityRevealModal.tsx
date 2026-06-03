/**
 * Per-rarity reveal modal — envelope → flip → glow → particle → centered.
 * Total wall time per RARITY_TIMINGS[rarity].total. Skip button surfaces
 * when total > SKIP_THRESHOLD_MS.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Per-rarity reveal modal SHALL dispatch animation sequences keyed off
 *    the `rarity` prop"
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'
import { ParticleBurst } from './ParticleBurst'
import { CelebrationHalo } from './CelebrationHalo'
import { RARITY_TIMINGS, SKIP_THRESHOLD_MS, type Rarity } from './timings'

type Stage = 'envelope' | 'flip' | 'glow' | 'particle' | 'centered' | 'done'

// Enhanced-celebration intensity per rarity (1 subtle … 3 spectacle). Rides
// within the existing reveal timeline — does NOT alter any RARITY_TIMINGS value.
const RARITY_HALO_INTENSITY: Record<Rarity, number> = {
  P1: 3,
  P2: 2,
  P3: 2,
  P4: 1,
  P5: 1,
}

const RARITY_COLORS: Record<Rarity, string> = {
  P1: '#d4a04d', // gold — DA branch
  P2: '#c44d4d', // red-coral — 5HT branch
  P3: '#6a8c3f', // green — Glu branch
  P4: '#6a9bc4', // blue — GABA branch
  P5: '#9b9b9b', // muted grey — common
}

export interface RarityRevealModalProps {
  rarity: Rarity
  onComplete: () => void
  children?: ReactNode
  title?: string
}

export function RarityRevealModal({
  rarity,
  onComplete,
  children,
  title,
}: RarityRevealModalProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const timing = RARITY_TIMINGS[rarity]
  const color = RARITY_COLORS[rarity]
  const [stage, setStage] = useState<Stage>('envelope')
  const [showSkip, setShowSkip] = useState(false)
  const completedRef = useRef(false)

  const fire = (): void => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete()
  }

  useEffect(() => {
    if (reduced) {
      setStage('centered')
      const t = window.setTimeout(fire, Math.min(500, timing.total))
      return () => clearTimeout(t)
    }
    const timers: number[] = []
    let elapsed = 0
    const at = (next: Stage, addMs: number): void => {
      elapsed += addMs
      timers.push(window.setTimeout(() => setStage(next), elapsed))
    }
    at('flip', timing.envelope)
    at('glow', timing.flip)
    const afterGlow = timing.glow
    if (timing.particle) {
      at('particle', afterGlow)
      at('centered', timing.particle)
    } else {
      at('centered', afterGlow)
    }
    elapsed += timing.hold
    timers.push(window.setTimeout(fire, elapsed))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rarity, reduced])

  useEffect(() => {
    if (timing.total <= SKIP_THRESHOLD_MS) return
    const t = window.setTimeout(() => setShowSkip(true), SKIP_THRESHOLD_MS)
    return () => clearTimeout(t)
  }, [timing.total])

  // Card visual variants per stage.
  const cardVariants = {
    envelope: { rotateY: 0, scale: 0.85, opacity: 1, boxShadow: `0 0 0 ${color}` },
    flip: { rotateY: 180, scale: 0.9, opacity: 1, boxShadow: `0 0 4px ${color}` },
    glow: { rotateY: 180, scale: 1, opacity: 1, boxShadow: `0 0 24px ${color}` },
    particle: { rotateY: 180, scale: 1.05, opacity: 1, boxShadow: `0 0 36px ${color}` },
    centered: { rotateY: 180, scale: 1, opacity: 1, boxShadow: `0 0 16px ${color}` },
    done: { rotateY: 180, scale: 1, opacity: 1, boxShadow: `0 0 16px ${color}` },
  } as const

  const reducedVariants = {
    envelope: { opacity: 0, scale: 0.9 },
    flip: { opacity: 0.5, scale: 0.95 },
    glow: { opacity: 1, scale: 1 },
    particle: { opacity: 1, scale: 1 },
    centered: { opacity: 1, scale: 1 },
    done: { opacity: 1, scale: 1 },
  } as const

  const showFrontFace = stage !== 'envelope'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? `稀有度 ${rarity} 揭曉`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
      }}
    >
      <div style={{ position: 'relative', perspective: '1200px' }}>
        {/* Enhanced cinematic celebration layer — expanding halo + sparkles once
            the card is revealed. Additive overlay; CelebrationHalo self-nulls in
            reduced-motion. (revamp-neurons-homepage-experience) */}
        {(stage === 'glow' || stage === 'particle' || stage === 'centered') && (
          <CelebrationHalo
            color={color}
            intensity={RARITY_HALO_INTENSITY[rarity]}
            durationMs={Math.max(500, timing.glow + (timing.particle ?? 0))}
          />
        )}
        {/*
          Spin wrapper — Z-axis rotation layered over the card's existing
          stage-based reveal. Per `neurons-mode` spec: P1 SHALL spin >= 3 turns
          over >= 1500ms with ease-out cubic for the「快轉 → 減速 → 定位」 feel.
          P2-P5 have spinTurns === 0 and this wrapper becomes a no-op
          transition. Reduced-motion users get no rotation regardless of rarity.
        */}
        <motion.div
          initial={{ rotate: 0 }}
          animate={{
            rotate: reduced ? 0 : 360 * timing.spinTurns,
          }}
          transition={{
            duration: reduced || timing.spinTurns === 0 ? 0 : 1.5,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ display: 'inline-block' }}
        >
        <motion.div
          initial={reduced ? reducedVariants.envelope : cardVariants.envelope}
          animate={reduced ? reducedVariants[stage] : cardVariants[stage]}
          transition={{ duration: reduced ? 0.2 : 0.35, ease: 'easeOut' }}
          style={{
            width: '220px',
            height: '320px',
            borderRadius: '8px',
            background: '#f4ecd8',
            border: `3px solid ${color}`,
            transformStyle: 'preserve-3d',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#5a3f29',
          }}
        >
          {showFrontFace ? (
            <div
              style={{
                transform: 'rotateY(180deg)',
                backfaceVisibility: 'hidden',
                padding: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.85em', color }}>{rarity}</div>
              <div style={{ fontWeight: 700, fontSize: '1.15em', marginTop: '0.4rem' }}>
                {title ?? '揭曉'}
              </div>
              <div style={{ marginTop: '0.6rem', fontSize: '0.9em' }}>{children}</div>
            </div>
          ) : (
            <div
              style={{
                fontSize: '3rem',
                opacity: 0.4,
                backfaceVisibility: 'hidden',
              }}
              aria-hidden
            >
              ✉︎
            </div>
          )}
        </motion.div>
        </motion.div>
        <AnimatePresence>
          {!reduced && stage === 'particle' && (
            <ParticleBurst count={16} color={color} durationMs={timing.particle ?? 600} />
          )}
        </AnimatePresence>
      </div>
      {showSkip && stage !== 'done' && (
        <button
          type="button"
          onClick={fire}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            padding: '0.5rem 1rem',
            background: '#f4ecd8',
            border: '2px solid #8c6d4a',
            borderRadius: '4px',
            color: '#5a3f29',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          跳過 →
        </button>
      )}
    </div>
  )
}
