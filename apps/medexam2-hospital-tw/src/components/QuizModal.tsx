import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BugReportCategory, Question, SubjectId } from '@study-rpg/core'
import { RARITY_LABELS, getSpecialtyMultiplier } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { loadPoolSizeMap, pickQuestionById, pickRandomQuestion } from '../lib/quiz'
import {
  recordCorrectAnswer,
  recordWrongAnswer,
  applyQualityModifier,
  restoreDefaultSrs,
  type DefaultPathSnapshot,
  type PrevSrsSnapshot,
} from '../lib/mastery'
import { emitGraceToast } from '../lib/grace-toast'
import { applyQuizReward } from '../services/quiz-rewards'
import { maybeRollNonReadingEvent } from '../services/non-reading-event-trigger'
import { getNextDueCardForSubject } from '../lib/srs-scheduler'
import { lookupSprite } from '../lib/sprite-lookup'
import { toggleBookmark, useBookmark } from '../services/bookmarks'
import {
  getQuizCompanionDoctorId,
  setQuizCompanionDoctorId,
} from '../services/quiz-companion'
import { effectiveYearSet, getYearFilter } from '../services/year-filter'
import { BugReportModal } from './BugReportModal'
import { EmojiIcon } from './EmojiIcon'
import { ExplanationMarkdown } from './ExplanationMarkdown'
import { QuizBugReportSheet } from './QuizBugReportSheet'
import { buildQuestionSnapshot, type QuizQuestionSnapshot } from '../services/bug-report'
import { incrementEasyClick, incrementGuessedClick } from '../lib/srs-telemetry'
import { useQuizHotkeys } from '../lib/use-quiz-hotkeys'

const ALL_SUBJECT_IDS: SubjectId[] = [
  '內科', '家醫科', '小兒科', '皮膚科', '神經內科', '精神科',
  '外科', '泌尿科', '骨科', '婦產科', '復健科', '眼科', '耳鼻喉科', '麻醉科',
]

