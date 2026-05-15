import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ContentPack, MockAttempt, MockPerQuestionAnswer, Question } from '@study-rpg/core'
import { computeProgressDelta, decodePaperId, newCard } from '@study-rpg/core'
import { getDB } from '@study-rpg/core'
import { getAttemptById, listAttemptsByPaper } from '../db/mock-attempts'

interface Props {
  content: ContentPack
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function paperLabel(paperId: string): string {
  const d = decodePaperId(paperId)
  if (!d) return paperId
  const kind = d.paper === 'medexam-1' ? '醫一' : '醫二'
  return `${d.year} 第 ${d.session} 次 ${kind}`
}

const EXPLANATION_FALLBACK = (
  <>
    📌 此題詳解暫無 — 可至
    <a href="https://sites.google.com/view/ymmedexam/ans" target="_blank" rel="noreferrer">
      陽明國考考古題小組
    </a>
    查詢
  </>
)

export function MockResultRoute({ content }: Props) {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [attempt, setAttempt] = useState<MockAttempt | null>(null)
  const [priorAttempts, setPriorAttempts] = useState<MockAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [srsEnqueued, setSrsEnqueued] = useState(false)

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const a = await getAttemptById(attemptId)
        if (cancelled) return
        setAttempt(a)
        if (a) {
          const all = await listAttemptsByPaper(a.paperId)
          if (!cancelled) setPriorAttempts(all.filter((x) => x.id !== a.id))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [attemptId])

  // Map question id → Question for cards
  const questionMap = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of content.questions) m.set(q.id, q)
    return m
  }, [content.questions])

  const wrongAnswers = useMemo<MockPerQuestionAnswer[]>(
    () => attempt?.perQuestionAnswers.filter((a) => !a.isCorrect) ?? [],
    [attempt],
  )

  const handleSrsEnqueue = useCallback(async () => {
    if (!attempt) return
    const db = getDB()
    const now = Date.now()
    // Use same-id put pattern as existing srs code uses newCard then writes via put.
    for (const a of wrongAnswers) {
      const card = newCard(a.questionId, now)
      try {
        const existing = await db.srs.get(a.questionId)
        if (!existing) await db.srs.put(card)
        // If already exists, leave it — reviewCard will be applied next time user reviews.
      } catch (err) {
        console.error('[mock-result] enqueue srs failed:', err)
      }
    }
    setSrsEnqueued(true)
  }, [attempt, wrongAnswers])

  if (loading) {
    return <div className="mock-result-page"><p className="mock-loading">載入中...</p></div>
  }
  if (!attempt) {
    return (
      <div className="mock-result-page">
        <p className="mock-empty">查無此 attempt</p>
        <Link to="/mock" className="mock-back">← 回挑卷</Link>
      </div>
    )
  }

  const progress = computeProgressDelta(attempt.totalScore, priorAttempts)
  const total = attempt.perQuestionAnswers.length

  return (
    <div className="mock-result-page">
      <header className="mock-result-header">
        <Link to="/mock" className="mock-back">← 回挑卷</Link>
        <h2>模擬考結果</h2>
      </header>

      <section className="mock-result-summary">
        <div className="mock-result-paper">{paperLabel(attempt.paperId)}</div>
        <div className="mock-result-score">
          <strong>{attempt.totalScore}</strong> / {total}
        </div>
        <div className="mock-result-meta">
          ⏱ {fmtElapsed(attempt.elapsedSec)} · 第 {progress.attemptCount} 次嘗試
        </div>
        {progress.previousScore === null ? (
          <div className="mock-progress-curve mock-progress-first">首次嘗試 — 之後可看進步曲線</div>
        ) : (
          <div className={`mock-progress-curve mock-progress-${
            progress.delta === null ? 'same' : progress.delta > 0 ? 'up' : progress.delta < 0 ? 'down' : 'same'
          }`}>
            上次 {progress.previousScore} → 這次 {attempt.totalScore}
            {progress.delta !== null && progress.delta !== 0 && (
              <span className="mock-progress-delta">
                {progress.delta > 0 ? ' +' : ' '}{progress.delta} 分
              </span>
            )}
            {progress.delta === 0 && <span className="mock-progress-delta"> 與上次相同</span>}
          </div>
        )}
      </section>

      <section className="mock-result-srs">
        {wrongAnswers.length === 0 ? (
          <div className="mock-result-perfect">🎉 全對！完美一卷！</div>
        ) : srsEnqueued ? (
          <button className="mock-srs-btn mock-srs-btn-done" disabled>已加入 SRS 排程</button>
        ) : (
          <button className="mock-srs-btn" onClick={handleSrsEnqueue}>
            將 {wrongAnswers.length} 道錯題加入 SRS 排程
          </button>
        )}
      </section>

      <section className="mock-result-cards">
        {attempt.perQuestionAnswers.map((a, idx) => {
          const q = questionMap.get(a.questionId)
          if (!q) {
            return (
              <article key={a.questionId} className="mock-result-card mock-result-card-missing">
                <div className="mock-result-card-num">{idx + 1}.</div>
                <div className="mock-result-card-warn">⚠ 找不到此題在當前題庫</div>
              </article>
            )
          }
          return (
            <article
              key={a.questionId}
              className={`mock-result-card ${a.isCorrect ? 'mock-result-card-correct' : a.userSelection === null ? 'mock-result-card-blank' : 'mock-result-card-wrong'}`}
            >
              <div className="mock-result-card-num">
                {idx + 1}.{' '}
                {a.isCorrect ? '✓' : a.userSelection === null ? '—' : '✗'}{' '}
                <span className="mock-result-card-subject">[{q.subject}]</span>
              </div>
              <div className="mock-result-card-stem">{q.stem}</div>
              <div className="mock-result-card-options">
                {Object.entries(q.options).map(([key, text]) => {
                  const isUser = a.userSelection === key
                  const isCorrect = q.answer === key
                  return (
                    <div
                      key={key}
                      className={`mock-result-option ${isCorrect ? 'mock-result-option-correct' : ''} ${isUser && !isCorrect ? 'mock-result-option-user-wrong' : ''}`}
                    >
                      <span className="mock-result-option-key">({key})</span>
                      <span className="mock-result-option-text">{text}</span>
                      {isUser && <span className="mock-result-option-tag"> ← 你選</span>}
                      {isCorrect && <span className="mock-result-option-tag"> ← 正解</span>}
                    </div>
                  )
                })}
              </div>
              {a.userSelection === null && (
                <div className="mock-result-card-unanswered">未作答</div>
              )}
              <div className="mock-result-card-explanation">
                <strong>詳解：</strong>
                {q.explanation && q.explanation.trim().length > 0
                  ? <span style={{ whiteSpace: 'pre-wrap' }}>{q.explanation}</span>
                  : EXPLANATION_FALLBACK}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
