import { useEffect, useMemo, useRef, useState } from 'react'
import {
  sampleMiniBoss,
  MINI_BOSS_QUESTIONS,
  passed,
  type Question,
  type SubjectId,
} from '@study-rpg/core'

export interface BossRunResult {
  correctQ: number
  totalQ: number
  timeSpentMs: number
  passed: boolean
}

interface Props {
  pool: Question[]
  subject: SubjectId
  onClose: (result: BossRunResult | null) => void
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

export function BossModal({ pool, subject, onClose }: Props) {
  const startedAt = useRef(Date.now())
  const filtered = useMemo(() => pool.filter((q) => q.subject === subject), [pool, subject])
  const selection = useMemo(() => sampleMiniBoss(filtered, MINI_BOSS_QUESTIONS), [filtered])
  const questions = selection.questions

  const [idx, setIdx] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [remainingMs, setRemainingMs] = useState(selection.durationMs)

  useEffect(() => {
    if (finished) return
    const tick = () => {
      const elapsed = Date.now() - startedAt.current
      const left = selection.durationMs - elapsed
      if (left <= 0) {
        setRemainingMs(0)
        setFinished(true)
      } else {
        setRemainingMs(left)
      }
    }
    const t = setInterval(tick, 200)
    return () => clearInterval(t)
  }, [finished, selection.durationMs])

  function finalize(extraCorrect = 0) {
    const final = correctCount + extraCorrect
    setFinished(true)
    onClose({
      correctQ: final,
      totalQ: questions.length,
      timeSpentMs: Date.now() - startedAt.current,
      passed: passed({ correctQ: final, totalQ: questions.length }),
    })
  }

  function handlePick(optionKey: string) {
    if (picked !== null || finished) return
    setPicked(optionKey)
    const wasCorrect = optionKey === questions[idx].answer
    if (wasCorrect) setCorrectCount((c) => c + 1)
  }

  function handleNext() {
    if (picked === null) return
    if (idx === questions.length - 1) {
      finalize()
    } else {
      setIdx((i) => i + 1)
      setPicked(null)
    }
  }

  function handleAbort() {
    onClose({
      correctQ: correctCount,
      totalQ: questions.length,
      timeSpentMs: Date.now() - startedAt.current,
      passed: passed({ correctQ: correctCount, totalQ: questions.length }),
    })
  }

  if (questions.length === 0) {
    return (
      <div className="modal-backdrop" onClick={() => onClose(null)}>
        <div className="modal frame" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span>mini-boss · {subject}</span>
            <button className="close-btn" onClick={() => onClose(null)}>✕</button>
          </div>
          <div className="empty-state">該科目沒有可用題目，無法挑戰。</div>
        </div>
      </div>
    )
  }

  const q = questions[idx]
  const isLast = idx === questions.length - 1
  const showSummary = finished

  return (
    <div className="modal-backdrop" onClick={handleAbort}>
      <div className="modal frame quiz-modal boss-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>⚔ mini-boss · {subject} — {idx + 1} / {questions.length}</span>
          <span className={`boss-timer ${remainingMs < 60_000 ? 'boss-timer-warn' : ''}`}>
            ⏱ {formatMs(remainingMs)}
          </span>
          <button className="close-btn" onClick={handleAbort}>✕</button>
        </div>

        {showSummary ? (
          <div className="quiz-summary boss-summary">
            <h2 className="quiz-summary-title">
              {passed({ correctQ: correctCount, totalQ: questions.length }) ? '🎖 通關' : '💢 失敗'}
            </h2>
            <p className="quiz-summary-score">
              答對 {correctCount} / {questions.length}（{((correctCount / questions.length) * 100).toFixed(1)}%）
            </p>
            <p className="quiz-summary-hint">
              通關門檻 60% · 用時 {formatMs(Date.now() - startedAt.current)}
            </p>
            <button onClick={() => onClose({
              correctQ: correctCount,
              totalQ: questions.length,
              timeSpentMs: Date.now() - startedAt.current,
              passed: passed({ correctQ: correctCount, totalQ: questions.length }),
            })}>關閉</button>
          </div>
        ) : (
          <div className="quiz-body">
            <div className="quiz-stem">{q.stem}</div>
            <div className="quiz-options">
              {Object.entries(q.options).map(([key, text]) => {
                const isPicked = picked === key
                const isCorrect = q.answer === key
                let cls = 'quiz-option'
                if (picked !== null) {
                  if (isCorrect) cls += ' option-correct'
                  else if (isPicked) cls += ' option-wrong'
                }
                return (
                  <button
                    key={key}
                    className={cls}
                    disabled={picked !== null}
                    onClick={() => handlePick(key)}
                  >
                    <span className="quiz-option-letter">({key})</span>
                    <span className="quiz-option-text">{text}</span>
                  </button>
                )
              })}
            </div>
            {picked !== null && (
              <div className="quiz-actions">
                <button onClick={handleNext}>{isLast ? '看結果' : '下一題 →'}</button>
              </div>
            )}
          </div>
        )}

        <div className="quiz-footer">
          ⚠ Boss mode：不顯示詳解 · 計時持續 · 中途關閉視為放棄
        </div>
      </div>
    </div>
  )
}
