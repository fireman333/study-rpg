/**
 * SpotlightOverlay — layout-agnostic spotlight engine for the guided tour
 * (rebuild-neurons-onboarding-as-guided-tour).
 *
 * Frames a target element located AT RUNTIME via `data-tutorial` anchor
 * selectors (`resolveTourAnchor` → querySelector + getBoundingClientRect) and
 * positions an instruction card adjacent to it. Measurement re-runs on
 * `resize`, capture-phase `scroll` (nested scrollers) and a light interval so
 * anchors that mount/unmount (e.g. QuizModal answer options) are tracked.
 *
 * Hard rules (spec: layout-agnostic spotlight positioning):
 *   - NO anchor resolves → the SAME card renders centered, NO hole — never a
 *     spotlight over nothing, never a crash.
 *   - The dim/hole layer is pointer-events:none throughout — the highlighted
 *     element itself stays directly clickable (non-blocking).
 *   - Pulse animation respects prefers-reduced-motion.
 *
 * Styling is inline CSSProperties (no styles.css edits — the layout agent owns
 * that file). The hole's dim uses the big-box-shadow trick so a single
 * non-interactive div both dims the page and frames the anchor.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  placeSpotlightCard,
  resolveTourAnchor,
  resolveTourAnchorElement,
  type AnchorBox,
} from '../../lib/services/onboarding-tour'

const HOLE_PAD = 6
const CARD_WIDTH = 340
// First-render fallback only — the card's REAL height is measured post-mount
// (offsetHeight) and re-fed into the placement math. On a narrow mobile column
// the wrapped CJK body makes the card ~180-220px tall; trusting a fixed
// estimate let the "below fits?" test pass while the fixed-position card
// clipped its button row past the viewport bottom (stuck tour).
const CARD_EST_HEIGHT = 150
const REMEASURE_MS = 450

/** Track an anchor's viewport box; null = not currently resolvable. */
function useAnchorBox(anchors: readonly string[]): AnchorBox | null {
  const [box, setBox] = useState<AnchorBox | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (anchors.length === 0) {
      setBox(null)
      return
    }
    let alive = true

    const apply = (): void => {
      rafRef.current = null
      if (!alive) return
      const next = resolveTourAnchor(anchors)
      setBox((prev) => {
        if (prev === null && next === null) return prev
        if (
          prev !== null &&
          next !== null &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev // avoid re-render churn while nothing moved
        }
        return next
      })
    }

    const schedule = (): void => {
      if (rafRef.current !== null) return
      rafRef.current =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(apply)
          : (setTimeout(apply, 16) as unknown as number)
    }

    apply() // immediate first measure (no one-frame flash of the fallback)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true) // capture: nested scrollers too
    const interval = setInterval(schedule, REMEASURE_MS) // anchors may (un)mount

    return () => {
      alive = false
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      clearInterval(interval)
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [anchors])

  return box
}

export interface SpotlightOverlayProps {
  /** Selectors tried in order (see TOUR_STEPS); [] or all-miss → centered card. */
  anchors: readonly string[]
  /** Card content (copy + controls) — interactive, rendered adjacent to the hole. */
  children: ReactNode
  /** Skip the hole pulse when the user prefers reduced motion. */
  reduced: boolean
  /** Accessible label for the instruction card region. */
  ariaLabel: string
  /** Escape key handler (the step's skip/dismiss action). Keyboard users are never trapped. */
  onEscape?: () => void
}

