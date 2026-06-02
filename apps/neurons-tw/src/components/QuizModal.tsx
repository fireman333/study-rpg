import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Question } from '@study-rpg/core'
import { db } from '../lib/db'
import { recordCorrectAnswer, recordIncorrectAnswer } from '../lib/services/connectome'
import { recordQuestionResult } from '../lib/services/question-history'
import { SpikeTrainFiring, AnswerFeedbackFlash } from '../lib/motion'
import { useQuizHotkeys, type QuizPhase } from '../lib/hooks/useQuizHotkeys'
import { toggleBookmark, useIsBookmarked } from '../lib/services/bookmarks'
import { toggleEasy, toggleGuessed, useFlag } from '../lib/services/question-flags'
import { useActiveSquad } from '../lib/services/study-squad'
import { SpriteSheetPlayer } from './SpriteSheetPlayer'
import SquadCelebration from './SquadCelebration'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'

interface Props {
  pool: Question[]
  onClose: () => void
  /**
   * Optional session-end callback (per add-neurons-study-squad). Fires once when
   * the player ends the session, with answered-session stats. The 出征 entry on
   * the homepage wires this to the no-op `onExpeditionComplete` reward seam;
   * normal quiz entries omit it (no-op).
   */
  onComplete?: (stats: { total: number; correct: number }) => void
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function QuizModal({ pool, onClose, onComplete }: Props): JSX.Element {
  // Build session pool once: exclude image-option questions + shuffle.
  const sessionPool = useMemo(
    () => shuffle(pool.filter((q) => !q.hasOptionImages)),
    [pool],
  )

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ outcome: 'correct' | 'incorrect'; nonce: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // Active squad — drives the correct-answer celebration (empty → no-op).
  const squad = useActiveSquad()
  // Tally correct answers this session for the onComplete seam; guard so the
  // session-end callback fires at most once.
  const correctCountRef = useRef(0)
  const completedRef = useRef(false)

  const handleClose = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true
      onComplete?.({ total: sessionPool.length, correct: correctCountRef.current })
    }
    onClose()
  }, [onClose, onComplete, sessionPool.length])

  const q: Question | undefined = sessionPool[idx]
  const exhausted = idx >= sessionPool.length

  const handlePick = useCallback(
    async (optionKey: string) => {
      if (picked !== null || busy || !q) return
      setBusy(true)
      try {
        setPicked(optionKey)
        const isCorrect =
          q.disputed === true ||
          optionKey === q.answer ||
          (q.acceptedAnswers?.includes(optionKey) ?? false)
        // Instant answer-feedback flash (non-blocking, sibling overlay).
        setFlash({ outcome: isCorrect ? 'correct' : 'incorrect', nonce: Date.now() })
        if (isCorrect) {
          correctCountRef.current += 1
          // Capture the triggering question's pre-answer `everWrong` for variant
          // provenance (救贖 individual). MUST read before recordQuestionResult
          // (below) flips it, and before recordCorrectAnswer fires the
          // slot-unlock that stamps provenance. Best-effort — cosmetic only.
          let wasRedemption = false
          try {
            wasRedemption = (await db.questionHistory.get(q.id))?.everWrong ?? false
          } catch {
            /* ignore — redemption flag is display-only */
          }
          await recordCorrectAnswer(q.subject, { wasRedemption })
        } else {
          await recordIncorrectAnswer(q.subject)
        }
        // Record per-question result for the 錯題 sub-tabs. Best-effort —
        // never break the answer flow if the history write fails.
        try {
          await recordQuestionResult(q.id, q.subject, isCorrect)
        } catch (err) {
          console.error('[question-history] failed to record result', err)
        }
      } finally {
        setBusy(false)
      }
    },
    [picked, busy, q],
  )

  const handleNext = useCallback(() => {
    setPicked(null)
    setHighlighted(null)
    setIdx((i) => i + 1)
    // Scroll the modal body back to top on next-question so the player sees
    // the new stem from the start rather than mid-scroll from the last reveal.
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [])

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Keyboard hotkeys: 1/2/3/4 highlight, Enter submit, Enter/Space advance,
  // Space/Shift+Space/↓↑/Home/End scroll the modal body container.
  const phase: QuizPhase = picked === null ? 'asking' : 'answered'
  const optionKeysForHotkey = useMemo<string[]>(() => {
    const cur = sessionPool[idx]
    return cur ? Object.keys(cur.options) : []
  }, [sessionPool, idx])
  const handleToggleBookmark = useCallback(() => {
    const cur = sessionPool[idx]
    if (!cur) return
    void toggleBookmark(cur)
  }, [sessionPool, idx])
  const handleToggleEasy = useCallback(() => {
    const cur = sessionPool[idx]
    if (!cur) return
    void toggleEasy(cur.id)
  }, [sessionPool, idx])
  const handleToggleGuessed = useCallback(() => {
    const cur = sessionPool[idx]
    if (!cur) return
    void toggleGuessed(cur.id)
  }, [sessionPool, idx])
  useQuizHotkeys({
    isOpen: sessionPool[idx] !== undefined && idx < sessionPool.length,
    phase,
    optionKeys: optionKeysForHotkey,
    highlightedKey: highlighted,
    scrollContainerRef,
    setHighlightedKey: setHighlighted,
    onSubmit: (key) => {
      setHighlighted(null)
      void handlePick(key)
    },
    onAdvance: handleNext,
    onToggleBookmark: handleToggleBookmark,
    onToggleEasy: handleToggleEasy,
    onToggleGuessed: handleToggleGuessed,
  })

  // An empty session pool (e.g. year filter × family yields 0 questions) must
  // NOT show the "答完" completion wording — fall through to the empty branch
  // below by gating the exhausted check on a non-empty pool.
  if (exhausted && sessionPool.length > 0) {
    return (
      <div
        className="modal-backdrop"
        style={backdropStyle}
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-label="答題完成"
      >
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <header style={headerStyle}>
            <span>題庫已答完</span>
            <button style={closeBtnStyle} onClick={handleClose} aria-label="關閉">
              ✕
            </button>
          </header>
          <div style={bodyStyle}>
            <p style={{ textAlign: 'center', color: '#5a3f29', margin: '2rem 0' }}>
              🎉 你已經答完本次 session 的所有題目（{sessionPool.length} 題）。<br />
              關閉後重新開啟可以再來一輪。
            </p>
          </div>
          <footer style={footerStyle}>
            <button style={primaryBtnStyle} onClick={handleClose}>
              結束
            </button>
          </footer>
        </div>
      </div>
    )
  }

  if (!q) {
    // sessionPool empty (entire corpus was image-option questions, unlikely but defensive)
    return (
      <div
        className="modal-backdrop"
        style={backdropStyle}
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-label="題庫空"
      >
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <header style={headerStyle}>
            <span>題庫空</span>
            <button style={closeBtnStyle} onClick={handleClose}>
              ✕
            </button>
          </header>
          <div style={bodyStyle}>
            <p style={{ textAlign: 'center', color: '#c44d4d' }}>
              所選年份下這個範圍沒有可作答的題目。<br />
              關閉後到上方調整年份篩選再試。
            </p>
          </div>
          <footer style={footerStyle}>
            <button style={primaryBtnStyle} onClick={handleClose}>
              結束
            </button>
          </footer>
        </div>
      </div>
    )
  }

  const optionKeys = Object.keys(q.options)
  const correctKey = q.answer
  // Keys that count as correct: disputed (一律給分) → all; multi (多選給分) → listed; else → the single answer.
  const acceptedKeys = q.disputed
    ? optionKeys
    : q.acceptedAnswers && q.acceptedAnswers.length > 0
      ? q.acceptedAnswers
      : [correctKey]
  const isCorrect = picked !== null && (q.disputed === true || acceptedKeys.includes(picked))
  const revealed = picked !== null
  // Hero correct-reaction: if the answered family has a featured animated variant
  // (slot-3 `correct` sheet present), play its flourish next to the spike train.
  // Only 藥理學 ships sheets in this slice; generalises as other families gain them.
  const heroReactionBase =
    isCorrect && SPRITE_MAP[`variant:${q.subject}:3:correct`] ? `variant:${q.subject}:3` : null

  return (
    <div
      className="modal-backdrop"
      style={backdropStyle}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="答題中"
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {flash && (
          <AnswerFeedbackFlash
            key={flash.nonce}
            outcome={flash.outcome}
            onComplete={() => setFlash(null)}
          />
        )}
        <style>{`
          @media (max-width: 600px) {
            .bookmark-btn-label { display: none; }
            .flag-btn-label { display: none; }
          }
        `}</style>
        <header style={headerStyle}>
          <span>
            第 {idx + 1} / {sessionPool.length} 題 · {q.subject}
          </span>
          <button style={closeBtnStyle} onClick={handleClose} aria-label="關閉">
            ✕
          </button>
        </header>

        <div style={bodyStyle} ref={scrollContainerRef}>
          <p style={stemStyle}>{q.stem}</p>
          <QuestionFigure key={q.id} q={q} />

          <div style={optionsGridStyle}>
            {optionKeys.map((key) => {
              const optText = q.options[key]
              let border = '2px solid #d4c4a0'
              let bg = '#fdf8ee'
              let boxShadow: string | undefined
              const isHighlighted = !revealed && key === highlighted
              if (revealed) {
                if (!q.disputed && acceptedKeys.includes(key)) {
                  border = '2px solid #4d8c4d' // green = correct answer (all accepted keys for 多選給分)
                  bg = '#e8f5e8'
                }
                if (key === picked) {
                  if (isCorrect) {
                    border = '2px solid #4d6dc4' // blue = selected & correct
                    bg = '#e8eef8'
                  } else {
                    border = '2px solid #c44d4d' // red = selected & wrong
                    bg = '#f8e8e8'
                  }
                }
              } else if (isHighlighted) {
                // Keyboard-driven highlight before commit. Same warm-gold accent
                // as mouse hover so the visual vocabulary stays consistent.
                border = '2px solid #d4a04d'
                bg = '#fdf2e0'
                boxShadow = '0 0 0 3px rgba(212, 160, 77, 0.25)'
              }
              const style: React.CSSProperties = {
                ...optionCardStyle,
                border,
                background: bg,
                cursor: picked !== null ? 'default' : 'pointer',
                opacity:
                  picked !== null && key !== picked && !acceptedKeys.includes(key) ? 0.65 : 1,
                ...(boxShadow ? { boxShadow } : {}),
              }
              return (
                <button
                  key={key}
                  style={style}
                  onClick={() => handlePick(key)}
                  disabled={picked !== null}
                  aria-pressed={isHighlighted}
                >
                  <span style={optionKeyStyle}>{key}</span>
                  <span>{optText}</span>
                </button>
              )
            })}
          </div>

          {revealed && (
            <div style={revealStyle}>
              {q.disputed && (
                <p style={disputedBannerStyle}>⚠️ 此題為送分題，任何選項皆計為答對。</p>
              )}
              {!q.disputed && q.acceptedAnswers && q.acceptedAnswers.length > 1 && (
                <p style={disputedBannerStyle}>
                  ⚠️ 此題官方更正為多個答案（{q.acceptedAnswers.join(' / ')}）皆計為答對。
                </p>
              )}
              <p style={resultLineStyle}>
                {isCorrect ? '✅ 答對' : '❌ 答錯'}
                {!q.disputed && ` · 正解：${acceptedKeys.join(' 或 ')}`}
                {isCorrect && (
                  <span style={spikeFireStyle} aria-hidden>
                    <SpikeTrainFiring key={`spike-${idx}`} width={120} />
                  </span>
                )}
              </p>
              {heroReactionBase && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.1rem' }} aria-hidden>
                  <SpriteSheetPlayer
                    key={`hero-correct-${idx}`}
                    spriteKeyBase={heroReactionBase}
                    state="correct"
                    size={104}
                  />
                </div>
              )}
              {/* Active-squad celebration — bounces on every correct answer
                  (empty squad → no-op). Per add-neurons-study-squad. */}
              {isCorrect && <SquadCelebration key={`squad-${idx}`} squad={squad} />}
              {q.explanation && (
                <details style={explanationStyle} open>
                  <summary style={explanationSummaryStyle}>📖 詳解</summary>
                  <div style={explanationBodyStyle}>{q.explanation}</div>
                </details>
              )}
              <p style={questionIdStyle}>題號 {q.id}</p>
            </div>
          )}
        </div>

        <footer style={footerStyle}>
          <BookmarkButton question={q} />
          {revealed && <FlagButtons questionId={q.id} />}
          {revealed ? (
            <>
              <button style={secondaryBtnStyle} onClick={handleClose}>
                結束
              </button>
              <button style={primaryBtnStyle} onClick={handleNext} autoFocus>
                下一題 →
              </button>
            </>
          ) : (
            <button style={secondaryBtnStyle} onClick={handleClose}>
              結束
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

/**
 * ✨ 太簡單 + 🤔 我亂猜的 toggle buttons — answered phase only.
 * Future SRS pipeline will consume these flags as scheduling inputs.
 */
function FlagButtons({ questionId }: { questionId: string }): JSX.Element {
  const { easyMarked, guessedMarked } = useFlag(questionId)
  return (
    <>
      <button
        type="button"
        style={easyMarked ? flagEasyActiveStyle : flagEasyStyle}
        onClick={() => void toggleEasy(questionId)}
        aria-pressed={easyMarked}
        aria-label={easyMarked ? '取消 ✨ 標記 (2)' : '標記 ✨ 太簡單 (2)'}
        title={easyMarked ? '取消 ✨ 標記（鍵盤 2）' : '標記 ✨ 太簡單（鍵盤 2）'}
      >
        <span aria-hidden>✨</span>
        <span className="flag-btn-label">太簡單</span>
      </button>
      <button
        type="button"
        style={guessedMarked ? flagGuessedActiveStyle : flagGuessedStyle}
        onClick={() => void toggleGuessed(questionId)}
        aria-pressed={guessedMarked}
        aria-label={guessedMarked ? '取消 🤔 標記 (3)' : '標記 🤔 我亂猜的 (3)'}
        title={guessedMarked ? '取消 🤔 標記（鍵盤 3）' : '標記 🤔 我亂猜的（鍵盤 3）'}
      >
        <span aria-hidden>🤔</span>
        <span className="flag-btn-label">我亂猜的</span>
      </button>
    </>
  )
}

/** ⭐ bookmark toggle button — lives in QuizModal footer, both phases. */
function BookmarkButton({ question }: { question: Question }): JSX.Element {
  const bookmarked = useIsBookmarked(question.id)
  return (
    <button
      type="button"
      style={bookmarked ? bookmarkBtnActiveStyle : bookmarkBtnStyle}
      onClick={() => void toggleBookmark(question)}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '取消收藏 (1)' : '收藏 (1)'}
      title={bookmarked ? '取消收藏（鍵盤 1）' : '收藏題目（鍵盤 1）'}
    >
      <span aria-hidden>{bookmarked ? '★' : '☆'}</span>
      <span className="bookmark-btn-label">{bookmarked ? '已收藏' : '收藏'}</span>
    </button>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 12, 30, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}

const modalStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fdf8ee',
  border: '2px solid #d4a04d',
  borderRadius: '10px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  width: '100%',
  maxWidth: '720px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#f5e6d3',
  fontWeight: 600,
  color: '#5a3f29',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.2rem',
  cursor: 'pointer',
  color: '#8c6d4a',
  padding: '0.25rem 0.5rem',
}

const bodyStyle: React.CSSProperties = {
  padding: '1.25rem',
  overflowY: 'auto',
  flex: 1,
}

const stemStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  marginTop: 0,
  marginBottom: '1.25rem',
  whiteSpace: 'pre-wrap',
}

/**
 * Renders the question's figure: an <img> when imagePath is set (prepend
 * Vite BASE_URL), a [圖] placeholder when the question is flagged hasImage but
 * has no figure available (never silently drop a figure), and nothing otherwise.
 * `key={q.id}` at the call site remounts this per question, resetting onError.
 */
function QuestionFigure({ q }: { q: Question }) {
  const [error, setError] = useState(false)
  if (q.imagePath && !error) {
    return (
      <div style={figureWrapStyle}>
        <img
          src={`${import.meta.env.BASE_URL}${q.imagePath}`}
          alt="題目附圖"
          style={figureImgStyle}
          onError={() => setError(true)}
        />
      </div>
    )
  }
  if (q.hasImage) {
    return <div style={figurePlaceholderStyle}>[圖] 此題原有附圖，暫無法顯示</div>
  }
  return null
}

const figureWrapStyle: React.CSSProperties = {
  margin: '0 0 1.25rem',
  display: 'flex',
  justifyContent: 'center',
}

const figureImgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '340px',
  objectFit: 'contain',
  border: '1px solid #d8c8a8',
  borderRadius: '6px',
  background: '#fff',
}

