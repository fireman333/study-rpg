/**
 * ERConsultDialog — modal for the "急診照會" feature.
 *
 * Spec: openspec/specs/er-consultation/spec.md
 *
 * Mount pattern: rendered at App root, driven by Dexie liveQuery on
 * `gameCounters.erConsultActive`. Self-resolves on answer / skip / settings-off.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Question } from '@study-rpg/core'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB, type ERConsultActiveState } from '../db/schema'
import { pickQuestionById } from '../lib/quiz'
import { lookupERDoctorSprite } from '../lib/sprite-lookup'
import { ExplanationMarkdown } from './ExplanationMarkdown'
import {
  ER_CONSULT_GREETINGS,
  ER_CONSULT_GRATITUDE,
  ER_CONSULT_CORRECTIONS,
  answerERConsult,
  getERConsultSettings,
  setERConsultSettings,
  skipERConsult,
} from '../services/er-consultation'

const EXPLANATION_FALLBACK = '📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢'

/** Pick a stable variant from a pool keyed by active.questionId so re-renders don't reshuffle. */
function pickStableVariant(pool: ReadonlyArray<string>, seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length] ?? pool[0]
}

export function ERConsultDialog(): JSX.Element | null {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const active: ERConsultActiveState | null = counters?.erConsultActive ?? null

  if (!active) return null
  return <ERConsultDialogInner active={active} />
}

