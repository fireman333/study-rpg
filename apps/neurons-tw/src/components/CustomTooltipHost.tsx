/**
 * CustomTooltipHost — global custom tooltip with a fast, configurable delay.
 *
 * Native HTML `title=` attribute tooltips have an OS-controlled delay (~1–1.5s
 * on Chrome / Safari) which feels slow for inline UI cues like the leaderboard
 * achievement badges. This component listens at document level for elements
 * with a `data-tooltip` attribute, shows a styled fixed-position div after a
 * short delay, and renders ABOVE all parent `overflow: hidden` clipping (the
 * leaderboard list scroll container would otherwise clip a tooltip; `position:
 * fixed` escapes that the same way the OS title popup never clips).
 *
 * Mount once at the App root. Any descendant with `data-tooltip="..."` gets the
 * fast tooltip automatically — opt-in via the attribute, not behaviour forced
 * on every element.
 *
 * Touch devices: no hover event → tooltip never shows. Tap-and-hold is not
 * intercepted (mobile users open the 成就 page for full info instead of relying
 * on inline hover).
 *
 * Ported 1:1 from 二階 (`medexam2-hospital-tw`) so neurons leaderboard badges
 * behave identically — see `add-neurons-leaderboard-badge-tooltip`.
 */

import { useEffect, useRef, useState } from 'react'

const SHOW_DELAY_MS = 250
const TOOLTIP_OFFSET_PX = 6

interface TooltipState {
  text: string
  /** Viewport x of the trigger element's horizontal center. */
  centerX: number
  /** Viewport y of the trigger element's top edge. */
  topY: number
}

export function CustomTooltipHost(): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearTimer = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    // Use bubbling mouseover/mouseout (not mouseenter — those don't bubble)
    // for document-level delegation.
    const onMouseOver = (e: MouseEvent): void => {
      const el = e.target as HTMLElement | null
      const target = el?.closest<HTMLElement>('[data-tooltip]')
      if (!target) return
      const text = target.dataset.tooltip
      if (!text) return
      clearTimer()
      timerRef.current = setTimeout(() => {
        const rect = target.getBoundingClientRect()
        setState({
          text,
          centerX: rect.left + rect.width / 2,
          topY: rect.top,
        })
      }, SHOW_DELAY_MS)
    }

    const onMouseOut = (e: MouseEvent): void => {
      const el = e.target as HTMLElement | null
      const target = el?.closest<HTMLElement>('[data-tooltip]')
      if (!target) return
      clearTimer()
      setState(null)
    }

    // Also hide on scroll — getBoundingClientRect at show time would be stale
    // post-scroll and the tooltip would drift away from the trigger.
    const onScroll = (): void => {
      clearTimer()
      setState(null)
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('scroll', onScroll, true)

    return () => {
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('scroll', onScroll, true)
      clearTimer()
    }
  }, [])

  if (!state) return null

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: state.centerX,
        top: state.topY - TOOLTIP_OFFSET_PX,
        transform: 'translate(-50%, -100%)',
        background: '#1a1a1a',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        padding: '4px 8px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        zIndex: 9999,
        pointerEvents: 'none',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
      }}
    >
      {state.text}
    </div>
  )
}
