/**
 * Milestone tip toast — `redesign-hospital-economy` §9.5.4.
 *
 * Single toast pinned top-center; auto-dismisses after 8s (per design D10 L3).
 * Caller (via `useMilestoneTips`) sets `tip` on threshold cross + `null` on
 * dismiss. The hook is responsible for writing `tutorial.firedTips[tipId] = true`
 * so each tip fires at most once per save.
 */

import { useEffect } from 'react'
import type { MilestoneTipId } from '@study-rpg/content-medexam2-tw'

export interface MilestoneTipProps {
  tipId: MilestoneTipId
  message: string
  onDismiss: () => void
}

export function MilestoneTipToast({ tipId, message, onDismiss }: MilestoneTipProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [tipId, onDismiss])

  return (
    <div className="milestone-tip-toast" role="status" aria-live="polite">
      <span className="milestone-tip-toast__icon" aria-hidden>💡</span>
      <span className="milestone-tip-toast__body">{message}</span>
      <button
        type="button"
        className="milestone-tip-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss tip"
      >
        ×
      </button>
    </div>
  )
}