const figurePlaceholderStyle: React.CSSProperties = {
  margin: '0 0 1.25rem',
  padding: '0.9rem',
  border: '1px dashed #c9b890',
  borderRadius: '6px',
  color: '#8a7a5a',
  fontSize: '0.9rem',
  textAlign: 'center',
  background: '#faf6ec',
}

const optionsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: '0.6rem',
}

const optionCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  padding: '0.75rem 0.9rem',
  borderRadius: '6px',
  textAlign: 'left',
  fontSize: '0.95rem',
  lineHeight: 1.5,
  color: '#3a2a1a',
  fontFamily: 'inherit',
  transition: 'background 0.15s, border-color 0.15s',
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

const revealStyle: React.CSSProperties = {
  marginTop: '1.25rem',
  padding: '0.9rem 1rem',
  background: '#fff',
  border: '1px dashed #c4a04d',
  borderRadius: '6px',
}

const disputedBannerStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  padding: '0.4rem 0.6rem',
  background: '#fff8e0',
  border: '1px solid #d4a04d',
  borderRadius: '4px',
  fontSize: '0.88rem',
  color: '#5a3f29',
}

const resultLineStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '1rem',
  fontWeight: 600,
  color: '#3a2a1a',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

// Peripheral EEG spike-train burst on correct answer — sibling overlay, never
// gates the reward / next-question flow. (polish-neurons-clinical-machine-aesthetic)
const spikeFireStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 24,
  marginLeft: 'auto',
}

