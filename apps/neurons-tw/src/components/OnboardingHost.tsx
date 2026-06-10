/**
 * OnboardingHost — orchestrates the two new-player onboarding moments
 * (improve-neurons-onboarding):
 *
 *   ① Interactive guided overlay — a NON-BLOCKING coaching strip that observes
 *      EXISTING gameplay events and spotlights the next action, terminating when
 *      the player extracts their first neuron (`connectome.variantSlotUnlocked`).
 *      Skippable; replayable from HelpMenu.
 *   ② Expedition-unlock spotlight — a one-shot just-in-time teach card fired on
 *      the player's first wrong answer, explaining the benefit (修復連線 + DMN 抽卡).
 *      Suppressed while the guided overlay is active (deferred until it ends).
 *
 * Observes only (does NOT modify walker / energy / gacha): onAnswerCorrect /
 * onAnswerWrong (answer-feedback bus), connectome.variantSlotUnlocked (events
 * bus). State is device-local meta flags (see lib/services/onboarding).
 *
 * Spec: openspec/specs/neurons-onboarding/spec.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CelebrationHalo, ParticleBurst, useRespectsReducedMotion } from '../lib/motion'
import { EmojiIcon } from './EmojiIcon'
import { onAnswerCorrect, onAnswerWrong } from '../lib/maze/answer-feedback'
import { events } from '../lib/services/connectome'
import {
  getGuidedComplete,
  setGuidedComplete,
  getExpeditionSpotlightSeen,
  setExpeditionSpotlightSeen,
  maybeAutoCompleteForExistingPlayer,
  onReplayGuided,
} from '../lib/services/onboarding'

type Phase = 'loading' | 'guided' | 'idle'
type GuidedStep = 'answer' | 'progress' | 'done'

export function OnboardingHost(): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  const [phase, setPhase] = useState<Phase>('loading')
  const [step, setStep] = useState<GuidedStep>('answer')
  const [spotlight, setSpotlight] = useState(false)
  // A wrong answer that arrived WHILE the guided overlay was active — its benefit
  // spotlight is deferred until the overlay completes/skips (D5 sequencing).
  const pendingSpotlightRef = useRef(false)

  // Reveal the ⚔️ entry (one-way flag) + decide whether to show the benefit
  // spotlight now or defer it. `seenGuard` re-reads the persisted one-shot flag.
  async function showSpotlightIfUnseen(): Promise<void> {
    if (await getExpeditionSpotlightSeen()) return
    setSpotlight(true)
  }

  // Init: existing players are auto-completed (no overlay); new saves see it.
  useEffect(() => {
    let alive = true
    void (async () => {
      await maybeAutoCompleteForExistingPlayer()
      const complete = await getGuidedComplete()
      if (alive) setPhase(complete ? 'idle' : 'guided')
    })()
    return () => {
      alive = false
    }
  }, [])

  // HelpMenu「重看新手引導」replay.
  useEffect(
    () =>
      onReplayGuided(() => {
        setSpotlight(false)
        pendingSpotlightRef.current = false
        setStep('answer')
        setPhase('guided')
      }),
    [],
  )

  // Guided step progression (subscribe only while the overlay is active).
  useEffect(() => {
    if (phase !== 'guided') return
    const offCorrect = onAnswerCorrect(() => {
      setStep((s) => (s === 'answer' ? 'progress' : s))
    })
    const onUnlock = (): void => setStep('done')
    events.on('connectome.variantSlotUnlocked', onUnlock)
    return () => {
      offCorrect()
      events.off('connectome.variantSlotUnlocked', onUnlock)
    }
  }, [phase])

  // Terminal step: celebrate, then mark complete + flip to idle.
  useEffect(() => {
    if (phase !== 'guided' || step !== 'done') return
    const t = setTimeout(
      () => {
        void setGuidedComplete()
        setPhase('idle')
      },
      reduced ? 1200 : 2600,
    )
    return () => clearTimeout(t)
  }, [phase, step, reduced])

  // First wrong answer → show or DEFER the benefit spotlight. (The ⚔️ entry itself
  // reveals via the monotonic `everWrong` derivation in OverviewPage, not here.)
  useEffect(() => {
    return onAnswerWrong(() => {
      if (phase === 'guided') pendingSpotlightRef.current = true
      else void showSpotlightIfUnseen()
    })
  }, [phase])

  // When the guided overlay ends with a deferred wrong-answer, show the spotlight.
  useEffect(() => {
    if (phase === 'idle' && pendingSpotlightRef.current) {
      pendingSpotlightRef.current = false
      void showSpotlightIfUnseen()
    }
  }, [phase])

  const skipGuided = (): void => {
    void setGuidedComplete()
    setPhase('idle')
  }

  const dismissSpotlight = (): void => {
    setSpotlight(false)
    void setExpeditionSpotlightSeen()
  }

  if (phase === 'loading') return null

  return (
    <>
      {phase === 'guided' && <GuidedStrip step={step} reduced={reduced} onSkip={skipGuided} />}
      {spotlight && <ExpeditionSpotlight onClose={dismissSpotlight} />}
    </>
  )
}

// --- Guided coaching strip ---------------------------------------------------

const GUIDED_COPY: Record<Exclude<GuidedStep, 'done'>, { lead: string; body: string }> = {
  answer: {
    lead: '先答一題試試',
    body: '答對會餵能量，推著你的神經元在腦圖上前進。也可以在下方科目卡點 📖 閱讀。',
  },
  progress: {
    lead: '看到了嗎？牠前進了',
    body: '能量讓神經元在腦圖上走。再多答幾題，走到腦區就會抽出你的第一隻神經元。',
  },
}

function GuidedStrip({
  step,
  reduced,
  onSkip,
}: {
  step: GuidedStep
  reduced: boolean
  onSkip: () => void
}): JSX.Element {
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

  const copy = GUIDED_COPY[step]
  return (
    <section role="region" aria-label="新手引導" style={stripStyle}>
      <div style={stripTextStyle}>
        <strong style={stripLeadStyle}>
          <EmojiIcon char="👋" size={15} /> {copy.lead}
        </strong>
        <span style={stripBodyStyle}>{copy.body}</span>
      </div>
      <button type="button" onClick={onSkip} style={skipBtnStyle} aria-label="跳過新手引導">
        跳過
      </button>
    </section>
  )
}

// --- Expedition-unlock benefit spotlight -------------------------------------

function ExpeditionSpotlight({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div role="dialog" aria-modal="false" aria-label="錯題出征解鎖" style={spotlightBackdropStyle}>
      <div style={spotlightCardStyle}>
        <strong style={spotlightTitleStyle}>
          <EmojiIcon char="⚔️" size={18} /> 解鎖了：錯題出征
        </strong>
        <p style={spotlightBodyStyle}>
          答錯不是壞事 — 它會進「錯題出征」。重新答對＝修復腦圖連線，還能抽 DMN 命運卡。清越多錯題、抽越多卡。
        </p>
        <p style={spotlightHintStyle}>看上方的 ⚔️ 錯題出征 鈕，隨時可以出發。</p>
        <button type="button" onClick={onClose} style={spotlightBtnStyle}>
          知道了
        </button>
      </div>
    </div>
  )
}

// --- styles (mobile-first: fixed strips, safe-area aware, narrow-viewport ok) ---

const stripStyle: CSSProperties = {
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

const stripTextStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }
const stripLeadStyle: CSSProperties = { fontSize: '0.95rem', color: '#5a3f29' }
const stripBodyStyle: CSSProperties = { fontSize: '0.82rem', color: '#3a2a1a', lineHeight: 1.5 }

const skipBtnStyle: CSSProperties = {
  flexShrink: 0,
  alignSelf: 'flex-start',
  padding: '0.3rem 0.6rem',
  borderRadius: 6,
  border: '1px solid #b8893a',
  background: 'transparent',
  color: '#8c6d4a',
  fontFamily: 'inherit',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}

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

const spotlightBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1250,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  padding: 'calc(0.8rem + env(safe-area-inset-bottom, 0px)) 0.8rem',
  background: 'rgba(40, 28, 16, 0.35)',
}

const spotlightCardStyle: CSSProperties = {
  width: 'min(460px, 94vw)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  padding: '1rem 1.1rem',
  background: '#fdf6e3',
  border: '3px solid #c06a3a',
  borderRadius: 10,
  boxShadow: '0 10px 30px rgba(60, 42, 26, 0.4)',
}

const spotlightTitleStyle: CSSProperties = { fontSize: '1.02rem', color: '#a8462a' }
const spotlightBodyStyle: CSSProperties = { margin: 0, fontSize: '0.9rem', color: '#3a2a1a', lineHeight: 1.6 }
const spotlightHintStyle: CSSProperties = { margin: 0, fontSize: '0.8rem', color: '#5a3f29', fontWeight: 600 }

const spotlightBtnStyle: CSSProperties = {
  alignSelf: 'flex-end',
  marginTop: '0.2rem',
  padding: '0.45rem 1.1rem',
  borderRadius: 6,
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
}
