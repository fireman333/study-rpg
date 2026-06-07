/**
 * MazeCompletionCelebration — one-shot 「全腦點亮」 payoff overlay shown when a
 * family's brain-maze (including its second lap) becomes fully lit. Non-blocking
 * (`pointer-events: none`); composes the motion-library `CelebrationHalo`
 * (spectacle intensity) + `ParticleBurst`. Returns null under reduced-motion so
 * nothing animates and the maze's lit nodes remain as the static completed
 * end-state.
 *
 * Spec: openspec/specs/neurons-maze-second-lap/spec.md
 *   "Family second-lap completion SHALL play a one-time celebration animation"
 */
import { type CSSProperties } from 'react'
import { CelebrationHalo, ParticleBurst, useRespectsReducedMotion } from '../lib/motion'

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 6,
  overflow: 'hidden',
}

const bannerStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, calc(-50% - 88px))',
  whiteSpace: 'nowrap',
  padding: '0.3rem 0.85rem',
  borderRadius: 8,
  background: 'rgba(10, 22, 30, 0.82)',
  color: 'var(--signal-cyan)',
  fontWeight: 700,
  fontSize: '0.95rem',
  letterSpacing: '0.04em',
  boxShadow: '0 0 14px rgba(80, 200, 230, 0.5)',
}

export function MazeCompletionCelebration({ label }: { label?: string }): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  if (reduced) return null

  return (
    <div aria-hidden style={overlayStyle}>
      <CelebrationHalo intensity={3} durationMs={1600} color="var(--signal-cyan)" />
      <ParticleBurst count={24} durationMs={1100} color="var(--signal-amber, #d4a04d)" />
      {label && <span style={bannerStyle}>✨ {label}・全腦點亮！</span>}
    </div>
  )
}
