import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import {
  initMasteryForPack,
  runDailyResetIfNeeded,
  creditConnectomeFromExpedition,
  getConnectomeStatus,
  getAboutToWireHint,
  type ExpeditionConnectomeResult,
  type ConnectomeStatus,
  type AboutToWireHint,
} from '../lib/services/connectome'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import QuizHotkeysAnnouncementBanner from '../components/QuizHotkeysAnnouncementBanner'
import { QuizModal } from '../components/QuizModal'
import { FamilyPicker, type FamilyAccrual, type MazeFamilyHint } from '../components/FamilyPicker'
import MazeGrid from '../components/maze/MazeGrid'
import RadioWidget from '../components/RadioWidget'
import { MazeCompletionCelebration } from '../components/MazeCompletionCelebration'
import { ExpeditionRitualCelebration } from '../components/ExpeditionRitualCelebration'
import { hasCelebrated, markCelebrated } from '../lib/services/maze-celebration'
import { ConnectomeStatCard } from '../components/ConnectomeStatCard'
import { DailyPrescriptionCard } from '../components/DailyPrescriptionCard'
import { EmojiIcon } from '../components/EmojiIcon'
import { LightsOutRitual } from '../components/LightsOutRitual'
import { usePrescriptionStatus } from '../lib/hooks/usePrescriptionStatus'
import { useNg0717Imprints } from '../lib/hooks/useNg0717Imprints'
import { type EnrichedImprint } from '../components/Ng0717BranchBuds'
import {
  isLightsOutToday,
  setLightsOutToday,
  clearLightsOutToday,
  hasPreTodayWrongBasis,
} from '../lib/services/prescription'
import { armPrescriptionWireCredit } from '../lib/services/prescription-wire'
import { OnboardingHost } from '../components/OnboardingHost'
import { SquadPreview } from '../components/SquadSurfaces'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'
import { ownedSlotCount } from '../lib/services/variant-ownership'
import { filterPoolByFamily, filterPoolByYear, filterPoolByNewOnly } from '../lib/services/quiz-pool'
import { useQuestionHistory } from '../lib/services/question-history'
import {
  buildDueReviewPool,
  computeFamilyModeCounts,
  type QuizMode,
} from '../lib/services/srs-scheduler'
import {
  buildWrongQuestionPool,
  buildQuickReviewPool,
  buildSessionRepairPool,
  leadThenFill,
  onExpeditionComplete,
} from '../lib/services/expedition'
import {
  computeWeaknessPressure,
  buildTargetedDrillPool,
  type WeaknessDiagnostic,
} from '../lib/services/weakness-pressure'
import { useConceptTags } from '../lib/concept-tags'
import { useAllFlags } from '../lib/services/question-flags'
import { RescueScene } from '../components/RescueScene'
import { useRescuePlans } from '../lib/services/rescue/rescue-store'
import { computeRescueD } from '../lib/services/rescue/rescue-lifecycle'
import { computeConceptMastery, computeRescueScore } from '../lib/services/rescue/rescue-score'
import { buildConceptYield } from '../lib/services/rescue/rescue-session'
import { dequeueQuickReview } from '../lib/services/quick-review-queue'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { ALL_YEARS, effectiveYearSet, useYearFilter } from '../lib/services/year-filter'
import { useMaze } from '../lib/maze/useMaze'
import { emitMazeFocus, onMazeRecenter } from '../lib/maze/maze-focus'
import { db, todayISO } from '../lib/db'

interface Props {
  pack: ContentPack
}

interface ProgressStats {
  variants: number
}

// QuizModal entry state. `undefined` = modal 未開；object = 特定 family + mode
// （🆕 新題 / 🔄 錯題，per add-neurons-quiz-mode-chips-and-srs）。The 🎲 cross-family
// random entry was removed by redesign-neurons-homepage-cta.
type QuizEntry = { familyId: string; mode: QuizMode } | undefined

