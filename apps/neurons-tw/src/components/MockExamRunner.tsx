import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Question } from '@study-rpg/core'
import {
  clampIndex,
  createInitialMockState,
  firstUnanswered,
  isCorrectAnswer,
  mockExamReducer,
  navigatorCellStates,
  scoreMockExam,
  wrongOrUnansweredIndexes,
  type MockExamState,
} from '../lib/exam-set-mock'
import { recordQuestionResult } from '../lib/services/question-history'
import {
  saveMockDraft,
  deleteMockDraft,
  neuronsPaperKeyString,
  type NeuronsPaperKey,
} from '../lib/services/mock-exam-draft'
import { submitMockVariantRoll, type MockRollResult } from '../lib/services/mock-variant-gacha'
import { MockVariantRevealBadge } from './MockVariantRevealBadge'
import { Explanation } from './Explanation'
import { LocalPdfButton } from './LocalPdfButton'
import { useLocalPdfAvailable } from './useLocalPdfAvailable'
import { PrecedingContext } from './PrecedingContext'
import { QuestionFigure } from './QuestionFigure'
import { QuestionJumpGrid } from './QuestionJumpGrid'
import { EmojiIcon } from './EmojiIcon'

/**
 * 模擬考試 (mock-exam) runner — closed-book ordered run through a whole exam paper
 * (~100 questions). Answers are deferred & editable with free navigation; all
 * explanations reveal only at 全部送出, then a locked review. Wrong + unanswered
 * (送分 excluded) are written to the 錯題本 in one batch at submit, feeding the
 * ⚔️ 出征 pool. Pure-practice: NO maze energy / variant / connectome / DMN. The
 * state machine + scoring are the shared `@study-rpg/core` exam-set engine.
 *
 * Correctness follows the engine's single source of truth (`isCorrectAnswer`:
 * `disputed || key === answer`), deliberately ignoring `acceptedAnswers` so the
 * score and the per-option review highlight never disagree.
 *
 * Spec: openspec/specs/neurons-exam-set-expedition/spec.md (模擬考試 requirements)
 */

export interface MockResumeState {
  answers: Array<string | null>
  flaggedIndexes: number[]
  index: number
  startedAt: number
}

const DRAFT_SAVE_DEBOUNCE_MS = 400

function buildInitialMockState(pool: Question[], resume?: MockResumeState): MockExamState {
  if (!resume) return createInitialMockState(pool.length)
  return {
    index: clampIndex(resume.index, pool.length),
    answers: resume.answers.slice(),
    flagged: new Set(resume.flaggedIndexes),
    submitted: false,
  }
}

