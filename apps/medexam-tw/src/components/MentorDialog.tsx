import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question, QuestionId } from '@study-rpg/core'

const GREETINGS = [
  '今天來試試這個',
  '我覺得這題你要看一下',
  '來，挑戰一下',
  '測測你',
  '這題不錯，做做看',
]
const PRAISES = [
  '不錯！記得這結論',
  '對！這題重點就在這',
  '答對了，繼續加油',
  '漂亮！',
  '沒問題',
]
const TEACHES = [
  '沒事，下次會記得',
  '這個容易混淆',
  '來看詳解',
  '再看一遍',
  '下次注意',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
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

interface Props {
  question: Question
  /** Number of pending questions in backlog (current question included). Used for "尚有 N 題" hint. */
  backlogRemaining: number
  /** "you are mastered" extra message — true when mode=='random' fallback. */
  showMasteredHint: boolean
  /** Theme sprite URLs. Mentor portrait keys are 'mentor-male' / 'mentor-female' (optional per theme-pack-contract). */
  sprites: Record<string, string>
  /** Called after the user submits an answer. Caller handles backlog pop + reward + state. */
  onAnswered: (result: { questionId: QuestionId; correct: boolean; elapsedMs: number }) => void
  /** Called when the user skips this question. Caller handles backlog pop without reward. */
  onSkipped: (questionId: QuestionId) => void
  /** Called when the dialog is dismissed (close button after seeing feedback, or after auto-close on correct). */
  onClose: () => void
  /** Whether to suppress the skip confirmation prompt (set after first skip in same session). */
  suppressSkipConfirm: boolean
  /** Called when a skip-confirmation actually fires for the first time, so caller can suppress next ones. */
  onFirstSkipConfirm: () => void
}

export function MentorDialog({
  question,
  backlogRemaining,
  showMasteredHint,
  sprites,
  onAnswered,
  onSkipped,
  onClose,
  suppressSkipConfirm,
  onFirstSkipConfirm,
}: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [answered, setAnswered] = useState(false)
  const [autoCloseTimer, setAutoCloseTimer] = useState<number | null>(null)
  const startedAtRef = useRef<number>(Date.now())

  // Sprite key chosen once per dialog instance (random male / female / text-only fallback)
  const portraitUrl = useMemo<string | null>(() => {
    const candidates: string[] = []
    if (sprites['mentor-male']) candidates.push(sprites['mentor-male'])
    if (sprites['mentor-female']) candidates.push(sprites['mentor-female'])
    if (candidates.length === 0) return null
    return candidates[Math.floor(Math.random() * candidates.length)]
  }, [sprites])

  // NPC dialogue: greeting on open, praise/teach after answer
  const dialogue = useMemo<string>(() => {
    if (!answered) return pickRandom(GREETINGS)
    return picked === question.answer ? pickRandom(PRAISES) : pickRandom(TEACHES)
  }, [answered, picked, question.answer])

  // Auto-close on correct answer after 2 seconds
  useEffect(() => {
    if (!answered || picked !== question.answer) return
    const t = window.setTimeout(() => {
      onClose()
    }, 2_000)
    setAutoCloseTimer(t)
    return () => window.clearTimeout(t)
    // intentionally exclude onClose from deps — caller may re-create closure each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, picked, question.answer])

  function handleAnswer(option: string) {
    if (answered) return
    setPicked(option)
    setAnswered(true)
    const elapsedMs = Date.now() - startedAtRef.current
    onAnswered({ questionId: question.id, correct: option === question.answer, elapsedMs })
  }

  function handleSkipClick() {
    if (suppressSkipConfirm) {
      onSkipped(question.id)
      onClose()
      return
    }
    setShowSkipConfirm(true)
  }

  function confirmSkip() {
    onFirstSkipConfirm()
    onSkipped(question.id)
    setShowSkipConfirm(false)
    onClose()
  }

  const isCorrect = picked === question.answer
  const explanation = question.explanation?.trim() ?? ''

  return (
    <div className="mentor-dialog-overlay" onClick={() => !autoCloseTimer && onClose()}>
      <div className="mentor-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="mentor-dialog-header">
          {portraitUrl ? (
            <img src={portraitUrl} alt="導師" className="mentor-dialog-portrait" />
          ) : (
            <div className="mentor-dialog-portrait mentor-dialog-portrait-fallback">今日導師</div>
          )}
          <div className="mentor-dialog-title-block">
            <div className="mentor-dialog-title">今日導師題</div>
            {backlogRemaining > 1 && (
              <div className="mentor-dialog-backlog">尚有 {backlogRemaining} 題待答</div>
            )}
            {showMasteredHint && !answered && (
              <div className="mentor-dialog-mastered">你已通透 — 隨機複習</div>
            )}
          </div>
        </header>

        <div className="mentor-dialog-bubble">「{dialogue}」</div>

        <article className="mentor-dialog-question">
          <div className="mentor-dialog-subject">[{question.subject}]</div>
          <div className="mentor-dialog-stem">{question.stem}</div>
          <div className="mentor-dialog-options">
            {Object.entries(question.options).map(([key, text]) => {
              const isUser = picked === key
              const isAnswerKey = key === question.answer
              const cls = [
                'mentor-dialog-option',
                isUser ? 'mentor-dialog-option-selected' : '',
                answered && isAnswerKey ? 'mentor-dialog-option-correct' : '',
                answered && isUser && !isAnswerKey ? 'mentor-dialog-option-wrong' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={key}
                  className={cls}
                  disabled={answered}
                  onClick={() => handleAnswer(key)}
                >
                  <span className="mentor-dialog-option-key">({key})</span>
                  <span className="mentor-dialog-option-text">{text}</span>
                  {answered && isUser && (
                    <span className="mentor-dialog-option-tag"> ← 你選</span>
                  )}
                  {answered && isAnswerKey && (
                    <span className="mentor-dialog-option-tag"> ← 正解</span>
                  )}
                </button>
              )
            })}
          </div>

          {answered && !isCorrect && (
            <div className="mentor-dialog-explanation">
              <strong>詳解：</strong>
              {explanation.length > 0
                ? <span style={{ whiteSpace: 'pre-wrap' }}>{explanation}</span>
                : EXPLANATION_FALLBACK}
            </div>
          )}
        </article>

        <footer className="mentor-dialog-footer">
          {!answered && (
            <button className="mentor-dialog-skip" onClick={handleSkipClick}>跳過</button>
          )}
          {answered && (
            <button className="mentor-dialog-close" onClick={onClose}>
              {isCorrect ? '繼續' : '關閉'}
            </button>
          )}
        </footer>

        {showSkipConfirm && (
          <div className="mentor-dialog-skip-confirm" onClick={(e) => e.stopPropagation()}>
            <p>今天不接？skip 不算 streak check-in</p>
            <div className="mentor-dialog-skip-actions">
              <button onClick={() => setShowSkipConfirm(false)}>繼續作答</button>
              <button className="mentor-dialog-skip-confirm-btn" onClick={confirmSkip}>確定跳過</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