export default function OverviewPage({ pack }: Props): JSX.Element {
  const [quizEntry, setQuizEntry] = useState<QuizEntry>(undefined)
  // 出征 (expedition) is a separate, mutually-exclusive QuizModal entry on the
  // cross-subject wrong-question pool. (add-neurons-study-squad)
  const [expeditionOpen, setExpeditionOpen] = useState(false)
  // Quick-review mini-batch: when true, the open expedition is capped to ≤5
  // wrong questions (DMN quick-review-batch event, realign-dmn-event-rewards-to-maze).
  const [quickReviewActive, setQuickReviewActive] = useState(false)
  // 一鍵特訓 (add-neurons-weakness-radar-and-error-repair, Feature 1): a scoped ≤10-Q
  // targeted drill launched from a weak family card. `undefined` = closed. Reuses the
  // normal QuizModal recording + SRS path (it is a scoped launcher, not a new scorer).
  const [targetedDrill, setTargetedDrill] = useState<{ familyId: string } | undefined>(undefined)
  // 當場回鍋 session-repair pass (Feature 4): the just-finished expedition's wrong ids,
  // surfaced at settlement as an optional one-time repair pass. `null` = not offered.
  const [repairWrongIds, setRepairWrongIds] = useState<string[] | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  // 單科考前救急 (add-neurons-single-subject-rescue): a device-local, one-family last-minute
  // rescue overlay. `rescueInitialFamily` preselects the setup family (from a card chip) or is
  // undefined (from the header entry). The active plan is read reactively for the card 變身.
  const [rescueOpen, setRescueOpen] = useState(false)
  const [rescueInitialFamily, setRescueInitialFamily] = useState<string | undefined>(undefined)
  const rescuePlans = useRescuePlans()
  // 模考 moved off the homepage → 題庫 tab (tidy-neurons-homepage-ui); its picker +
  // pure-practice drill now live in QuestionBankPage. The ⚔️ 錯題出征 CTA now lives
  // in the merged ConnectomeStatCard (redesign-neurons-homepage-cta).
  // Settlement result of the last wrong-pool expedition → conduction ledger + ritual
  // (rework-neurons-connectome-expedition-driven).
  const [settlement, setSettlement] = useState<ExpeditionConnectomeResult | null>(null)
  // Per-settlement token guarding the async connectome-credit race
  // (add-neurons-weakness-radar-and-error-repair, Codex suggestion 1): each expedition
  // completion bumps it; the late `creditConnectomeFromExpedition().then` compares its
  // captured token and skips the stale `setSettlement` if the recap was dismissed or the
  // player already entered the「當場回鍋」pass in the meantime.
  const settlementTokenRef = useRef(0)
  // About-to-wire nudge for the settlement recap (polish-neurons-connectome-visual):
  // recomputed after each settlement.
  const [aboutToWire, setAboutToWire] = useState<AboutToWireHint | null>(null)
  // Once-per-day completion ritual overlay (polish-neurons-connectome-visual).
  const [ritual, setRitual] = useState<{ streak: number; nonce: number } | null>(null)
  // Narrative connectome indicators (reloads on mount + after each settlement).
  const [connStatus, setConnStatus] = useState<ConnectomeStatus | null>(null)
  useEffect(() => {
    let alive = true
    void getConnectomeStatus()
      .then((s) => {
        if (alive) setConnStatus(s)
      })
      .catch((err) => console.error('[connectome] status load failed:', err))
    return () => {
      alive = false
    }
  }, [settlement])
  // About-to-wire nudge: recompute after each settlement (polish-neurons-connectome-visual).
  useEffect(() => {
    if (!settlement) return
    let alive = true
    void getAboutToWireHint()
      .then((h) => {
        if (alive) setAboutToWire(h)
      })
      .catch((err) => console.error('[connectome] about-to-wire hint failed:', err))
    return () => {
      alive = false
    }
  }, [settlement])
  // Auto-dismiss the daily-completion ritual overlay (mirrors the celebration window).
  useEffect(() => {
    if (!ritual) return
    const t = setTimeout(() => setRitual(null), 2400)
    return () => clearTimeout(t)
  }, [ritual])
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const [stats, setStats] = useState<ProgressStats>({ variants: 0 })
  const [accrualByFamily, setAccrualByFamily] = useState<Map<string, FamilyAccrual>>(new Map())
  const timer = useReadingTimer()

  // Single useMaze subscription for the homepage (it runs reconcileSettles →
  // pulls; mounting it twice would double-fire). MazeGrid is presentational
  // and consumes this view.
  const mazeView = useMaze(pack)

  // 全腦點亮 completion celebration (add-neurons-loop-celebration-animations).
  // Fire a one-shot payoff overlay when a family's maze (incl. second lap) goes
  // fully lit — detected as a LIVE non-complete → complete (`target` non-null →
  // null) transition this session, NOT merely observing `target === null` at
  // mount (a family already complete on first observation must not celebrate).
  // Synced one-shot marker (hasCelebrated / markCelebrated) prevents replay
  // across sessions + devices.
  const prevCompleteRef = useRef<Map<string, boolean>>(new Map())
  const [celebration, setCelebration] = useState<{ label: string; nonce: number } | null>(null)

  useEffect(() => {
    const prev = prevCompleteRef.current
    for (const fam of mazeView.families) {
      const curComplete = fam.target === null
      const wasComplete = prev.get(fam.familyId)
      prev.set(fam.familyId, curComplete)
      // Live completion edge only: `wasComplete === false` excludes both an
      // unseen family (undefined) and one already complete at first observation.
      if (wasComplete === false && curComplete) {
        const familyId = fam.familyId
        void (async () => {
          if (await hasCelebrated(familyId)) return
          await markCelebrated(familyId)
          const label = pack.subjects.find((s) => s.id === familyId)?.displayName ?? familyId
          setCelebration({ label, nonce: Date.now() })
        })()
      }
    }
  }, [mazeView, pack.subjects])

  // Auto-dismiss the celebration overlay after the primitives' window.
  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2200)
    return () => clearTimeout(t)
  }, [celebration])

  const persistedYears = useYearFilter()
  const yearSet = useMemo(() => effectiveYearSet(persistedYears), [persistedYears])
  const yearActive = yearSet.size < ALL_YEARS.length

  // Full question-history (drives 出征 count, the per-mode pools, and the
  // per-family 🆕/🔄 chip badges).
  const questionHistory = useQuestionHistory()

  // Error-cause flag lookup (add-neurons-weakness-radar-and-error-repair): questionId
  // → { wrongAnswerMarked, insightMarked }. Feeds ALL review/expedition pool builders
  // (due / wrong / quick-review / drill) so 觀念洞 sorts front + 看錯 sinks everywhere.
  const questionFlags = useAllFlags()
  const flagOf = useMemo(() => {
    const byId = new Map(questionFlags.map((f) => [f.questionId, f]))
    return (id: string) => byId.get(id)
  }, [questionFlags])

  const quizPool = useMemo(() => {
    if (quizEntry === undefined) return []
    const { familyId, mode } = quizEntry
    const byFamily = filterPoolByFamily(pack.questions, familyId)
    const scoped = yearActive ? filterPoolByYear(byFamily, yearSet) : byFamily
    return mode === 'fresh'
      ? filterPoolByNewOnly(scoped, questionHistory)
      : buildDueReviewPool(scoped, questionHistory, Date.now(), flagOf)
  }, [pack.questions, quizEntry, yearSet, yearActive, questionHistory, flagOf])

  // Per-family 新題 (unseen) + 錯題 (due) counts for the FamilyPicker chip badges.
  const modeCountsByFamily = useMemo(
    () =>
      computeFamilyModeCounts(
        pack.questions,
        questionHistory,
        yearActive
          ? (q) => typeof q.meta?.year === 'number' && yearSet.has(q.meta.year)
          : () => true,
      ),
    [pack.questions, questionHistory, yearSet, yearActive],
  )

  // Weakness-pressure diagnostic (add-neurons-weakness-radar-and-error-repair, Feature 1):
  // pure derived per-family/per-concept "review-now" pressure. Reads questionHistory ×
  // conceptTags; never touches familyMastery. Memoised — O(history) per recompute.
  const conceptTags = useConceptTags()
  const familyIds = useMemo(() => pack.subjects.map((s) => s.id), [pack.subjects])
  const weakness: WeaknessDiagnostic = useMemo(
    () => computeWeaknessPressure(questionHistory, conceptTags, familyIds),
    [questionHistory, conceptTags, familyIds],
  )
  // Per-family rescue chip map (add-neurons-multi-subject-rescue): D countdown + RescueScore
  // for EVERY active plan (multiple coexist). Yield uses the corpus-percentile fallback (no cram
  // fetch on the homepage); the scene itself refines with cram tiers. Empty when no plan is active.
  const rescueChipByFamily = useMemo(() => {
    const m = new Map<string, { d: number; score: number }>()
    for (const plan of rescuePlans) {
      const scoped = filterPoolByFamily(pack.questions, plan.familyId)
      const conceptYield = buildConceptYield([], scoped, conceptTags)
      const scopedHistory = questionHistory.filter((h) => h.family === plan.familyId)
      const mastery = computeConceptMastery(scopedHistory, conceptTags)
      m.set(plan.familyId, {
        d: computeRescueD(plan.examDate, todayISO()),
        score: computeRescueScore(mastery, conceptYield),
      })
    }
    return m
  }, [rescuePlans, pack.questions, conceptTags, questionHistory])
  // 一鍵特訓 pool: family-scoped ≤10 high-weakness questions (wrong / low-ease / overdue),
  // reusing the existing family-filter + the targeted-drill ranker. Materialised only
  // while the drill is open.
  const targetedDrillPool = useMemo(() => {
    if (targetedDrill === undefined) return []
    const scoped = filterPoolByFamily(pack.questions, targetedDrill.familyId)
    return buildTargetedDrillPool(scoped, questionHistory, flagOf, 10)
  }, [targetedDrill, pack.questions, questionHistory, flagOf])
  // Session-repair pool: this session's wrong ids, each at most once (Feature 4).
  const repairPool = useMemo(() => {
    if (!repairOpen || !repairWrongIds) return []
    return buildSessionRepairPool(pack.questions, questionHistory, repairWrongIds)
  }, [repairOpen, repairWrongIds, pack.questions, questionHistory])

  // 出征 pool — all-subject currently-unmastered questions (lastResult==='wrong').
  // NOT year-filtered: it is the player's wrong set regardless of exam year.
  // The 出征 button only needs the COUNT (cheap, O(history)); the full-corpus
  // materialization runs only while the drill is actually open.
  const wrongCount = useMemo(
    () => questionHistory.reduce((n, h) => (h.lastResult === 'wrong' ? n + 1 : n), 0),
    [questionHistory],
  )
  // Expedition entry one-way reveal (improve-neurons-onboarding): hidden for a
  // never-wrong new player; shown once the player has ever answered incorrectly.
  // `everWrong` is monotonic, so this derivation is itself the persistent one-way
  // signal AND the backstop for players who already had wrong history pre-change.
  const hasEverAnsweredWrong = useMemo(
    () => questionHistory.some((h) => h.everWrong === true),
    [questionHistory],
  )
  // Pinned「置頂下次出征」ids that are STILL wrong — one source for both the pool
  // lead ordering and the「已置頂 N 題」badge (refold-neurons-quick-review-into-expedition).
  const wrongIdSet = useMemo(
    () => new Set(questionHistory.filter((h) => h.lastResult === 'wrong').map((h) => h.questionId)),
    [questionHistory],
  )
  // Sourced from the R2-synced `questionFlags.pinnedAt` (add-neurons-pin-queue-
  // r2-sync): `questionFlags` above is a Dexie liveQuery (useAllFlags), so
  // enqueue / dequeue / cross-device pulls recompute the badge + expedition lead
  // natively — the old localStorage subscribe/prune/queueRev machinery is gone.
  // Still-wrong is a read-time filter (replaces the eager prune: a pin whose
  // question is no longer wrong is simply not counted / not led); FIFO order =
  // `pinnedAt` ascending, sorted in-memory (non-indexed by design).
  const pinnedStillWrongIds = useMemo(
    () =>
      questionFlags
        .filter((f) => f.pinnedAt != null && wrongIdSet.has(f.questionId))
        .sort((a, b) => (a.pinnedAt as number) - (b.pinnedAt as number))
        .map((f) => f.questionId),
    [questionFlags, wrongIdSet],
  )
  const expeditionPool = useMemo(() => {
    if (!expeditionOpen) return []
    // Pinned still-wrong ids lead BOTH the full expedition and the DMN quick-review
    // mini-batch (Feature 2 refolded into 錯題出征 per refold-neurons-quick-review-into-
    // expedition). Ordering honours the error-cause flags (觀念洞 front / 看錯 back)
    // via `flagOf` within the fill pool.
    const byId = new Map(pack.questions.map((q) => [q.id, q]))
    const pinned = pinnedStillWrongIds
      .map((id) => byId.get(id))
      .filter((q): q is (typeof pack.questions)[number] => Boolean(q))
    if (!quickReviewActive) {
      // Full expedition: whole wrong set, pinned questions led to the front (no cap).
      return leadThenFill(pinned, buildWrongQuestionPool(pack.questions, questionHistory, flagOf))
    }
    // DMN quick-review mini-batch: pinned lead, priority-ordered ≤5 wrong-pool fill (cap 5).
    return leadThenFill(pinned, buildQuickReviewPool(pack.questions, questionHistory, 5, flagOf), 5)
  }, [expeditionOpen, quickReviewActive, pack.questions, questionHistory, flagOf, pinnedStillWrongIds])

  useEffect(() => {
    initMasteryForPack(pack).catch(() => {
      // Non-fatal: chips fall back to 0/0 display until next load
    })
    // The maze is the homepage now; the connectome tree no longer mounts to drive
    // the daily reset. Run it once on homepage open so synapse decay still ticks
    // for a user who opens the app without answering a question that day.
    // (recordCorrectAnswer also runs it in-tx, so this only matters for view-only days.)
    runDailyResetIfNeeded().catch(() => {
      // Non-fatal: decay will run on the next correct answer's in-tx reset.
    })
  }, [pack])

  useEffect(() => {
    // Read-only table reads (no daily-reset WRITE inside the liveQuery querier —
    // Dexie forbids writes in a querier; the reset is owned by the mount effect
    // above + recordCorrectAnswer).
    const sub = liveQuery(async () => {
      const [variants, familyAccrual] = await Promise.all([
        ownedSlotCount(db),
        db.familyAccrual.toArray(),
      ])
      const accrual = new Map<string, FamilyAccrual>(
        familyAccrual.map((r) => [
          r.familyId,
          { ap: r.ap, unlockedSlots: r.unlockedSlots, firedToday: r.firedToday },
        ]),
      )
      return { stats: { variants }, accrual }
    }).subscribe({
      next: (val) => {
        setStats(val.stats)
        setAccrualByFamily(val.accrual)
      },
      error: (err) => console.warn('[OverviewPage] stats query failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  // Refresh totalStudyMinutes display whenever the timer fires a minute side-effect
  // (signalled by minutesFired change) OR on mount.
  useEffect(() => {
    void readTotalStudyMinutes().then(setTotalStudyMin)
  }, [timer.minutesFired])

  // Open quizzes; expedition is mutually exclusive, so opening one closes it.
  // Per-family 🆕 新題 / 🔄 錯題 entry (add-neurons-quiz-mode-chips-and-srs).
  const openFamilyQuiz = (familyId: string, mode: QuizMode): void => {
    setExpeditionOpen(false)
    setQuickReviewActive(false)
    setQuizEntry({ familyId, mode })
  }

  // Open the 出征 expedition drill (cross-subject wrong questions); mutually
  // exclusive with the regular quiz.
  const openExpedition = (): void => {
    if (wrongCount === 0) return
    setQuizEntry(undefined)
    setQuickReviewActive(false) // full expedition, not a quick-review mini-batch
    setExpeditionOpen(true)
  }

  // 一鍵特訓: open a family-scoped ≤10-Q targeted drill (Feature 1). Mutually
  // exclusive with the other quiz entries.
  const openTargetedDrill = (familyId: string): void => {
    setQuizEntry(undefined)
    setQuickReviewActive(false)
    setExpeditionOpen(false)
    setTargetedDrill({ familyId })
  }

  // 考前救急: open the rescue scene. From the header entry `familyId` is undefined (setup
  // defaults to the first / active family); from a card's rescue chip it is that family.
  const openRescue = (familyId?: string): void => {
    setRescueInitialFamily(familyId)
    setRescueOpen(true)
  }

  // DMN quick-review-batch: the toast CTA emits `dmn.quickReviewStart`; open the
  // expedition modal capped to ≤5 wrong questions. Clears credit the expedition
  // DMN draw axis via onExpeditionComplete (closed loop). No-op if nothing wrong.
  useEffect(() => {
    const handler = (): void => {
      if (wrongCount === 0) return
      setQuizEntry(undefined)
      setQuickReviewActive(true)
      setExpeditionOpen(true)
    }
    dmnUiEvents.on('dmn.quickReviewStart', handler)
    return () => dmnUiEvents.off('dmn.quickReviewStart', handler)
  }, [wrongCount])

  // ── Embedded maze + decoupled family focus (redesign-neurons-homepage-squad-and-maze-focus): ONE
  // MazeGrid stacks ABOVE the family-card grid (collapsed to a teaser by default). Focusing a family
  // is a MAZE-CAMERA operation only — it NEVER enters a page detail mode. `focusedFamilyId` drives the
  // camera fly + the focused-card highlight; the card grid never collapses, every subject stays
  // answerable, and 🔭 全覽 is just a camera reset (not a required exit). `dockFamilyId` is the mobile-
  // only accordion anchor (the maze CSS-docks under the tapped card); the separate 收合 chevron removes
  // the dock (≠ 全覽, which only resets the camera). Expand pref is device-local (NOT synced); default =
  // expanded; a returning player's explicit collapse is respected (absent pref → stay expanded).
  const [mazeExpanded, setMazeExpanded] = useState(true)
  const [focusedFamilyId, setFocusedFamilyId] = useState<string | null>(null)
  // Transient「已聚焦腦圖：<科> ↑」nudge shown when 聚焦 fires while the (expanded) maze band is fully
  // offscreen-above — feedback without a forced scroll-jump. Auto-dismisses.
  const [focusToast, setFocusToast] = useState<string | null>(null)
  useEffect(() => {
    if (!focusToast) return
    const t = setTimeout(() => setFocusToast(null), 2200)
    return () => clearTimeout(t)
  }, [focusToast])
  // Mobile-only ephemeral dock anchor — which card the maze panel sits under. EPHEMERAL React state:
  // NOT persisted (reload clears it), NOT a meta key, NOT synced. Kept separate from focusedFamilyId
  // so mobile 🔭 全覽 can clear the spotlight while leaving the panel docked.
  const [dockFamilyId, setDockFamilyId] = useState<string | null>(null)
  // Pre-dock anchor top (mobile): captured at tap time BEFORE React applies the dock, so the layout
  // effect can scroll-compensate the tapped card to zero visible jump. Ref → no re-render.
  const dockAnchorRef = useRef<number | null>(null)
  useEffect(() => {
    let alive = true
    void db.meta.get('maze:homeExpanded').then((r) => { if (alive && r?.value === '0') setMazeExpanded(false) })
    return () => { alive = false }
  }, [])

  // ── 今日處方箋 (add-neurons-daily-prescription): the topmost homepage surface. The
  // reactive hook ensures today's frozen plan exists once, then liveQuery-tracks
  // line progress + NG-0717 maturation. Collapse pref is device-local (meta key,
  // NOT synced), mirroring maze:homeExpanded; default = expanded.
  const prescription = usePrescriptionStatus(pack)
  // NG-0717 分支印記: grown dendritic buds, enriched with per-subject colour + label.
  const rawImprints = useNg0717Imprints()
  const branchImprints = useMemo<EnrichedImprint[]>(() => {
    const byId = new Map(pack.subjects.map((s) => [s.id, s]))
    return rawImprints.map((im) => {
      const s = byId.get(im.subjectId)
      return {
        ...im,
        color: s?.color ?? '#c9a86a',
        displayName: s?.displayName ?? im.subjectId,
        group: s?.group ?? '',
      }
    })
  }, [rawImprints, pack.subjects])
  const [prescriptionCollapsed, setPrescriptionCollapsed] = useState(false)
  useEffect(() => {
    let alive = true
    void db.meta
      .get('prescription:homeCollapsed')
      .then((r) => { if (alive && r?.value === '1') setPrescriptionCollapsed(true) })
    return () => { alive = false }
  }, [])
  const togglePrescriptionCollapse = (): void => {
    setPrescriptionCollapsed((c) => {
      const next = !c
      void db.meta.put({ key: 'prescription:homeCollapsed', value: next ? '1' : '0' })
      return next
    })
  }
  // Single-CTA routing: next incomplete line → wrong-pool 出征, else 盲區 family fresh.
  const startPrescription = (): void => {
    const t = prescription?.nextTarget
    if (t === 'wrong') {
      openExpedition()
    } else if (t === 'breadth') {
      const famId = prescription?.plan?.breadthFamilyId
      if (famId) openFamilyQuiz(famId, 'fresh')
    }
    // both complete (t === null) → completed state, no route.
  }

  // ── 熄燈儀式 (neurons-lights-out): always-available "今天到此為止". Persists device-
  // local for the day (service key, NOT synced), clears at midnight. While active
  // the homepage enters a CALM state that quiets the push CTAs — NOT a hard lock;
  // 「還是想再讀一下」restores the normal homepage.
  const [lightsOut, setLightsOut] = useState(false)
  const [ritualOpen, setRitualOpen] = useState(false)
  useEffect(() => {
    let alive = true
    void isLightsOutToday().then((on) => { if (alive) setLightsOut(on) })
    return () => { alive = false }
  }, [])
  // Qualitative "touched today" families (firedToday OR sameDayCorrect>0) → display
  // labels only. NO metrics surfaced.
  const touchedFamilyLabels = useMemo(() => {
    const labels: string[] = []
    for (const [famId, a] of accrualByFamily) {
      const rawTouched = a.firedToday
      if (rawTouched) {
        labels.push(pack.subjects.find((s) => s.id === famId)?.displayName ?? famId)
      }
    }
    return labels
  }, [accrualByFamily, pack.subjects])
  const activateLightsOut = (): void => {
    setLightsOut(true)
    setRitualOpen(true)
    void setLightsOutToday()
  }
  const reopenStudy = (): void => {
    setLightsOut(false)
    void clearLightsOutToday()
  }
  const isMobileMaze = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  const prefersReduced = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const expandMaze = (): void => {
    setMazeExpanded(true)
    void db.meta.put({ key: 'maze:homeExpanded', value: '1' })
  }
  const collapseMaze = (): void => {
    setMazeExpanded(false)
    // Collapsing returns to the teaser at the top: drop both the desktop detail-mode (selection) and
    // the mobile dock so the layout fully resets (per A2「▴ 收合」).
    setFocusedFamilyId(null)
    setDockFamilyId(null)
    void db.meta.put({ key: 'maze:homeExpanded', value: '0' })
  }
  const focusFamilyOnMaze = (familyId: string): void => {
    const mobile = isMobileMaze()
    // Mobile: capture the tapped card's pre-dock viewport top so the layout effect can scroll-compensate.
    if (mobile) {
      const card = document.getElementById(`family-card-${familyId}`)
      dockAnchorRef.current = card ? card.getBoundingClientRect().top : null
    }
    setFocusedFamilyId(familyId)
    setDockFamilyId(familyId)
    expandMaze()
    emitMazeFocus(familyId, { manual: true })
    // Desktop: focus is camera-only — the card grid never reflows. If the maze band is fully scrolled
    // offscreen ABOVE the viewport, nudge with a toast (NOT a jump-to-top); if only partially above, a
    // gentle scrollIntoView({block:'nearest'}) brings it in. Mobile: the dock layout effect (keyed on
    // dockFamilyId) OWNS scroll, so do nothing here.
    if (!mobile) {
      requestAnimationFrame(() => {
        const band = document.querySelector('.neurons-md__detail') as HTMLElement | null
        if (!band) return
        const rect = band.getBoundingClientRect()
        const label = pack.subjects.find((s) => s.id === familyId)?.id ?? familyId
        if (rect.bottom <= 0) {
          setFocusToast(label) // fully above → feedback toast instead of a scroll-jump
        } else if (rect.top < 0) {
          band.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'nearest' })
        }
      })
    }
  }
  // 🔭 全覽 (or the maze topbar 🎯 chip) = camera reset back to the whole map: clear the focus (camera
  // recenter + card-highlight drop). The card grid never collapses, so 全覽 is a convenience — NOT a
  // required exit to resume answering. On MOBILE the panel STAYS docked (dockFamilyId untouched; the
  // separate 收合 chevron removes the dock) so 全覽 just shows the whole map without relayout.
  useEffect(() => onMazeRecenter(() => setFocusedFamilyId(null)), [])
  // Reverse link (maze → cards): tapping a family's walker on the stage selects its subject card.
  // BUG FIX (C′): walker-tap must ALSO emit a sticky focus — in detail mode the resulting full-width
  // stage resize fires the ResizeObserver → frameContextual would otherwise reframe to the WHOLE map
  // (focusRef null) and discard the family the player tapped. Emitting the manual focus keeps the
  // camera on that family across the resize.
  const onMazeFamilyTap = (familyId: string): void => {
    setFocusedFamilyId(familyId)
    setDockFamilyId(familyId)
    emitMazeFocus(familyId, { manual: true })
    requestAnimationFrame(() =>
      document.getElementById(`family-card-${familyId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    )
  }

  // ── Mobile A2 dock measurement (CSS visual move, DOM unchanged → no canvas re-parent/remount).
  // Writes `--maze-dock-top` (= tapped card bottom, offset 8px) + `--maze-dock-h` (= detail height) so
  // CSS can absolutely-position the detail under the card and open a matching gap. Runs pre-paint
  // (useLayoutEffect) so the anchor-scroll compensation is invisible. Mobile-only; desktop is a no-op.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const md = document.querySelector('.neurons-md') as HTMLElement | null
    const detail = document.querySelector('.neurons-md__detail') as HTMLElement | null
    if (!md || !detail) return
    if (dockFamilyId == null) {
      md.style.removeProperty('--maze-dock-top')
      md.style.removeProperty('--maze-dock-h')
      dockAnchorRef.current = null
      return
    }
    const card = document.getElementById(`family-card-${dockFamilyId}`)
    if (!card) return
    const measure = (): void => {
      const mdTop = md.getBoundingClientRect().top
      const cardBottom = card.getBoundingClientRect().bottom
      md.style.setProperty('--maze-dock-top', `${Math.round(cardBottom - mdTop + 8)}px`)
      const h = detail.getBoundingClientRect().height
      if (h > 0) md.style.setProperty('--maze-dock-h', `${Math.round(h)}px`)
    }
    measure()
    // Anchor-scroll compensation (only for a card-tap entry, which set dockAnchorRef): the dock removes
    // the in-flow maze above the cards, so the cards (incl. the tapped one) jump up — scroll back by the
    // delta so the tapped card stays visually fixed. Walker reverse-tap skips this (it scrolls-to-card).
    if (dockAnchorRef.current != null) {
      const afterTop = card.getBoundingClientRect().top
      const delta = afterTop - dockAnchorRef.current
      dockAnchorRef.current = null
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta)
    }
    // Re-measure the dock offset when card heights change while docked (live chip counts / reading label).
    const ro = new ResizeObserver(() => measure())
    const master = document.querySelector('.neurons-md__master')
    if (master) ro.observe(master)
    // Bounded: if the docked panel bottom overflows the viewport, nudge it into view (block:'nearest').
    const panelBottom = detail.getBoundingClientRect().bottom
    if (panelBottom > window.innerHeight) {
      detail.scrollIntoView({ block: 'nearest', behavior: prefersReduced() ? 'auto' : 'smooth' })
    }
    return () => ro.disconnect()
  }, [dockFamilyId, mazeExpanded])
  // Per-card maze-progress hints (deep card↔maze integration): each subject card renders a small
  // derived axon node-track (lit / frontier / 二週目) mirroring its tract on the ONE maze canvas.
  const mazeHintByFamily = useMemo(() => {
    const m = new Map<string, MazeFamilyHint>()
    for (const f of mazeView.families) {
      m.set(f.familyId, {
        lit: f.connectedCount,
        total: f.graph?.nodes.length ?? 0,
        firstRouteCount: f.graph?.firstRouteNodeCount ?? 0,
        complete: f.target === null,
      })
    }
    return m
  }, [mazeView])

  // Per-subject reading (add-neurons-maze-zoom-and-focus): each family card's 📖 entry
  // toggles that subject's reading session; starting/resuming also expands + focuses the maze
  // on that subject (sticky). One subject at a time — `timer.start(familyId)` switches if a
  // different subject was active.
  const onToggleReading = (familyId: string): void => {
    // Same subject + actively reading → toggle off (no focus needed when stopping).
    if (timer.readingFamilyId === familyId && timer.status === 'reading') {
      timer.stop()
      return
    }
    // Same subject + paused → resume; otherwise (idle / different subject) → start.
    if (timer.readingFamilyId === familyId && timer.status === 'paused') timer.resume()
    else timer.start(familyId)
    focusFamilyOnMaze(familyId)
  }

  const onFocusFamily = (familyId: string): void => {
    focusFamilyOnMaze(familyId)
  }

  // Wrong-pool 出征 settlement: credit the DMN expedition axis AND the connectome
  // (expedition co-repair → wiring + synaptic conduction). The year-set 模考 path
  // deliberately stays DMN-only (no connectome credit — D11). The wrong-only pool
  // means every correct IS a wrong→correct repair.
  const handleWrongExpeditionComplete = (s: {
    total: number
    correct: number
    correctBySubject: Record<string, number>
    energyBySubject: Record<string, number>
    wrongIds: string[]
    correctIds: string[]
  }): void => {
    onExpeditionComplete(s)
    // Bump the settlement token for this completion; the async credit below captures
    // it and only opens the recap if it is still current (not dismissed / not entered
    // repair) — avoids a stale late `setSettlement` re-opening a closed recap.
    settlementTokenRef.current += 1
    const token = settlementTokenRef.current
    // Offer the optional「當場回鍋」session-repair pass over THIS session's wrong
    // questions (Feature 4). Skippable; sourced only from the current session; no SRS /
    // DMN effect (handled by the QuizModal `sessionRepair` prop). Empty ⇒ not offered.
    setRepairWrongIds(s.wrongIds.length > 0 ? s.wrongIds : null)
    void (async () => {
      // Anti-farm arming (add-neurons-prescription-tiers-and-sync, design D6): the
      // settlement's counted repairs (this session's correct ids — in the wrong-only
      // pool every correct IS a repair) qualify for tier-countable synapse credit
      // only when they intersect the plan's frozen `wrongEligibleQuestionIds` (a
      // pre-today wrong set by construction). Armed BEFORE the credit call — the
      // synapse events are emitted synchronously inside it — and disarmed in the
      // finally, so a farm settlement (only fresh today-wrongs repaired) mints no
      // wire key.
      try {
        armPrescriptionWireCredit(await hasPreTodayWrongBasis(s.correctIds))
      } catch (err) {
        console.error('[prescription-wire] anti-farm basis check failed:', err)
        armPrescriptionWireCredit(false)
      }
      try {
        const result = await creditConnectomeFromExpedition({
          repairsBySubject: s.correctBySubject,
          energyBySubject: s.energyBySubject,
          sessionPool: s.total,
        })
        // Stale-guard: skip the recap open if this settlement was dismissed / superseded
        // (the recap close handlers + entering repair bump the token).
        if (settlementTokenRef.current !== token) return
        if (result.todayRepairs > 0) setSettlement(result)
        // Daily-completion ritual: fire once per day on the first effective completion
        // (polish-neurons-connectome-visual). Date-keyed ephemeral flag, NOT synced.
        if (result.effectiveCompletion) {
          const key = `connectome:ritualFired:${todayISO()}`
          const already = await db.meta.get(key)
          if (!already) {
            await db.meta.put({ key, value: '1' })
            setRitual({ streak: result.streak, nonce: Date.now() })
          }
        }
      } catch (err) {
        console.error('[connectome] expedition credit failed:', err)
      } finally {
        armPrescriptionWireCredit(false)
      }
    })()
  }

  // Dismiss the settlement recap (close / backdrop). Bumps the settlement token so a
  // still-in-flight connectome credit's late `.then` won't re-open the recap.
  const dismissSettlement = (): void => {
    settlementTokenRef.current += 1
    setSettlement(null)
    setRepairWrongIds(null)
  }

  // Enter the「當場回鍋」session-repair pass from the recap. Also bumps the token so a
  // late credit can't re-open the recap on top of the repair drill.
  const enterSessionRepair = (): void => {
    settlementTokenRef.current += 1
    setSettlement(null)
    setRepairOpen(true)
  }

  // Dynamic label for the actively-reading card (preserves the pause-reason feedback
  // the old global toolbar toggle showed).
  const readingActiveLabel = (() => {
    if (timer.status === 'reading') return `🟢 閱讀中 · ${timer.currentMinute} min · 點擊結束`
    if (timer.status === 'paused') {
      if (timer.pauseReason === 'visibility') return '⏸ 切到別的分頁 · 點擊繼續'
      return '⏸ 已暫停 · 點擊繼續'
    }
    return undefined
  })()

  // Split the display name at the em-dash into a big name + a smaller tagline so the long
  // English half no longer wraps mid-phrase on mobile (owner). Falls back to the whole string
  // if there's no separator.
  const [heroTitleMain, ...heroTitleRest] = pack.meta.displayName.split(' — ')
  const heroTitleTag = heroTitleRest.join(' — ')

  // The embedded maze detail surface (collapsed = teaser, expanded = the maze panel + a collapse
  // affordance). Passed into FamilyPicker as the master-detail's detail slot.
  const mazeSlot = mazeExpanded ? (
    // data-tutorial="maze": stable onboarding-spotlight anchor (tutorial agent contract). The collapsed
    // teaser below carries the same anchor so [data-tutorial="maze"] resolves in BOTH states (exactly
    // one of the two is mounted at a time).
    <div className="neurons-md__maze" data-tutorial="maze">
      <button type="button" className="neurons-maze-collapse" onClick={collapseMaze} aria-label="收合腦圖">
        🧠 腦圖 ▴ 收合
      </button>
      <div style={{ position: 'relative' }}>
        <MazeGrid view={mazeView} emphasisFamilyId={focusedFamilyId} onFamilyTap={onMazeFamilyTap} />
        {celebration && (
          <MazeCompletionCelebration key={celebration.nonce} label={celebration.label} />
        )}
        {ritual && <ExpeditionRitualCelebration key={ritual.nonce} streak={ritual.streak} />}
      </div>
    </div>
  ) : (
    <button type="button" className="neurons-maze-teaser" data-tutorial="maze" onClick={expandMaze} aria-label="展開腦圖">
      <span className="neurons-maze-teaser__row">
        <span className="neurons-maze-teaser__brain" aria-hidden>🧠</span>
        <span className="neurons-maze-teaser__label">神經元腦圖</span>
        <span className="neurons-maze-teaser__chev" aria-hidden>▾</span>
      </span>
      <span className="neurons-maze-teaser__hint">點開看連結神經元，或點任一科聚焦</span>
    </button>
  )

  return (
    <>
      <QuizHotkeysAnnouncementBanner />
      <LeaderboardPromoBanner />
      <OnboardingHost />

      {focusToast && (
        <div role="status" aria-live="polite" style={focusToastStyle}>
          <EmojiIcon char="🔭" size={14} decorative /> 已聚焦腦圖：{focusToast} ↑
        </div>
      )}

      <header style={heroStyle}>
        <div>
          <h1 style={heroTitleStyle}>
            {heroTitleMain}
            {heroTitleTag && <span style={heroTitleTagStyle}>{heroTitleTag}</span>}
          </h1>
          <p style={heroSubtitleStyle}>
            "Neurons that fire together, wire together." — Donald Hebb
          </p>
        </div>
      </header>

      {/* 今日處方箋 = the homepage's TOPMOST surface (add-neurons-daily-prescription):
          two small lines + one CTA that routes to the next incomplete line, plus the
          NG-0717 collectible + ambient exam countdown. Collapsible slim strip (device-
          local pref). While lights-out is active it is quieted (calm end-of-day state):
          the push CTA is hidden and only a summary strip remains, so the app stops
          prompting more work — NOT a hard lock (「還是想再讀一下」below restores it). */}
      {!lightsOut && (
        <DailyPrescriptionCard
          status={prescription}
          collapsed={prescriptionCollapsed}
          onToggleCollapse={togglePrescriptionCollapse}
          onStartPrescription={startPrescription}
          branchImprints={branchImprints}
        />
      )}

      {/* Merged daily-loop stat card = the homepage's top dashboard, ABOVE the maze
          (redesign-neurons-homepage-cta + fix-neurons-dashboard-card-rwd): ⚔️ 錯題出征
          primary CTA + connectome status (responsive causal chain) + DMN bar + the
          total-collection chips (🧬/💎/📖) folded in. Standalone strips are gone.
          Hidden while lights-out is active so the ⚔️ push CTA also stops prompting. */}
      {!lightsOut ? (
        <ConnectomeStatCard
          status={connStatus}
          hasEverAnsweredWrong={hasEverAnsweredWrong}
          wrongCount={wrongCount}
          pinnedCount={pinnedStillWrongIds.length}
          onExpedition={openExpedition}
          variants={stats.variants}
          totalStudyMin={totalStudyMin}
        />
      ) : (
        // Calm end-of-day state: no metrics, no "you stopped early" framing — just a
        // gentle acknowledgement + a low-key opt-back-in affordance.
        <section style={calmStateStyle} aria-label="收工中">
          <p style={calmLeadStyle}>🌙 今天已收工 · 好好休息</p>
          <button type="button" style={reopenBtnStyle} onClick={reopenStudy}>
            還是想再讀一下
          </button>
        </section>
      )}

      {/* ── Read-only squad preview (redesign-neurons-homepage-squad-and-maze-focus): the editable
            picker moved to the 圖鑑 (/collection) tab; the homepage keeps only this read-only entry. ── */}
      <SquadPreview />

      {/* How-to-play caption — describes the family grid + decoupled maze focus below. */}
      <p style={quizCtaHintStyle}>
        直接答題，或在下方科目卡片點 <EmojiIcon char="📖" size={14} decorative /> 閱讀（能量全進該科）。點卡片上的「<EmojiIcon char="🔍" size={14} decorative /> 聚焦」把該科聚焦在腦圖上（其他科照常作答、版面不跳）；<EmojiIcon char="🔭" size={14} decorative /> 全覽 把腦圖鏡頭拉回整張連結圖；走腦圖到節點即可抽出神經元。
      </p>

      {/* ── Family-grid + embedded-maze (redesign-neurons-homepage-squad-and-maze-focus): ONE MazeGrid
            stacks ABOVE the card grid. A card's 🔍 聚焦 button flies the maze CAMERA only — the grid
            never collapses, every subject stays answerable, and 🔭 全覽 just resets the camera (no detail
            mode, no dock header, no chip rail). Mobile: the maze docks under the tapped card. ONE canvas,
            never re-parented — CSS class-toggle only. ── */}
      <FamilyPicker
        pack={pack}
        accrualByFamily={accrualByFamily}
        modeCountsByFamily={modeCountsByFamily}
        weaknessByFamily={weakness.byFamily}
        onTargetedDrill={openTargetedDrill}
        onStartQuiz={openFamilyQuiz}
        onFocusFamily={onFocusFamily}
        onToggleReading={onToggleReading}
        readingFamilyId={timer.readingFamilyId}
        readingActiveLabel={readingActiveLabel}
        focusedFamilyId={focusedFamilyId}
        dockFamilyId={dockFamilyId}
        mazeExpanded={mazeExpanded}
        mazeSlot={mazeSlot}
        mazeHintByFamily={mazeHintByFamily}
        rescueChipByFamily={rescueChipByFamily}
        onOpenRescue={openRescue}
      />

      {/* Lofi 電台 — 收合式、OFF-by-default 彩蛋，塞在迷宮/科目格下方 (add-neurons-lofi-radio) */}
      <RadioWidget />

      {/* 單科考前救急 overlay (add-neurons-single-subject-rescue): device-local, one family at a
          time. Owns its own setup → blitz → overview → session flow; answers reuse QuizModal's
          rescue submit mode. Closing reverts the card/drill absorption via the plan-null signal. */}
      {rescueOpen && (
        <RescueScene
          pack={pack}
          initialFamilyId={rescueInitialFamily}
          onClose={() => setRescueOpen(false)}
        />
      )}

      {quizEntry !== undefined && expeditionOpen === false && (
        <QuizModal
          pool={quizPool}
          preserveOrder={quizEntry.mode === 'review'}
          onClose={() => setQuizEntry(undefined)}
        />
      )}

      {/* 出征 (expedition) drill — cross-subject wrong questions (full pool, or a
          ≤5 quick-review mini-batch when quickReviewActive). onComplete credits
          the expedition DMN draw axis. (add-neurons-study-squad / realign-dmn-event-rewards-to-maze) */}
      {expeditionOpen && (
        <QuizModal
          pool={expeditionPool}
          onClose={() => {
            // Both paths consume the pins — null the served pins' pinnedAt (fresh
            // updatedAt) so the dequeue propagates cross-device under per-row LWW
            // (add-neurons-pin-queue-r2-sync). dequeueQuickReview only touches rows
            // actually pinned, so passing the full served pool is a safe intersection.
            void dequeueQuickReview(expeditionPool.map((q) => q.id))
            setExpeditionOpen(false)
            setQuickReviewActive(false)
          }}
          onComplete={handleWrongExpeditionComplete}
        />
      )}

      {/* 一鍵特訓 — family-scoped ≤10-Q targeted drill of high-weakness questions
          (add-neurons-weakness-radar-and-error-repair, Feature 1). Normal recording +
          SRS path (a scoped launcher, not a new scorer); no onComplete → no DMN credit. */}
      {targetedDrill !== undefined && (
        <QuizModal
          pool={targetedDrillPool}
          preserveOrder
          onClose={() => setTargetedDrill(undefined)}
        />
      )}

      {/* 當場回鍋 session-repair pass — this session's wrong questions, each once, with
          NO SM-2 schedule change and NO DMN credit (Feature 4). Skippable. */}
      {repairOpen && (
        <QuizModal
          pool={repairPool}
          preserveOrder
          sessionRepair
          onClose={() => {
            setRepairOpen(false)
            setRepairWrongIds(null)
          }}
        />
      )}

      {/* 模考 picker + pure-practice drill moved to the 題庫 tab (QuestionBankPage)
          per tidy-neurons-homepage-ui. */}

      {/* 出征結算 recap surface. Rendered whenever EITHER a connectome settlement exists
          (todayRepairs > 0) OR this session has repairable wrong questions — so a
          full-wrong / no-repair session (the player who most needs to re-drill) still
          gets the「當場回鍋」entry. `todayRepairs` is a STAT shown inside, NOT the render
          gate for the session-repair CTA (add-neurons-weakness-radar-and-error-repair,
          Feature 4 — decoupled per Codex #3). */}
      {!repairOpen && (settlement || (repairWrongIds !== null && repairWrongIds.length > 0)) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="出征結算"
          style={examMenuBackdropStyle}
          onClick={dismissSettlement}
        >
          <div style={examMenuPanelStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={examMenuTitleStyle}>出征結算</h2>
            {settlement ? (
              <>
                <p style={{ margin: '0.25rem 0', fontWeight: 600 }}>
                  今日修復 {settlement.todayRepairs} 題
                  {settlement.effectiveCompletion
                    ? ` · ✓ 出征完成 · 連續 ${settlement.streak} 天`
                    : ' · 尚未達成有效完成（今日修復滿 5 題）'}
                </p>
                {settlement.newlyWired.length > 0 && (
                  <ul style={{ margin: '0.4rem 0', paddingLeft: '1.1rem' }}>
                    {settlement.newlyWired.map((w) => (
                      <li key={w.pairKey}>
                        {w.formed ? (
                          <><EmojiIcon char="🔗" size={13} decorative /> 新連線</>
                        ) : (
                          <><EmojiIcon char="⚡" size={13} decorative /> 強化連線</>
                        )}：{w.pairKey.replace('|', ' – ')}
                      </li>
                    ))}
                  </ul>
                )}
                {settlement.conductionFlows.length > 0 ? (
                  <>
                    <p style={{ margin: '0.4rem 0 0.2rem', fontWeight: 600 }}>突觸傳導</p>
                    <ul style={{ margin: '0 0 0.4rem', paddingLeft: '1.1rem' }}>
                      {settlement.conductionFlows.map((f, i) => (
                        <li key={`${f.fromFamily}-${f.toFamily}-${i}`}>
                          {f.fromFamily} → {f.toFamily} +{f.amount} 能量
                        </li>
                      ))}
                    </ul>
                    <p style={{ margin: '0.2rem 0', fontWeight: 600 }}>
                      今日連線額外獲得 +
                      {settlement.conductionFlows.reduce((a, f) => a + f.amount, 0)} 能量
                    </p>
                  </>
                ) : (
                  settlement.newlyWired.length === 0 && (
                    <p style={{ margin: '0.4rem 0', color: '#5a3f29' }}>
                      今日已修復，尚未形成跨科連線（需 ≥2 科各修復 ≥2 題）。
                    </p>
                  )
                )}
                {/* About-to-wire ghost line (polish-neurons-connectome-visual): nudge toward
                    the closest pair. Honest empty state = render nothing when null. */}
                {aboutToWire && (
                  <p style={{ margin: '0.4rem 0', color: '#1d6f6a', fontWeight: 600 }}>
                    💡 再修復 {aboutToWire.subjectB} {aboutToWire.remaining} 題，即可和 {aboutToWire.subjectA} 形成連線
                  </p>
                )}
              </>
            ) : (
              // No connectome settlement (0 today-repairs) but the session missed some —
              // a repair-only recap so the entry is never gated away.
              <p style={{ margin: '0.25rem 0', color: '#5a3f29' }}>
                這場出征還有答錯的題目，趁記憶新鮮先回鍋修一遍。
              </p>
            )}
            {/* 當場回鍋 session-repair CTA (Feature 4): re-answer THIS session's wrong
                questions once, no SRS / DMN effect. Distinct from the DMN「快速複習」card
                (historical pool + DMN-axis credit). Shown whenever the session missed some,
                independent of todayRepairs. */}
            {repairWrongIds !== null && repairWrongIds.length > 0 && (
              <button
                type="button"
                onClick={enterSessionRepair}
                style={sessionRepairBtnStyle}
              >
                <EmojiIcon char="🩹" size={14} decorative /> 當場回鍋 · 把這場錯的 {repairWrongIds.length} 題再答一次
              </button>
            )}
            <button
              type="button"
              onClick={dismissSettlement}
              style={examMenuOptionStyle}
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* 今天到此為止 (neurons-lights-out): always-available closure control. Hidden
          only while already lit-out (the calm-state「還是想再讀一下」handles re-entry). */}
      {!lightsOut && (
        <div style={lightsOutBarStyle}>
          <button type="button" style={lightsOutBtnStyle} onClick={activateLightsOut}>
            🌙 今天到此為止
          </button>
        </div>
      )}

      {/* Closure ritual overlay — plays once on activation; the lights-out state
          itself persists for the day after the overlay is dismissed. */}
      {ritualOpen && (
        <LightsOutRitual
          touchedFamilyLabels={touchedFamilyLabels}
          onClose={() => setRitualOpen(false)}
        />
      )}

      <footer style={{ marginTop: '2rem', fontSize: '0.8em', color: '#5a3f29' }}>
        <p style={{ margin: '0.25rem 0' }}>
          來源：
          {pack.meta.credits.map((c, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.name}
                </a>
              ) : (
                c.name
              )}
              （{c.license}）
            </span>
          ))}
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          開源 fork engine · AGPL-3.0 · content packs CC-BY-NC · 本站不收費、不放廣告。
          <br />
          回報問題 / 想法 → 從各頁設定面板的「回報問題」按鈕，或開 GitHub issue。
        </p>
      </footer>
    </>
  )
}

// 遠征選單 + 年份回數 paper picker (add-neurons-exam-set-expedition).
const examMenuBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(40, 28, 16, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}

const examMenuPanelStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '3px solid #8c6d4a',
  borderRadius: '8px',
  padding: '1.1rem 1.25rem',
  width: 'min(420px, 92vw)',
  maxHeight: '82vh',
  overflowY: 'auto',
  boxShadow: '0 8px 28px rgba(60, 42, 26, 0.35)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
}

const examMenuTitleStyle: React.CSSProperties = {
  margin: '0 0 0.25rem',
  fontSize: '1.05rem',
  fontWeight: 700,
  color: '#3a2a1a',
}

const examMenuOptionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.7rem 0.9rem',
  border: '2px solid #b8893a',
  borderRadius: '6px',
  background: '#fff',
  color: '#5a3f29',
  fontWeight: 600,
  fontSize: '0.95rem',
  cursor: 'pointer',
}

// 當場回鍋 session-repair CTA — accent green (repair) so it reads distinct from the
// neutral 關閉 button and the DMN「快速複習」card.
const sessionRepairBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  padding: '0.7rem 0.9rem',
  border: '2px solid #2f8f4e',
  borderRadius: '6px',
  background: '#e8f5e8',
  color: '#2f6b3a',
  fontWeight: 700,
  fontSize: '0.92rem',
  cursor: 'pointer',
}

const heroStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f4ecd8 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
}

const heroTitleStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  margin: '0 0 0.3rem',
  color: '#3a2a1a',
}

// English half of the display name — a smaller inline tagline trailing the big name on the SAME
// row (owner: space is enough for one line). `nowrap` keeps "Long-term Potentiation" together,
// so on a too-narrow viewport the whole tagline drops to its own line instead of breaking mid-phrase.
const heroTitleTagStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: '#7a5a3a',
  marginLeft: '0.5rem',
  whiteSpace: 'nowrap',
}

const heroSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#5a3f29',
  fontStyle: 'italic',
  // Shrink-to-fit so the Hebb quote sits on one line on a phone (owner: it wrapped to two rows
  // at a fixed 0.9rem). Caps at 0.9rem on desktop.
  fontSize: 'clamp(0.65rem, 2.8vw, 0.9rem)',
}

const quizCtaHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
  lineHeight: 1.55,
}

// Offscreen-focus nudge (D7): a brief top toast when 聚焦 fires while the maze band is scrolled
// fully above the viewport — feedback without a jump-to-top.
// Calm end-of-day state shown in place of the stat card after lights-out.
const calmStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '1.1rem 1rem',
  marginBottom: '1rem',
  background: 'linear-gradient(135deg, #eceaf2 0%, #e3e1ee 100%)',
  border: '2px solid #c4bfd6',
  borderRadius: '8px',
}

const calmLeadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#544a6a',
}

const reopenBtnStyle: React.CSSProperties = {
  padding: '0.45rem 1.1rem',
  borderRadius: '999px',
  border: '1px solid #b2aacb',
  background: '#fff',
  color: '#6a5f8a',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}

// Always-available「今天到此為止」bar near the bottom of the homepage.
const lightsOutBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: '1.5rem',
}

const lightsOutBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.4rem',
  borderRadius: '999px',
  border: '1px solid #b2aacb',
  background: 'linear-gradient(135deg, #4a4a72 0%, #363658 100%)',
  color: '#eef0fb',
  fontFamily: 'inherit',
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
}

const focusToastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1100,
  padding: '0.5rem 0.9rem',
  borderRadius: '999px',
  background: 'rgba(40, 28, 16, 0.92)',
  color: '#fdf6e3',
  fontSize: '0.85rem',
  fontWeight: 600,
  boxShadow: '0 4px 14px rgba(20, 14, 38, 0.4)',
  pointerEvents: 'none',
}
