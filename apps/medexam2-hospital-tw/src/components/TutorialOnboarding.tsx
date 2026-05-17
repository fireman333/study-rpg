/**
 * Onboarding tutorial — `redesign-hospital-economy` §9.5.1 + §9.5.7.
 *
 * 7-step modal sequence for fresh saves. Fires before any other gameplay
 * action. Step 1 has a 「跳過教學」link that marks every step complete (per
 * §9.5.7). Each Next/Skip click persists `tutorial.completedSteps[stepId] = true`,
 * so reload resumes at first incomplete step.
 *
 * MVP simplification: every step is `click-next` regardless of the
 * content-pack `completeOn` field — eventual auto-advance on actual gameplay
 * events (recruitment-screen-visited / doctor-assigned / etc.) is a follow-up.
 */

import { useEffect, useState } from 'react'
import { TUTORIAL_STEPS } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type GameCountersRow } from '../db/schema'

interface TutorialOnboardingProps {
  counters: GameCountersRow
  onComplete: () => void
}

export function TutorialOnboarding({ counters: initialCounters, onComplete }: TutorialOnboardingProps) {
  // Resume at first incomplete step
  const initialIndex = TUTORIAL_STEPS.findIndex(
    (s) => initialCounters.tutorial?.completedSteps?.[s.id] !== true,
  )
  const [stepIndex, setStepIndex] = useState(Math.max(0, initialIndex === -1 ? TUTORIAL_STEPS.length - 1 : initialIndex))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex >= TUTORIAL_STEPS.length - 1
  const isFirst = stepIndex === 0

  async function markStepComplete(stepId: string): Promise<void> {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const c = await db.gameCounters.get('singleton')
      if (!c) return
      await db.gameCounters.put({
        ...c,
        tutorial: {
          ...c.tutorial,
          completedSteps: { ...c.tutorial.completedSteps, [stepId]: true },
        },
      })
    })
  }

  async function markAllComplete(): Promise<void> {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const c = await db.gameCounters.get('singleton')
      if (!c) return
      const completedSteps: Record<string, true> = {}
      for (const s of TUTORIAL_STEPS) completedSteps[s.id] = true
      await db.gameCounters.put({
        ...c,
        tutorial: { ...c.tutorial, completedSteps },
      })
    })
  }

  async function handleNext() {
    if (busy) return
    setBusy(true)
    try {
      await markStepComplete(step.id)
      if (isLast) onComplete()
      else setStepIndex(stepIndex + 1)
    } finally {
      setBusy(false)
    }
  }

  function handleBack() {
    if (busy || isFirst) return
    setStepIndex(stepIndex - 1)
  }

  async function handleSkip() {
    if (busy) return
    setBusy(true)
    try {
      await markAllComplete()
      onComplete()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal frame tutorial-onboarding-modal">
        <div className="tutorial-onboarding__progress" aria-label={`步驟 ${stepIndex + 1} / ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`tutorial-onboarding__pip ${i === stepIndex ? 'tutorial-onboarding__pip--active' : ''} ${
                i < stepIndex ? 'tutorial-onboarding__pip--done' : ''
              }`}
            />
          ))}
        </div>
        <h2 className="modal__title">{step.title}</h2>
        <p className="tutorial-onboarding__body">{step.body}</p>
        <p className="muted tutorial-onboarding__counter">
          步驟 {stepIndex + 1} / {TUTORIAL_STEPS.length}
        </p>
        <div className="modal__actions tutorial-onboarding__actions">
          {isFirst ? (
            <button className="ghost-btn" onClick={() => void handleSkip()} disabled={busy}>
              跳過教學
            </button>
          ) : (
            <button className="ghost-btn" onClick={handleBack} disabled={busy}>
              上一步
            </button>
          )}
          <button className="primary-btn" onClick={() => void handleNext()} disabled={busy}>
            {isLast ? '開始遊玩' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}
