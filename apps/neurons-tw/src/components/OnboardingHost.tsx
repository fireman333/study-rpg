/**
 * OnboardingHost — orchestrates the two new-player onboarding moments
 * (rebuild-neurons-onboarding-as-guided-tour):
 *
 *   ① Guided tour — welcome card (core loop in ≤3 plain-語 lines) followed by
 *      step-by-step ELEMENT SPOTLIGHTS (📖 閱讀 → 答題 → 腦圖 → 儀表板 → 等待
 *      抽出 → 🎉 慶祝). Spotlights consume `data-tutorial` anchors at runtime
 *      and degrade to a centered card when an anchor is missing (the homepage
 *      layout is owned by a parallel change — positioning is layout-agnostic).
 *      Steps advance by OBSERVING existing gameplay events or via 「下一步」;
 *      skippable at every step; replayable from HelpMenu.
 *   ② Expedition-unlock spotlight — a one-shot just-in-time teach fired on the
 *      player's first wrong answer (修復連線 + DMN 抽卡), targeting the
 *      `[data-tutorial="expedition"]` anchor (centered fallback). Suppressed
 *      while the tour is active (deferred until it ends).
 *
 * Observes only (does NOT modify walker / energy / gacha): onAnswerCorrect /
 * onAnswerWrong (answer-feedback bus), connectome.variantSlotUnlocked (events
 * bus), reading-timer state. State is device-local meta flags (see
 * lib/services/onboarding) — no Dexie bump, no SYNCED_META_KEYS, no R2 change.
 *
 * Spec: openspec/specs/neurons-onboarding/spec.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRespectsReducedMotion } from '../lib/motion'
import { EmojiIcon } from './EmojiIcon'
import { onAnswerWrong } from '../lib/maze/answer-feedback'
import {
  getGuidedComplete,
  setGuidedComplete,
  getExpeditionSpotlightSeen,
  setExpeditionSpotlightSeen,
  maybeAutoCompleteForExistingPlayer,
  onReplayGuided,
} from '../lib/services/onboarding'
import { GuidedTour } from './onboarding/GuidedTour'
import { SpotlightOverlay } from './onboarding/SpotlightOverlay'

type Phase = 'loading' | 'tour' | 'idle'

export function OnboardingHost(): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  const [phase, setPhase] = useState<Phase>('loading')
  // Bumped on each HelpMenu replay → keyed remount restarts the tour from the
  // welcome card with fresh step state.
  const [tourRun, setTourRun] = useState(0)
  const [spotlight, setSpotlight] = useState(false)
  // A wrong answer that arrived WHILE the tour was active — its benefit
  // spotlight is deferred until the tour completes/skips (no overlay collision).
  const pendingSpotlightRef = useRef(false)

  // Re-reads the persisted one-shot flag before showing (seen guard).
  async function showSpotlightIfUnseen(): Promise<void> {
    if (await getExpeditionSpotlightSeen()) return
    setSpotlight(true)
  }

  // Init: existing players are auto-completed (no tour); new saves see it.
  useEffect(() => {
    let alive = true
    void (async () => {
      await maybeAutoCompleteForExistingPlayer()
      const complete = await getGuidedComplete()
      if (alive) setPhase(complete ? 'idle' : 'tour')
    })()
    return () => {
      alive = false
    }
  }, [])

  // HelpMenu「重看新手引導」replay — restart from the welcome card.
  useEffect(
    () =>
      onReplayGuided(() => {
        setSpotlight(false)
        pendingSpotlightRef.current = false
        setTourRun((n) => n + 1)
        setPhase('tour')
      }),
    [],
  )

  // Tour ended (completed OR skipped) → persist + flip to idle.
  const handleTourExit = (): void => {
    void setGuidedComplete()
    setPhase('idle')
  }

  // First wrong answer → show or DEFER the benefit spotlight. (The ⚔️ entry
  // itself reveals via the monotonic `everWrong` derivation in OverviewPage.)
  useEffect(() => {
    return onAnswerWrong(() => {
      if (phase === 'tour') pendingSpotlightRef.current = true
      else void showSpotlightIfUnseen()
    })
  }, [phase])

  // When the tour ends with a deferred wrong-answer, show the spotlight.
  useEffect(() => {
    if (phase === 'idle' && pendingSpotlightRef.current) {
      pendingSpotlightRef.current = false
      void showSpotlightIfUnseen()
    }
  }, [phase])

  const dismissSpotlight = (): void => {
    setSpotlight(false)
    void setExpeditionSpotlightSeen()
  }

  if (phase === 'loading') return null

  return (
    <>
      {phase === 'tour' && <GuidedTour key={tourRun} reduced={reduced} onExit={handleTourExit} />}
      {spotlight && <ExpeditionSpotlight reduced={reduced} onClose={dismissSpotlight} />}
    </>
  )
}

// --- Expedition-unlock benefit spotlight -------------------------------------
// Rendered through the layout-agnostic spotlight engine: frames the actual ⚔️
// button when `[data-tutorial="expedition"]` resolves, otherwise the same card
// renders centered (graceful degrade — anchor is stamped by the layout change).

function ExpeditionSpotlight({
  reduced,
  onClose,
}: {
  reduced: boolean
  onClose: () => void
}): JSX.Element {
  return (
    <SpotlightOverlay
      anchors={['[data-tutorial="expedition"]']}
      reduced={reduced}
      ariaLabel="錯題出征解鎖"
    >
      <strong style={spotlightTitleStyle}>
        <EmojiIcon char="⚔️" size={18} /> 解鎖了：錯題出征
      </strong>
      <p style={spotlightBodyStyle}>
        答錯不是壞事 — 它會進「錯題出征」。重新答對＝修復腦圖連線，還能抽 DMN 命運卡。清越多錯題、抽越多卡。
      </p>
      <p style={spotlightHintStyle}>⚔️ 錯題出征 鈕隨時可以出發。</p>
      <button type="button" onClick={onClose} style={spotlightBtnStyle}>
        知道了
      </button>
    </SpotlightOverlay>
  )
}

const spotlightTitleStyle: CSSProperties = { fontSize: '1.02rem', color: '#a8462a' }
const spotlightBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  color: '#3a2a1a',
  lineHeight: 1.6,
}
const spotlightHintStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#5a3f29',
  fontWeight: 600,
}

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
