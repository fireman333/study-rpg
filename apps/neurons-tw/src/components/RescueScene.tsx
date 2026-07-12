/**
 * RescueScene — 單科考前救急 full-screen overlay (add-neurons-single-subject-rescue).
 *
 * One family, one exam date, a backward-planned daily queue. A self-contained overlay
 * (portaled to <body>, like SpeedReviewPage, to escape the AnimatedRoutes transform)
 * that owns the whole rescue flow: setup → D-scaled diagnostic blitz → overview
 * (RescueScore + 戰情圖 + stop-loss re-read) → today's queue / exam-morning quick-scan.
 * The plan / confidence / overrides sync cross-device via the R2 `neurons` bundle
 * (add-neurons-rescue-r2-sync) when signed in; only telemetry stays device-local.
 * Answering reuses QuizModal in its rescue submit mode (pre-reveal two-button
 * confidence). Zero Dexie bump (rides the existing `meta` kv).
 *
 * Spec: openspec/changes/add-neurons-single-subject-rescue/specs/
 *       neurons-single-subject-rescue/spec.md (+ neurons-homepage / neurons-weakness-radar deltas)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { QuizModal } from './QuizModal'
import { EmojiIcon } from './EmojiIcon'
import { useCram } from '../lib/cram'
import { loadHandout } from '../lib/handout'
import { resolveLeafToRegion } from '../lib/handout-regions'
import { useConceptTags, conceptLabel } from '../lib/concept-tags'
import { useQuestionHistory } from '../lib/services/question-history'
import { useAllFlags } from '../lib/services/question-flags'
import { filterPoolByFamily } from '../lib/services/quiz-pool'
import { todayISO } from '../lib/db'
import {
  useRescuePlan,
  useRescuePlans,
  useRescueState,
  getActivePlan,
  getActivePlans,
  startRescue,
  editRescuePlan,
  abandonRescue,
  archiveIfDue,
  touchLastStudied,
  setOverride,
  recordConfidence,
  isBlitzDone,
  markBlitzDone,
  deferBlitzDone,
  deferTouchLastStudied,
  flushPendingRescueLifecycle,
  appendTelemetry,
  exportTelemetry,
  shouldShowReconcileNote,
  markPlanKnown,
  useRescueHydrated,
} from '../lib/services/rescue/rescue-store'
import { computeRescueD, rescuePhase } from '../lib/services/rescue/rescue-lifecycle'
import { computeConceptMastery, computeRescueScore } from '../lib/services/rescue/rescue-score'
import { isOverrideExpired } from '../lib/services/rescue/rescue-stoploss'
import { findCramSubject, resolveConceptRereadCard } from '../lib/services/rescue/rescue-reread'
import type { ConfidenceSignal } from '../lib/services/rescue/rescue-priority'
import {
  buildBlitzPool,
  buildWarMap,
  buildConceptYield,
  assembleRescueQueue,
  computeReadiness,
  buildQuickScanPool,
  buildConceptStatsToday,
  interleaveByBlock,
  type WarMapConcept,
} from '../lib/services/rescue/rescue-session'
import { useAuth } from '../lib/auth/AuthContext'
import { useSyncContext } from '../lib/sync/SyncProvider'

interface Props {
  pack: ContentPack
  /** A card chip passes its family → open that family's scene directly; a bare entry
   *  (no family, no startInSetup) opens the fallback multi-plan overview list (or setup
   *  when no plan is active). */
  initialFamilyId?: string
  /** Hub「＋ 新增計畫」entry (fold-rescue-list-into-exam-prep-hub): boot straight into
   *  add-new-plan setup even when other plans are active. The single conscious crossing of
   *  the「don't touch RescueScene internals」boundary — see the phase + setupTouched
   *  initializers. Ignored when `initialFamilyId` is set. */
  startInSetup?: boolean
  onClose: () => void
}

// 'list' = the multi-plan overview (add-neurons-multi-subject-rescue). Since
// fold-rescue-list-into-exam-prep-hub it is FALLBACK-ONLY (the hub rescue status strip is the
// homepage-reachable plan list): reached only as the mid-scene plan-vanish safety net and the
// in-scene 切科 / back-to-list exit — NOT a homepage entry destination. Keep it (do not delete
// in a dead-code audit): deleting it degrades the cross-device abandon UX. 'overview' remains the
// per-plan RescueScore / 戰情圖 / stop-loss view for the currently-viewed family.
type Phase = 'list' | 'setup' | 'overview' | 'blitz' | 'session' | 'quickscan'

const DAY_MS = 86_400_000
function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Fixed 國考第一階 exam date for this cycle (design D5 / open-Q). Post-cycle reuse falls back to
 *  today+3 once the fixed date is past; always clamped inside the +14 run-sync window ceiling. */
const FIXED_EXAM_ISO = '2026-07-17'
function defaultExamISO(): string {
  const today = todayISO()
  if (FIXED_EXAM_ISO < today) return addDaysISO(today, 3)
  const max = addDaysISO(today, 14)
  return FIXED_EXAM_ISO > max ? max : FIXED_EXAM_ISO
}

const RETURN_COPY: Record<string, string> = {
  夯: '再讀這幾天，回報很高。',
  普通: '還有可回收的分數，穩穩刷。',
  低迷: '這科邊際回報較低，收斂就好。',
}
const WAR_BAND_COLOR: Record<WarMapConcept['band'], string> = {
  red: '#c44d4d',
  yellow: '#d4a04d',
  grey: '#b7ac93',
}
const WAR_BAND_LABEL: Record<WarMapConcept['band'], string> = {
  red: '高頻弱點 / 高信心答錯',
  yellow: '待鞏固',
  grey: '尚未診斷',
}

