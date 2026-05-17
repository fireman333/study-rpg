/**
 * EventToast — `redesign-hospital-economy` §6.1a.
 *
 * Passive (auto-resolved) event toast. The outcome was already applied inside
 * `tick.ts` when the event triggered; this toast is purely informational.
 * 5-sec auto-dismiss (per design D6 L3). Stacks vertically if multiple fire
 * in quick succession (handled by App.tsx queue logic).
 */

import { useEffect } from 'react'
import type {
  EventDefinition,
  ToastEventOutcome,
} from '@study-rpg/content-medexam2-tw'

export interface EventToastProps {
  event: EventDefinition
  outcome: ToastEventOutcome
  onDismiss: () => void
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

export function EventToast({ event, outcome, onDismiss }: EventToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [event.id, onDismiss])

  const icon = event.polarity === 'negative' ? '⚠️' : '🌟'
  const polarityClass = `event-toast--${event.polarity}`
  const sign = outcome.kind === 'reputation-loss' ? '−' : '+'
  const label =
    outcome.kind === 'reputation-loss'
      ? `聲望 ${sign}${fmt(outcome.amount)}`
      : `聲望 ${sign}${fmt(outcome.amount)}`

  return (
    <div className={`event-toast ${polarityClass}`} role="status" aria-live="polite">
      <span className="event-toast__icon" aria-hidden>{icon}</span>
      <div className="event-toast__body">
        <strong className="event-toast__title">{event.label}</strong>
        <span className="event-toast__detail">{label}</span>
      </div>
      <button
        type="button"
        className="event-toast__close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