export function MockExamRunner({
  pool,
  paperLabel,
  paperKey,
  resume,
  onClose,
}: {
  pool: Question[]
  paperLabel: string
  paperKey: NeuronsPaperKey
  resume?: MockResumeState
  onClose: () => void
}): JSX.Element {
  const sessionPool = pool
  const [state, dispatch] = useReducer(mockExamReducer, undefined, () =>
    buildInitialMockState(sessionPool, resume),
  )
  const startedAtRef = useRef(resume?.startedAt ?? Date.now())
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [rollResult, setRollResult] = useState<MockRollResult | null>(null)
  const stemRef = useRef<HTMLParagraphElement>(null)

  const q = sessionPool[state.index]
  // When the local-PDF action is available, default the inline 詳解 collapsed (PDF is richer).
  const pdfAvailable = useLocalPdfAvailable(q?.id ?? '')
  const score = useMemo(() => scoreMockExam(sessionPool, state.answers), [sessionPool, state.answers])
  const cellStates = useMemo(() => navigatorCellStates(sessionPool, state), [sessionPool, state])
  const hasProgress = state.answers.some((a) => a !== null)

  // Move focus to the stem on navigation (a11y).
  useEffect(() => {
    if (!state.submitted) stemRef.current?.focus()
  }, [state.index, state.submitted])

  // Debounced draft save while answering; deleted explicitly on submit / discard.
  useEffect(() => {
    if (state.submitted || sessionPool.length === 0) return
    const startedAt = startedAtRef.current
    const timer = setTimeout(() => {
      void saveMockDraft({
        key: paperKey,
        questionIds: sessionPool.map((x) => x.id),
        answers: state.answers,
        flaggedIndexes: [...state.flagged],
        index: state.index,
        startedAt,
        now: Date.now(),
      })
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.answers, state.flagged, state.index, state.submitted, sessionPool, paperKey])

  function doSubmit(): void {
    setConfirmSubmit(false)
    // Batch-write the 錯題本: every non-disputed wrong OR unanswered question. family
    // = q.subject (neurons recordQuestionResult convention). everWrong monotonic-OR.
    const wrongs = wrongOrUnansweredIndexes(sessionPool, state.answers)
    dispatch({ type: 'submit', at: Date.now() })
    // Best-effort batch 錯題本 write — distinct question ids, safe to run together.
    void Promise.all(
      wrongs.map((i) => recordQuestionResult(sessionPool[i].id, sessionPool[i].subject, false)),
    ).catch((err) => console.error('[mock-exam] 錯題本 batch write failed:', err))
    void deleteMockDraft(paperKey)
    // Independent mock-variant gacha roll (add-neurons-exam-set-mock-variants):
    // after the 錯題本 write, score-weighted roll gated by the per-paper daily cap.
    // null = cap already spent today (exam still recorded; only the roll is capped).
    // No maze/energy/DMN credit.
    void submitMockVariantRoll(neuronsPaperKeyString(paperKey), score.examScore)
      .then((res) => {
        if (res) setRollResult(res)
      })
      .catch((err) => console.error('[mock-exam] variant roll failed:', err))
  }

  function onSubmitClick(): void {
    if (score.unansweredCount > 0) setConfirmSubmit(true)
    else doSubmit()
  }

  function restart(): void {
    startedAtRef.current = Date.now()
    dispatch({ type: 'reset' })
  }

  function requestClose(): void {
    if (!state.submitted && hasProgress) {
      setConfirmLeave(true)
      return
    }
    onClose()
  }

  function leaveDiscard(): void {
    setConfirmLeave(false)
    void deleteMockDraft(paperKey)
    onClose()
  }

  return (
    <div style={backdropStyle} onClick={requestClose} role="dialog" aria-modal="true" aria-label={`模擬考試 ${paperLabel}`}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headStyle}>
          <h2 style={titleStyle}>
            <EmojiIcon char="📝" size={22} /> 模擬考試 · {paperLabel}
          </h2>
          <button type="button" style={closeStyle} onClick={requestClose} aria-label="關閉">
            ✕
          </button>
        </header>

        <div style={bodyStyle}>
          {sessionPool.length === 0 ? (
            <p style={emptyStyle}>這一卷沒有可作答的題目。</p>
          ) : (
            <>
              {state.submitted && (
                <section style={summaryStyle} aria-live="polite">
                  <p style={summaryScoreStyle}>
                    答對 {score.correctCount} / {sessionPool.length}
                    {score.unansweredCount > 0 && (
                      <span style={summaryNoteStyle}>（未作答 {score.unansweredCount} 題以錯計）</span>
                    )}
                  </p>
                  <p style={summaryMetricsStyle}>
                    正確率 {score.accuracyPct.toFixed(1)}%　·　國考換算 {score.examScore.toFixed(1)} 分
                    <span style={summaryMetricsNoteStyle}>（滿分 100）</span>
                  </p>
                  <ul style={subjectBreakdownStyle}>
                    {Object.entries(score.bySubject).map(([subject, tally]) => (
                      <li key={subject}>
                        {subject}：{tally.correct} / {tally.total}
                      </li>
                    ))}
                  </ul>
                  {rollResult && <MockVariantRevealBadge result={rollResult} />}
                  <button type="button" style={primaryBtnStyle} onClick={restart}>
                    再考一次
                  </button>
                </section>
              )}

              <div style={progressStyle}>
                {state.submitted ? '檢討模式' : '模擬考試'} · 第 {state.index + 1} / {sessionPool.length} 題
              </div>

              <PrecedingContext question={q} />
              <p style={stemStyle} ref={stemRef} tabIndex={-1}>
                {q.stem}
              </p>
              <QuestionFigure key={q.id} q={q} />

              {state.submitted && q.disputed && (
                <p style={disputedBannerStyle}>⚖ 此題為送分題，任何選項皆計為答對。</p>
              )}

              <div style={optionsGridStyle}>
                {Object.keys(q.options)
                  .sort()
                  .map((key) => {
                    const selected = state.answers[state.index] === key
                    const isCorrect = state.submitted && isCorrectAnswer(q, key)
                    const isWrongPick = state.submitted && selected && !q.disputed && key !== q.answer
                    let border = '2px solid #d4c4a0'
                    let bg = '#fdf8ee'
                    if (state.submitted) {
                      // Mutually exclusive: a key is either a wrong pick or correct, never both.
                      if (isWrongPick) {
                        border = '2px solid #c44d4d'
                        bg = '#f8e8e8'
                      } else if (isCorrect) {
                        border = '2px solid #4d8c4d'
                        bg = '#e8f5e8'
                      }
                    } else if (selected) {
                      border = '2px solid #d4a04d'
                      bg = '#fdf2e0'
                    }
                    const dim = state.submitted && !isCorrect && !selected
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        style={{ ...optionCardStyle, border, background: bg, opacity: dim ? 0.65 : 1 }}
                        onClick={() => dispatch({ type: 'answer', index: state.index, key })}
                        disabled={state.submitted}
                      >
                        <span style={optionKeyStyle}>{key}</span>
                        <span>{q.options[key]}</span>
                      </button>
                    )
                  })}
              </div>

              {state.submitted && q.explanation && (
                <>
                  <LocalPdfButton questionId={q.id} />
                  <details style={explanationStyle} open={!pdfAvailable}>
                    <summary style={explanationSummaryStyle}>
                      <EmojiIcon char="📖" size={15} /> 詳解
                    </summary>
                    <Explanation question={q} textStyle={explanationBodyStyle} />
                    {(q as { explanationSource?: string }).explanationSource === 'ai-generated' && (
                      <p style={aiNoteStyle}>🤖 此詳解由 AI 生成，未經陽明國考小組審定，僅供參考</p>
                    )}
                  </details>
                </>
              )}
              {state.submitted && <p style={questionIdStyle}>題號 {q.id}</p>}

              <QuestionJumpGrid
                states={cellStates}
                flagged={state.flagged}
                currentIndex={state.index}
                answeredCount={score.answeredCount}
                unansweredCount={score.unansweredCount}
                reviewMode={state.submitted}
                onJump={(i) => dispatch({ type: 'goTo', index: i })}
              />
            </>
          )}
        </div>

        {sessionPool.length > 0 && (
          <footer style={footerStyle}>
            <div style={navRowStyle}>
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => dispatch({ type: 'goTo', index: state.index - 1 })}
                disabled={state.index === 0}
              >
                ‹ 上一題
              </button>
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => dispatch({ type: 'goTo', index: state.index + 1 })}
                disabled={state.index >= sessionPool.length - 1}
              >
                下一題 ›
              </button>
            </div>
            {!state.submitted && (
              <div style={actionRowStyle}>
                <button
                  type="button"
                  style={state.flagged.has(state.index) ? flagBtnOnStyle : flagBtnStyle}
                  aria-pressed={state.flagged.has(state.index)}
                  onClick={() => dispatch({ type: 'toggleFlag', index: state.index })}
                >
                  ⚑ {state.flagged.has(state.index) ? '取消標記' : '標記'}
                </button>
                <button type="button" style={primaryBtnStyle} onClick={onSubmitClick}>
                  全部送出
                </button>
              </div>
            )}
            {state.submitted && (
              <button type="button" style={primaryBtnStyle} onClick={onClose}>
                關閉
              </button>
            )}
          </footer>
        )}

        {confirmSubmit && (
          <ConfirmPanel
            title="還有未作答的題目"
            body={`目前有 ${score.unansweredCount} 題未作答，送出後將以錯計並記入錯題本。`}
            actions={[
              { label: '回去檢查', onClick: () => setConfirmSubmit(false), kind: 'secondary' },
              {
                label: '跳第一題未作答',
                onClick: () => {
                  setConfirmSubmit(false)
                  const first = firstUnanswered(state.answers)
                  if (first >= 0) dispatch({ type: 'goTo', index: first })
                },
                kind: 'secondary',
              },
              { label: '仍要送出', onClick: doSubmit, kind: 'primary' },
            ]}
          />
        )}

        {confirmLeave && (
          <ConfirmPanel
            title="要離開模擬考試嗎？"
            body="你的作答已自動保存，下次可從題庫繼續。"
            actions={[
              { label: '保留進度離開', onClick: onClose, kind: 'primary' },
              { label: '放棄本次', onClick: leaveDiscard, kind: 'secondary' },
              { label: '取消', onClick: () => setConfirmLeave(false), kind: 'secondary' },
            ]}
          />
        )}
      </div>
    </div>
  )
}