const explanationStyle: React.CSSProperties = {
  marginTop: '0.5rem',
}

const explanationSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#5a3f29',
  fontWeight: 600,
  marginBottom: '0.4rem',
}

const explanationBodyStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
}

const questionIdStyle: React.CSSProperties = {
  marginTop: '0.6rem',
  fontSize: '0.72rem',
  letterSpacing: '0.02em',
  color: '#9b8c70',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
}

const footerStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  borderTop: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '0.6rem',
  background: '#fdf8ee',
  flexWrap: 'wrap',
}

// BookmarkButton — left-aligned in footer, gets `margin-right: auto` to push
// the action buttons (結束 / 下一題) to the right. Subtle visual weight so it
// doesn't compete with the primary action.
const bookmarkBtnStyle: React.CSSProperties = {
  marginRight: 'auto',
  padding: '0.4rem 0.9rem',
  borderRadius: '6px',
  border: '1px solid #c4a878',
  background: 'transparent',
  color: '#8c6d4a',
  fontSize: '0.92rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  lineHeight: 1,
}

const bookmarkBtnActiveStyle: React.CSSProperties = {
  ...bookmarkBtnStyle,
  background: '#fdf2e0',
  borderColor: '#d4a04d',
  color: '#d4a04d',
}

// FlagButtons — ✨ 太簡單 / 🤔 我亂猜的 toggle buttons in answered phase.
// Share base layout with bookmark btn but use category-specific accent colors.
const flagBtnBaseStyle: React.CSSProperties = {
  padding: '0.4rem 0.7rem',
  borderRadius: '6px',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  lineHeight: 1,
}

const flagEasyStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px solid #c4a878',
}

const flagEasyActiveStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: '#fdf2e0',
  color: '#d4a04d',
  border: '1px solid #d4a04d',
}

const flagGuessedStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: 'transparent',
  color: '#5a7a99',
  border: '1px solid #aabfcf',
}

const flagGuessedActiveStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: '#e6eef5',
  color: '#6a9bc4',
  border: '1px solid #6a9bc4',
}

const baseBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.1rem',
  borderRadius: '6px',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid #d4a04d',
}

const primaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: '#d4a04d',
  color: '#fff',
}

const secondaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: 'transparent',
  color: '#5a3f29',
}
