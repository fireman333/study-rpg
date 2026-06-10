import { useEffect, useMemo, useRef, useState } from 'react'
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
import { FamilyPicker, type FamilyAccrual } from '../components/FamilyPicker'
import MazeGrid from '../components/maze/MazeGrid'
import { MazeCompletionCelebration } from '../components/MazeCompletionCelebration'
import { ExpeditionRitualCelebration } from '../components/ExpeditionRitualCelebration'
import { hasCelebrated, markCelebrated } from '../lib/services/maze-celebration'
import { DmnDrawProgressRing } from '../components/DmnDrawProgressRing'
import { OnboardingHost } from '../components/OnboardingHost'
import StudySquadPanel from '../components/StudySquadPanel'
import { EmojiIcon } from '../components/EmojiIcon'
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
  onExpeditionComplete,
} from '../lib/services/expedition'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { ALL_YEARS, effectiveYearSet, useYearFilter } from '../lib/services/year-filter'
import { YearFilterBar } from '../components/YearFilterBar'
import { useMaze } from '../lib/maze/useMaze'
import { emitMazeFocus } from '../lib/maze/maze-focus'
import { db, todayISO } from '../lib/db'

interface Props {
  pack: ContentPack
}

interface ProgressStats {
  variants: number
  dmnOwned: number
}

// QuizModal entry state. `null` = 🎲 跨 family 隨機（沿用原行為）；`undefined` =
// modal 未開；object = 特定 family + mode（🆕 新題 / 🔄 錯題，per
// add-neurons-quiz-mode-chips-and-srs）。
type QuizEntry = { familyId: string; mode: QuizMode } | null | undefined

