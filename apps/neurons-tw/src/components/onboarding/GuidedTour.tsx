/**
 * GuidedTour — the step-by-step first-run tour UI
 * (rebuild-neurons-onboarding-as-guided-tour).
 *
 * Sequence: 歡迎卡 → 📖 閱讀 → 答題 → 腦圖 → 儀表板 → 等待抽出 → 🎉 慶祝.
 * Step definitions / copy / transition logic live in the pure module
 * `lib/services/onboarding-tour` (unit-tested); this component only renders
 * the current step and OBSERVES existing gameplay events to advance:
 *   - reading step:  onReadingTimerStateChange + status === 'reading'
 *   - quiz step:     onAnswerCorrect (answer-feedback bus)
 *   - ANY step:      connectome.variantSlotUnlocked → terminal celebration
 * It never modifies walker / energy / gacha logic, never intercepts input
 * (welcome backdrop + spotlight dim are pointer-events:none), and every step
 * offers 跳過引導 (spotlight steps also offer 下一步).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CelebrationHalo, ParticleBurst } from '../../lib/motion'
import { EmojiIcon } from '../EmojiIcon'
import { onAnswerCorrect } from '../../lib/maze/answer-feedback'
import { events } from '../../lib/services/connectome'
import {
  getReadingTimerState,
  onReadingTimerStateChange,
} from '../../lib/services/reading-timer'
import {
  advanceTourStep,
  TOUR_ORDER,
  TOUR_STEPS,
  WELCOME_LINES,
  type TourAdvanceEvent,
  type TourStepId,
} from '../../lib/services/onboarding-tour'
import { SpotlightOverlay } from './SpotlightOverlay'

export interface GuidedTourProps {
  reduced: boolean
  /** Called once when the tour ends — completed (terminal celebration) or skipped. */
  onExit: (completed: boolean) => void
}

