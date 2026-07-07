import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Question, BinaryReviewPrev, BinaryReviewResult } from '@study-rpg/core'
import { QUIZ_BUG_TARGETS, QUIZ_BUG_TARGET_TO_CATEGORY, type QuizBugTarget } from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import { submitBugReport } from '../lib/services/bug-report'
import { recordCorrectAnswer, recordIncorrectAnswer } from '../lib/services/connectome'
import { recordQuestionResult } from '../lib/services/question-history'
import { reclassifiedFamily } from '../lib/question-family'
import {
  recordPrescriptionAnswer,
  recordCramRescueAnswer,
  type TierCrossing,
} from '../lib/services/prescription'
import {
  TIER_T1_NAME,
  TIER_T2_NAME,
  TIER_T3_NAME,
  TIER_T4_NAME,
  TIER_REACHED_MARK,
  TIER_ENERGY_LABEL,
} from '../lib/calm-copy'
import { flushFirstPullReveals } from '../lib/services/first-pull-reveal'
import {
  scheduleSrsForAnswer,
  applyEasyModifier,
  applyGuessedModifier,
  applyInsightModifier,
  restoreDefaultSrs,
} from '../lib/services/srs-scheduler'
import { SpikeTrainFiring, AnswerFeedbackFlash, streakFeedbackIntensity } from '../lib/motion'
import { getStreaks } from '../lib/services/streak'
import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import { readMazeEnergyState, affordableSettles, walkerFraction } from '../lib/maze/economy'
import { useQuizHotkeys, type QuizPhase } from '../lib/hooks/useQuizHotkeys'
import { toggleBookmark, useIsBookmarked } from '../lib/services/bookmarks'
import {
  toggleEasy,
  toggleGuessed,
  toggleWrongAnswer,
  toggleInsight,
  useFlag,
} from '../lib/services/question-flags'
import { enqueueQuickReview, useIsPinned } from '../lib/services/quick-review-queue'
import { useActiveSquad } from '../lib/services/study-squad'
import { SpriteSheetPlayer } from './SpriteSheetPlayer'
import { Explanation } from './Explanation'
import { LocalPdfButton } from './LocalPdfButton'
import { SHOW_INLINE_EXPLANATION } from '../lib/feature-flags'
import { EmojiIcon } from './EmojiIcon'
import SquadCelebration from './SquadCelebration'
import MazeExpedition, { ExpeditionRestoreStub } from './MazeExpedition'
import { QuestionFigure } from './QuestionFigure'
import { PrecedingContext } from './PrecedingContext'
import { ConceptLabelRow } from './ConceptLabelRow'
import { useConceptTags, conceptLabelsFor, conceptBankHref } from '../lib/concept-tags'
import { useExpeditionHidden, setExpeditionHiddenPref } from '../lib/expedition-visibility'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { liveQuery } from 'dexie'
import { db } from '../lib/db'