export default function OverviewPage({ pack }: Props): JSX.Element {
  const [quizEntry, setQuizEntry] = useState<QuizEntry>(undefined)
  // 出征 (expedition) is a separate, mutually-exclusive QuizModal entry on the
  // cross-subject wrong-question pool. (add-neurons-study-squad)
  const [expeditionOpen, setExpeditionOpen] = useState(false)
  // Quick-review mini-batch: when true, the open expedition is capped to ≤5
  // wrong questions (DMN quick-review-batch event, realign-dmn-event-rewards-to-maze).
  const [quickReviewActive, setQuickReviewActive] = useState(false)
  // 模考 moved off the homepage → 題庫 tab (tidy-neurons-homepage-ui); its picker +
  // pure-practice drill now live in QuestionBankPage. The homepage CTA toolbar keeps
  // only 🎲 隨機 + ⚔️ 錯題出征.
  // Settlement result of the last wrong-pool expedition → conduction ledger + ritual
  // (rework-neurons-connectome-expedition-driven).
  const [settlement, setSettlement] = useState<ExpeditionConnectomeResult | null>(null)
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
  const [stats, setStats] = useState<ProgressStats>({ variants: 0, dmnOwned: 0 })
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

  const quizPool = useMemo(() => {
    if (quizEntry === undefined) return []
    if (quizEntry === null) {
      // 🎲 cross-family random — unchanged (whole year-scoped corpus).
      return yearActive ? filterPoolByYear(pack.questions, yearSet) : [...pack.questions]
    }
    const { familyId, mode } = quizEntry
    const byFamily = filterPoolByFamily(pack.questions, familyId)
    const scoped = yearActive ? filterPoolByYear(byFamily, yearSet) : byFamily
    return mode === 'fresh'
      ? filterPoolByNewOnly(scoped, questionHistory)
      : buildDueReviewPool(scoped, questionHistory)
  }, [pack.questions, quizEntry, yearSet, yearActive, questionHistory])

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

  // Random-quiz CTA count reflects the year-filtered total corpus.
  const totalPoolSize = useMemo(
    () => (yearActive ? filterPoolByYear(pack.questions, yearSet).length : pack.questions.length),
    [pack.questions, yearSet, yearActive],
  )

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
  const expeditionPool = useMemo(() => {
    if (!expeditionOpen) return []
    return quickReviewActive
      ? buildQuickReviewPool(pack.questions, questionHistory, 5)
      : buildWrongQuestionPool(pack.questions, questionHistory)
  }, [expeditionOpen, quickReviewActive, pack.questions, questionHistory])

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
      const [variants, dmn, familyAccrual] = await Promise.all([
        ownedSlotCount(db),
        db.dmnCards.count(),
        db.familyAccrual.toArray(),
      ])
      const accrual = new Map<string, FamilyAccrual>(
        familyAccrual.map((r) => [
          r.familyId,
          { ap: r.ap, unlockedSlots: r.unlockedSlots, firedToday: r.firedToday },
        ]),
      )
      return { stats: { variants, dmnOwned: dmn }, accrual }
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
  // 🎲 cross-family random keeps the existing whole-corpus behavior (entry null).
  const openRandomQuiz = (): void => {
    setExpeditionOpen(false)
    setQuickReviewActive(false)
    setQuizEntry(null)
  }
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

  // Per-subject reading (add-neurons-maze-zoom-and-focus): each family card's 📖 entry
  // toggles that subject's reading session; starting/resuming also focuses the maze
  // camera on that subject (sticky). One subject at a time — `timer.start(familyId)`
  // switches if a different subject was active.
  const onToggleReading = (familyId: string): void => {
    // Same subject + actively reading → toggle off (no focus needed when stopping).
    if (timer.readingFamilyId === familyId && timer.status === 'reading') {
      timer.stop()
      return
    }
    // Same subject + paused → resume; otherwise (idle / different subject) → start.
    if (timer.readingFamilyId === familyId && timer.status === 'paused') timer.resume()
    else timer.start(familyId)
    emitMazeFocus(familyId, { manual: true })
  }

  const onFocusFamily = (familyId: string): void => {
    emitMazeFocus(familyId, { manual: true })
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
  }): void => {
    onExpeditionComplete(s)
    void creditConnectomeFromExpedition({
      repairsBySubject: s.correctBySubject,
      energyBySubject: s.energyBySubject,
      sessionPool: s.total,
    })
      .then(async (result) => {
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
      })
      .catch((err) => console.error('[connectome] expedition credit failed:', err))
  }

  // Dynamic label for the actively-reading card (preserves the pause-reason feedback
  // the old global toolbar toggle showed).
  const readingActiveLabel = (() => {
    if (timer.status === 'reading') return `🟢 閱讀中 · ${timer.currentMinute} min · 點擊結束`
    if (timer.status === 'paused') {
      if (timer.pauseReason === 'visibility') return '⏸ 切到別的分頁 · 點擊繼續'
      if (timer.pauseReason === 'idle') return '⏸ 90s 無動作 · 點擊繼續'
      return '⏸ 已暫停 · 點擊繼續'
    }
    return undefined
  })()

  return (
    <>
      <QuizHotkeysAnnouncementBanner />
      <LeaderboardPromoBanner />
      <OnboardingHost />

      <header style={heroStyle}>
        <div>
          <h1 style={heroTitleStyle}>{pack.meta.displayName}</h1>
          <p style={heroSubtitleStyle}>
            "Neurons that fire together, wire together." — Donald Hebb
          </p>
        </div>
      </header>

      {/* Connectome narrative indicators (neurons-homepage / D6): 今日出征 · 連續 N 天 ·
          本週 X/7 · 穩定連線數（不含早期連線）· 最強 pair · 今日連線額外獲得 X 能量.
          NOT a 116/116 collection bar. */}
      {connStatus && (
        <section
          aria-label="connectome 狀態"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem 0.9rem',
            alignItems: 'center',
            margin: '0 0 0.75rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d8c4a8',
            borderRadius: 8,
            background: '#fbf5ea',
            fontSize: '0.85em',
            color: '#5a3f29',
          }}
        >
          <span title="今日是否完成有效出征（修復 ≥5 題）">
            今日出征 {connStatus.todayCompleted ? '✓' : '✗'}
          </span>
          <span title="連續完成有效出征的天數">🔥 連續 {connStatus.streak} 天</span>
          <span title="本週（近 7 天）完成有效出征的天數">本週 {connStatus.weeklyCount}/7</span>
          <span title="達 strong 的跨科連線數（不含尚未重新驗證的早期連線）">
            穩定連線 {connStatus.stableLinks}
          </span>
          {connStatus.strongestPair && (
            <span title="最近最強的跨科連線">
              最強 {connStatus.strongestPair.replace('|', '–')}
            </span>
          )}
          {connStatus.todayConductionEnergy > 0 && (
            <span title="今日經由突觸傳導從連線額外獲得的能量">
              ⚡ 今日連線 +{connStatus.todayConductionEnergy}
            </span>
          )}
        </section>
      )}

      {/* ── CTA toolbar (above the maze): cross-family random quiz + 全科錯題 出征
            (persistent expedition CTA, per neurons-homepage). Reading is now
            per-subject — each family card carries its own 📖 entry below. ── */}
      <section style={quizCtaSectionStyle} aria-label="核心循環入口">
        <div style={ctaButtonRowStyle}>
          <button
            type="button"
            style={randomQuizButtonStyle}
            onClick={openRandomQuiz}
            aria-label="跨 family 隨機答題"
            title={`從全部 ${totalPoolSize} 題隨機抽題`}
          >
            <EmojiIcon char="🎲" size={18} /> 隨機跨 family 答題
            <span style={ctaCountBadgeStyle}>{totalPoolSize} 題</span>
          </button>
          {/* One-way reveal (improve-neurons-onboarding): hidden for a never-wrong
              new player (no disabled dead button); shown once they've ever answered
              wrong, then persistent (disabled「無錯題」when currently nothing wrong). */}
          {hasEverAnsweredWrong && (
            <button
              type="button"
              style={wrongCount > 0 ? wrongExpeditionButtonStyle : wrongExpeditionButtonDisabledStyle}
              onClick={openExpedition}
              disabled={wrongCount === 0}
              aria-label="錯題出征：修復錯題建立連線"
              title="修復跨科錯題＝在腦圖上建立突觸連線（同時獲得 DMN 抽卡）"
            >
              <span style={ctaCardMainStyle}>
                <span>
                  <EmojiIcon char="⚔️" size={18} /> 錯題出征
                </span>
                <span style={ctaCountBadgeStyle}>
                  {wrongCount === 0 ? '無錯題' : `${wrongCount} 題`}
                </span>
              </span>
              <span style={ctaCardSubStyle}>🔗 修復錯題＝建立連線</span>
            </button>
          )}
        </div>
        <p style={quizCtaHintStyle}>
          直接答題，或在下方科目卡片點 📖 閱讀（能量全進該科）。點科目卡片可在腦圖上聚焦該科；走腦圖到節點即可抽出神經元。
        </p>
        <YearFilterBar />
      </section>

      {/* ── The flat-grid maze IS the homepage centerpiece (redesign-neurons-maze-
            rotjs-grid). One square weave grid, 11 per-family routes border→center;
            zoomable brain-pixel tilemap; the connectome tree no longer mounts here. ── */}
      <div style={{ position: 'relative' }}>
        <MazeGrid view={mazeView} />
        {celebration && (
          <MazeCompletionCelebration key={celebration.nonce} label={celebration.label} />
        )}
        {ritual && <ExpeditionRitualCelebration key={ritual.nonce} streak={ritual.streak} />}
      </div>

      {/* ── Study squad: party + assembly editor (出征 itself now lives in the CTA
            toolbar above). Sits below the maze as a deploy-from-the-map surface. ── */}
      <StudySquadPanel />

      <DmnDrawProgressRing />

      <section style={statusChipStyle} aria-label="進度狀態">
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}><EmojiIcon char="🧬" size={15} /></span>
          <span style={statusLabelStyle}>變體</span>
          <span style={statusValueStyle}>{stats.variants}</span>
          <span style={statusMaxStyle}>隻</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>💎</span>
          <span style={statusLabelStyle}>DMN</span>
          <span style={statusValueStyle}>{stats.dmnOwned}</span>
          <span style={statusMaxStyle}>/ 20</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}><EmojiIcon char="📖" size={15} /></span>
          <span style={statusLabelStyle}>累積閱讀</span>
          <span style={statusValueStyle}>{totalStudyMin}</span>
          <span style={statusMaxStyle}>min</span>
        </div>
      </section>

      <FamilyPicker
        pack={pack}
        accrualByFamily={accrualByFamily}
        modeCountsByFamily={modeCountsByFamily}
        onStartQuiz={openFamilyQuiz}
        onFocusFamily={onFocusFamily}
        onToggleReading={onToggleReading}
        readingFamilyId={timer.readingFamilyId}
        readingActiveLabel={readingActiveLabel}
      />

      {quizEntry !== undefined && expeditionOpen === false && (
        <QuizModal
          pool={quizPool}
          preserveOrder={quizEntry !== null && quizEntry.mode === 'review'}
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
            setExpeditionOpen(false)
            setQuickReviewActive(false)
          }}
          onComplete={handleWrongExpeditionComplete}
        />
      )}

      {/* 模考 picker + pure-practice drill moved to the 題庫 tab (QuestionBankPage)
          per tidy-neurons-homepage-ui. */}

      {settlement && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="出征結算"
          style={examMenuBackdropStyle}
          onClick={() => setSettlement(null)}
        >
          <div style={examMenuPanelStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={examMenuTitleStyle}>出征結算</h2>
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
                    {w.formed ? '🔗 新連線' : '⚡ 強化連線'}：{w.pairKey.replace('|', ' – ')}
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
            <button type="button" onClick={() => setSettlement(null)} style={examMenuOptionStyle}>
              關閉
            </button>
          </div>
        </div>
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

// EEG-monitor status readout — dark signal surface + grid/scanline backdrop +
// monospace signal-cyan values. The single Overview data surface (D3 + D5); the
// rest of the page stays warm. (polish-neurons-clinical-machine-aesthetic)
const statusChipStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  padding: '0.5rem 0.85rem',
  marginBottom: '1rem',
  background: 'var(--signal-bg)',
  backgroundImage:
    'linear-gradient(var(--grid-line) 1px, transparent 1px),' +
    'linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),' +
    'repeating-linear-gradient(0deg, var(--scanline) 0px, var(--scanline) 1px, transparent 1px, transparent 3px)',
  backgroundSize: '18px 18px, 18px 18px, 100% 3px',
  color: 'var(--signal-ink)',
  border: '2px solid var(--signal-dim)',
  borderRadius: '6px',
  fontSize: '0.8rem',
  fontWeight: 600,
}

const statusItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.3rem',
}