export function SpotlightOverlay({
  anchors,
  children,
  reduced,
  ariaLabel,
  onEscape,
}: SpotlightOverlayProps): JSX.Element {
  const box = useAnchorBox(anchors)

  // Measure the card's REAL height (content + wrapped lines + buttons) and feed
  // it into the placement math. Runs after every render (content changes on
  // step advance, width changes on resize) but only sets state on a >1px delta,
  // so it converges immediately — useLayoutEffect makes the corrected position
  // apply before paint (no visible jump).
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardH, setCardH] = useState(CARD_EST_HEIGHT)
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el) return
    const h = el.offsetHeight
    if (h > 0 && Math.abs(h - cardH) > 1) setCardH(h)
  })

  // On step entry (anchors change), bring the anchored target into view so the
  // spotlight + coaching card are never stranded off-screen. The homepage stacks
  // the full-width maze ABOVE the family grid, so anchors like the 📖 reading
  // button sit ~1700px down — without this, clicking 開始引導 would just dim the
  // screen with the card far below the fold.
  //   • Multi-pass (rAF + 250ms + 650ms): the maze canvas grows its height
  //     asynchronously on first paint, so an early single measurement can read
  //     the anchor as "in view"; each pass is guarded, so later passes no-op
  //     once it is centred.
  //   • behavior:'auto' (instant), NOT 'smooth': a programmatic SMOOTH
  //     scrollIntoView is silently dropped here (re-measure churn during the
  //     animation), leaving scrollY at 0 — verified in-browser. Instant centring
  //     is reliable and reads as "the tour jumped me to the next thing".
  //   • Anchor-free steps (welcome / extract) are skipped — they render a
  //     centered card and need no scroll.
  useEffect(() => {
    if (anchors.length === 0 || typeof document === 'undefined') return
    let cancelled = false
    const scrollNow = (): void => {
      if (cancelled) return
      // Same visible-first resolution the spotlight box uses, so the element
      // scrolled to is exactly the one framed (any hidden / zero-size DOM-first
      // duplicate of the anchor is skipped).
      const el = resolveTourAnchorElement(anchors)
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.top >= 72 && r.bottom <= window.innerHeight - 72) return // already comfortably in view
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
    const raf = requestAnimationFrame(scrollNow)
    const t1 = setTimeout(scrollNow, 250)
    const t2 = setTimeout(scrollNow, 650)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [anchors])

  // A11y: move initial focus to the card's PRIMARY control (the last button — 開始引導 / 下一步 /
  // 知道了 sit at the row's end) on each step entry, so keyboard / screen-reader users land on the
  // instruction and can act. preventScroll: the overlay already scrolls the anchor into view; we
  // must not fight it. Keyed on `anchors` (changes exactly on step change), not every re-measure.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const raf = requestAnimationFrame(() => {
      const buttons = card.querySelectorAll<HTMLButtonElement>('button')
      const primary = buttons[buttons.length - 1]
      primary?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [anchors])

  // A11y: Escape = the step's skip/dismiss action. NOT a focus trap — the dim/hole layer stays
  // pointer-events:none so the page behind the card remains interactive (frictionless play).
  useEffect(() => {
    if (!onEscape) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEscape()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])

  if (box === null) {
    // Graceful degrade: centered card, no dim hole, page fully interactive.
    return (
      <div style={centeredWrapStyle}>
        <div ref={cardRef} role="dialog" aria-label={ariaLabel} aria-live="polite" style={cardStyle}>
          {children}
        </div>
      </div>
    )
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const holeLeft = box.left - HOLE_PAD
  const holeTop = box.top - HOLE_PAD
  const holeW = box.width + HOLE_PAD * 2
  const holeH = box.height + HOLE_PAD * 2

  // Below the hole when the MEASURED card height fits, else above; hard-clamped
  // fully on-screen (pure math in onboarding-tour → unit-tested).
  const placement = placeSpotlightCard({
    hole: { left: holeLeft, top: holeTop, width: holeW, height: holeH },
    viewport: { width: vw, height: vh },
    cardHeight: cardH,
    cardWidth: CARD_WIDTH,
  })

  return (
    <>
      {/* Dim + frame in one non-interactive div (big box-shadow trick). */}
      <div
        aria-hidden
        style={{
          ...holeStyle,
          left: holeLeft,
          top: holeTop,
          width: holeW,
          height: holeH,
          animation: reduced ? undefined : 'onboarding-spotlight-pulse 1.6s ease-in-out infinite',
        }}
      />
      {!reduced && <style>{pulseKeyframes}</style>}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={ariaLabel}
        aria-live="polite"
        style={{
          ...cardStyle,
          position: 'fixed',
          top: placement.top,
          left: placement.left,
          width: placement.width,
          // cardStyle's maxWidth (92vw) is for the CENTERED fallback — with an
          // explicit clamped width it would shrink the rendered card below the
          // placement math's width on narrow viewports → misaligned left edge.
          maxWidth: 'none',
          zIndex: 1245,
        }}
      >
        {children}
      </div>
    </>
  )
}

// Keyframes injected locally (styles.css is owned by the layout agent).
const pulseKeyframes = `
@keyframes onboarding-spotlight-pulse {
  0%, 100% { box-shadow: 0 0 0 200vmax rgba(24, 14, 4, 0.45), 0 0 0 0 rgba(212, 160, 77, 0.55); }
  50% { box-shadow: 0 0 0 200vmax rgba(24, 14, 4, 0.45), 0 0 0 7px rgba(212, 160, 77, 0.18); }
}
`

const holeStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 1240,
  pointerEvents: 'none', // NON-BLOCKING: the framed element stays clickable
  borderRadius: 10,
  border: '2px solid #d4a04d',
  boxShadow: '0 0 0 200vmax rgba(24, 14, 4, 0.45)',
}

const centeredWrapStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1240,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  pointerEvents: 'none', // backdrop never traps input; only the card is interactive
}

const cardStyle: CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  maxWidth: 'min(380px, 92vw)',
  padding: '0.75rem 0.9rem',
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: 10,
  boxShadow: '0 8px 26px rgba(60, 42, 26, 0.35)',
  color: '#3a2a1a',
}