interface Props {
  pool: Question[]
  onClose: () => void
  /**
   * Optional session-end callback (per add-neurons-study-squad). Fires once when
   * the player ends the session, with answered-session stats. The 出征 entry on
   * the homepage wires this to the no-op `onExpeditionComplete` reward seam;
   * normal quiz entries omit it (no-op).
   */
  onComplete?: (stats: {
    total: number
    correct: number
    /**
     * Per-subject correct count this session. In the wrong-only 出征 pool every
     * correct IS a wrong→correct repair, so the wrong-pool expedition forwards this
     * to `creditConnectomeFromExpedition` (rework-neurons-connectome-expedition-driven).
     */
    correctBySubject: Record<string, number>
    /** Per-subject maze energy earned this session (post-multiplier) — the conduction batch. */
    energyBySubject: Record<string, number>
    /**
     * Question ids answered WRONG this session (deduped downstream) — feeds the
     * optional settlement「當場回鍋」session-repair pass
     * (add-neurons-weakness-radar-and-error-repair). Empty when nothing was missed.
     */
    wrongIds: string[]
    /**
     * Question ids answered CORRECT this session (in the wrong-only 出征 pool
     * every correct IS a wrong→correct repair) — the settlement hook intersects
     * these with the prescription plan's frozen `wrongEligibleQuestionIds` to
     * arm the synapse wire-key anti-farm gate
     * (add-neurons-prescription-tiers-and-sync, design D6).
     */
    correctIds: string[]
  }) => void
  /**
   * Preserve the incoming pool order instead of shuffling (per
   * add-neurons-quiz-mode-chips-and-srs). The 🔄 錯題 review mode passes a
   * pre-ordered oldest-due-first pool, so it must not be reshuffled. Defaults
   * to false (新題 / 隨機 / 出征 keep the existing shuffle).
   */
  preserveOrder?: boolean
  /**
   * Pure-practice mode (per tidy-neurons-homepage-ui): 模考 / 題庫 answers SHALL NOT
   * accrue maze energy, advance the walker, pull variants, bump the streak, or
   * credit the connectome. `questionHistory` (paper coverage + everWrong), the SRS
   * schedule, AND 今日處方箋 crediting STILL fire. The prescription credit is a
   * deliberate exception to practice-inert: answering a frozen-snapshot question
   * correctly IS repairing that connection regardless of entry point, so 考前猜題
   * practice visibly advances the daily 修煉 (no XP / gacha / game-streak granted).
   * Callers also omit `onComplete`, so no DMN draw axis is credited. Defaults to
   * false (養成 quiz / 出征 keep full rewards).
   */
  practice?: boolean
  /**
   * Session-repair「當場回鍋」pass (add-neurons-weakness-radar-and-error-repair,
   * Feature 4). Implies practice-inert (no maze energy / walker / streak / connectome),
   * AND — critically — records the result WITHOUT invoking the SRS scheduler, so a
   * question's `interval` / `easeFactor` / `nextDueAt` / `attempts` / `correctCount`
   * are preserved unchanged (`srsEffect: none`). It is an immediate retrieval-after-
   * error correction, not a scheduled review. NO DMN-draw-axis credit (callers omit
   * onComplete or ignore it). A correct answer earns only a UI-only「當場修復」stamp.
   * Defaults to false.
   */
  sessionRepair?: boolean
  /**
   * Credit today's 考前救援 bonus (add-neurons-cram-rescue-and-card-actions). Set by
   * the 考前猜題 (cram) practice entry: each answer (correct OR wrong) writes a
   * write-once daily meta key so the optional post-完成 bonus can read it. Synced
   * (write-once UNION, date-windowed — add-neurons-prescription-tiers-and-sync);
   * no dayComplete effect, no economy beyond the claim-gated tier grants its
   * recompute may cross. Defaults to false.
   */
  creditCramRescue?: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Quiz-time maze-energy feedback strip (add-neurons-maze-zoom-and-focus). A
 * display-only DOM strip shown above the 詳解 after a correct answer: the answered
 * family's sprite + the energy gained toward the next maze node. When `advanced`
 * (this answer crossed a node-settle threshold) it escalates to a one-shot
 * "walker advances one node" tween. `pointer-events: none` — never interactive; the
 * real settle/pull happens in the homepage useMaze reconcile. Reduced-motion shows
 * the static end-state (no tween).
 */
function EnergyFeedbackStrip({
  familyId,
  energyGain,
  progress,
  advanced,
  reducedMotion,
}: {
  familyId: string
  energyGain: number
  progress: number
  advanced: boolean
  reducedMotion: boolean
}): JSX.Element {
  const spriteUrl = SPRITE_MAP[`subject:${familyId}`] ?? ''
  const animate = advanced && !reducedMotion
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <div style={energyStripStyle} aria-hidden>
      <div style={energyStripTrackStyle}>
        {advanced && <span style={energyStripNodeStyle} />}
        {spriteUrl ? (
          <img
            src={spriteUrl}
            alt=""
            width={36}
            height={36}
            style={animate ? { ...energyStripSpriteStyle, animation: 'energy-advance 1.8s ease-out 1' } : energyStripSpriteStyle}
          />
        ) : (
          <EmojiIcon char="🧬" size={21} />
        )}
      </div>
      <div style={energyStripTextWrapStyle}>
        <div style={energyStripGainStyle}><EmojiIcon char="⚡" size={13} /> +{energyGain.toFixed(1)} 能量 · {familyId}</div>
        {advanced ? (
          <div style={energyStripAdvanceLabelStyle}><EmojiIcon char="🧠" size={13} /> 推進一格！抽出一隻神經元</div>
        ) : (
          <div style={energyStripBarTrackStyle}>
            <div style={{ ...energyStripBarFillStyle, width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

const energyStripStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '0.5rem 0',
  padding: '0.4rem 0.6rem',
  background: '#10122a',
  border: '1px solid #2c2f55',
  borderRadius: 8,
  pointerEvents: 'none',
  maxHeight: 72,
  overflow: 'hidden',
}
const energyStripTrackStyle: CSSProperties = {
  position: 'relative',
  width: 56,
  height: 40,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
}
const energyStripSpriteStyle: CSSProperties = { imageRendering: 'pixelated', width: 36, height: 36 }
const energyStripNodeStyle: CSSProperties = {
  position: 'absolute',
  right: 2,
  top: '50%',
  width: 8,
  height: 8,
  marginTop: -4,
  borderRadius: '50%',
  background: '#ffd36a',
  boxShadow: '0 0 6px #ffd36a',
}
const energyStripTextWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
}
const energyStripGainStyle: CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#ffd36a' }
const energyStripAdvanceLabelStyle: CSSProperties = { fontSize: '0.74rem', fontWeight: 700, color: '#8fe3a0' }
const energyStripBarTrackStyle: CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: '#23264a',
  overflow: 'hidden',
}
const energyStripBarFillStyle: CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, #6a9bc4, #ffd36a)',
  transition: 'width 0.4s ease',
}

/**
 * Reactively report whether the player owns a family's slot-5 傳奇 apex variant
 * (its `[familyId, 5]` neuronVariants row exists). Drives the featured
 * correct-reaction upgrade (slot-5 showpiece when owned, else slot-3) per
 * `neurons-sprite-animation`. Mirrors `useIsBookmarked`'s liveQuery pattern.
 */
function useOwnsLegendarySlot(familyId: string | undefined): boolean {
  const [owns, setOwns] = useState(false)
  useEffect(() => {
    if (!familyId) {
      setOwns(false)
      return
    }
    const sub = liveQuery(() => db.neuronVariants.get([familyId, 5])).subscribe({
      next: (row) => setOwns(!!row),
      error: () => setOwns(false),
    })
    return () => sub.unsubscribe()
  }, [familyId])
  return owns
}

export function QuizModal({ pool, onClose, onComplete, preserveOrder = false, practice = false, sessionRepair = false, creditCramRescue = false }: Props): JSX.Element {
  // Session-repair is practice-inert PLUS SRS-inert. `inert` gates the maze /
  // energy / streak / connectome side-effects that both practice and session-repair
  // suppress; `sessionRepair` alone additionally suppresses the SRS scheduler.
  const inert = practice || sessionRepair
  // Build session pool ONCE at mount and freeze it — a quiz session is an
  // immutable ordered sequence. The caller's `pool` prop ref churns whenever
  // `questionHistory` updates: the `useQuestionHistory` liveQuery emits a NEW
  // array on every answer (recordQuestionResult writes the table), which re-runs
  // the caller's `quizPool` useMemo and hands us a fresh array. A `useMemo` keyed
  // on `pool` would then RE-SHUFFLE the remaining questions mid-session, so the
  // displayed question "jumped" on every answer (fix: stale-jump bug). A lazy
  // useState initializer computes once; QuizModal is conditionally mounted per
  // session (quizEntry/expeditionOpen), so a new session still re-derives, while
  // the order stays fixed within one session — including 錯題 review's
  // pre-ordered oldest-due-first pool (preserveOrder), which must not reshuffle.
  const [sessionPool] = useState<Question[]>(() => {
    const filtered = pool.filter((q) => !q.hasOptionImages)
    return preserveOrder ? filtered : shuffle(filtered)
  })

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Inline 🐞 report sheet — holds the question id being reported (null = closed).
  const [bugForQuestionId, setBugForQuestionId] = useState<string | null>(null)
  // 神經元遠征隊 band visibility — shares the homepage opt-out preference, read live so
  // an on-band × hide here (or a Help-menu restore) updates the open quiz immediately.
  const bandHidden = useExpeditionHidden()
  const [flash, setFlash] = useState<{ outcome: 'correct' | 'incorrect'; nonce: number } | null>(null)
  // Quiz-time maze-energy feedback (add-neurons-maze-zoom-and-focus): set on a correct
  // answer; `advanced` means this answer crossed a node-settle threshold → the strip
  // escalates to the one-node advance animation. Reset on Next. Display-only — the
  // real settle/pull happens in the homepage useMaze reconcile.
  const [feedbackStrip, setFeedbackStrip] = useState<
    { familyId: string; energyGain: number; progress: number; advanced: boolean } | null
  >(null)
  // Streak-scaled correct-answer feedback intensity (neurons-motion-library):
  // set on a correct answer from the post-answer streak; drives the spike-train
  // burst magnitude. Continuous scale, capped. Reset to baseline on Next.
  const [correctIntensity, setCorrectIntensity] = useState(1)
  // True when THIS answer newly credited a 今日處方箋 line — drive the scoped verdict
  // notes. Fire from ANY entry point incl. 考前猜題 practice (prescription crediting is a
  // deliberate exception to practice-inert), so cram practice visibly advances 修煉.
  const [repairConsolidated, setRepairConsolidated] = useState(false)
  const [breadthConsolidated, setBreadthConsolidated] = useState(false)
  const [dayJustCompleted, setDayJustCompleted] = useState(false)
  // Tier crossings THIS answer newly claimed (add-neurons-prescription-tiers-and-
  // sync): returned by the prescription/cram record tails, surfaced as a
  // non-punishing toast at the verdict moment (mirrors the 連結已固化 note
  // pattern). Reset on Next.
  const [tierCrossings, setTierCrossings] = useState<TierCrossing[]>([])
  const reducedMotion = useRespectsReducedMotion()
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // Active squad — drives the correct-answer celebration (empty → no-op).
  const squad = useActiveSquad()
  // Tested concept labels for the current question (add-neurons-concept-labels-in-quiz).
  const conceptTags = useConceptTags()
  // Tally correct answers this session for the onComplete seam; guard so the
  // session-end callback fires at most once.
  const correctCountRef = useRef(0)
  // Per-subject tallies for the connectome credit (rework-neurons-connectome-
  // expedition-driven): correct count (= repairs in the wrong-only pool) + maze
  // energy earned per subject (the conduction batch). Forwarded via onComplete.
  const correctBySubjectRef = useRef<Record<string, number>>({})
  const energyBySubjectRef = useRef<Record<string, number>>({})
  // Ids answered WRONG this session — feeds the settlement「當場回鍋」session-repair
  // pass (add-neurons-weakness-radar-and-error-repair, Feature 4). Deduped downstream
  // by buildSessionRepairPool.
  const wrongIdsRef = useRef<string[]>([])
  // Ids answered CORRECT this session — the settlement hook intersects these with
  // the plan's frozen wrong snapshot to arm the wire-key anti-farm gate
  // (add-neurons-prescription-tiers-and-sync).
  const correctIdsRef = useRef<string[]>([])
  const completedRef = useRef(false)
  // SRS snapshots for the just-answered question, captured in handlePick: the
  // pre-answer prev (so ✨/🤔 recompute from the same baseline) and the default
  // post-answer schedule (so toggling a modifier OFF restores it). Reset on Next.
  const prevSrsRef = useRef<BinaryReviewPrev | null>(null)
  const defaultPostSrsRef = useRef<BinaryReviewResult | null>(null)

  // On quiz close (unmount, any path) play any DEFERRED first-pull reveals that
  // were minted silently mid-quiz — the player is now back on the maze/home.
  // (add-neurons-first-pull-reveal) Universal across finish / ✕ / backdrop.
  useEffect(() => {
    return () => {
      flushFirstPullReveals()
    }
  }, [])

  const handleClose = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true
      // 純練習 (模考/題庫) AND 當場回鍋 session-repair never credit the session-end reward
      // seam (the DMN draw axis) — self-enforce the "inert ⇒ no game reward" invariant
      // here rather than relying on callers to also omit onComplete. `inert = practice ||
      // sessionRepair`; session-repair already omits onComplete, so this is defence-in-
      // depth against a future caller mis-wiring it. (tidy-neurons-homepage-ui + Codex #2)
      if (!inert) {
        onComplete?.({
          total: sessionPool.length,
          correct: correctCountRef.current,
          correctBySubject: correctBySubjectRef.current,
          energyBySubject: energyBySubjectRef.current,
          wrongIds: wrongIdsRef.current,
          correctIds: correctIdsRef.current,
        })
      }
    }
    onClose()
  }, [onClose, onComplete, sessionPool.length, inert])

  const q: Question | undefined = sessionPool[idx]
  const exhausted = idx >= sessionPool.length
  // Featured correct-reaction upgrades to the slot-5 傳奇 showpiece when owned.
  const ownsLegendary = useOwnsLegendarySlot(q?.subject)

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
          correctBySubjectRef.current[q.subject] =
            (correctBySubjectRef.current[q.subject] ?? 0) + 1
          if (!correctIdsRef.current.includes(q.id)) correctIdsRef.current.push(q.id)
          // 純練習 (tidy-neurons-homepage-ui): 模考 / 題庫 答對不給能量 / walker /
          // variant / streak / connectome；只有 questionHistory + SRS 仍記（見下方）。
          // 當場回鍋 session-repair is also inert here (and skips SRS below).
          if (!inert) {
            // Capture maze-energy state around the accrual so the feedback strip can show
            // the gain + detect a settle-threshold crossing (the homepage useMaze performs
            // the actual settle/pull). `recordCorrectAnswer` MUST run exactly once; the
            // before/after reads are best-effort and never break the answer flow.
            let before: { earned: number; settles: number } | null = null
            try {
              before = await readMazeEnergyState(q.subject)
            } catch (err) {
              console.error('[maze-feedback] failed to read energy state (before)', err)
            }
            // Best-effort: an uninitialised familyMastery row (partial IndexedDB /
            // init race) makes recordAttemptInTx throw. Log + swallow so a mastery
            // failure never short-circuits the rest of handlePick (questionHistory /
            // SRS / prescription below), mirroring the recordQuestionResult pattern.
            try {
              await recordCorrectAnswer(q.subject)
            } catch (err) {
              console.error('[connectome] failed to record correct answer', err)
            }
            // Streak-scaled feedback: read the post-answer streak (recordCorrectAnswer
            // bumped it) → continuous intensity for the spike-train burst. Best-effort;
            // never break the answer flow.
            try {
              const { current } = await getStreaks()
              setCorrectIntensity(streakFeedbackIntensity(current))
            } catch (err) {
              console.error('[streak-feedback] failed to read streak', err)
            }
            if (before) {
              try {
                const after = await readMazeEnergyState(q.subject)
                const gain = Math.max(0, after.earned - before.earned)
                // Accumulate the per-subject conduction batch (rework-neurons-connectome-
                // expedition-driven): summed energy is conducted to wired neighbors at
                // settlement by the wrong-pool expedition's onComplete handler.
                energyBySubjectRef.current[q.subject] =
                  (energyBySubjectRef.current[q.subject] ?? 0) + gain
                setFeedbackStrip({
                  familyId: q.subject,
                  energyGain: gain,
                  progress: walkerFraction(after),
                  advanced: affordableSettles(after.earned) > affordableSettles(before.earned),
                })
              } catch (err) {
                console.error('[maze-feedback] failed to read energy state (after)', err)
              }
            }
          }
        } else {
          // Track this session's wrong ids for the settlement session-repair pass FIRST,
          // BEFORE the maze/mastery write — that write can throw (e.g. an uninitialised
          // familyMastery row) and session-repair tracking must not depend on it, or a
          // recording failure would silently drop the question from 當場回鍋 (Feature 4).
          if (!wrongIdsRef.current.includes(q.id)) wrongIdsRef.current.push(q.id)
          // Best-effort: an uninitialised familyMastery row makes recordAttemptInTx
          // throw. Log + swallow so recordQuestionResult / SRS / prescription below
          // still run (mirrors the recordQuestionResult pattern).
          if (!inert) {
            try {
              await recordIncorrectAnswer(q.subject)
            } catch (err) {
              console.error('[connectome] failed to record incorrect answer', err)
            }
          }
        }
        // Record per-question result for the 錯題 sub-tabs. Best-effort —
        // never break the answer flow if the history write fails. STILL fires in
        // session-repair (so everWrong / lastResult stay truthful) — only the SRS
        // scheduler is skipped below (srsEffect: none).
        try {
          await recordQuestionResult(q.id, q.subject, isCorrect)
        } catch (err) {
          console.error('[question-history] failed to record result', err)
        }
        // 當場回鍋 session-repair: record-only — no prescription / cram / SRS / DMN /
        // reward crediting. It is an immediate retrieval-after-error correction, not a
        // scheduled review or a new expedition (per D4).
        if (!sessionRepair) {
          // 今日處方箋 progress — this is the single shared answer-resolution point,
          // so it fires for BOTH the 出征 expedition and family 🆕新題 answers.
          // Best-effort + no-op when today's plan doesn't exist; never break the flow.
          try {
            const presc = await recordPrescriptionAnswer(q.id, q.subject, isCorrect)
            if (presc.repairConsolidated) setRepairConsolidated(true)
            if (presc.breadthConsolidated) setBreadthConsolidated(true)
            if (presc.justCompleted) setDayJustCompleted(true)
            if (presc.tierCrossings.length > 0)
              setTierCrossings((prev) => [...prev, ...presc.tierCrossings])
          } catch (err) {
            console.error('[prescription] failed to record answer', err)
          }
          // 考前救援 bonus — cram practice entry only (correct OR wrong). Own channel,
          // best-effort; write-once daily meta, no dayComplete / economy effect
          // beyond the claim-gated tier grants its recompute may cross.
          if (creditCramRescue) {
            try {
              const rescue = await recordCramRescueAnswer(q.id)
              if (rescue.tierCrossings.length > 0)
                setTierCrossings((prev) => [...prev, ...rescue.tierCrossings])
            } catch (err) {
              console.error('[cram-rescue] failed to record answer', err)
            }
          }
          // Update the SRS schedule for this question — runs on EVERY answer
          // regardless of mode (二階 skipSrs semantics), EXCEPT session-repair (which
          // preserves interval / easeFactor / nextDueAt / attempts / correctCount).
          // Best-effort, own channel.
          try {
            const sched = await scheduleSrsForAnswer(q.id, q.subject, isCorrect)
            prevSrsRef.current = sched.prev
            defaultPostSrsRef.current = sched.result
          } catch (err) {
            console.error('[srs] failed to schedule review', err)
          }
        }
      } finally {
        setBusy(false)
      }
    },
    [picked, busy, q, inert, sessionRepair, creditCramRescue],
  )

  const handleNext = useCallback(() => {
    setPicked(null)
    setHighlighted(null)
    setFeedbackStrip(null)
    setCorrectIntensity(1)
    setRepairConsolidated(false)
    setBreadthConsolidated(false)
    setDayJustCompleted(false)
    setTierCrossings([])
    setQueuedForReview(false)
    // Drop the answered question's SRS snapshots — the next question captures
    // its own in handlePick.
    prevSrsRef.current = null
    defaultPostSrsRef.current = null
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
  // ✨「太簡單」 / 🤔「我亂猜的」: persist the flag AND adjust the SRS schedule.
  // Toggling ON recomputes from the pre-answer prev (easy → lengthen, guessed →
  // interval 1); toggling OFF restores the default post-answer schedule. (✨ does
  // NOT clear everWrong in neurons — the questionHistory adapter merges everWrong
  // monotonic-OR, so a clear would be futile + contradict the 永久錯題庫 invariant.)
  const runFlagToggle = useCallback(
    async (kind: 'easy' | 'guessed') => {
      const cur = sessionPool[idx]
      if (!cur) return
      const toggleFn = kind === 'easy' ? toggleEasy : toggleGuessed
      const applyFn = kind === 'easy' ? applyEasyModifier : applyGuessedModifier
      let on = false
      try {
        on = await toggleFn(cur.id)
      } catch (err) {
        console.error(`[question-flags] toggle ${kind} failed`, err)
        return
      }
      try {
        if (on) await applyFn(cur.id, prevSrsRef.current)
        else if (defaultPostSrsRef.current) await restoreDefaultSrs(cur.id, defaultPostSrsRef.current)
      } catch (err) {
        console.error(`[srs] ${kind} modifier failed`, err)
      }
    },
    [sessionPool, idx],
  )
  const handleToggleEasy = useCallback(() => runFlagToggle('easy'), [runFlagToggle])
  const handleToggleGuessed = useCallback(() => runFlagToggle('guessed'), [runFlagToggle])
  // 👁「看錯」/ 💡「觀念洞」error-cause modifiers — post-WRONG counterpart to ✨/🤔
  // (add-neurons-weakness-radar-and-error-repair). 看錯 only persists the flag
  // (review de-prioritisation is read-side). 觀念洞 additionally shortens the next
  // interval via the guessed-style收斂 (reviewCardBinaryGuessed), WITHOUT touching
  // everWrong; toggling off restores the default post-answer schedule.
  const runWrongCauseToggle = useCallback(
    async (kind: 'wrong' | 'insight') => {
      const cur = sessionPool[idx]
      if (!cur) return
      const toggleFn = kind === 'wrong' ? toggleWrongAnswer : toggleInsight
      let on = false
      try {
        on = await toggleFn(cur.id)
      } catch (err) {
        console.error(`[question-flags] toggle ${kind} failed`, err)
        return
      }
      // Only 觀念洞 adjusts the schedule (prioritise + interval 1 + ease decrement via
      // applyInsightModifier — harsher than a plain wrong, distinct from 我亂猜的 which
      // preserves ease; add-neurons-insight-ease-penalty). 看錯 leaves the schedule alone —
      // its effect is purely review-ordering de-prioritisation. Un-flag restores default.
      if (kind !== 'insight') return
      try {
        if (on) await applyInsightModifier(cur.id, prevSrsRef.current)
        else if (defaultPostSrsRef.current) await restoreDefaultSrs(cur.id, defaultPostSrsRef.current)
      } catch (err) {
        console.error('[srs] insight modifier failed', err)
      }
    },
    [sessionPool, idx],
  )
  const handleToggleWrongAnswer = useCallback(() => runWrongCauseToggle('wrong'), [runWrongCauseToggle])
  const handleToggleInsight = useCallback(() => runWrongCauseToggle('insight'), [runWrongCauseToggle])
  // 置頂下次出征: pin the just-missed question via the durable cross-device
  // `questionFlags.pinnedAt` (add-neurons-pin-queue-r2-sync; async Dexie write).
  // `queuedForReview` gives instant optimistic feedback (reset per-question in
  // handleNext); `useIsPinned` is the liveQuery-backed durable state.
  const [queuedForReview, setQueuedForReview] = useState(false)
  const pinnedForReview = useIsPinned(q?.id ?? '')
  const handleAddToQuickReview = useCallback(() => {
    const cur = sessionPool[idx]
    if (!cur) return
    setQueuedForReview(true)
    enqueueQuickReview(cur.id).catch((err) => {
      console.error('[quick-review] enqueue failed', err)
      setQueuedForReview(false)
    })
  }, [sessionPool, idx])
  // Whether the just-answered question is correct — mirrors the reveal-region
  // isCorrect (computed again below for render). Drives which modifier pair the
  // 2/3 hotkeys target: correct → ✨/🤔, wrong → 看錯/觀念洞 (分時互斥, task 4.1).
  const answeredCorrect = useMemo(() => {
    const cur = sessionPool[idx]
    if (!cur || picked === null) return false
    return (
      cur.disputed === true ||
      picked === cur.answer ||
      (cur.acceptedAnswers?.includes(picked) ?? false)
    )
  }, [sessionPool, idx, picked])
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
    // 分時互斥: the 2/3 hotkeys drive whichever modifier pair is currently visible.
    onToggleEasy: answeredCorrect ? handleToggleEasy : handleToggleWrongAnswer,
    onToggleGuessed: answeredCorrect ? handleToggleGuessed : handleToggleInsight,
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
  // The 題號 embeds the original 考選部 subject; when the build reclassified this question
  // into a different family, surface it so the mismatch reads as intentional (not a bug).
  const reclassifiedSubject = reclassifiedFamily(q.id, q.subject)
  // Concept labels are shown only after reveal (pre-reveal would spoil what the question tests).
  const conceptLabels = conceptLabelsFor(q, conceptTags)
  // Featured correct-reaction: play the answered family's reaction flourish next to
  // the spike train. Ownership-gated featured slot — when the player owns the slot-5
  // 傳奇 apex (and it ships a `correct` showpiece) the reaction upgrades to it; else
  // the slot-3 featured; else no sheet → no flourish (per neurons-sprite-animation).
  const heroReactionBase = !isCorrect
    ? null
    : ownsLegendary && SPRITE_MAP[`variant:${q.subject}:5:correct`]
      ? `variant:${q.subject}:5`
      : SPRITE_MAP[`variant:${q.subject}:3:correct`]
        ? `variant:${q.subject}:3`
        : null

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
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button
              type="button"
              style={bugBtnStyle}
              onClick={() => setBugForQuestionId(q.id)}
              aria-label="回報這題的問題"
              title="回報這題的問題"
            >
              <EmojiIcon char="🐞" size={16} />
            </button>
            <button style={closeBtnStyle} onClick={handleClose} aria-label="關閉">
              ✕
            </button>
          </span>
        </header>

        {/* 神經元遠征隊 compact band — an in-flow animated strip between the title bar
            and the question (fix-neurons-quiz-expedition-band-overlap): reserves its own
            space so it never overlaps the stem; honors the homepage hide preference and
            carries its own on-band − collapse control. When collapsed it leaves a slim
            ＋ 展開 restore handle in place, so the player can bring it back while answering. */}
        {bandHidden ? (
          <ExpeditionRestoreStub compact onShow={() => setExpeditionHiddenPref(false)} />
        ) : (
          <MazeExpedition compact onHide={() => setExpeditionHiddenPref(true)} />
        )}

        {bugForQuestionId && (
          <QuizBugReportSheet
            questionId={bugForQuestionId}
            onClose={() => setBugForQuestionId(null)}
          />
        )}

        <div style={bodyStyle} ref={scrollContainerRef}>
          <p style={questionIdTopStyle}>
            題號 {q.id}
            {reclassifiedSubject && (
              <span style={reclassifiedNoteStyle}>（現歸類：{reclassifiedSubject}）</span>
            )}
          </p>
          <PrecedingContext question={q} />
          <p style={stemStyle}>{q.stem}</p>
          <QuestionFigure key={q.id} q={q} />

          {/* data-tutorial: guided-tour anchor (rebuild-neurons-onboarding-as-guided-tour) */}
          <div style={optionsGridStyle} data-tutorial="quiz-answer">
            {optionKeys.map((key, optIdx) => {
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
                  {!revealed && optIdx < 4 && (
                    <span className="quiz-hotkey-badge" aria-hidden>
                      {['₁', '₂', '₃', '₄'][optIdx]}
                    </span>
                  )}
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
                    <SpikeTrainFiring key={`spike-${idx}`} width={120} intensity={correctIntensity} />
                  </span>
                )}
              </p>
              {/* 當場回鍋 session-repair: a UI-only「當場修復」stamp on a correct retry.
                  No synced field / schema bump — purely derived from sessionRepair × isCorrect
                  (add-neurons-weakness-radar-and-error-repair, Feature 4). */}
              {sessionRepair && isCorrect && (
                <p style={repairStampStyle}>
                  <EmojiIcon char="🩹" size={13} decorative /> 當場修復 · 這題剛才錯的，現在對了
                </p>
              )}
              {repairConsolidated && !dayJustCompleted && (
                <p style={repairConsolidatedStyle}>
                  <EmojiIcon char="🩹" size={13} decorative /> 連結已固化 · 這條原本不穩的連結，穩了
                </p>
              )}
              {breadthConsolidated && !dayJustCompleted && (
                <p style={breadthDevelopedStyle}>
                  <EmojiIcon char="🔍" size={13} decorative /> 新連結已開發 · 今日處方箋開發新連結 +1
                </p>
              )}
              {dayJustCompleted && (
                <p style={dayCompletedNoteStyle}>
                  <EmojiIcon char="🎉" size={13} decorative /> 今日處方箋完成 · 兩件小事都做完了
                </p>
              )}
              {/* Tier-crossing toasts (add-neurons-prescription-tiers-and-sync) —
                  one non-punishing line per tier THIS answer newly claimed, at the
                  verdict moment (mirrors the 連結已固化 note pattern). Fires from
                  any entry point via the record tails. */}
              {tierCrossings.map((c) => (
                <p key={`tier-${c.tier}`} style={tierCrossNoteStyle}>
                  <EmojiIcon char="⚡" size={13} decorative />{' '}
                  {TIER_NAME_BY_TIER[c.tier]} {TIER_REACHED_MARK} · {TIER_ENERGY_LABEL} +
                  {c.energy} → {c.familyId}
                </p>
              ))}
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
              {/* Quiz-time maze-energy feedback strip (add-neurons-maze-zoom-and-focus) —
                  above the 詳解, display-only; escalates on a settle-threshold crossing. */}
              {isCorrect && feedbackStrip && (
                <EnergyFeedbackStrip
                  key={`energy-${idx}`}
                  familyId={feedbackStrip.familyId}
                  energyGain={feedbackStrip.energyGain}
                  progress={feedbackStrip.progress}
                  advanced={feedbackStrip.advanced}
                  reducedMotion={reducedMotion}
                />
              )}
              {/* Error-cause replay (add-neurons-weakness-radar-and-error-repair, Feature 2):
                  after a WRONG answer, actively surface 你選了 X（迷思）+ 正解 Y（關鍵） from the
                  existing per-option optionExplanations — no need to expand the passive 簡答. A
                  correct answer never renders it; a missing side degrades gracefully (omitted). */}
              {!isCorrect && (
                <ErrorCauseReplay
                  question={q}
                  chosenKey={picked}
                  correctKeys={acceptedKeys}
                  queued={queuedForReview || pinnedForReview}
                  onAddToQuickReview={handleAddToQuickReview}
                />
              )}
              {/* Tested concept labels (post-reveal only). Tap → new tab to 題庫 prefilled with the
                  concept, preserving this answering session in the original tab. */}
              <ConceptLabelRow labels={conceptLabels} hrefFor={conceptBankHref} />
              {q.explanation && (
                <>
                  <LocalPdfButton questionId={q.id} />
                  {SHOW_INLINE_EXPLANATION && q.optionExplanations && (
                    <details style={explanationStyle} open>
                      <summary style={explanationSummaryStyle}><EmojiIcon char="📖" size={15} /> 簡答</summary>
                      <Explanation question={q} textStyle={explanationBodyStyle} />
                      {(q as { explanationSource?: string }).explanationSource === 'ai-generated' && (
                        <p style={aiNoteStyle}>🤖 此題原始詳解由 AI 生成，未經陽明國考小組審定，僅供參考</p>
                      )}
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <footer style={footerStyle}>
          <BookmarkButton question={q} hotkeyVisible={revealed} />
          {revealed && (
            <FlagButtons
              questionId={q.id}
              isCorrect={isCorrect}
              onEasy={handleToggleEasy}
              onGuessed={handleToggleGuessed}
              onWrongAnswer={handleToggleWrongAnswer}
              onInsight={handleToggleInsight}
            />
          )}
          {revealed ? (
            <>
              <button style={secondaryBtnStyle} onClick={handleClose}>
                結束
              </button>
              <button style={primaryBtnStyle} onClick={handleNext} autoFocus>
                下一題 →
                <span className="quiz-hotkey-badge quiz-hotkey-badge--enter" aria-hidden>
                  ↵
                </span>
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
 * Answered-phase modifier buttons — TIME-SLICED by outcome
 * (add-neurons-weakness-radar-and-error-repair, task 4.1):
 *   correct → ✨ 太簡單 / 🤔 我亂猜的 (SRS-adjusting, per add-neurons-quiz-mode-chips-and-srs)
 *   wrong   → 👁 看錯 / 💡 觀念洞 (error-cause; 觀念洞 shortens interval, 看錯 de-prioritises)
 * The player never sees all four at once. All persist to the coexisting four-flag
 * `questionFlags` row; each toggle preserves the flags it does not own.
 */
function FlagButtons({
  questionId,
  isCorrect,
  onEasy,
  onGuessed,
  onWrongAnswer,
  onInsight,
}: {
  questionId: string
  isCorrect: boolean
  onEasy: () => void
  onGuessed: () => void
  onWrongAnswer: () => void
  onInsight: () => void
}): JSX.Element {
  const { easyMarked, guessedMarked, wrongAnswerMarked, insightMarked } = useFlag(questionId)
  if (!isCorrect) {
    // Post-wrong error-cause modifiers.
    return (
      <>
        <button
          type="button"
          style={wrongAnswerMarked ? flagWrongActiveStyle : flagWrongStyle}
          onClick={onWrongAnswer}
          aria-pressed={wrongAnswerMarked}
          aria-label={wrongAnswerMarked ? '取消 👁 看錯 標記 (2)' : '標記 👁 看錯 (2)'}
          title={wrongAnswerMarked ? '取消 👁 看錯 標記（鍵盤 2）' : '標記 👁 看錯 · 這題只是看錯了（鍵盤 2）'}
        >
          <EmojiIcon char="👁" size={16} decorative />
          <span className="flag-btn-label">看錯</span>
          <span className="quiz-hotkey-badge" aria-hidden>₂</span>
        </button>
        <button
          type="button"
          style={insightMarked ? flagInsightActiveStyle : flagInsightStyle}
          onClick={onInsight}
          aria-pressed={insightMarked}
          aria-label={insightMarked ? '取消 💡 觀念洞 標記 (3)' : '標記 💡 觀念洞 (3)'}
          title={insightMarked ? '取消 💡 觀念洞 標記（鍵盤 3）' : '標記 💡 觀念洞 · 這題觀念沒懂（鍵盤 3）'}
        >
          <EmojiIcon char="💡" size={16} decorative />
          <span className="flag-btn-label">觀念洞</span>
          <span className="quiz-hotkey-badge" aria-hidden>₃</span>
        </button>
      </>
    )
  }
  // Post-correct ✨/🤔 modifiers.
  return (
    <>
      <button
        type="button"
        style={easyMarked ? flagEasyActiveStyle : flagEasyStyle}
        onClick={onEasy}
        aria-pressed={easyMarked}
        aria-label={easyMarked ? '取消 ✨ 標記 (2)' : '標記 ✨ 太簡單 (2)'}
        title={easyMarked ? '取消 ✨ 標記（鍵盤 2）' : '標記 ✨ 太簡單（鍵盤 2）'}
      >
        <EmojiIcon char="✨" size={16} decorative />
        <span className="flag-btn-label">太簡單</span>
        <span className="quiz-hotkey-badge" aria-hidden>₂</span>
      </button>
      <button
        type="button"
        style={guessedMarked ? flagGuessedActiveStyle : flagGuessedStyle}
        onClick={onGuessed}
        aria-pressed={guessedMarked}
        aria-label={guessedMarked ? '取消 🤔 標記 (3)' : '標記 🤔 我亂猜的 (3)'}
        title={guessedMarked ? '取消 🤔 標記（鍵盤 3）' : '標記 🤔 我亂猜的（鍵盤 3）'}
      >
        <EmojiIcon char="🤔" size={16} decorative />
        <span className="flag-btn-label">我亂猜的</span>
        <span className="quiz-hotkey-badge" aria-hidden>₃</span>
      </button>
    </>
  )
}

/**
 * Error-cause replay (add-neurons-weakness-radar-and-error-repair, Feature 2):
 * after a wrong answer, actively show the chosen distractor's explanation (框成
 * 迷思) + the correct option's explanation (框成 關鍵), both sourced from the
 * existing `optionExplanations`. A missing side is omitted (graceful degrade),
 * never an empty block. Carries the「置頂下次出征」CTA (transient device-local queue).
 */
function ErrorCauseReplay({
  question,
  chosenKey,
  correctKeys,
  queued,
  onAddToQuickReview,
}: {
  question: Question
  chosenKey: string | null
  correctKeys: string[]
  queued: boolean
  onAddToQuickReview: () => void
}): JSX.Element | null {
  const oe = question.optionExplanations
  const chosenExpl = chosenKey && oe ? oe[chosenKey] : undefined
  // The correct option to explain = the first accepted key that has an explanation.
  const correctKey = oe ? correctKeys.find((k) => k in oe) : undefined
  const correctExpl = correctKey && oe ? oe[correctKey] : undefined
  // Nothing to replay AND no explanations to show → omit entirely (no empty block).
  if (!chosenExpl && !correctExpl) {
    // Still offer the quick-review CTA — the player may want to revisit even when
    // no 簡答 exists — but skip the empty replay card.
    return (
      <div style={errorReplayCtaOnlyStyle}>
        <QuickReviewCta queued={queued} onAdd={onAddToQuickReview} />
      </div>
    )
  }
  return (
    <div style={errorReplayStyle}>
      {chosenExpl && chosenKey && (
        <div style={errorReplayMisconceptionStyle}>
          <span style={errorReplayTagMisStyle}>你選了 {chosenKey}</span>
          <span style={errorReplayBodyStyle}>{chosenExpl}</span>
        </div>
      )}
      {correctExpl && correctKey && (
        <div style={errorReplayKeyStyle}>
          <span style={errorReplayTagKeyStyle}>正解 {correctKey}</span>
          <span style={errorReplayBodyStyle}>{correctExpl}</span>
        </div>
      )}
      <QuickReviewCta queued={queued} onAdd={onAddToQuickReview} />
    </div>
  )
}

/**「置頂下次出征」button — pins the just-missed question to the front of the next
 *  錯題出征 (refold-neurons-quick-review-into-expedition). Reflects pinned state;
 *  idempotent enqueue upstream; the pin is cross-device durable via
 *  questionFlags.pinnedAt (add-neurons-pin-queue-r2-sync). 📌 renders pixel-art
 *  via the emoji-icon pack. */
function QuickReviewCta({ queued, onAdd }: { queued: boolean; onAdd: () => void }): JSX.Element {
  const pinnedCopy = '已置頂，下次錯題出征會優先遇到'
  return (
    <button
      type="button"
      style={queued ? quickReviewCtaAddedStyle : quickReviewCtaStyle}
      onClick={onAdd}
      disabled={queued}
      aria-label={queued ? pinnedCopy : '置頂下次出征'}
      title={queued ? pinnedCopy : '置頂到下次錯題出征最前面（跨裝置同步）'}
    >
      <EmojiIcon char="📌" size={14} decorative />
      {queued ? ` ${pinnedCopy}` : ' 置頂下次出征'}
    </button>
  )
}

/** ⭐ bookmark toggle button — lives in QuizModal footer, both phases. */
function BookmarkButton({
  question,
  hotkeyVisible,
}: {
  question: Question
  hotkeyVisible: boolean
}): JSX.Element {
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
      {hotkeyVisible && (
        <span className="quiz-hotkey-badge" aria-hidden>
          ₁
        </span>
      )}
    </button>
  )
}

/**
 * Inline 🐞 report sheet (add-neurons-bug-report). Compact question-scoped
 * report: target picker → mapped category + the displayed question_id, single
 * description field, same force-sign-in gate. Submits to Supabase bug_reports.
 */
const QUIZ_BUG_TARGET_LABELS: Record<QuizBugTarget, string> = {
  question: '題目內容有誤',
  image: '圖片問題',
  explanation: '答案 / 詳解有誤',
  'concept-tag': '概念標籤錯誤',
  other: '其他',
}

function QuizBugReportSheet({
  questionId,
  onClose,
}: {
  questionId: string
  onClose: () => void
}): JSX.Element {
  const { user, signInWithGoogle } = useAuth()
  const [target, setTarget] = useState<QuizBugTarget>('question')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const canSubmit = desc.trim().length > 0 && !submitting

  async function handleSubmit(): Promise<void> {
    if (!user || !canSubmit) return
    setSubmitting(true)
    setResult(null)
    const res = await submitBugReport(
      {
        category: QUIZ_BUG_TARGET_TO_CATEGORY[target],
        severity: 'minor',
        what_doing: `回報題目 ${questionId}（${QUIZ_BUG_TARGET_LABELS[target]}）`,
        what_happened: desc.trim(),
        question_id: questionId,
      },
      {},
      { authStatus: 'authed', userId: user.id },
    )
    setSubmitting(false)
    setResult(res.ok ? { ok: true, msg: '✅ 已送出，謝謝！' } : { ok: false, msg: `送出失敗：${res.error}` })
  }

  return (
    <div style={bugSheetBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="回報題目問題">
      <div style={bugSheet} onClick={(e) => e.stopPropagation()}>
        <header style={bugSheetHeader}>
          <span><EmojiIcon char="🐞" size={16} /> 回報這題</span>
          <button style={closeBtnStyle} onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>
        <div style={{ padding: '0.9rem 1rem' }}>
          <p style={bugSheetQid}>題號 {questionId}</p>
          {!user ? (
            <>
              <p style={{ color: '#5a3f29', fontSize: '0.86rem', lineHeight: 1.6 }}>
                回報需要先登入。
              </p>
              <button style={primaryBtnStyle} onClick={() => void signInWithGoogle()}>
                使用 Google 登入
              </button>
            </>
          ) : result?.ok ? (
            <>
              <p style={{ color: '#4d8c4d', fontWeight: 600, margin: '0.8rem 0', textAlign: 'center' }}>
                {result.msg}
              </p>
              <button style={primaryBtnStyle} onClick={onClose}>
                關閉
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
                {QUIZ_BUG_TARGETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    style={target === t ? bugTargetActive : bugTarget}
                    aria-pressed={target === t}
                    onClick={() => setTarget(t)}
                  >
                    {QUIZ_BUG_TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
              <textarea
                style={bugSheetTextarea}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="簡短說明哪裡有問題…"
                rows={3}
              />
              {result && !result.ok && (
                <p style={{ color: '#c44d4d', fontSize: '0.82rem', marginTop: '0.5rem' }}>{result.msg}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.8rem' }}>
                <button style={secondaryBtnStyle} onClick={onClose}>
                  取消
                </button>
                <button
                  style={canSubmit ? primaryBtnStyle : { ...primaryBtnStyle, opacity: 0.5, cursor: 'not-allowed' }}
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {submitting ? '送出中…' : '送出'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const bugBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.05rem',
  cursor: 'pointer',
  padding: '0.25rem 0.35rem',
  lineHeight: 1,
}

const bugSheetBackdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(20, 12, 30, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
  padding: '1rem',
}

const bugSheet: CSSProperties = {
  background: '#fdf8ee',
  border: '2px solid #d4a04d',
  borderRadius: 10,
  boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
  width: '100%',
  maxWidth: 420,
  fontFamily: 'var(--font-pixel-cjk)',
  color: '#3a2a1a',
}

const bugSheetHeader: CSSProperties = {
  padding: '0.6rem 0.9rem',
  borderBottom: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#f5e6d3',
  fontWeight: 700,
  color: '#5a3f29',
}

const bugSheetQid: CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '0.72rem',
  color: '#9b8c70',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
}

const bugSheetTextarea: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem 0.6rem',
  borderRadius: 6,
  border: '1px solid #c4a878',
  background: '#fff',
  fontFamily: 'inherit',
  fontSize: '0.9rem',
  color: '#3a2a1a',
  resize: 'vertical',
}

const bugTarget: CSSProperties = {
  padding: '0.3rem 0.55rem',
  borderRadius: 6,
  border: '1px solid #c4a878',
  background: 'transparent',
  color: '#5a3f29',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const bugTargetActive: CSSProperties = {
  ...bugTarget,
  background: '#d4a04d',
  color: '#fff',
  borderColor: '#b8893a',
  fontWeight: 600,
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  // Reflow beside the docked PDF panel; var defaults to 0px → full-screen when panel closed.
  top: 0,
  left: 0,
  bottom: 0,
  right: 'var(--pdf-panel-width, 0px)',
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
  fontFamily: 'var(--font-pixel-cjk)',
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
  overflowWrap: 'anywhere',
  // Exam content — legible, never pixel (opt out of the global pixel default).
  fontFamily: 'var(--font-legible)',
}

/**
 * Renders the question's figure: an <img> when imagePath is set (prepend
 * Vite BASE_URL), a [圖] placeholder when the question is flagged hasImage but
 * has no figure available (never silently drop a figure), and nothing otherwise.
 * `key={q.id}` at the call site remounts this per question, resetting onError.
 */
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
  // Exam content (option text) — legible, never pixel.
  fontFamily: 'var(--font-legible)',
  overflowWrap: 'anywhere',
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
  // Disclaimer prose about the question — legible, never pixel.
  fontFamily: 'var(--font-legible)',
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

// 當場修復 stamp — UI-only recognition for a session-repair correct retry.
const repairStampStyle: React.CSSProperties = {
  margin: '-0.2rem 0 0.6rem',
  fontSize: '0.84rem',
  fontWeight: 700,
  color: '#2f8f4e',
}

// Scoped「連結已固化」note — only when today's 處方 repair pool is consolidated.
const repairConsolidatedStyle: React.CSSProperties = {
  margin: '-0.3rem 0 0.6rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#4d8c4d',
}

// 「新連結已開發」note — first breadth-family answer credited today (any entry point).
const breadthDevelopedStyle: React.CSSProperties = {
  margin: '-0.3rem 0 0.6rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#2f6b8c',
}

// Non-punishing 「今日處方箋完成」note — the answer that completes both lines today.
const dayCompletedNoteStyle: React.CSSProperties = {
  margin: '-0.3rem 0 0.6rem',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#7a5410',
}

// Tier-crossing note (add-neurons-prescription-tiers-and-sync) — a tier THIS
// answer newly claimed, with its flat conduction-energy grant.
const TIER_NAME_BY_TIER: Record<1 | 2 | 3 | 4, string> = {
  1: TIER_T1_NAME,
  2: TIER_T2_NAME,
  3: TIER_T3_NAME,
  4: TIER_T4_NAME,
}
const tierCrossNoteStyle: React.CSSProperties = {
  margin: '-0.3rem 0 0.6rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#8a6a1a',
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
  overflowWrap: 'anywhere',
  // 詳解 explanation prose — legible, never pixel.
  fontFamily: 'var(--font-legible)',
}

const aiNoteStyle: React.CSSProperties = {
  marginTop: '0.6rem',
  fontSize: '0.74rem',
  lineHeight: 1.5,
  color: '#8a5a2a',
  fontStyle: 'italic',
  // AI-generated disclaimer prose — legible, never pixel.
  fontFamily: 'var(--font-legible)',
}

// 題號 shown as a small monospace header above the question stem (moved from below the 詳解).
const questionIdTopStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.72rem',
  letterSpacing: '0.02em',
  color: '#9b8c70',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
}

// Subtle inline marker after the 題號 when the question was reclassified into a
// different family than its id encodes; inherits the muted id color so it never jars.
const reclassifiedNoteStyle: React.CSSProperties = {
  marginLeft: '0.4em',
  fontWeight: 400,
  fontSize: '0.92em',
  opacity: 0.8,
  fontFamily: 'system-ui, "Noto Sans TC", sans-serif',
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
  position: 'relative',
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
  position: 'relative',
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

// 👁 看錯 — muted grey accent (de-prioritise semantics).
const flagWrongStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: 'transparent',
  color: '#7a7266',
  border: '1px solid #b8ae9e',
}

const flagWrongActiveStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: '#eeeae2',
  color: '#6a6153',
  border: '1px solid #8c8375',
}

// 💡 觀念洞 — amber accent (prioritise + shorten interval semantics).
const flagInsightStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: 'transparent',
  color: '#b07d1a',
  border: '1px solid #d4b06a',
}

const flagInsightActiveStyle: React.CSSProperties = {
  ...flagBtnBaseStyle,
  background: '#fbf0d8',
  color: '#a8720f',
  border: '1px solid #c99a2e',
}

// ── Error-cause replay (Feature 2) ──────────────────────────────────────────
const errorReplayStyle: React.CSSProperties = {
  margin: '0.2rem 0 0.6rem',
  padding: '0.55rem 0.7rem',
  background: '#fbf5ea',
  border: '1px solid #e0cfa8',
  borderRadius: '6px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
}

const errorReplayCtaOnlyStyle: React.CSSProperties = {
  margin: '0.2rem 0 0.6rem',
}

const errorReplayMisconceptionStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.45rem',
  alignItems: 'baseline',
  borderLeft: '3px solid #c44d4d',
  paddingLeft: '0.5rem',
}

const errorReplayKeyStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.45rem',
  alignItems: 'baseline',
  borderLeft: '3px solid #2f8f4e',
  paddingLeft: '0.5rem',
}

const errorReplayTagMisStyle: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  fontSize: '0.8rem',
  color: '#c44d4d',
  fontFamily: 'var(--font-legible)',
}

const errorReplayTagKeyStyle: React.CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  fontSize: '0.8rem',
  color: '#2f8f4e',
  fontFamily: 'var(--font-legible)',
}

const errorReplayBodyStyle: React.CSSProperties = {
  fontSize: '0.86rem',
  lineHeight: 1.55,
  color: '#3a2a1a',
  fontFamily: 'var(--font-legible)',
  overflowWrap: 'anywhere',
}

const quickReviewCtaStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.35rem 0.7rem',
  borderRadius: '6px',
  border: '1px solid #6a9bc4',
  background: '#fff',
  color: '#4d6dc4',
  fontSize: '0.82rem',
  fontWeight: 600,
  fontFamily: 'var(--font-legible)',
  cursor: 'pointer',
}

const quickReviewCtaAddedStyle: React.CSSProperties = {
  ...quickReviewCtaStyle,
  background: '#e8f5e8',
  border: '1px solid #4d8c4d',
  color: '#2f6b3a',
  cursor: 'default',
}

const baseBtnStyle: React.CSSProperties = {
  position: 'relative',
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