export function GuidedTour({ reduced, onExit }: GuidedTourProps): JSX.Element | null {
  const [step, setStep] = useState<TourStepId>('welcome')
  const welcomeStartRef = useRef<HTMLButtonElement | null>(null)

  const dispatch = (event: TourAdvanceEvent): void => {
    setStep((s) => advanceTourStep(s, event))
  }

  // A11y: Escape skips the tour from any active step (welcome / spotlight steps / extract wait
  // strip). The tour-active step also covers the spotlight steps, so SpotlightOverlay below is NOT
  // given its own onEscape (would double-fire). NOT a focus trap — the page stays interactive.
  useEffect(() => {
    if (step === 'done') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onExit(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onExit])

  // A11y: on the welcome card, move initial focus to its primary control (開始引導).
  useEffect(() => {
    if (step !== 'welcome') return
    const raf = requestAnimationFrame(() => welcomeStartRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Observe existing gameplay events while the tour is active (not done).
  useEffect(() => {
    if (step === 'done') return
    const offCorrect = onAnswerCorrect(() => dispatch('answerCorrect'))
    const offReading = onReadingTimerStateChange(() => {
      if (getReadingTimerState().status === 'reading') dispatch('readingStarted')
    })
    const onUnlock = (): void => dispatch('variantSlotUnlocked')
    events.on('connectome.variantSlotUnlocked', onUnlock)
    return () => {
      offCorrect()
      offReading()
      events.off('connectome.variantSlotUnlocked', onUnlock)
    }
  }, [step === 'done'])

  // Terminal celebration: show, then exit as completed.
  useEffect(() => {
    if (step !== 'done') return
    const t = setTimeout(() => onExit(true), reduced ? 1200 : 2600)
    return () => clearTimeout(t)
  }, [step, reduced])

  const skip = (): void => onExit(false)

  if (step === 'done') {
    return (
      <div aria-live="polite" style={doneOverlayStyle}>
        {!reduced && (
          <>
            <CelebrationHalo intensity={3} durationMs={1600} color="var(--signal-cyan)" />
            <ParticleBurst count={24} durationMs={1100} color="var(--signal-amber, #d4a04d)" />
          </>
        )}
        <div style={doneCardStyle}>
          <strong style={{ fontSize: '1.05rem' }}>
            <EmojiIcon char="🎉" size={18} /> 抽出第一隻神經元了！
          </strong>
          <span>收集神經元的唯一方法，就是探索腦圖。繼續唸書＋答題就會越收越多。</span>
        </div>
      </div>
    )
  }

  if (step === 'welcome') {
    return (
      <div style={welcomeWrapStyle}>
        <div role="dialog" aria-label="新手引導：歡迎" aria-live="polite" style={welcomeCardStyle}>
          <strong style={welcomeTitleStyle}>
            <EmojiIcon char="👋" size={18} /> {TOUR_STEPS.welcome.lead}
          </strong>
          <ul style={welcomeListStyle}>
            {WELCOME_LINES.map((line) => (
              <li key={line.icon} style={welcomeLineStyle}>
                <EmojiIcon char={line.icon} size={15} decorative /> {line.text}
              </li>
            ))}
          </ul>
          <div style={welcomeBtnRowStyle}>
            <button type="button" onClick={skip} style={ghostBtnStyle} aria-label="跳過新手引導">
              跳過
            </button>
            <button
              ref={welcomeStartRef}
              type="button"
              onClick={() => dispatch('next')}
              style={primaryBtnStyle}
            >
              {TOUR_STEPS.welcome.nextLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'extract') {
    // Terminal wait: a compact non-blocking bottom strip (anchor-free by design)
    // — the player free-plays until `connectome.variantSlotUnlocked` fires.
    const def = TOUR_STEPS.extract
    return (
      <section role="region" aria-label="新手引導" style={waitStripStyle}>
        <div style={waitTextStyle}>
          <strong style={waitLeadStyle}>
            <EmojiIcon char="🎯" size={15} /> {def.lead}
          </strong>
          <span style={waitBodyStyle}>{def.body}</span>
        </div>
        <button type="button" onClick={skip} style={ghostBtnStyle} aria-label="跳過新手引導">
          跳過
        </button>
      </section>
    )
  }

  // Spotlight steps (reading / quiz / maze / dashboard). Anchors are consumed
  // defensively — SpotlightOverlay degrades to a centered card on all-miss.
  const def = TOUR_STEPS[step]
  const stepNo = TOUR_ORDER.indexOf(step) // welcome=0 → reading=1 …
  return (
    <SpotlightOverlay anchors={def.anchors} reduced={reduced} ariaLabel="新手引導">
      <span style={stepCounterStyle}>
        新手引導 {stepNo}/{TOUR_ORDER.length - 1}
      </span>
      <strong style={spotLeadStyle}>{def.lead}</strong>
      <span style={spotBodyStyle}>{def.body}</span>
      <div style={spotBtnRowStyle}>
        <button type="button" onClick={skip} style={ghostBtnStyle} aria-label="跳過新手引導">
          跳過引導
        </button>
        {def.nextLabel !== null && (
          <button type="button" onClick={() => dispatch('next')} style={primaryBtnStyle}>
            {def.nextLabel}
          </button>
        )}
      </div>
    </SpotlightOverlay>
  )
}

// --- styles (inline only — styles.css is owned by the layout agent) -----------

const welcomeWrapStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1240,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  // Frictionless: the welcome backdrop NEVER traps input (spec). Only the card
  // itself is interactive.
  pointerEvents: 'none',
  background: 'rgba(24, 14, 4, 0.28)',
}

const welcomeCardStyle: CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
  width: 'min(460px, 94vw)',
  padding: '1rem 1.1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f5e6d3 100%)',
  border: '3px solid #d4a04d',
  borderRadius: 12,
  boxShadow: '0 12px 34px rgba(60, 42, 26, 0.4)',
  color: '#3a2a1a',
}

const welcomeTitleStyle: CSSProperties = { fontSize: '1.1rem', color: '#5a3f29' }
const welcomeListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  fontSize: '0.88rem',
  lineHeight: 1.55,
}
const welcomeLineStyle: CSSProperties = { display: 'block' }
const welcomeBtnRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  marginTop: '0.2rem',
}

const primaryBtnStyle: CSSProperties = {
  padding: '0.45rem 1.1rem',
  borderRadius: 6,
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const ghostBtnStyle: CSSProperties = {
  padding: '0.45rem 0.7rem',
  borderRadius: 6,
  border: '1px solid #b8893a',
  background: 'transparent',
  color: '#8c6d4a',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: '0.8rem',
  cursor: 'pointer',
  flexShrink: 0,
}

const stepCounterStyle: CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: '#8c6d4a',
}
const spotLeadStyle: CSSProperties = { fontSize: '0.95rem', color: '#5a3f29' }
const spotBodyStyle: CSSProperties = { fontSize: '0.84rem', lineHeight: 1.55 }
const spotBtnRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.15rem',
}

const waitStripStyle: CSSProperties = {
  position: 'fixed',
  left: '0.6rem',
  right: '0.6rem',
  bottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))',
  zIndex: 1200,
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.6rem 0.75rem',
  maxWidth: 560,
  margin: '0 auto',
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: 10,
  boxShadow: '0 6px 22px rgba(60, 42, 26, 0.28)',
}

const waitTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  flex: 1,
  minWidth: 0,
}
const waitLeadStyle: CSSProperties = { fontSize: '0.95rem', color: '#5a3f29' }
const waitBodyStyle: CSSProperties = { fontSize: '0.82rem', color: '#3a2a1a', lineHeight: 1.5 }

const doneOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1300,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}

const doneCardStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  maxWidth: 'min(420px, 88vw)',
  padding: '0.85rem 1rem',
  textAlign: 'center',
  background: 'rgba(10, 22, 30, 0.9)',
  color: '#f4ecd8',
  borderRadius: 10,
  boxShadow: '0 0 18px rgba(80, 200, 230, 0.5)',
  fontSize: '0.88rem',
  lineHeight: 1.55,
}
