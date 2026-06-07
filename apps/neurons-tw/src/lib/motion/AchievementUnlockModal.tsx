/**
 * P1 鑽石-tier achievement unlock — full-screen, staggered children
 * (tier chip → badge → title → description → reward → CTA), dismiss required.
 *
 * P2 / P3 / P4 achievements SHOULD use <Toast> with achievement-specific
 * content instead (per spec design rationale).
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "P1 achievement unlock modal SHALL render full-screen with staggered
 *    children and dismiss-required interaction"
 */

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface AchievementUnlockModalContent {
  tierLabel: string
  badge: ReactNode
  title: string
  description: string
  rewardLabel: string
  ctaLabel?: string
}

export interface AchievementUnlockModalProps {
  achievement: AchievementUnlockModalContent
  onDismiss: () => void
}

const STAGGER_MS = 100

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: STAGGER_MS / 1000, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

const reducedItemVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
}

const reducedContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
}

export function AchievementUnlockModal({
  achievement,
  onDismiss,
}: AchievementUnlockModalProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const cVariants = reduced ? reducedContainerVariants : containerVariants
  const iVariants = reduced ? reducedItemVariants : itemVariants

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-unlock-modal-title"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
        fontFamily: 'var(--font-pixel-cjk)',
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={cVariants}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: '#f4ecd8',
          border: '3px solid #b58900',
          borderRadius: '8px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.85rem',
          textAlign: 'center',
          color: '#5a3f29',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}
      >
        <motion.div
          variants={iVariants}
          style={{
            background: '#b58900',
            color: '#fff',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.85em',
            fontWeight: 700,
          }}
        >
          {achievement.tierLabel}
        </motion.div>
        <motion.div variants={iVariants} aria-hidden style={{ fontSize: '4rem', lineHeight: 1 }}>
          {achievement.badge}
        </motion.div>
        <motion.h2
          id="achievement-unlock-modal-title"
          variants={iVariants}
          style={{ margin: 0, fontSize: '1.35rem' }}
        >
          {achievement.title}
        </motion.h2>
        <motion.p variants={iVariants} style={{ margin: 0, color: '#5a3f29' }}>
          {achievement.description}
        </motion.p>
        <motion.div
          variants={iVariants}
          style={{
            background: '#e9dcb4',
            border: '1px solid #c4a878',
            padding: '0.45rem 0.85rem',
            borderRadius: '4px',
            fontSize: '0.9em',
          }}
        >
          <strong style={{ marginRight: '0.4rem' }}>獎勵</strong>
          {achievement.rewardLabel}
        </motion.div>
        <motion.button
          type="button"
          variants={iVariants}
          onClick={onDismiss}
          style={{
            marginTop: '0.4rem',
            padding: '0.5rem 1.5rem',
            background: '#b58900',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700,
          }}
        >
          {achievement.ctaLabel ?? '太強了！'}
        </motion.button>
      </motion.div>
    </div>
  )
}
