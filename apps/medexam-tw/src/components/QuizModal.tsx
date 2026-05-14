import { useEffect, useMemo, useState } from 'react'
import type { Question, QuestionId, SubjectId } from '@study-rpg/core'

export interface QuizResult { correct: boolean }
export interface QuestionResult { questionId: QuestionId; correct: boolean; elapsedMs: number }

/** Max questions presented in one review-mode session. */
export const REVIEW_BATCH_SIZE = 20

type QuizMode = 'reading' | 'review'

interface Props {
  pool: Question[]
  subjectFilter?: SubjectId
  count?: number
  /** Question IDs whose SrsCard.dueAt <= now (sourced from db.srs); prepended before fresh picks. */
  dueQuestionIds?: QuestionId[]
  /** 'reading' (default) = due-biased + fresh filler. 'review' = due-only, capped at REVIEW_BATCH_SIZE. */
  mode?: QuizMode
  onClose: (results: QuizResult[], questionResults: QuestionResult[]) => void
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function QuizModal({ pool, subjectFilter, count = 5, dueQuestionIds, mode = 'reading', onClose }: Props) {
  const questions = useMemo(() => {
    const filtered = subjectFilter ? pool.filter((q) => q.subject === subjectFilter) : pool
    const dueSet = new Set(dueQuestionIds ?? [])
    const dueInPool = filtered.filter((q) => dueSet.has(q.id))
    if (mode === 'review') {
      const shuffledDue = shuffle(dueInPool)
      return shuffledDue.slice(0, Math.min(shuffledDue.length, REVIEW_BATCH_SIZE))
    }
    const freshInPool = filtered.filter((q) => !dueSet.has(q.id))
    const shuffledDue = shuffle(dueInPool)
    const need = Math.max(0, count - shuffledDue.length)
    const filler = need > 0 ? shuffle(freshInPool).slice(0, need) : []
    return [...shuffledDue.slice(0, count), ...filler]
  }, [pool, subjectFilter, count, dueQuestionIds, mode])

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([])
  const [skippedCount, setSkippedCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(() => Date.now())

  useEffect(() => {
    if (!finished) setQuestionStartedAt(Date.now())
  }, [idx, finished])

  const results: QuizResult[] = questionResults.map((r) => ({ correct: r.correct }))

  if (questions.length === 0) {
    return (
      <div className="modal-backdrop" onClick={() => onClose([], [])}>
        <div className="modal frame" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span>題庫空了</span>
            <button className="close-btn" onClick={() => onClose([], [])}>✕</button>
          </div>
          <div className="empty-state">該科目沒有可用題目。</div>
        </div>
      </div>
    )
  }

  const q = questions[idx]
  const isLast = idx === questions.length - 1
  const correctCount = questionResults.filter((r) => r.correct).length

  function handlePick(optionKey: string) {
    if (picked !== null) return
    const elapsedMs = Date.now() - questionStartedAt
    setPicked(optionKey)
    setQuestionResults((prev) => [...prev, { questionId: q.id, correct: optionKey === q.answer, elapsedMs }])
  }

  function handleNext() {
    if (picked === null) return
    if (isLast) {
      setFinished(true)
    } else {
      setIdx((i) => i + 1)
      setPicked(null)
    }
  }

  function handleSkip() {
    if (picked !== null) return
    setSkippedCount((c) => c + 1)
    if (isLast) {
      setFinished(true)
    } else {
      setIdx((i) => i + 1)
      setPicked(null)
    }
  }

  function handleClose() {
    onClose(results, questionResults)
  }

  return (
    <div className="modal-backdrop" onClick={() => onClose(results, questionResults)}>
      <div className="modal frame quiz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>
            藥理學{mode === 'review' ? ' · 複習模式' : ''} — 第 {idx + 1} / {questions.length} 題
          </span>
          <button className="close-btn" onClick={() => onClose(results, questionResults)}>✕</button>
        </div>

        {finished ? (
          <div className="quiz-summary">
            <h2 className="quiz-summary-title">完成</h2>
            <p className="quiz-summary-score">
              答對 {correctCount} / {questionResults.length}
              {skippedCount > 0 && ` · 跳過 ${skippedCount}`}
            </p>
            <p className="quiz-summary-hint">關閉後會 +XP +屬性 + {correctCount} 次抽卡</p>
            <button onClick={handleClose}>完成並領取獎勵</button>
          </div>
        ) : (
          <div className="quiz-body">
            {mode === 'review' && (
              <div className="review-mode-banner">
                <span className="rmb-icon">🔄</span>
                <span className="rmb-text">
                  複習模式 · 共 {questions.length} 題（這次都是熟題、SRS 排程）
                </span>
              </div>
            )}
            {q.hasImage === true && (
              <div className="image-placeholder-banner">
                <span className="ipb-icon">📷</span>
                <span className="ipb-text">
                  此題原有附圖（題庫尚未匯入）。多數題目仍可從文字推測作答。
                </span>
                {mode === 'reading' && picked === null && (
                  <button className="ipb-skip" onClick={handleSkip}>
                    跳過此題 →
                  </button>
                )}
              </div>
            )}
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
              <>
                <div className={`quiz-feedback ${picked === q.answer ? 'feedback-correct' : 'feedback-wrong'}`}>
                  {picked === q.answer ? '✓ 答對' : `✗ 答錯，正解是 (${q.answer})`}
                </div>
                <details className="quiz-explanation" open>
                  <summary>詳解</summary>
                  <pre>{q.explanation}</pre>
                </details>
                <div className="quiz-actions">
                  <button onClick={handleNext}>{isLast ? '看結果' : '下一題 →'}</button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="quiz-footer">
          詳解 © <a href="https://sites.google.com/view/ymmedexam/ans" target="_blank" rel="noreferrer">陽明國考考古題小組</a> (CC-BY-NC)
          {q.meta?.year != null && q.meta?.session != null && (
            <> · 題目來源：{String(q.meta.year)}-{String(q.meta.session)} 醫師國考</>
          )}
        </div>
      </div>
    </div>
  )
}