export function RescueScene({ pack, initialFamilyId, startInSetup, onClose }: Props): JSX.Element | null {
  // The family whose scene is open (null → the overview list / setup). Every downstream
  // memo + lifecycle write scopes to this family; there is NO mid-session cross-subject
  // switcher (切科 = back to the list). A card chip opens its family directly; the header
  // entry opens the list (or setup when no plan is active).
  const [viewingFamily, setViewingFamily] = useState<string | null>(() =>
    initialFamilyId && getActivePlan(initialFamilyId) ? initialFamilyId : null,
  )
  const plan = useRescuePlan(viewingFamily ?? '')
  const plans = useRescuePlans()
  const state = useRescueState()
  const { status } = useAuth()
  // Signed in → the plan / confidence / overrides sync cross-device; otherwise
  // they only live on this device. Drives the storage-scope copy (no chip — the
  // app already shows a global sync chip).
  const synced = status === 'authed'
  const syncCtx = useSyncContext()
  const rescueHydrated = useRescueHydrated()
  // Review-B1 gate: while the local mirror hasn't hydrated, or an authed
  // device's startup force-pull hasn't landed yet (fresh sign-in / cold boot),
  // a cloud plan may still be inbound — starting a rescue NOW could silently
  // restart the run it's about to receive. Hold the setup CTA on「同步中…」.
  // An unseeded sync provider (`status == null`, before useSync's effect mounts)
  // is ALSO pending — the first pull definitely hasn't landed yet (Codex fix-review
  // low: the null-provider window). Fails open on pull error (offline: state ===
  // 'error') and once the first pull lands (lastPullAt set), so it never sticks.
  const startupSyncPending =
    !rescueHydrated ||
    (synced &&
      (syncCtx?.status == null ||
        (syncCtx.status.lastPullAt === null && syncCtx.status.state !== 'error')))
  const history = useQuestionHistory()
  const flags = useAllFlags()
  const conceptTags = useConceptTags()
  const cram = useCram()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // The run (familyId + createdAt) FROZEN at the moment the current answering phase opened.
  // A confidence tap records under THIS run, not a write-time `getActivePlan()` resolve, so a
  // plan sync-replaced mid-session (new createdAt) can't misfile the tap under the new run —
  // `recordConfidence` no-ops on a createdAt mismatch (Codex/Fable review fix 2).
  const activeRunRef = useRef<{ familyId: string; createdAt: number } | null>(null)
  const captureRun = (familyId: string, createdAt: number): void => {
    activeRunRef.current = { familyId, createdAt }
  }
  // A card-chip / direct entry can boot straight into an answering phase (blitz) via the
  // phase initializer, which runs no transition handler — capture the run once on mount.
  useEffect(() => {
    if (!initialFamilyId) return
    const p = getActivePlan(initialFamilyId)
    if (p) captureRun(initialFamilyId, p.createdAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Auto-archive a plan whose exam has passed (reverts absorption via the plan-null signal).
  // Cross-device safety (mirrors the B1 startRescue gate on the same `startupSyncPending`):
  // archiveIfDue writes a fresh-`updatedAt` `plan: null` that LWW-wins account-wide. Running it
  // before the startup force-pull lands would let a stale device null-clobber another device's
  // newer active run (2026-07-08 re-check finding). Hold until the first pull has landed;
  // offline fails open via `startupSyncPending`, leaving only the inherent offline-LWW residual.
  useEffect(() => {
    if (startupSyncPending) return
    archiveIfDue(todayISO())
  }, [startupSyncPending])
  // Flush any DEFERRED lifecycle write (blitz completion / study-touch) once the startup pull
  // has landed. The pending state is MODULE-LEVEL (rescue-store) so it also survives this
  // scene unmounting before the pull lands — the sync layer fires the same flush on startup
  // settlement. This mounted effect covers the ~1s status-poll lag between the pull landing
  // and `startupSyncPending` flipping (Codex/Fable review fix 3).
  useEffect(() => {
    if (startupSyncPending) return
    flushPendingRescueLifecycle()
  }, [startupSyncPending])

  const [phase, setPhase] = useState<Phase>(() => {
    if (initialFamilyId) {
      const p = getActivePlan(initialFamilyId)
      if (p) return isBlitzDone(initialFamilyId, p.createdAt) ? 'overview' : 'blitz'
      return 'setup'
    }
    // Hub「＋ 新增計畫」entry (fold-rescue-list-into-exam-prep-hub): boot straight into
    // add-new-plan setup even with active plans present. Placed after the initialFamilyId
    // block so it only applies to the no-family entry (the setupTouched initializer keeps
    // the untouched-setup redirect from bouncing it to 'list').
    if (startInSetup) return 'setup'
    return getActivePlans().length > 0 ? 'list' : 'setup'
  })
  // Setup form state. Default family = the card-chip family, else the first subject WITHOUT an
  // active plan (so「＋ 新增計畫」lands on something new), else the first subject.
  const [setupFamily, setSetupFamily] = useState<string>(
    () => initialFamilyId ?? pack.subjects.find((s) => !getActivePlan(s.id))?.id ?? pack.subjects[0]?.id ?? '',
  )
  const [setupExam, setSetupExam] = useState<string>(() => defaultExamISO())
  const [setupMinutes, setSetupMinutes] = useState<number>(30)
  // 救急 = last-minute sprint: cap the exam date at today+14 so the plan's whole
  // life fits inside the `isSyncedRescueKey` 14-day run-sync window (a longer
  // "rescue" would silently stop syncing confidence from day 15 — review quick-fix).
  const maxExamISO = addDaysISO(todayISO(), 14)
  // Whether the user has interacted with the setup form THIS viewing — an
  // untouched setup carries no intent, so a plan landing via the startup pull
  // may take the scene over (review-B1); once touched, we never yank the form.
  // The hub「＋」add-plan entry (startInSetup) inits touched=true — the SAME
  // deliberate-add semantics as goToSetup — so the untouched-setup redirect below
  // doesn't bounce it to 'list'. Existing undefined / familyId entries keep it false.
  const [setupTouched, setSetupTouched] = useState(Boolean(startInSetup && !initialFamilyId))
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  // One-time "continued from another device" hint: shown when the viewed plan arrived via
  // sync (not started on this device) — set when a plan's scene is opened — then marked
  // acknowledged so it never repeats. (add-neurons-rescue-r2-sync Focus-2)
  const [reconcileNote, setReconcileNote] = useState<boolean>(() => {
    if (!initialFamilyId) return false
    const p = getActivePlan(initialFamilyId)
    return p ? shouldShowReconcileNote(p.createdAt) : false
  })
  useEffect(() => {
    if (!viewingFamily) return
    const p = getActivePlan(viewingFamily)
    if (p && reconcileNote) markPlanKnown(p.createdAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the viewed plan vanished (archived / abandoned) while inside its scene, fall back to
  // the overview list (or setup when no plan remains) — NOT close the whole scene, so other
  // families' plans stay reachable.
  useEffect(() => {
    const perPlan = phase === 'overview' || phase === 'blitz' || phase === 'session' || phase === 'quickscan'
    if (perPlan && !plan) {
      setViewingFamily(null)
      setReconcileNote(false)
      setPhase(getActivePlans().length > 0 ? 'list' : 'setup')
    }
  }, [plan, phase])

  // Review-B1 (cross-device takeover): a fresh device cold-boots with no plans → 'setup', then
  // the startup force-pull lands cloud plans. If the user hasn't touched the setup form, hand
  // the scene to the overview list rather than let a tap on 開始救急 mint a fresh (clobbering)
  // run. Only an UNtouched initial setup is redirected (a deliberate 新增計畫 sets touched).
  useEffect(() => {
    if (phase !== 'setup' || setupTouched) return
    if (plans.length > 0) setPhase('list')
  }, [phase, setupTouched, plans.length])

  const subjectId = plan?.familyId ?? ''
  // Header + copy use the 科目 (subject) name — which IS the subject `id` in neurons —
  // NOT the neuron persona `displayName` (owner request: 「考前救急 · 藥理學」, not the persona).
  const familyName = subjectId
  const subjectQuestions = useMemo(
    () => (plan ? filterPoolByFamily(pack.questions, subjectId) : []),
    [plan, pack.questions, subjectId],
  )
  const cramSubject = useMemo(() => findCramSubject(cram, subjectId), [cram, subjectId])
  const push = cramSubject?.push ?? []
  const histById = useMemo(() => new Map(history.map((h) => [h.questionId, h])), [history])
  const flagById = useMemo(() => new Map(flags.map((f) => [f.questionId, f])), [flags])
  // Confidence + overrides scope to the VIEWING family's active run (per-family maps).
  const confidenceById = useMemo<Map<string, ConfidenceSignal>>(
    () => new Map(Object.entries(viewingFamily ? state.confidenceByFamily[viewingFamily] ?? {} : {})),
    [state.confidenceByFamily, viewingFamily],
  )
  const conceptStats = useMemo(
    () => (plan ? buildConceptStatsToday(subjectQuestions, history, conceptTags) : new Map()),
    [plan, subjectQuestions, history, conceptTags],
  )
  const overrideConcepts = useMemo(() => {
    const now = Date.now()
    const s = new Set<string>()
    const overrides = viewingFamily ? state.overridesByFamily[viewingFamily] ?? {} : {}
    for (const [cid, ov] of Object.entries(overrides)) {
      const attempts = conceptStats.get(cid)?.attemptsToday ?? 0
      if (!isOverrideExpired(ov, now, attempts)) s.add(cid)
    }
    return s
  }, [state.overridesByFamily, viewingFamily, conceptStats])

  const assembled = useMemo(() => {
    if (!plan) return null
    return assembleRescueQueue({
      subjectQuestions,
      history,
      flagById,
      confidenceById,
      conceptTags,
      push,
      overrideConcepts,
      conceptStats,
      dailyMinutes: plan.dailyMinutes,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, subjectQuestions, history, flagById, confidenceById, conceptTags, cram, overrideConcepts, conceptStats])

  const warMap = useMemo(
    () =>
      assembled
        ? buildWarMap(subjectQuestions, history, assembled.conceptYield, conceptTags, confidenceById)
        : [],
    [assembled, subjectQuestions, history, conceptTags, confidenceById],
  )
  const readiness = useMemo(
    () =>
      assembled
        ? computeReadiness(history, assembled.conceptYield, conceptTags, assembled.dayMeanMovability)
        : null,
    [assembled, history, conceptTags],
  )
  // 戰情圖 sections: split the labelled concepts into 紅優先 / 黃待鞏固 / 灰未診斷, each
  // capped for a <5s pre-exam glance. Red is sorted hi-confidence-wrong first (the worst
  // leak surfaces at the very top). Concepts without a resolvable label are dropped.
  const warSections = useMemo(() => {
    const labeled = warMap
      .map((c) => ({ ...c, zh: conceptLabel(subjectId, c.conceptId) }))
      .filter((c) => c.zh)
    const red = labeled
      .filter((c) => c.band === 'red')
      .sort((a, b) => Number(b.hiConfWrong) - Number(a.hiConfWrong))
    const yellow = labeled.filter((c) => c.band === 'yellow')
    const grey = labeled.filter((c) => c.band === 'grey')
    return [
      { band: 'red' as const, label: '優先高頻弱點', items: red, cap: 6 },
      { band: 'yellow' as const, label: '待鞏固', items: yellow, cap: 4 },
      { band: 'grey' as const, label: '尚未診斷', items: grey, cap: 3 },
    ]
  }, [warMap, subjectId])

  // 戰情圖 → 考前講義 deep-link (add-neurons-handout-rescue-deeplink). A tapped concept lazily loads
  // the (module-cached, ~3 MB) handout bundle, resolves its leaf → region for THIS subject, then
  // navigates. `handoutBusy` drives per-chip aria-busy; `handoutNote` surfaces the two null cases
  // (no region vs bundle load failure); `handoutNavRef` guards a rapid double-tap across chips.
  const navigate = useNavigate()
  const [handoutBusy, setHandoutBusy] = useState<string | null>(null)
  const [handoutNote, setHandoutNote] = useState<{ conceptId: string; zh: string; kind: 'no-region' | 'load-fail' } | null>(null)
  const handoutNavRef = useRef(false)

  const openConceptHandout = useCallback(
    async (conceptId: string, zh: string): Promise<void> => {
      if (handoutNavRef.current) return // double-tap guard: a resolution is already in flight
      handoutNavRef.current = true
      setHandoutNote(null)
      setHandoutBusy(conceptId)
      const data = await loadHandout()
      if (!data) {
        // Bundle failed to load — a retryable state, NOT the escape hatch (the handout top would
        // fail on the same bundle). loadHandout resets its inflight so the retry actually re-fetches.
        setHandoutNote({ conceptId, zh, kind: 'load-fail' })
        setHandoutBusy(null)
        handoutNavRef.current = false
        return
      }
      const subj = data.subjects.find((s) => s.subjectId === subjectId)
      const hit = subj ? resolveLeafToRegion(subj.chapterQuizzes, conceptId) : null
      if (!hit) {
        // Loaded fine but this leaf owns no region (e.g. a 送分/disputed-only leaf) — stay put with an
        // escape hatch to the subject's handout top. Never navigate to a wrong region / region 0.
        setHandoutNote({ conceptId, zh, kind: 'no-region' })
        setHandoutBusy(null)
        handoutNavRef.current = false
        return
      }
      // Success: dismiss the overlay (hygiene; the route unmount also tears it down) then navigate.
      // Carry the LEAF (not the resolved region): the handout's (subject, leaf) resolver lands at leaf
      // granularity — the leaf's primary topic sub-anchor when present, else its region. `hit` is used
      // ONLY as the mapped-vs-unmapped gate; region vs chapter stays an internal resolver detail
      // (add-neurons-handout-unit-correspondence).
      onClose()
      navigate(`/cram/handout?subject=${encodeURIComponent(subjectId)}&leaf=${encodeURIComponent(conceptId)}&from=rescue`)
    },
    [subjectId, navigate, onClose],
  )

  const openSubjectHandoutTop = useCallback((): void => {
    onClose()
    navigate(`/cram/handout?subject=${encodeURIComponent(subjectId)}&from=rescue`)
  }, [subjectId, navigate, onClose])

  const d = plan ? computeRescueD(plan.examDate, todayISO()) : 0
  const phaseKind = plan ? rescuePhase(plan.examDate, todayISO()) : 'active'

  // Today's set. Exam-eve (D1) is consolidation-only — no brand-new (unanswered) items.
  const daySet = useMemo(() => {
    if (!assembled) return []
    let core = assembled.day
    if (phaseKind === 'exam-eve') core = core.filter((q) => histById.has(q.id))
    const addon = interleaveByBlock(assembled.queue.addon, conceptTags)
    return [...interleaveByBlock(core, conceptTags), ...addon]
  }, [assembled, phaseKind, histById, conceptTags])

  const blitzPool = useMemo(() => {
    if (!plan || !assembled) return []
    return buildBlitzPool(subjectQuestions, histById, assembled.conceptYield, conceptTags, d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, assembled, subjectQuestions, histById, conceptTags, d])

  const quickScanPool = useMemo(
    () =>
      assembled
        ? buildQuickScanPool(subjectQuestions, histById, confidenceById, assembled.conceptYield, conceptTags)
        : [],
    [assembled, subjectQuestions, histById, confidenceById, conceptTags],
  )

  const rereadCards = useMemo(
    () =>
      assembled
        ? assembled.rereadConcepts.map((cid) => resolveConceptRereadCard(cramSubject, cid))
        : [],
    [assembled, cramSubject],
  )

  // Overview-list cards — D + RescueScore for EVERY active plan (multiple coexist). Each plan's
  // score is computed independently over its family-scoped pool + history (corpus-percentile
  // Yield fallback; the per-plan scene refines with cram tiers on open).
  const planCards = useMemo(
    () =>
      plans.map((p) => {
        const scoped = filterPoolByFamily(pack.questions, p.familyId)
        const conceptYield = buildConceptYield([], scoped, conceptTags)
        const scopedHistory = history.filter((h) => h.family === p.familyId)
        const mastery = computeConceptMastery(scopedHistory, conceptTags)
        return {
          familyId: p.familyId,
          accent: pack.subjects.find((s) => s.id === p.familyId)?.color ?? '#8c6d4a',
          d: computeRescueD(p.examDate, todayISO()),
          score: computeRescueScore(mastery, conceptYield),
        }
      }),
    [plans, pack.questions, pack.subjects, conceptTags, history],
  )

  // Scene-bound confidence sink (add-neurons-multi-subject-rescue, D5): bound to the run
  // (familyId + createdAt) FROZEN when this answering phase opened, so a tap in family A's
  // scene records under A's run scope — never B's, and never the wrong run if A was
  // sync-replaced mid-session. QuizModal never resolves the active plan itself. Stable
  // identity (reads the ref, no deps) so re-renders don't re-bind it (Codex/Fable review fix 2).
  const onRescueConfidence = useCallback((qid: string, signal: 'sure' | 'guess') => {
    const run = activeRunRef.current
    if (run) recordConfidence(run.familyId, run.createdAt, qid, signal)
  }, [])

  // ── actions ──
  // Open a family's per-plan scene (from the list, a chip, or a resume). Never mints a new run.
  const openPlan = (familyId: string): void => {
    const p = getActivePlan(familyId)
    if (!p) return
    captureRun(familyId, p.createdAt)
    setViewingFamily(familyId)
    if (shouldShowReconcileNote(p.createdAt)) {
      setReconcileNote(true)
      markPlanKnown(p.createdAt)
    } else {
      setReconcileNote(false)
    }
    setPhase(isBlitzDone(familyId, p.createdAt) ? 'overview' : 'blitz')
  }
  // Back to the overview list (切科 exit) — or setup when no plan remains.
  const backToList = (): void => {
    setViewingFamily(null)
    setReconcileNote(false)
    setPhase(getActivePlans().length > 0 ? 'list' : 'setup')
  }
  // Deliberately open setup to add a NEW plan (from the list). Preselect a family without a plan
  // and mark the form touched so the untouched auto-takeover effect doesn't bounce back to the list.
  const goToSetup = (): void => {
    setSetupFamily(pack.subjects.find((s) => !getActivePlan(s.id))?.id ?? pack.subjects[0]?.id ?? '')
    setSetupExam(defaultExamISO())
    setSetupTouched(true)
    setPhase('setup')
  }
  // Start a NEW plan for setupFamily (guarded: duplicate subject → open it instead; the button is
  // also disabled while startupSyncPending so a stale device can't mint a clobbering run).
  const doStart = (): void => {
    if (startupSyncPending) return
    if (getActivePlan(setupFamily)) {
      openPlan(setupFamily)
      return
    }
    const res = startRescue({ familyId: setupFamily, examDate: setupExam, dailyMinutes: setupMinutes })
    if (res.ok) captureRun(setupFamily, res.plan.createdAt)
    setViewingFamily(setupFamily)
    appendTelemetry({
      kind: 'plan-started',
      familyId: setupFamily,
      examDate: setupExam,
      dailyMinutes: setupMinutes,
    })
    setPhase('blitz')
  }
  // Edit an existing plan's exam date / minutes in place (no new run) then open it.
  const doEditPlan = (): void => {
    if (startupSyncPending) return
    editRescuePlan(setupFamily, { examDate: setupExam, dailyMinutes: setupMinutes })
    appendTelemetry({
      kind: 'plan-edited',
      familyId: setupFamily,
      examDate: setupExam,
      dailyMinutes: setupMinutes,
    })
    openPlan(setupFamily)
  }
  const finishBlitz = (): void => {
    if (plan && viewingFamily) {
      if (startupSyncPending) {
        // DEFER the envelope write until the startup pull lands (module-level state in
        // rescue-store, flushed on startup settlement + by the mounted flush effect). Dropping
        // it would permanently lose blitzDoneAt on a cold boot → immediate re-run of the blitz.
        deferBlitzDone(viewingFamily, plan.createdAt)
      } else {
        markBlitzDone(viewingFamily, plan.createdAt)
        touchLastStudied(viewingFamily)
      }
    }
    appendTelemetry({ kind: 'diagnostic-completed', count: blitzPool.length })
    setPhase('overview')
  }
  const openSession = (): void => {
    if (daySet.length === 0) return
    if (viewingFamily && plan) captureRun(viewingFamily, plan.createdAt)
    appendTelemetry({ kind: 'priority-selected', count: daySet.length, phase: phaseKind })
    setPhase('session')
  }
  const finishSession = (): void => {
    // DEFER the study-touch while the startup pull is in flight (consistent with the blitz
    // defer), so a stale device doesn't drop the bump nor clobber a newer cloud run.
    if (viewingFamily) {
      if (startupSyncPending) deferTouchLastStudied(viewingFamily)
      else touchLastStudied(viewingFamily)
    }
    setPhase('overview')
  }
  const openQuickScan = (): void => {
    if (quickScanPool.length === 0) return
    if (viewingFamily && plan) captureRun(viewingFamily, plan.createdAt)
    appendTelemetry({ kind: 'quick-scan-opened', count: quickScanPool.length })
    setPhase('quickscan')
  }
  const finishQuickScan = (): void => {
    appendTelemetry({ kind: 'quick-scan-completed' })
    if (viewingFamily) {
      if (startupSyncPending) deferTouchLastStudied(viewingFamily)
      else touchLastStudied(viewingFamily)
    }
    setPhase('overview')
  }
  const doOverride = (conceptId: string): void => {
    if (!viewingFamily) return
    setOverride(viewingFamily, conceptId, {
      setAt: Date.now(),
      attemptsAtOverride: conceptStats.get(conceptId)?.attemptsToday ?? 0,
    })
    appendTelemetry({ kind: 'manual-override', conceptId })
  }
  const doAbandon = (): void => {
    if (viewingFamily && !startupSyncPending) abandonRescue(viewingFamily)
    setConfirmAbandon(false)
    backToList()
  }
  const doExport = (): void => {
    try {
      const blob = new Blob([exportTelemetry()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rescue-telemetry-${todayISO()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[rescue] telemetry export failed', err)
    }
  }

  if (!mounted) return null

  // Answering phases render QuizModal (its own fixed overlay) instead of scene chrome.
  if (phase === 'blitz' && plan) {
    return createPortal(
      <QuizModal
        pool={blitzPool}
        rescueSubmit
        preserveOrder
        onRescueConfidence={onRescueConfidence}
        onClose={finishBlitz}
      />,
      document.body,
    )
  }
  if (phase === 'session' && plan) {
    return createPortal(
      <QuizModal
        pool={daySet}
        rescueSubmit
        preserveOrder
        onRescueConfidence={onRescueConfidence}
        onClose={finishSession}
      />,
      document.body,
    )
  }
  if (phase === 'quickscan' && plan) {
    return createPortal(
      <QuizModal
        pool={quickScanPool}
        rescueSubmit
        preserveOrder
        onRescueConfidence={onRescueConfidence}
        onClose={finishQuickScan}
      />,
      document.body,
    )
  }

  const conceptsLoading = phase === 'overview' && Object.keys(conceptTags).length === 0
  // Setup guardrails (add-neurons-multi-subject-rescue, D6): duplicate subject → open / edit
  // (never restart); soft nudge once adding would put ≥3 plans in flight; hard cap disables a
  // NEW plan at 5 (opening / editing / abandoning existing plans stays available).
  const setupIsDup = !!getActivePlan(setupFamily)
  const activeCount = plans.length
  const wouldExceedCap = !setupIsDup && activeCount >= 5
  const showSoftNudge = !setupIsDup && activeCount >= 2

  return createPortal(
    <div style={sceneStyle} role="dialog" aria-modal="true" aria-label="考前救急">
      <header style={headerStyle}>
        <span style={titleStyle}>
          <EmojiIcon char="⏱️" size={16} decorative /> 考前救急
          {plan && <span style={familyNameStyle}>· {familyName}</span>}
        </span>
        {plan && (
          <span style={dChipStyle}>{d <= 0 ? '考試當天' : `距考試 ${d} 天 (D-${d})`}</span>
        )}
        <button style={closeBtnStyle} onClick={onClose} aria-label="關閉救急">
          ✕
        </button>
      </header>

      <div style={bodyStyle}>
        {phase === 'setup' && (
          <div style={cardStyle}>
            <h2 style={h2Style}>鎖定一科，考前聚焦</h2>
            <p style={subCopyStyle}>選一科、設考試日與每天可投入的分鐘數，之後每天替你排最高回報的題。</p>
            <label style={labelStyle}>
              救哪一科
              <select
                style={inputStyle}
                value={setupFamily}
                onChange={(e) => {
                  setSetupTouched(true)
                  setSetupFamily(e.target.value)
                }}
              >
                {pack.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                    {getActivePlan(s.id) ? '（已在救急中）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              考試日期
              <input
                style={inputStyle}
                type="date"
                value={setupExam}
                min={todayISO()}
                max={maxExamISO}
                onChange={(e) => {
                  setSetupTouched(true)
                  // Clamp typed-in dates too (the picker honours max, manual
                  // keyboard entry doesn't in every browser). ISO compares
                  // lexicographically. 14 天上限對齊 isSyncedRescueKey 的
                  // run-sync window — 更遠的「救急」第 15 天起信心會靜默停同步。
                  const v = e.target.value
                  setSetupExam(v && v > maxExamISO ? maxExamISO : v)
                }}
              />
            </label>
            <label style={labelStyle}>
              每天可投入
              <select
                style={inputStyle}
                value={setupMinutes}
                onChange={(e) => {
                  setSetupTouched(true)
                  setSetupMinutes(Number(e.target.value))
                }}
              >
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} 分鐘 / 天
                  </option>
                ))}
              </select>
            </label>
            {showSoftNudge && (
              <p style={fallbackNoteStyle}>
                ⚠️ 同時進行 3 科以上救急，每天總時間會拉高——先確認排得完再新增。
              </p>
            )}
            {setupIsDup ? (
              <div style={warnBoxStyle}>
                「{setupFamily}」已經在救急中。可以直接開啟，或用上面的考試日／分鐘更新這個計畫（不會重來、已答進度都保留）。
                <div style={rowStyle}>
                  <button style={primaryBtnStyle} onClick={() => openPlan(setupFamily)}>
                    開啟這科救急 →
                  </button>
                  <button
                    style={startupSyncPending ? ghostBtnDisabledStyle : ghostBtnStyle}
                    onClick={doEditPlan}
                    disabled={startupSyncPending}
                  >
                    {startupSyncPending ? '同步中…' : '更新計畫'}
                  </button>
                </div>
              </div>
            ) : wouldExceedCap ? (
              <div style={warnBoxStyle}>
                同時最多 5 科救急。先完成或放棄一科，再新增下一科。
                <div style={rowStyle}>
                  <button style={primaryBtnStyle} onClick={backToList}>
                    ← 回計畫清單
                  </button>
                </div>
              </div>
            ) : (
              <button
                style={startupSyncPending ? primaryBtnDisabledStyle : primaryBtnStyle}
                onClick={doStart}
                disabled={!setupFamily || startupSyncPending}
              >
                {startupSyncPending ? '同步中…' : '開始救急 →'}
              </button>
            )}
            {activeCount > 0 && !setupIsDup && !wouldExceedCap && (
              <button style={linkBtnStyle} onClick={backToList}>
                ← 回計畫清單
              </button>
            )}
            <p style={deviceCopyStyle}>
              {synced
                ? '已登入，救急計畫與信心紀錄會跨裝置同步。'
                : '未登入，目前只存在這台裝置；登入後救急計畫與信心紀錄會跨裝置同步。'}
            </p>
          </div>
        )}

        {/* Fallback-only multi-plan list (fold-rescue-list-into-exam-prep-hub): reached via
            vanish-fallback / in-scene 切科, NOT as a homepage entry — the hub rescue strip is
            the plan list. Retained on purpose (see the Phase type comment). */}
        {phase === 'list' && (
          <div style={overviewWrapStyle}>
            <h2 style={h2Style}>考前救急計畫</h2>
            {planCards.length === 0 ? (
              <p style={fallbackNoteStyle}>目前沒有進行中的救急計畫。</p>
            ) : (
              planCards.map((c) => (
                <button
                  key={c.familyId}
                  style={planListCardStyle(c.accent)}
                  onClick={() => openPlan(c.familyId)}
                  aria-label={`開啟 ${c.familyId} 救急 · ${c.d <= 0 ? '考試日' : `D-${c.d}`} · RescueScore ${c.score}`}
                >
                  <span style={planListNameStyle(c.accent)}>{c.familyId}</span>
                  <span style={planListMetaStyle}>
                    <span style={planListDStyle}>{c.d <= 0 ? '考試日' : `D-${c.d}`}</span>
                    <span style={planListScoreStyle}>RescueScore {c.score}</span>
                  </span>
                  <span style={planListCtaStyle(c.accent)}>今日佇列 →</span>
                </button>
              ))
            )}
            <button
              style={activeCount >= 5 ? primaryBtnDisabledStyle : primaryBtnStyle}
              onClick={goToSetup}
              disabled={activeCount >= 5}
              title={activeCount >= 5 ? '同時最多 5 科，先完成或放棄一科' : undefined}
            >
              {activeCount >= 5 ? '已達 5 科上限' : '＋ 新增計畫'}
            </button>
            <p style={deviceCopyStyle}>
              {synced
                ? '已登入，救急計畫與信心紀錄會跨裝置同步。'
                : '未登入，目前只存在這台裝置；登入後救急計畫與信心紀錄會跨裝置同步。'}
            </p>
          </div>
        )}

        {phase === 'overview' && plan && (
          <div style={overviewWrapStyle}>
            {conceptsLoading ? (
              <p style={loadingStyle}>載入救急資料中…</p>
            ) : (
              <>
                {reconcileNote && (
                  <p style={reconcileNoteStyle}>這份救急計畫來自另一台裝置，已在這裡接續。</p>
                )}
                {/* RescueScore + qualitative return */}
                <div style={scoreCardStyle}>
                  <div>
                    <div style={scoreLabelStyle}>RescueScore</div>
                    <div style={scoreValueStyle}>{readiness?.score ?? 0}</div>
                  </div>
                  <div style={returnColStyle}>
                    <div style={returnTierStyle}>續讀回報：{readiness?.tier ?? '普通'}</div>
                    <div style={returnCopyStyle}>{RETURN_COPY[readiness?.tier ?? '普通']}</div>
                  </div>
                </div>

                {/* primary CTA — directly under the score so the main action is reachable
                    without scrolling past the 戰情圖 / stop-loss cards. */}
                {phaseKind === 'exam-morning' ? (
                  <button
                    style={quickScanPool.length ? primaryBtnStyle : primaryBtnDisabledStyle}
                    onClick={openQuickScan}
                    disabled={quickScanPool.length === 0}
                  >
                    ▶ 考試日速掃（{quickScanPool.length} 題 · ~15 分）
                  </button>
                ) : (
                  <button
                    style={daySet.length ? primaryBtnStyle : primaryBtnDisabledStyle}
                    onClick={openSession}
                    disabled={daySet.length === 0}
                  >
                    ▶ {phaseKind === 'exam-eve' ? '考前夜鞏固' : '今日佇列'}（{daySet.length} 題）
                  </button>
                )}
                {phaseKind === 'exam-eve' && (
                  <p style={fallbackNoteStyle}>考前夜只鞏固已練過的，不塞全新難題。</p>
                )}

                {/* 戰情圖 — three labelled sections (紅優先 / 黃待鞏固 / 灰未診斷), each capped
                    with a +N overflow so nothing is silently truncated. */}
                <div style={warMapCardStyle}>
                  <div style={warMapHeadRowStyle}>
                    <span style={warMapTitleStyle}>戰情圖</span>
                    <span style={warMapHintStyle}>先看紅色 ‼ · 點概念開講義</span>
                  </div>
                  {warSections.every((s) => s.items.length === 0) ? (
                    <p style={fallbackNoteStyle}>完成診斷題後，這裡會顯示紅／黃／灰弱點分布。</p>
                  ) : (
                    warSections.map((sec) =>
                      sec.items.length === 0 ? null : (
                        <div key={sec.band} style={warBandSectionStyle}>
                          <div style={warBandHeaderStyle}>
                            <i style={{ ...warDotStyle, background: WAR_BAND_COLOR[sec.band] }} />
                            <span style={warBandLabelStyle}>{sec.label}</span>
                            <span style={countBadgeStyle}>{sec.items.length}</span>
                          </div>
                          <div style={warGridStyle}>
                            {sec.items.slice(0, sec.cap).map((c) => (
                              <button
                                key={c.conceptId}
                                type="button"
                                style={sec.band === 'red' ? warChipRedBtnStyle : warChipBtnStyle}
                                title={WAR_BAND_LABEL[c.band]}
                                aria-label={`開啟講義：${c.zh}`}
                                aria-busy={handoutBusy === c.conceptId}
                                onClick={() => void openConceptHandout(c.conceptId, c.zh)}
                              >
                                {c.hiConfWrong && <span style={hiConfMarkStyle}>‼</span>}
                                <i style={{ ...warDotStyle, background: WAR_BAND_COLOR[c.band] }} />
                                {c.zh}
                              </button>
                            ))}
                            {sec.items.length > sec.cap && (
                              <span style={warMoreChipStyle}>+{sec.items.length - sec.cap}</span>
                            )}
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>

                {/* 講義 deep-link outcome note: no-region → escape hatch to the subject handout top;
                    load-fail → retry (never route to a handout that would fail on the same bundle). */}
                {handoutNote && (
                  <div style={handoutNoteStyle}>
                    {handoutNote.kind === 'no-region' ? (
                      <>
                        <span>「{handoutNote.zh}」暫無對應講義段落。</span>
                        <button type="button" style={handoutNoteBtnStyle} onClick={openSubjectHandoutTop}>
                          開啟該科講義
                        </button>
                      </>
                    ) : (
                      <>
                        <span>講義載入失敗。</span>
                        <button
                          type="button"
                          style={handoutNoteBtnStyle}
                          onClick={() => void openConceptHandout(handoutNote.conceptId, handoutNote.zh)}
                        >
                          重試
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* stop-loss re-read interstitial — below the map (an interrupt, not the nav) */}
                {rereadCards.map((card) => (
                  <div key={card.conceptId} style={stopLossCardStyle}>
                    <div style={stopLossHeadStyle}>
                      ⚠️ 暫時卡住：{card.conceptZh ?? conceptLabel(subjectId, card.conceptId) ?? '這個觀念'}
                    </div>
                    <p style={stopLossBodyStyle}>
                      這塊暫時卡住，先重讀 30 秒再回來測，通常比硬刷省力。
                    </p>
                    {card.kernelItems.slice(0, 3).map((it, i) => (
                      <p key={i} style={kernelLineStyle} dangerouslySetInnerHTML={{ __html: it.html }} />
                    ))}
                    {card.source === 'subject-fallback' && (
                      <p style={fallbackNoteStyle}>（此為整科重點，非單一觀念卡）</p>
                    )}
                    {overrideConcepts.has(card.conceptId) ? (
                      <p style={overrideActiveStyle}>已加練中 · 會自動在 24 小時 / 再 6 題後重新評估</p>
                    ) : (
                      <button style={ghostBtnStyle} onClick={() => doOverride(card.conceptId)}>
                        仍想加練這塊（不擠掉高頻目標）
                      </button>
                    )}
                  </div>
                ))}

                <p style={deviceCopyStyle}>
                  {synced
                    ? '已登入，救急計畫與信心紀錄會跨裝置同步。'
                    : '未登入，目前只存在這台裝置；登入後救急計畫與信心紀錄會跨裝置同步。'}
                </p>
                <div style={overviewFootRowStyle}>
                  {/* 切科 = back to the multi-plan list (no mid-session cross-subject switcher). */}
                  <button style={linkBtnStyle} onClick={backToList}>
                    ← 計畫清單
                  </button>
                  <button style={linkBtnStyle} onClick={() => setConfirmAbandon(true)}>
                    放棄計畫
                  </button>
                  <button style={exportLinkBtnStyle} onClick={doExport}>
                    匯出診斷紀錄 JSON
                  </button>
                </div>
                {confirmAbandon && (
                  <div style={warnBoxStyle}>
                    {synced
                      ? '放棄後這個帳號其他已登入裝置也會退出這個計畫；你已答的題目與進度都保留。確定放棄？'
                      : '放棄後會退出這個計畫；你已答的題目與進度都保留。確定放棄？'}
                    <div style={rowStyle}>
                      <button
                        style={startupSyncPending ? primaryBtnDisabledStyle : primaryBtnStyle}
                        onClick={doAbandon}
                        disabled={startupSyncPending}
                      >
                        {startupSyncPending ? '同步中…' : '確定放棄'}
                      </button>
                      <button style={ghostBtnStyle} onClick={() => setConfirmAbandon(false)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── styles (warm pixel-tan aesthetic, matching SpeedReviewPage / QuizModal) ──
const sceneStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  right: 'var(--pdf-panel-width, 0px)',
  background: '#f3ecd8',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.7rem 1rem',
  borderBottom: '2px solid #d8c8a0',
}
const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#5a4a2f',
  fontSize: '1rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
}
const familyNameStyle: React.CSSProperties = { color: '#8c6d4a', fontWeight: 600 }
const dChipStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.82rem',
  color: '#7a5a2f',
  background: '#efe4c6',
  border: '1px solid #d4a04d',
  borderRadius: 999,
  padding: '0.15rem 0.6rem',
  fontVariantNumeric: 'tabular-nums',
}
const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  color: '#8c6d4a',
  cursor: 'pointer',
  lineHeight: 1,
}
const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  justifyContent: 'center',
  padding: '1rem',
  boxSizing: 'border-box',
}
const cardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  width: 'min(560px, 100%)',
  height: 'fit-content',
  padding: '1.2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
}
const overviewWrapStyle: React.CSSProperties = {
  width: 'min(680px, 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
}
const h2Style: React.CSSProperties = { margin: 0, color: '#5a4a2f', fontSize: '1.2rem' }
const subCopyStyle: React.CSSProperties = { margin: 0, color: '#8c7a55', fontSize: '0.9rem', lineHeight: 1.6 }
const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  color: '#5a4a2f',
  fontSize: '0.9rem',
  fontWeight: 600,
}
const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  borderRadius: 8,
  border: '1px solid #c9b891',
  background: '#fffdf7',
  color: '#3f341f',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '0.6rem 1.1rem',
  background: '#d4a04d',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: '0.98rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const primaryBtnDisabledStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: '#e0d4b8',
  color: '#a89a7d',
  cursor: 'not-allowed',
}
const ghostBtnStyle: React.CSSProperties = {
  padding: '0.5rem 0.9rem',
  background: 'transparent',
  color: '#7a5a2f',
  border: '1px solid #c9b891',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const ghostBtnDisabledStyle: React.CSSProperties = {
  ...ghostBtnStyle,
  color: '#a89a7d',
  borderColor: '#e0d4b8',
  cursor: 'not-allowed',
}
// ── Overview-list plan cards (multi-subject list phase) ──
const planListCardStyle = (accent: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
  width: '100%',
  padding: '0.7rem 0.9rem',
  background: '#fbf6e9',
  border: `2px solid ${accent}`,
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  boxSizing: 'border-box',
})
const planListNameStyle = (accent: string): React.CSSProperties => ({
  fontWeight: 800,
  fontSize: '1rem',
  color: accent,
})
const planListMetaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.6rem',
  color: '#7a5a2f',
  fontSize: '0.84rem',
  fontVariantNumeric: 'tabular-nums',
}
const planListDStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#8a5a1f',
  background: '#efe4c6',
  border: '1px solid #d4a04d',
  borderRadius: 999,
  padding: '0.1rem 0.55rem',
}
const planListScoreStyle: React.CSSProperties = { color: '#8c7a55', fontWeight: 600 }
const planListCtaStyle = (accent: string): React.CSSProperties => ({
  marginLeft: 'auto',
  fontWeight: 700,
  color: accent,
  fontSize: '0.86rem',
})
const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#a08a5e',
  fontSize: '0.82rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
// Export is a secondary / dogfood affordance — smaller + dimmer than the other links.
const exportLinkBtnStyle: React.CSSProperties = {
  ...linkBtnStyle,
  color: '#8a7a52',
  fontSize: '0.74rem',
  textDecoration: 'none',
  opacity: 0.75,
  marginLeft: 'auto',
}
const deviceCopyStyle: React.CSSProperties = { margin: 0, color: '#a08a5e', fontSize: '0.78rem' }
// One-time cross-device reconcile hint — quiet, low-pressure.
const reconcileNoteStyle: React.CSSProperties = {
  margin: '0 0 2px',
  color: '#7a9a6e',
  fontSize: '0.76rem',
}
const loadingStyle: React.CSSProperties = { color: '#8c7a55', margin: '2rem auto' }
const warnBoxStyle: React.CSSProperties = {
  background: '#fbeee0',
  border: '1px solid #d4a04d',
  borderRadius: 8,
  padding: '0.7rem 0.85rem',
  color: '#6a4a24',
  fontSize: '0.88rem',
  lineHeight: 1.6,
}
const rowStyle: React.CSSProperties = { display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }
const scoreCardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  padding: '0.9rem 1.1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1.2rem',
  flexWrap: 'wrap', // narrow phones: RescueScore + return copy stack instead of squeezing
}
const scoreLabelStyle: React.CSSProperties = { color: '#8c7a55', fontSize: '0.78rem', fontWeight: 600 }
const scoreValueStyle: React.CSSProperties = {
  color: '#5a4a2f',
  fontSize: '2.4rem',
  fontWeight: 800,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}
const returnColStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.2rem' }
const returnTierStyle: React.CSSProperties = { color: '#5a4a2f', fontWeight: 700, fontSize: '1rem' }
const returnCopyStyle: React.CSSProperties = { color: '#8c7a55', fontSize: '0.85rem' }
const stopLossCardStyle: React.CSSProperties = {
  background: '#fdf2e0',
  border: '1px solid #d4a04d',
  borderRadius: 10,
  padding: '0.8rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}
const stopLossHeadStyle: React.CSSProperties = { fontWeight: 700, color: '#8a5a1f' }
const stopLossBodyStyle: React.CSSProperties = { margin: 0, color: '#6a4a24', fontSize: '0.86rem', lineHeight: 1.6 }
const kernelLineStyle: React.CSSProperties = { margin: '0.1rem 0', color: '#3f341f', fontSize: '0.9rem', lineHeight: 1.6 }
const fallbackNoteStyle: React.CSSProperties = { margin: 0, color: '#a08a5e', fontSize: '0.78rem' }
const overrideActiveStyle: React.CSSProperties = { margin: 0, color: '#7a5a2f', fontSize: '0.82rem', fontWeight: 600 }
const warMapCardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  padding: '0.9rem 1.1rem',
}
const warMapHeadRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.6rem',
}
const warMapTitleStyle: React.CSSProperties = { fontWeight: 700, color: '#5a4a2f' }
const warMapHintStyle: React.CSSProperties = {
  color: '#8c7a55',
  fontSize: '0.72rem',
  textAlign: 'right',
}
const warBandSectionStyle: React.CSSProperties = { marginTop: '0.5rem' }
const warBandHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  marginBottom: '0.3rem',
}
const warBandLabelStyle: React.CSSProperties = { fontWeight: 700, color: '#5a4a2f', fontSize: '0.82rem' }
const countBadgeStyle: React.CSSProperties = {
  minWidth: 18,
  textAlign: 'center',
  background: '#e2d6b8',
  color: '#6a5836',
  borderRadius: 999,
  padding: '0 0.4rem',
  fontSize: '0.72rem',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}
const warMoreChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '0.2rem 0.55rem',
  fontSize: '0.78rem',
  color: '#8c7a55',
  background: '#f0ece2',
  border: '1px dashed #cbbb95',
}
const warGridStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }
const warChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  background: '#efe4cc',
  border: '1px solid #d8c39a',
  borderRadius: 999,
  padding: '0.2rem 0.6rem',
  fontSize: '0.82rem',
  color: '#4a3f28',
}
// Tappable chip (add-neurons-handout-rescue-deeplink): a button reset over the chip look so a tap
// opens the 講義. Red (highest-priority) concepts get a stronger affordance.
const warChipBtnStyle: React.CSSProperties = {
  ...warChipStyle,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.2,
  textAlign: 'left',
}
const warChipRedBtnStyle: React.CSSProperties = {
  ...warChipBtnStyle,
  background: '#f6e4d8',
  borderColor: '#cc9999',
  boxShadow: '0 1px 0 rgba(196,77,77,0.22)',
}
const handoutNoteStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginTop: '0.5rem',
  padding: '0.5rem 0.7rem',
  background: '#f0ece2',
  border: '1px solid #d8c39a',
  borderRadius: 10,
  fontSize: '0.82rem',
  color: '#5a4a2f',
}
const handoutNoteBtnStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#4a3f28',
  background: '#e2d6b8',
  border: '1px solid #cbbb95',
  borderRadius: 999,
  padding: '0.2rem 0.7rem',
}
const warDotStyle: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%', display: 'inline-block' }
const hiConfMarkStyle: React.CSSProperties = { color: '#c44d4d', fontWeight: 800 }
const overviewFootRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
  justifyContent: 'center',
}