function ConfirmPanel({
  title,
  body,
  actions,
}: {
  title: string
  body: string
  actions: Array<{ label: string; onClick: () => void; kind: 'primary' | 'secondary' }>
}): JSX.Element {
  return (
    <div style={confirmBackdropStyle} role="alertdialog" aria-modal="true" aria-label={title}>
      <div style={confirmCardStyle}>
        <h3 style={confirmTitleStyle}>{title}</h3>
        <p style={confirmBodyStyle}>{body}</p>
        <div style={confirmActionsStyle}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              style={a.kind === 'primary' ? primaryBtnStyle : secondaryBtnStyle}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic, matches QuizModal / QuestionBankPage) ──

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  // Reflow beside the docked PDF panel; var defaults to 0px → full-screen when panel closed.
  top: 0,
  left: 0,
  bottom: 0,
  right: 'var(--pdf-panel-width, 0px)',
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}
const cardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: '10px',
  width: 'min(640px, 100%)',
  maxHeight: '92vh',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
}
const headStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.8rem 1rem',
  borderBottom: '1px solid #d4c4a0',
}
const titleStyle: React.CSSProperties = { fontSize: '1.05rem', color: '#3a2a1a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }
const closeStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#8c6d4a' }
const bodyStyle: React.CSSProperties = { padding: '1rem 1.25rem', overflowY: 'auto', flex: 1 }
const emptyStyle: React.CSSProperties = { color: '#8c6d4a', fontSize: '0.95rem', textAlign: 'center', padding: '2rem 0' }
const progressStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#8c6d4a', fontWeight: 600, marginBottom: '0.7rem' }
const stemStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  marginTop: 0,
  marginBottom: '1rem',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'var(--font-legible)',
}
const optionsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: '0.6rem',
}
const optionCardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  padding: '0.75rem 0.9rem',
  borderRadius: '6px',
  textAlign: 'left',
  fontSize: '0.95rem',
  lineHeight: 1.5,
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  overflowWrap: 'anywhere',
  cursor: 'pointer',
}
const optionKeyStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  background: '#d4a04d',
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 700,
  flexShrink: 0,
}
const disputedBannerStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  padding: '0.4rem 0.6rem',
  background: '#fff8e0',
  border: '1px solid #d4a04d',
  borderRadius: '4px',
  fontSize: '0.88rem',
  color: '#5a3f29',
  fontFamily: 'var(--font-legible)',
}
const explanationStyle: React.CSSProperties = { marginTop: '0.9rem' }
const explanationSummaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: '0.9rem', color: '#5a3f29', fontWeight: 600, marginBottom: '0.4rem' }
const explanationBodyStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'var(--font-legible)',
}
const aiNoteStyle: React.CSSProperties = { marginTop: '0.6rem', fontSize: '0.74rem', lineHeight: 1.5, color: '#8a5a2a', fontStyle: 'italic', fontFamily: 'var(--font-legible)' }
const questionIdStyle: React.CSSProperties = { marginTop: '0.6rem', fontSize: '0.72rem', color: '#9b8c70', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }
const footerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderTop: '1px solid #d4c4a0',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.6rem',
}
const navRowStyle: React.CSSProperties = { display: 'flex', gap: '0.4rem' }
const navBtnStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  background: '#f4ecd8',
  color: '#3a2a1a',
  border: '1px solid #c9ad7f',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
}
const actionRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }
const primaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
}
const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px solid #b8893a',
  borderRadius: '6px',
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const flagBtnStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px dashed #b8893a',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
}
const flagBtnOnStyle: React.CSSProperties = { ...flagBtnStyle, background: '#d4a04d', color: '#fff', border: '1px solid #b8893a' }
const summaryStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #c9ad7f',
  borderRadius: '8px',
  padding: '0.8rem 1rem',
  marginBottom: '0.9rem',
}
const summaryScoreStyle: React.CSSProperties = { fontSize: '1.1rem', fontWeight: 700, color: '#3a2a1a', margin: '0 0 0.3rem' }
const summaryNoteStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 400, color: '#c44d4d', marginLeft: '0.4rem' }
const summaryMetricsStyle: React.CSSProperties = { fontSize: '0.9rem', color: '#4d8c4d', fontWeight: 600, margin: '0 0 0.5rem' }
const summaryMetricsNoteStyle: React.CSSProperties = { fontSize: '0.76rem', color: '#8c6d4a', fontWeight: 400, marginLeft: '0.4rem' }
const subjectBreakdownStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '0 0 0.7rem',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem 0.9rem',
  fontSize: '0.82rem',
  color: '#3a2a1a',
}
const confirmBackdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '10px',
  padding: '1rem',
}
const confirmCardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: '8px',
  padding: '1rem 1.1rem',
  width: 'min(360px, 100%)',
}
const confirmTitleStyle: React.CSSProperties = { fontSize: '1rem', color: '#3a2a1a', margin: '0 0 0.4rem' }
const confirmBodyStyle: React.CSSProperties = { fontSize: '0.86rem', color: '#5a3f29', lineHeight: 1.6, margin: '0 0 0.8rem', fontFamily: 'var(--font-legible)' }
const confirmActionsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.5rem' }
