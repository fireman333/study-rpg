import { useEffect, useMemo, useState } from 'react'
import {
  QUIZ_BUG_TARGETS,
  QUIZ_BUG_TARGET_TO_CATEGORY,
  type BugReportCategory,
  type QuizBugTarget,
} from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import {
  submitQuizInlineBugReport,
  type QuizQuestionSnapshot,
} from '../services/bug-report'

const TARGET_LABEL: Record<QuizBugTarget, string> = {
  question: '📝 題目本身有錯',
  image: '🖼️ 題目圖片有問題',
  explanation: '📑 詳解有錯',
  other: '🤷 簡答（其他意見）',
}

const MAX_DESCRIPTION_LENGTH = 200

export interface QuizBugReportSheetProps {
  /** Sheet is rendered when this is non-null (snapshot taken at open time). */
  snapshot: QuizQuestionSnapshot | null
  onClose: () => void
  onSubmitted: () => void
  /** Escape hatch — pass current target + description so BugReportModal can pre-fill. */
  onEscapeHatch: (preset: {
    category: BugReportCategory | undefined
    whatHappened: string | undefined
  }) => void
}

export function QuizBugReportSheet({
  snapshot,
  onClose,
  onSubmitted,
  onEscapeHatch,
}: QuizBugReportSheetProps) {
  const { user, signInWithGoogle } = useAuth()
  const [target, setTarget] = useState<QuizBugTarget | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Reset state every time a new sheet opens with a fresh snapshot.
  useEffect(() => {
    if (snapshot) {
      setTarget(null)
      setDescription('')
      setSubmitError(null)
      setSubmitting(false)
    }
  }, [snapshot])

  const canSubmit = useMemo(
    () =>
      !!user && !!snapshot && !!target && description.trim().length > 0 && !submitting,
    [user, snapshot, target, description, submitting],
  )

  if (!snapshot) return null

  async function handleSubmit() {
    if (!canSubmit || !target || !snapshot) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitQuizInlineBugReport({
        target,
        description: description.trim(),
        snapshot,
      })
      onSubmitted()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  function handleEscape() {
    onEscapeHatch({
      category: target ? QUIZ_BUG_TARGET_TO_CATEGORY[target] : undefined,
      whatHappened: description.trim() || undefined,
    })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="回報這題">
      <div
        className="modal-card quiz-bug-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="quiz-bug-sheet__head">
          <h2>🐞 回報這題</h2>
          <button
            type="button"
            className="quiz-bug-sheet__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ✕
          </button>
        </header>

        {!user ? (
          <div className="quiz-bug-sheet__login-gate">
            <p>請先登入再提交（這樣我才能跟你 follow-up）</p>
            <button
              type="button"
              className="quiz-bug-sheet__signin-btn"
              onClick={() => void signInWithGoogle()}
            >
              用 Google 登入
            </button>
          </div>
        ) : (
          <div className="quiz-bug-sheet__body">
            <p className="quiz-bug-sheet__meta">
              題號 <code>{snapshot.questionId}</code>
            </p>

            {snapshot.inMockExam && (
              <p className="quiz-bug-sheet__notice">
                模擬考進行中，送出後可繼續答題
              </p>
            )}

            <fieldset className="quiz-bug-sheet__fieldset">
              <legend>你想回報什麼？</legend>
              <div className="quiz-bug-sheet__radio-stack">
                {QUIZ_BUG_TARGETS.map((t) => (
                  <label key={t} className="quiz-bug-sheet__radio">
                    <input
                      type="radio"
                      name="quiz-bug-target"
                      value={t}
                      checked={target === t}
                      onChange={() => setTarget(t)}
                    />
                    <span>{TARGET_LABEL[t]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="quiz-bug-sheet__field">
              <span>簡單描述（最多 {MAX_DESCRIPTION_LENGTH} 字）</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                rows={2}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="例：答案標 B 但詳解推 C"
              />
              <span className="quiz-bug-sheet__counter">
                {description.length} / {MAX_DESCRIPTION_LENGTH}
              </span>
            </label>

            {submitError && (
              <div className="quiz-bug-sheet__error">送出失敗：{submitError}</div>
            )}

            <div className="quiz-bug-sheet__actions">
              <button
                type="button"
                className="quiz-bug-sheet__escape"
                onClick={handleEscape}
                disabled={submitting}
              >
                展開完整表單 →
              </button>
              <button
                type="button"
                className="quiz-bug-sheet__cancel"
                onClick={onClose}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                className="quiz-bug-sheet__submit"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {submitting ? '送出中…' : '送出'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