// Unicode subscript digits used for keyboard hotkey badges on choice + footer
// buttons. Only ₁–₄ are needed (max 4 choices, max 3 modifier buttons).
const HOTKEY_SUBSCRIPTS = ['₁', '₂', '₃', '₄'] as const

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
  // Cross-session questionHistory id cache for the skipSrs path. Keyed by
  // subjectId so a subject switch can reuse / invalidate independently.
  // Populated lazily on first skipSrs=true tick per (modal session, subject);
  // appended to in handlePickOption so fresh answers don't re-roll within
  // the same session.
  const historyIdsRef = useRef<Map<SubjectId, Set<string>>>(new Map())
  const wasFromDueRef = useRef<boolean>(false)
  const [boundDoctorId, setBoundDoctorId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [skipSrs, setSkipSrs] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([])
  // SRS state captured BEFORE recordCorrectAnswer overwrites it. Used by the
  // 「太簡單」/「我亂猜的」 button handlers to compute the modifier path from the
  // correct baseline (not stacked on the default-path write). Reset on each pick.
  const prevSrsRef = useRef<PrevSrsSnapshot | null>(null)
  // SRS state captured AFTER the default-path recordCorrectAnswer commits.
  // Restored when the player deselects a modifier by clicking the same
  // ✨ / 🤔 button a second time. Reset on each pick.
  const defaultPostSrsRef = useRef<DefaultPathSnapshot | null>(null)
  // Tracks which opt-in modifier (if any) the player has clicked for the
  // current reveal. Reset on each pick. Buttons toggle is-active visual based
  // on this.
  const [activeQuality, setActiveQuality] = useState<'easy' | 'guessed' | null>(null)
  const firedExhaustedRef = useRef<Set<SubjectId>>(new Set())
  // Keyboard-only pre-submit highlight (mouse path stays one-step click=submit).
  // Reset to null whenever the next question loads or the modal opens fresh.
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null)
  const modalCardRef = useRef<HTMLDivElement | null>(null)
  const [bugSheetSnapshot, setBugSheetSnapshot] = useState<QuizQuestionSnapshot | null>(null)
  const [bugFullModalOpen, setBugFullModalOpen] = useState(false)
  const [bugFullModalPrefill, setBugFullModalPrefill] = useState<{
    category?: BugReportCategory
    whatHappened?: string
  }>({})

  const doctorsLive = useLiveQuery(
    () => db.doctors.orderBy('obtainedAt').reverse().toArray(),
    [],
  )
  const doctors = doctorsLive ?? []

  // Persisted per-device companion choice. `undefined` while the query is still
  // resolving; `null` once we know no row exists; string once a doctor is pinned.
  const persistedCompanionIdLive = useLiveQuery(() => getQuizCompanionDoctorId(), [])

  // Persisted year-filter preference; reactive so HomePage chip toggles take
  // effect on the next pick without remounting the modal.
  const persistedYearFilter = useLiveQuery(() => getYearFilter(), [], null) ?? null
  const yearFilter = useMemo(() => effectiveYearSet(persistedYearFilter), [persistedYearFilter])
  const yearFilterRef = useRef<Set<number>>(yearFilter)
  useEffect(() => {
    yearFilterRef.current = yearFilter
  }, [yearFilter])

  // Resolve initial bound doctor only after BOTH queries have completed at least
  // one load (avoid the one-frame "newest then swap to remembered" flicker).
  useEffect(() => {
    if (boundDoctorId !== null) return
    if (doctorsLive === undefined || persistedCompanionIdLive === undefined) return
    if (doctorsLive.length === 0) return

    const persistedDoctor =
      persistedCompanionIdLive !== null
        ? doctorsLive.find((d) => d.id === persistedCompanionIdLive)
        : undefined

    if (persistedDoctor) {
      setBoundDoctorId(persistedDoctor.id)
      return
    }

    // No persisted ID, or persisted doctor retired/cleared → fall back to newest
    // and overwrite the meta row so subsequent opens stay consistent.
    const fallback = doctorsLive[0]
    setBoundDoctorId(fallback.id)
    void setQuizCompanionDoctorId(fallback.id)
  }, [doctorsLive, persistedCompanionIdLive, boundDoctorId])

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
    setHighlightedKey(null)
    if (resetSeen) {
      seenIdsRef.current = new Set()
      consumedDueIdsRef.current = new Set()
      // Invalidate the cross-session history cache for this subject so the
      // next skipSrs tick rebuilds from current Dexie state (catches any new
      // rows synced in or written between modal sessions).
      historyIdsRef.current.delete(forSubject)
    }

    // Use the latest persisted year-filter snapshot (ref avoids closing over a
    // stale value when the player toggles chips between renders).
    const activeYearFilter = yearFilterRef.current

    // skipSrs path: hydrate (or reuse cached) cross-session questionHistory
    // id set for this subject, used as `excludeIds` so the random picker
    // surfaces only never-answered questions. Done up front because both
    // the picker call AND the exhaustion-toast condition need the set.
    let historyIds: Set<string> | undefined
    if (skipSrs) {
      historyIds = historyIdsRef.current.get(forSubject)
      if (!historyIds) {
        const keys = await db.questionHistory
          .where('subjectId')
          .equals(forSubject)
          .primaryKeys()
        historyIds = new Set(keys as string[])
        historyIdsRef.current.set(forSubject, historyIds)
        if (import.meta.env.DEV) {
          console.info('[skipSrs] excluding %d ids for %s', historyIds.size, forSubject)
        }
      }
    }

    // Due-first: walk the cap-allocated due queue for this subject, skipping
    // orphans (questionHistory rows whose questionId no longer exists in the
    // content pack).
    // Skip this entire block if `skipSrs` is enabled.
    if (!skipSrs) {
      let dueRow = await getNextDueCardForSubject(
        forSubject,
        consumedDueIdsRef.current,
        Date.now(),
        { yearFilter: activeYearFilter },
      )
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
        dueRow = await getNextDueCardForSubject(
          forSubject,
          consumedDueIdsRef.current,
          Date.now(),
          { yearFilter: activeYearFilter },
        )
      }
    }

    // No due card available → fall back to random new question.
    // skipSrs=true: pass excludeIds so previously-answered questions cannot
    // be returned (hard filter). skipSrs=false: omit excludeIds so the
    // existing "random from full pool with repeats allowed" semantics are
    // preserved (the depleted-due-queue fall-back path).
    wasFromDueRef.current = false
    const q = await pickRandomQuestion(forSubject, seenIdsRef.current, {
      yearFilter: activeYearFilter,
      ...(skipSrs ? { excludeIds: historyIds } : {}),
    })
    if (!q) {
      setPoolEmpty(true)
      setQuestion(null)
    } else {
      setPoolEmpty(false)
      setQuestion(q)

      // Exhaustion toast detection. When skipSrs=true the effective "covered"
      // set is the union of in-session seen and cross-session history; when
      // skipSrs=false fall back to in-session seenIds only (prior behavior).
      // Year-filter awareness of `poolSize` is tracked separately by the
      // follow-up change `fix-medexam2-exhaustion-toast-year-filter-pool-size`.
      const poolSizeMap = await loadPoolSizeMap()
      const poolSize = poolSizeMap.get(forSubject) ?? 0
      const effectiveCoveredSize = skipSrs
        ? new Set([...seenIdsRef.current, ...(historyIds ?? [])]).size
        : seenIdsRef.current.size
      if (
        poolSize > 0 &&
        effectiveCoveredSize >= poolSize &&
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

  // Take focus on open so document keydown listener captures keystrokes from
  // the moment the modal mounts (no autofocus on any button → Space-as-scroll
  // doesn't trigger button click).
  useEffect(() => {
    modalCardRef.current?.focus()
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
    setActiveQuality(null) // reset modifier state for the new reveal
    // 送分題: 考選部判定全部給分 — 任何選項都算對
    const wasCorrect = question.disputed || optionKey === question.answer
    const payload = { subjectId, questionId: question.id }
    const capturedQuestion = question
    const capturedDoctor = boundDoctor

    // Capture prev SRS state BEFORE recordCorrectAnswer overwrites it — used
    // by the 「太簡單」/「我亂猜的」 buttons if the player clicks one. Only
    // meaningful on correct answers (buttons hidden on wrong).
    if (wasCorrect) {
      const priorRow = await db.questionHistory.get(capturedQuestion.id)
      prevSrsRef.current = {
        interval: priorRow?.interval ?? 0,
        easeFactor: priorRow?.easeFactor ?? 2.5,
        nextDueAt: priorRow?.nextDueAt ?? null,
      }
    } else {
      prevSrsRef.current = null
    }

    // Atomic answer + reward — single Dexie transaction wrapping both helpers.
    // Inner `db.transaction(...)` calls inside recordCorrectAnswer / applyQuizReward
    // join this outer scope when their table scope is a subset, so all writes
    // commit or roll back together (spec: hospital-quiz "Reward writes are
    // atomic with mastery / affinity writes").
    //
    // Tables in this scope split into two groups:
    //   (1) write targets — mastery / questionHistory / affinity / gameCounters /
    //       monotonicCounters / tickets / bannerUnlockBonusLog / achievements / meta
    //   (2) sub-tx scope-superset for `applyQuizReward` reads —
    //       - eventLog / fateCardHistory / retirementLog / doctors / rooms:
    //         read by `buildAchievementStats` (opens a sub-tx and Dexie
    //         rejects sub-tx scope that isn't a subset of the parent); rooms
    //         is the P1-specialty-match branch added in
    //         fix-medexam2-achievement-stats-rooms-scope
    //       - hospitalEquipment: read by `getOwnedEquipment` for the reputation
    //         multiplier
    //       These tables are read-only here; without them every quiz answer
    //       rolls back with `SubTransactionError` / `NotFoundError` (regression
    //       shipped with add-achievement-system Phase 6+7 commit ff57375 on
    //       2026-05-23, compounded by add-hospital-equipment-medexam2 a31672a
    //       on 2026-05-24).
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
        db.eventLog,
        db.fateCardHistory,
        db.retirementLog,
        db.doctors,
        db.rooms,
        db.achievements,
        db.meta,
        db.hospitalEquipment,
      ],
      async () => {
        // Read isFresh BEFORE recordCorrectAnswer writes the questionHistory row.
        const priorHistory = await db.questionHistory.get(capturedQuestion.id)
        const isFresh = priorHistory === undefined
        if (wasCorrect) {
          await recordCorrectAnswer(
            payload,
            {
              subjectId: capturedDoctor.subjectId,
              rarity: capturedDoctor.rarity,
            },
            {
              onTransitionToCorrect: (qid) => emitGraceToast({ questionId: qid }),
            },
          )
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
    // Keep the skipSrs history cache fresh: append the just-answered id so
    // subsequent 「下一題」clicks within the same modal session don't re-roll
    // a fresh answer (avoids the 3-roll budget being wasted on a question we
    // just persisted to questionHistory).
    historyIdsRef.current.get(subjectId)?.add(capturedQuestion.id)

    // Snapshot the post-default-write SRS state for potential modifier
    // deselect (player toggling ✨ 太簡單 / 🤔 我亂猜的 off via a second click).
    // Only meaningful on correct answers — modifier buttons are hidden on
    // wrong, so wrong-path skips the snapshot entirely.
    if (wasCorrect) {
      const postRow = await db.questionHistory.get(capturedQuestion.id)
      if (postRow) {
        defaultPostSrsRef.current = {
          interval: postRow.interval,
          easeFactor: postRow.easeFactor,
          nextDueAt: postRow.nextDueAt,
          everWrong: postRow.everWrong,
          lastAnsweredAt: postRow.lastAnsweredAt,
        }
      }
    }

    for (const text of rewardResult.toastTexts) emitToast(text)

    // Hook A — `rewire-hospital-events-to-non-reading-trigger`: every quiz
    // answer commit is an interaction opportunity to roll a hospital event /
    // ER consult. Service handles gates (reading-session / cooldown / mutex /
    // probability) internally and is safe to call unconditionally.
    void maybeRollNonReadingEvent('quiz')
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
      // Clear modifier state on advance — next reveal starts fresh.
      setActiveQuality(null)
      prevSrsRef.current = null
      defaultPostSrsRef.current = null
    }
  }

  /**
   * Click handler for 「太簡單」 / 「我亂猜的」 opt-in modifier buttons.
   * Three-state UX: default (no modifier) / easy / guessed.
   *
   * - Click an inactive button → applies that modifier (replaces any prior).
   * - Click the currently active button → deselects, restoring the SRS row
   *   to the snapshot captured immediately after the default-path write.
   *
   * Deselect closes a real UX gap: default vs. modifier produce different
   * SRS schedules, and a debounced no-op cannot express the player's intent
   * to revert. The snapshot lives in `defaultPostSrsRef` (set by
   * handlePickOption on the correct-answer path).
   */
  async function handleQualityClick(target: 'easy' | 'guessed'): Promise<void> {
    if (!revealed || !question || picking) return
    if (activeQuality === target) {
      // Deselect: revert SRS row to default-path snapshot.
      const snapshot = defaultPostSrsRef.current
      if (!snapshot) return // safety: snapshot missing → can't restore
      await restoreDefaultSrs(question.id, snapshot)
      setActiveQuality(null)
      return
    }
    const prev = prevSrsRef.current
    if (!prev) return // safety: only on correct (captured set there)
    await applyQualityModifier(question.id, target, prev)
    setActiveQuality(target)
    // DEV-only telemetry: count click on first selection per question.
    if (target === 'easy') incrementEasyClick()
    else incrementGuessedClick()
  }

  const optionKeys = useMemo(() => (question ? Object.keys(question.options).sort() : []), [question])

  const specialtyMultiplier = boundDoctor
    ? getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, subjectId)
    : 1.0

  // Keyboard hotkey wiring — see lib/use-quiz-hotkeys.ts for dispatch contract.
  const phase = revealed ? 'answered' : 'asking'
  const qualityAvailable =
    revealed &&
    question !== null &&
    selectedOption !== null &&
    (question.disputed || selectedOption === question.answer)
  useQuizHotkeys({
    isOpen: true,
    phase,
    optionKeys,
    highlightedKey,
    qualityAvailable,
    scrollContainerRef: modalCardRef,
    setHighlightedKey,
    onSubmit: (key) => void handlePickOption(key),
    onToggleBookmark: () => {
      if (question) void toggleBookmark(question.id)
    },
    onToggleEasy: () => void handleQualityClick('easy'),
    onToggleGuessed: () => void handleQualityClick('guessed'),
    onAdvance: () => void handleNext(),
  })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--quiz"
        onClick={(e) => e.stopPropagation()}
        ref={modalCardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="答題"
      >
        <header className="quiz-modal__head">
          <h2 className="quiz-modal__title"><EmojiIcon char="📚" size={24} /> {subjectId}</h2>
          <button type="button" className="quiz-modal__close" onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>

        <div
          className="quiz-modal__partner"
          style={
            boundDoctor
              ? ({
                  borderLeft: `4px solid var(--rarity-${boundDoctor.rarity.toLowerCase()})`,
                  ['--rarity-color' as string]: `var(--rarity-${boundDoctor.rarity.toLowerCase()})`,
                } as CSSProperties)
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
                  return url ? <img src={url} alt="" /> : <EmojiIcon char="🩺" size={32} />

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
                  <EmojiIcon char="✨" size={16} /> {specialtyMultiplier}×
                </span>
              )}
              {doctors.length > 1 && (
                <select
                  className="quiz-modal__partner-picker"
                  value={boundDoctor.id}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setBoundDoctorId(nextId)
                    void setQuizCompanionDoctorId(nextId)
                  }}
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
            <p className="quiz-modal__empty">
              {yearFilter.size < 10
                ? '此組合 0 題，請放寬年份篩選或切換科目。'
                : '這個科別目前沒有題目可抽。換一科試試。'}
            </p>
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
                  <EmojiIcon char="📷" size={18} /> 此題含附圖但尚未補齊（{question.id}）
                </div>
              )}
              {question.disputed && revealed && (
                <p className="quiz-modal__disputed">
                  <EmojiIcon char="⚖" size={18} /> 送分題（考選部判定全部給分，任何選項都算對）
                </p>
              )}
              <ul className="quiz-modal__options">
                {optionKeys.map((key, idx) => {
                  // 送分題: 揭曉時所有選項都標 correct（任選都對）
                  const isSelected = key === selectedOption
                  const isCorrect = revealed && (question.disputed || key === question.answer)
                  const isWrongPick = revealed && isSelected && !question.disputed && key !== question.answer
                  const isHighlighted = !revealed && highlightedKey === key
                  const className = [
                    'quiz-modal__option',
                    isCorrect ? 'quiz-modal__option--correct' : '',
                    isWrongPick ? 'quiz-modal__option--wrong' : '',
                    revealed && !isCorrect && !isSelected ? 'quiz-modal__option--dim' : '',
                    isHighlighted ? 'quiz-modal__option--highlighted' : '',
                  ].filter(Boolean).join(' ')
                  const hotkeyNum = idx + 1
                  const subscript = HOTKEY_SUBSCRIPTS[idx]
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={className}
                        onClick={() => void handlePickOption(key)}
                        disabled={revealed || !boundDoctor}
                        aria-keyshortcuts={hotkeyNum <= 4 ? String(hotkeyNum) : undefined}
                      >
                        <span className="quiz-modal__option-key">{key}.</span>
                        <span className="quiz-modal__option-text">{question.options[key]}</span>
                        {subscript && (
                          <span className="quiz-hotkey-badge" aria-hidden="true">
                            {subscript}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {revealed && (
                <div className="quiz-modal__explanation">
                  <h3>解析</h3>
                  <ExplanationMarkdown text={question.explanation ?? ''} />
                </div>
              )}

              {revealed &&
                selectedOption !== null &&
                selectedOption !== question.answer &&
                !question.disputed && <InlinePromoteHint />}
            </>
          )}
        </div>

        <footer className="quiz-modal__foot">
          <button
            type="button"
            className="quiz-bug-trigger quiz-bug-trigger--in-footer"
            onClick={openBugSheet}
            aria-label="回報這題"
            title="回報這題"
            disabled={!question}
          >
            <EmojiIcon char="🐞" size={20} />
          </button>
          {revealed && question && (
            <FooterBookmarkToggle questionId={question.id} />
          )}
          {revealed && question && selectedOption !== null && (
            (question.disputed || selectedOption === question.answer) && (
              <>
                <button
                  type="button"
                  className={`quiz-quality-btn quiz-quality-easy${activeQuality === 'easy' ? ' is-active' : ''}`}
                  onClick={() => void handleQualityClick('easy')}
                  title="這題很簡單 — 下次更晚再考"
                  disabled={picking}
                  aria-keyshortcuts="2"
                >
                  <EmojiIcon char="✨" size={16} />
                  <span>太簡單</span>
                  <span className="quiz-hotkey-badge" aria-hidden="true">₂</span>
                </button>
                <button
                  type="button"
                  className={`quiz-quality-btn quiz-quality-guessed${activeQuality === 'guessed' ? ' is-active' : ''}`}
                  onClick={() => void handleQualityClick('guessed')}
                  title="其實是亂猜 — 明天再考一次驗證"
                  disabled={picking}
                  aria-keyshortcuts="3"
                >
                  <EmojiIcon char="🤔" size={16} />
                  <span>我亂猜的</span>
                  <span className="quiz-hotkey-badge" aria-hidden="true">₃</span>
                </button>
              </>
            )
          )}
          <button
            type="button"
            className="quiz-modal__next"
            onClick={() => void handleNext()}
            disabled={!revealed || picking}
            aria-keyshortcuts={revealed ? 'Enter' : undefined}
          >
            下一題
            {revealed && (
              <span className="quiz-hotkey-badge quiz-hotkey-badge--enter" aria-hidden="true">
                ↵
              </span>
            )}
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
        <EmojiIcon char={bookmarked ? '⭐' : '☆'} size={20} />
      </button>
    </div>
  )
}

/**
 * Wrong-answer hint banner — appears above the footer when the player answered
 * wrong, pointing them at the ⭐ toggle now living in the footer row.
 */
function InlinePromoteHint() {
  return (
    <div className="quiz-modal__inline-promote quiz-modal__inline-promote--wrong">
      <span className="quiz-modal__inline-promote-hint">
        想之後再複習這題？點下方 ⭐ 加入手動收藏永久保留。
      </span>
    </div>
  )
}

/**
 * Footer-row ★ bookmark toggle. Same Dexie row as the corner-of-modal toggle
 * (`useBookmark` is live-query), so both render in sync. Sized to match the
 * 46px 🐞 / 太簡單 / 我亂猜的 / 下一題 chips so the whole footer lines up.
 */
function FooterBookmarkToggle({ questionId }: { questionId: string }) {
  const bookmarked = !!useBookmark(questionId)
  return (
    <button
      type="button"
      role="switch"
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '取消手動收藏' : '加入手動收藏'}
      aria-keyshortcuts="1"
      className={`quiz-modal__footer-bookmark${
        bookmarked ? ' quiz-modal__footer-bookmark--on' : ''
      }`}
      onClick={() => void toggleBookmark(questionId)}
    >
      <EmojiIcon char={bookmarked ? '⭐' : '☆'} size={18} />
      <span>{bookmarked ? '已收藏' : '加入收藏'}</span>
      <span className="quiz-hotkey-badge" aria-hidden="true">₁</span>
    </button>
  )
}
