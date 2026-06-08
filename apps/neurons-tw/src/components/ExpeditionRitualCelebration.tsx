/**
 * ExpeditionRitualCelebration — the once-per-day completion ritual overlay shown
 * the first time today's effective expedition-completion gate trips (今日出征 →
 * 完成). Non-blocking (`pointer-events: none`); reuses the motion-library
 * primitives (`CelebrationHalo` + `ParticleBurst`) — the same ones the
 * 全腦點亮 completion overlay uses. Under reduced-motion it degrades to a static
 * banner acknowledgement (NOT null), per the neurons-homepage ritual requirement.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "The homepage SHALL play a once-per-day completion ritual on the first
 *    effective expedition completion"
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
  padding: '0.3rem 0.95rem',
  borderRadius: 8,
  background: 'rgba(10, 22, 30, 0.82)',
  color: 'var(--signal-amber, #d4a04d)',
  fontWeight: 700,
  fontSize: '0.95rem',
  letterSpacing: '0.04em',
  boxShadow: '0 0 14px rgba(212, 160, 77, 0.5)',
}

export function ExpeditionRitualCelebration({ streak }: { streak: number }): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const banner = (
    <span style={bannerStyle}>
      ✨ 今日出征完成！{streak > 0 ? ` 🔥 ${streak}` : ''}
    </span>
  )
  // Reduced motion → static acknowledgement only (no halo / particles).
  if (reduced) {
    return (
      <div aria-hidden style={overlayStyle}>
        {banner}
      </div>
    )
  }
  return (
    <div aria-hidden style={overlayStyle}>
      <CelebrationHalo intensity={3} durationMs={1600} color="var(--signal-amber, #d4a04d)" />
      <ParticleBurst count={24} durationMs={1100} color="var(--signal-cyan)" />
      {banner}
    </div>
  )
}
