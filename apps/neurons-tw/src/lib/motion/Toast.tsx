/**
 * Generic toast primitive: fixed top-center, slide-in (or fade in reduced
 * motion), auto-dismiss after TOAST_AUTO_DISMISS_MS, close button, arbitrary
 * children for capability composition.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Generic Toast primitive SHALL support multiple variants, auto-dismiss,
 *    and arbitrary children for capability composition"
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'
import { CelebrationHalo } from './CelebrationHalo'
import { TOAST_AUTO_DISMISS_MS } from './timings'

export type ToastVariant = 'celebratory' | 'info' | 'warning'

export interface ToastProps {
  variant?: ToastVariant
  onDismiss: () => void
  children: ReactNode
}

const VARIANT_STYLES: Record<ToastVariant, React.CSSProperties> = {
  celebratory: { background: '#f4ecd8', border: '2px solid #b58900', color: '#5a3f29' },
  info: { background: '#f4ecd8', border: '2px solid #6a9bc4', color: '#5a3f29' },
  warning: { background: '#f4ecd8', border: '2px solid #c44d4d', color: '#5a3f29' },
}

export function Toast({ variant = 'info', onDismiss, children }: ToastProps): JSX.Element {
  const reduced = useRespectsReducedMotion()

  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [onDismiss])

  const initial = reduced ? { opacity: 0 } : { opacity: 0, y: -100 }
  const animate = reduced ? { opacity: 1 } : { opacity: 1, y: 0 }
  const exit = reduced ? { opacity: 0 } : { opacity: 0, y: -100 }
  const transition = { duration: reduced ? 0.2 : 0.3 }

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={initial}
      animate={animate}
      exit={exit}
      transition={transition}
      style={{
        position: 'fixed',
        top: '1.2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        padding: '0.6rem 1rem',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        minWidth: 'min(260px, calc(100vw - 1.6rem))',
        maxWidth: 'min(480px, calc(100vw - 1.6rem))',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
        ...VARIANT_STYLES[variant],
      }}
    >
      {/* Subtle enhanced-celebration layer for celebratory toasts. Additive
          overlay; self-nulls in reduced-motion. (revamp-neurons-homepage-experience) */}
      {variant === 'celebratory' && <CelebrationHalo color="#b58900" intensity={1} durationMs={650} />}
      <div style={{ flex: 1 }}>{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="關閉"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          fontSize: '1.1rem',
          cursor: 'pointer',
          padding: '0 0.25rem',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </motion.div>
  )
}