const statusEmojiStyle: React.CSSProperties = { fontSize: '0.95rem' }
const statusLabelStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.75, fontWeight: 500 }
const statusValueStyle: React.CSSProperties = {
  color: 'var(--signal-cyan)',
  fontFamily: 'var(--font-pixel-num)',
  fontSize: '1.25rem',
  lineHeight: 1,
  fontWeight: 400,
  letterSpacing: '0.5px',
}
const statusMaxStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.5, fontWeight: 500 }
const statusSepStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.35 }

const heroStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f4ecd8 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
}

const heroTitleStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  margin: '0 0 0.25rem',
  color: '#3a2a1a',
}

const heroSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#5a3f29',
  fontStyle: 'italic',
  fontSize: '0.9rem',
}

const quizCtaSectionStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '1rem 1.1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.55rem',
}

const ctaButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  width: '100%',
}

const randomQuizButtonStyle: React.CSSProperties = {
  flex: '1 1 200px',
  padding: '0.65rem 1.2rem',
  borderRadius: '6px',
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontSize: '1.02rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
}

// ⚔️ 錯題出征 = the prominent primary connectome-building CTA. Terracotta base +
// a static synaptic-cyan glow ring signals "this wires the brain". The glow is a
// box-shadow (no animation) so it degrades cleanly under prefers-reduced-motion.
// (split-neurons-expedition-exam-modes)
const wrongExpeditionButtonStyle: React.CSSProperties = {
  flex: '1 1 220px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '0.18rem',
  padding: '0.55rem 1rem',
  borderRadius: '6px',
  border: '2px solid #e0a44a',
  background: 'linear-gradient(135deg, #c06a3a 0%, #a85530 100%)',
  color: '#fff',
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 0 0 2px rgba(255,255,255,0.18), 0 0 14px 1px rgba(64, 210, 200, 0.55)',
}

const wrongExpeditionButtonDisabledStyle: React.CSSProperties = {
  ...wrongExpeditionButtonStyle,
  background: '#cbb89f',
  border: '2px solid #b8a07a',
  boxShadow: 'none',
  opacity: 0.7,
  cursor: 'not-allowed',
}

const ctaCardMainStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  fontSize: '1.02rem',
}

const ctaCardSubStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  opacity: 0.92,
  letterSpacing: '0.2px',
}

const ctaCountBadgeStyle: React.CSSProperties = {
  padding: '0.1rem 0.45rem',
  background: 'rgba(255,255,255,0.25)',
  borderRadius: '999px',
  fontSize: '0.78em',
  fontWeight: 600,
}

const quizCtaHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
  lineHeight: 1.55,
}