function ERConsultDialogInner({ active }: { active: ERConsultActiveState }): JSX.Element {
  const [question, setQuestion] = useState<Question | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const sessionSkippedOnceRef = useRef(false)
  const mountedAtRef = useRef(Date.now())
  const [toast, setToast] = useState<string | null>(null)

  // Load question by id
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const q = await pickQuestionById(active.questionId)
      if (!cancelled) setQuestion(q)
    })()
    return () => {
      cancelled = true
    }
  }, [active.questionId])

  // Onboarding tooltip — first time only
  useEffect(() => {
    void (async () => {
      const settings = await getERConsultSettings()
      if (!settings.onboarded) setShowOnboarding(true)
    })()
  }, [])

  const greeting = useMemo(() => {
    const tmpl = ER_CONSULT_GREETINGS[active.greetingIdx] ?? ER_CONSULT_GREETINGS[0]
    return tmpl.replace('{subject}', active.subjectId)
  }, [active.greetingIdx, active.subjectId])

  const reply = useMemo(() => {
    if (!revealed || !question) return null
    const wasCorrect = question.disputed || selectedOption === question.answer
    return wasCorrect
      ? pickStableVariant(ER_CONSULT_GRATITUDE, active.questionId)
      : pickStableVariant(ER_CONSULT_CORRECTIONS, active.questionId)
  }, [revealed, question, selectedOption, active.questionId])

  async function dismissOnboarding(): Promise<void> {
    setShowOnboarding(false)
    await setERConsultSettings({ onboarded: true })
  }

  async function handlePickOption(optionKey: string): Promise<void> {
    if (revealed || !question) return
    setSelectedOption(optionKey)
    setRevealed(true)
    const wasCorrect = question.disputed || optionKey === question.answer
    const reactionTimeMs = Date.now() - mountedAtRef.current

    if (showOnboarding) await dismissOnboarding()

    const result = await answerERConsult({ active, wasCorrect, reactionTimeMs })
    if (!result) return
    if (wasCorrect) {
      setToast(`+${result.revenueDelta} 💰 / +${result.reputationDelta} 聲望`)
      // Auto-close 2s after correct
      setTimeout(() => {
        // No-op state change to trigger unmount via liveQuery (active was cleared
        // in answerERConsult; liveQuery will see null on next tick).
      }, 2000)
    }
  }

  async function requestSkip(): Promise<void> {
    if (skipping) return
    if (!sessionSkippedOnceRef.current) {
      setShowSkipConfirm(true)
      return
    }
    await confirmSkip()
  }

  async function confirmSkip(): Promise<void> {
    setSkipping(true)
    sessionSkippedOnceRef.current = true
    setShowSkipConfirm(false)
    if (showOnboarding) await dismissOnboarding()
    await skipERConsult(active)
    // Modal will unmount via liveQuery on cleared erConsultActive
  }

  const erDoctorSprite = lookupERDoctorSprite(THEME_PIXEL_HOSPITAL.sprites, active.doctorSpriteKey)
  const optionKeys = useMemo(
    () => (question ? Object.keys(question.options).sort() : []),
    [question],
  )

  return (
    <div className="modal-backdrop modal-backdrop--er-consult">
      <div className="modal-card modal-card--er-consult" onClick={(e) => e.stopPropagation()}>
        <header className="er-consult__head">
          <h2 className="er-consult__title">🚨 急診照會</h2>
          <button
            type="button"
            className="er-consult__skip-btn"
            onClick={() => void requestSkip()}
            aria-label="跳過此次照會"
            disabled={skipping}
            title="跳過"
          >
            跳過
          </button>
        </header>

        {showOnboarding && (
          <div className="er-consult__onboarding" role="note">
            💡 急診照會 = 隨機跨科 consult，可從說明 menu「急診照會設定」關閉
          </div>
        )}

        <div className="er-consult__npc">
          <span className="er-consult__npc-sprite">
            {erDoctorSprite ? (
              <img src={erDoctorSprite} alt="急診醫師" />
            ) : (
              <span aria-hidden>🩺</span>
            )}
          </span>
          <div className="er-consult__npc-bubble">
            <p className="er-consult__npc-name">急診醫師</p>
            <p className="er-consult__npc-line">{reply ?? greeting}</p>
          </div>
        </div>

        <div className="er-consult__body">
          {!question && <p className="er-consult__loading">載入題目中…</p>}
          {question && (
            <>
              <div className="er-consult__question-meta">
                <span className="er-consult__subject-tag">{active.subjectId}</span>
                <span className="er-consult__question-id">{question.id}</span>
              </div>
              <p className="er-consult__stem">{question.stem}</p>
              {question.imagePath && (
                <div className="er-consult__image">
                  <img
                    src={`${import.meta.env.BASE_URL}${question.imagePath}`}
                    alt="題目附圖"
                  />
                </div>
              )}
              {question.hasImage && !question.imagePath && (
                <div className="er-consult__image-missing">
                  📷 此題含附圖但尚未補齊（{question.id}）
                </div>
              )}
              <ul className="er-consult__options">
                {optionKeys.map((key) => {
                  const isSelected = key === selectedOption
                  const isCorrect = revealed && (question.disputed || key === question.answer)
                  const isWrongPick =
                    revealed && isSelected && !question.disputed && key !== question.answer
                  const cls = [
                    'er-consult__option',
                    isCorrect ? 'er-consult__option--correct' : '',
                    isWrongPick ? 'er-consult__option--wrong' : '',
                    revealed && !isCorrect && !isSelected ? 'er-consult__option--dim' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={cls}
                        onClick={() => void handlePickOption(key)}
                        disabled={revealed}
                      >
                        <span className="er-consult__option-key">{key}.</span>
                        <span className="er-consult__option-text">{question.options[key]}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {revealed && (
                <div className="er-consult__explanation">
                  <h3>解析</h3>
                  <ExplanationMarkdown text={question.explanation || EXPLANATION_FALLBACK} />
                </div>
              )}
            </>
          )}
        </div>

        {revealed && (
          <footer className="er-consult__foot">
            <p className="er-consult__hint muted">關閉視窗即可回到醫院</p>
          </footer>
        )}

        {toast && (
          <div className="er-consult__toast" aria-live="polite">
            {toast}
          </div>
        )}

        {showSkipConfirm && (
          <div className="er-consult__confirm" role="dialog" aria-label="確認跳過">
            <p>跳過這次照會？不會扣分但也沒獎勵。</p>
            <div className="er-consult__confirm-actions">
              <button
                type="button"
                className="er-consult__confirm-cancel"
                onClick={() => setShowSkipConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="er-consult__confirm-ok"
                onClick={() => void confirmSkip()}
              >
                跳過
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
