import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BugReportCategory, Question, SubjectId } from '@study-rpg/core'
import { RARITY_LABELS, getSpecialtyMultiplier } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { loadPoolSizeMap, pickQuestionById, pickRandomQuestion } from '../lib/quiz'
import { recordCorrectAnswer, recordWrongAnswer } from '../lib/mastery'
import { applyQuizReward } from '../services/quiz-rewards'
import { getNextDueCardForSubject } from '../lib/srs-scheduler'
import { lookupSprite } from '../lib/sprite-lookup'
import { toggleBookmark, useBookmark } from '../services/bookmarks'
import { BugReportModal } from './BugReportModal'
import { QuizBugReportSheet } from './QuizBugReportSheet'
import { buildQuestionSnapshot, type QuizQuestionSnapshot } from '../services/bug-report'

const ALL_SUBJECT_IDS: SubjectId[] = [
  '內科', '家醫科', '小兒科', '皮膚科', '神經內科', '精神科',
  '外科', '泌尿科', '骨科', '婦產科', '復健科', '眼科', '耳鼻喉科', '麻醉科',
]

interface QuizModalProps {
  initialSubject: SubjectId
  onClose: () => void
}

export function QuizModal({ initialSubject, onClose }: QuizModalProps) {
  const db = getHospitalDB()
  const [subjectId, setSubjectId] = useState<SubjectId>(initialSubject)
  const [question, setQuestion] = useState<Question | null>(null)
  const [loading, setLoading] = useState(true)
  const [poolEmpty, setPoolEmpty] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const consumedDueIdsRef = useRef<Set<string>>(new Set())
  const wasFromDueRef = useRef<boolean>(false)
  const [boundDoctorId, setBoundDoctorId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [skipSrs, setSkipSrs] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([])
  const firedExhaustedRef = useRef<Set<SubjectId>>(new Set())
  const [bugSheetSnapshot, setBugSheetSnapshot] = useState<QuizQuestionSnapshot | null>(null)
  const [bugFullModalOpen, setBugFullModalOpen] = useState(false)
  const [bugFullModalPrefill, setBugFullModalPrefill] = useState<{
    category?: BugReportCategory
    whatHappened?: string
  }>({})

  const doctors = useLiveQuery(
    () => db.doctors.orderBy('obtainedAt').reverse().toArray(),
    [],
  ) ?? []

  // Default bound doctor = most recent on first render with doctors available
  useEffect(() => {
    if (boundDoctorId === null && doctors.length > 0) {
      setBoundDoctorId(doctors[0].id)
    }
  }, [doctors, boundDoctorId])

  const boundDoctor: DoctorRow | undefined = useMemo(
    () => doctors.find((d) => d.id === boundDoctorId),
    [doctors, boundDoctorId],
  )

  function emitToast(text: string) {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  function openBugSheet() {
    if (!question) return
    setBugSheetSnapshot(buildQuestionSnapshot(question, selectedOption, false))
  }

  function handleBugSubmitted() {
    setBugSheetSnapshot(null)
    emitToast('✓ 已送出回報，感謝你！')
  }

  async function loadNextQuestion(forSubject: SubjectId, resetSeen = false): Promise<void> {
    setLoading(true)
    setSelectedOption(null)
    setRevealed(false)
    if (resetSeen) {
      seenIdsRef.current = new Set()
      consumedDueIdsRef.current = new Set()
    }

    // Due-first: walk the cap-allocated due queue for this subject, skipping
    // orphans (questionHistory rows whose questionId no longer exists in the
    // content pack).
    // Skip this entire block if `skipSrs` is enabled.
    if (!skipSrs) {
      let dueRow = await getNextDueCardForSubject(forSubject, consumedDueIdsRef.current)
      while (dueRow) {
        const dueQuestion = await pickQuestionById(dueRow.questionId)
        if (dueQuestion) {
          consumedDueIdsRef.current.add(dueRow.questionId)
          wasFromDueRef.current = true
          setPoolEmpty(false)
          setQuestion(dueQuestion)
          setLoading(false)
          return
        }
        // Orphan: mark consumed and try next due row.
        consumedDueIdsRef.current.add(dueRow.questionId)
        dueRow = await getNextDueCardForSubject(forSubject, consumedDueIdsRef.current)
      }
    }

    // No due card available → fall back to random new question.
    wasFromDueRef.current = false
    const q = await pickRandomQuestion(forSubject, seenIdsRef.current)
    if (!q) {
      setPoolEmpty(true)
      setQuestion(null)
    } else {
      setPoolEmpty(false)
      setQuestion(q)

      // Exhaustion toast detection
      const poolSizeMap = await loadPoolSizeMap()
      const poolSize = poolSizeMap.get(forSubject) ?? 0
      if (
        poolSize > 0 &&
        seenIdsRef.current.size >= poolSize &&
        seenIdsRef.current.has(q.id) &&
        !firedExhaustedRef.current.has(forSubject)
      ) {
        emitToast('本科獨立題已掃完，繼續會開始重練')
        firedExhaustedRef.current.add(forSubject)
      }
    }
    setLoading(false)
  }

  // Initial question load
  useEffect(() => {
    void loadNextQuestion(initialSubject, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubjectChange(next: SubjectId): void {
    if (next === subjectId) return
    setSubjectId(next)
    void loadNextQuestion(next, true)
  }

  async function handlePickOption(optionKey: string): Promise<void> {
    if (revealed || !question || !boundDoctor) return
    setSelectedOption(optionKey)
    setRevealed(true)
    // 送分題: 考選部判定全部給分 — 任何選項都算對
    const wasCorrect = question.disputed || optionKey === question.answer
    const payload = { subjectId, questionId: question.id }
    const capturedQuestion = question
    const capturedDoctor = boundDoctor

    // Atomic answer + reward — single Dexie transaction wrapping both helpers.
    // Inner `db.transaction(...)` calls inside recordCorrectAnswer / applyQuizReward
    // join this outer scope when their table scope is a subset, so all writes
    // commit or roll back together (spec: hospital-quiz "Reward writes are
    // atomic with mastery / affinity writes").
    const rewardResult = await db.transaction(
      'rw',
      [
        db.mastery,
        db.questionHistory,
        db.affinity,
        db.gameCounters,
        db.monotonicCounters,
        db.tickets,
        db.bannerUnlockBonusLog,
      ],
      async () => {
        // Read isFresh BEFORE recordCorrectAnswer writes the questionHistory row.
        const priorHistory = await db.questionHistory.get(capturedQuestion.id)
        const isFresh = priorHistory === undefined
        if (wasCorrect) {
          await recordCorrectAnswer(payload, {
            subjectId: capturedDoctor.subjectId,
            rarity: capturedDoctor.rarity,
          })
        } else {
          await recordWrongAnswer(payload)
        }
        // Reads post-mastery-write affinity for banner-unlock detection. No-op for
        // genuinely wrong answers (no reward), but still runs for 送分題 disputed
        // questions where any option counts as correct.
        return applyQuizReward({
          subjectId,
          boundDoctor: { subjectId: capturedDoctor.subjectId, rarity: capturedDoctor.rarity },
          questionId: capturedQuestion.id,
          isCorrect: wasCorrect,
          isDisputed: !!capturedQuestion.disputed,
          isFresh,
        })
      },
    )
    for (const text of rewardResult.toastTexts) emitToast(text)
  }

  async function handleNext(): Promise<void> {
    if (!revealed || picking) return
    setPicking(true)
    try {
      // Only add new-picker questions to seenIds. Due cards stay out so they
      // can re-appear immediately if their next interval falls due again.
      if (question && !wasFromDueRef.current) seenIdsRef.current.add(question.id)
      await loadNextQuestion(subjectId, false)
    } finally {
      setPicking(false)
    }
  }

  const optionKeys = useMemo(() => (question ? Object.keys(question.options).sort() : []), [question])

  const specialtyMultiplier = boundDoctor
    ? getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, subjectId)
    : 1.0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--quiz" onClick={(e) => e.stopPropagation()}>
        <header className="quiz-modal__head">
          <h2 className="quiz-modal__title">📚 {subjectId}</h2>
          <div className="quiz-modal__head-actions">
            <button
              type="button"
              className="quiz-bug-trigger"
              onClick={openBugSheet}
              aria-label="回報這題"
              title="回報這題"
              disabled={!question}
            >
              🐞
            </button>
            <button type="button" className="quiz-modal__close" onClick={onClose} aria-label="關閉">
              ✕
            </button>
          </div>
        </header>

        <div
          className="quiz-modal__partner"
          style={
            boundDoctor
              ? { borderLeft: `4px solid var(--rarity-${boundDoctor.rarity.toLowerCase()})` }
              : undefined
          }
        >
          {boundDoctor ? (
            <>
              <span className="quiz-modal__partner-sprite">
                {(() => {
                  const url = lookupSprite(
                    boundDoctor.spriteKey,
                    THEME_PIXEL_HOSPITAL.sprites,
                    boundDoctor.rarity,
                  )
                  return url ? <img src={url} alt="" /> : <span aria-hidden>🩺</span>
                })()}
              </span>
              <span className="quiz-modal__partner-info">
                <span className="quiz-modal__partner-name">{boundDoctor.name}</span>
                <span className="quiz-modal__partner-meta">
                  {boundDoctor.rarity} {RARITY_LABELS[boundDoctor.rarity]} · 跟你一起練題
                </span>
              </span>
              {specialtyMultiplier > 1.0 && (
                <span className="quiz-modal__partner-bonus" title={`同科 ${boundDoctor.subjectId} 醫師 — 掌握加成 ${specialtyMultiplier}×`}>
                  ✨ {specialtyMultiplier}×
                </span>
              )}
              {doctors.length > 1 && (
                <select
                  className="quiz-modal__partner-picker"
                  value={boundDoctor.id}
                  onChange={(e) => setBoundDoctorId(e.target.value)}
                  aria-label="切換練題醫師"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.rarity})
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <p className="quiz-modal__no-doctor">請先招募醫師才能學習</p>
          )}
        </div>

        <div className="quiz-modal__subject-row">
          <label className="quiz-modal__subject-label">科別</label>
          <select
            className="quiz-modal__subject-dropdown"
            value={subjectId}
            onChange={(e) => handleSubjectChange(e.target.value as SubjectId)}
          >
            {ALL_SUBJECT_IDS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="quiz-modal__skip-srs">
          <label className="quiz-modal__skip-srs-label">
            <input
              type="checkbox"
              role="switch"
              aria-checked={skipSrs}
              checked={skipSrs}
              onChange={(e) => setSkipSrs(e.target.checked)}
            />
            <span>跳過 SRS（純隨機新題）</span>
          </label>
          <span className="quiz-modal__skip-srs-hint">
            （不影響 SRS 排程，到期題仍會記）
          </span>
        </div>

        <div className="quiz-modal__body">
          {loading && <p className="quiz-modal__loading">載入題目中…</p>}
          {!loading && poolEmpty && (
            <p className="quiz-modal__empty">這個科別目前沒有題目可抽。換一科試試。</p>
          )}
          {!loading && question && (
            <>
              <QuestionMetaRow questionId={question.id} />
              <p className="quiz-modal__stem">{question.stem}</p>
              {question.imagePath && (
                <div className="quiz-modal__image">
                  <img
                    src={`${import.meta.env.BASE_URL}${question.imagePath}`}
                    alt="題目附圖"
                  />
                </div>
              )}
              {question.hasImage && !question.imagePath && (
                <div className="quiz-modal__image-missing">
                  📷 此題含附圖但尚未補齊（{question.id}）
                </div>
              )}
              {question.disputed && revealed && (
                <p className="quiz-modal__disputed">
                  ⚖️ 送分題（考選部判定全部給分，任何選項都算對）
                </p>
              )}
              <ul className="quiz-modal__options">
                {optionKeys.map((key) => {
                  // 送分題: 揭曉時所有選項都標 correct（任選都對）
                  const isSelected = key === selectedOption
                  const isCorrect = revealed && (question.disputed || key === question.answer)
                  const isWrongPick = revealed && isSelected && !question.disputed && key !== question.answer
                  const className = [
                    'quiz-modal__option',
                    isCorrect ? 'quiz-modal__option--correct' : '',
                    isWrongPick ? 'quiz-modal__option--wrong' : '',
                    revealed && !isCorrect && !isSelected ? 'quiz-modal__option--dim' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={className}
                        onClick={() => void handlePickOption(key)}
                        disabled={revealed || !boundDoctor}
                      >
                        <span className="quiz-modal__option-key">{key}.</span>
                        <span className="quiz-modal__option-text">{question.options[key]}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {revealed && (
                <div className="quiz-modal__explanation">
                  <h3>解析</h3>
                  <pre className="quiz-modal__explanation-body">
                    {question.explanation || '（解析待補）'}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="quiz-modal__foot">
          <button
            type="button"
            className="quiz-modal__next"
            onClick={() => void handleNext()}
            disabled={!revealed || picking}
          >
            下一題
          </button>
        </footer>

        {toasts.length > 0 && (
          <div className="quiz-modal__toast-stack" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className="quiz-modal__toast">
                {t.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <QuizBugReportSheet
        snapshot={bugSheetSnapshot}
        onClose={() => setBugSheetSnapshot(null)}
        onSubmitted={handleBugSubmitted}
        onEscapeHatch={(preset) => {
          setBugSheetSnapshot(null)
          setBugFullModalPrefill(preset)
          setBugFullModalOpen(true)
        }}
      />

      <BugReportModal
        isOpen={bugFullModalOpen}
        onClose={() => {
          setBugFullModalOpen(false)
          setBugFullModalPrefill({})
        }}
        initialCategory={bugFullModalPrefill.category}
        initialWhatHappened={bugFullModalPrefill.whatHappened}
      />
    </div>
  )
}

function QuestionMetaRow({ questionId }: { questionId: string }) {
  const bookmarked = !!useBookmark(questionId)
  return (
    <div className="quiz-modal__question-meta">
      <span className="quiz-modal__question-meta-id">{questionId}</span>
      <button
        type="button"
        role="switch"
        aria-pressed={bookmarked}
        aria-label={bookmarked ? '取消收藏這題' : '收藏這題'}
        className="quiz-modal__bookmark-toggle"
        onClick={() => void toggleBookmark(questionId)}
      >
        {bookmarked ? '⭐' : '☆'}
      </button>
    </div>
  )
}
