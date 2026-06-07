import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { initMasteryForPack, runDailyResetIfNeeded } from '../lib/services/connectome'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import QuizHotkeysAnnouncementBanner from '../components/QuizHotkeysAnnouncementBanner'
import { QuizModal } from '../components/QuizModal'
import { FamilyPicker, type FamilyAccrual } from '../components/FamilyPicker'
import MazeGrid from '../components/maze/MazeGrid'
import { DmnDrawProgressRing } from '../components/DmnDrawProgressRing'
import { HomepageOnboarding } from '../components/HomepageOnboarding'
import StudySquadPanel from '../components/StudySquadPanel'
import { EmojiIcon } from '../components/EmojiIcon'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'
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
  buildExamSetExpeditionPool,
  listExamPapersWithCoverage,
} from '../lib/services/expedition'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { ALL_YEARS, effectiveYearSet, useYearFilter } from '../lib/services/year-filter'
import { YearFilterBar } from '../components/YearFilterBar'
import { useMaze } from '../lib/maze/useMaze'
import { emitMazeFocus } from '../lib/maze/maze-focus'
import { db } from '../lib/db'

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
  // 遠征選單 (add-neurons-exam-set-expedition): 出征 opens a chooser →
  // 'choose' (錯題 / 年份回數) → 'exam' (year+次別 paper picker). 'closed' = hidden.
  const [expeditionMenu, setExpeditionMenu] = useState<'closed' | 'choose' | 'exam'>('closed')
  // Active year+次別 paper drill (null = not open). Mutually exclusive with quizEntry / expeditionOpen.
  const [examSelection, setExamSelection] = useState<{ year: number; session: number } | null>(null)
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const [stats, setStats] = useState<ProgressStats>({ variants: 0, dmnOwned: 0 })
  const [accrualByFamily, setAccrualByFamily] = useState<Map<string, FamilyAccrual>>(new Map())
  const timer = useReadingTimer()

  // Single useMaze subscription for the homepage (it runs reconcileSettles →
  // pulls; mounting it twice would double-fire). MazeGrid is presentational
  // and consumes this view.
  const mazeView = useMaze(pack)

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
  const expeditionPool = useMemo(() => {
    if (!expeditionOpen) return []
    return quickReviewActive
      ? buildQuickReviewPool(pack.questions, questionHistory, 5)
      : buildWrongQuestionPool(pack.questions, questionHistory)
  }, [expeditionOpen, quickReviewActive, pack.questions, questionHistory])

  // 年份回數遠征: paper list (with coverage) for the picker; only materialized
  // while the picker is open. (add-neurons-exam-set-expedition)
  const examPapers = useMemo(
    () =>
      expeditionMenu === 'exam' ? listExamPapersWithCoverage(pack.questions, questionHistory) : [],
    [expeditionMenu, pack.questions, questionHistory],
  )
  // Unanswered pool for the selected paper, in question order; built at open time
  // (QuizModal snapshots it, so it won't shrink mid-session). Empty ⇒ paper complete.
  const examSetPool = useMemo(
    () =>
      examSelection
        ? buildExamSetExpeditionPool(
            pack.questions,
            questionHistory,
            examSelection.year,
            examSelection.session,
          )
        : [],
    [examSelection, pack.questions, questionHistory],
  )

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
        db.neuronVariants.count(),
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

  // 遠征選單 (add-neurons-exam-set-expedition): the 出征 button opens a chooser so
  // 錯題遠征 and 年份回數遠征 are co-equal; the menu is reachable regardless of pools.
  const openExpeditionMenu = (): void => {
    setQuizEntry(undefined)
    setExpeditionOpen(false)
    setQuickReviewActive(false)
    setExamSelection(null)
    setExpeditionMenu('choose')
  }
  const chooseWrongExpedition = (): void => {
    if (wrongCount === 0) return
    setExpeditionMenu('closed')
    openExpedition()
  }
  const chooseExamPaper = (year: number, session: number): void => {
    setExpeditionMenu('closed')
    setQuizEntry(undefined)
    setExpeditionOpen(false)
    setExamSelection({ year, session }) // drill opens when examSetPool is non-empty
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
      <HomepageOnboarding />

      <header style={heroStyle}>
        <div>
          <h1 style={heroTitleStyle}>{pack.meta.displayName}</h1>
          <p style={heroSubtitleStyle}>
            "Neurons that fire together, wire together." — Donald Hebb
          </p>
        </div>
      </header>

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
          <button
            type="button"
            style={expeditionButtonStyle}
            onClick={openExpeditionMenu}
            aria-label="出征：選擇遠征"
            title="選擇遠征：全科錯題，或特定年份+次別的全題依序"
          >
            <EmojiIcon char="⚔️" size={18} /> 出征
          </button>
        </div>
        <p style={quizCtaHintStyle}>
          直接答題，或在下方科目卡片點 📖 閱讀（能量全進該科）。點科目卡片可在腦圖上聚焦該科；走腦圖到節點即可抽出神經元。
        </p>
        <YearFilterBar />
      </section>

      {/* ── The flat-grid maze IS the homepage centerpiece (redesign-neurons-maze-
            rotjs-grid). One square weave grid, 11 per-family routes border→center;
            zoomable brain-pixel tilemap; the connectome tree no longer mounts here. ── */}
      <MazeGrid view={mazeView} />

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
          onComplete={onExpeditionComplete}
        />
      )}

      {/* 遠征選單 (add-neurons-exam-set-expedition): 出征 → choose 錯題 / 年份回數;
          年份回數 → year+次別 paper picker with coverage. */}
      {expeditionMenu !== 'closed' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="遠征選單"
          style={examMenuBackdropStyle}
          onClick={() => setExpeditionMenu('closed')}
        >
          <div style={examMenuPanelStyle} onClick={(e) => e.stopPropagation()}>
            {expeditionMenu === 'choose' ? (
              <>
                <h2 style={examMenuTitleStyle}>選擇遠征</h2>
                <button
                  type="button"
                  onClick={chooseWrongExpedition}
                  disabled={wrongCount === 0}
                  style={wrongCount > 0 ? examMenuOptionStyle : examMenuOptionDisabledStyle}
                >
                  <span><EmojiIcon char="⚔️" size={16} /> 錯題遠征</span>
                  <span style={ctaCountBadgeStyle}>{wrongCount === 0 ? '無錯題' : `${wrongCount} 題`}</span>
                </button>
                <button type="button" onClick={() => setExpeditionMenu('exam')} style={examMenuOptionStyle}>
                  <span><EmojiIcon char="📅" size={16} /> 年份回數遠征</span>
                  <span style={ctaCountBadgeStyle}>全題依序</span>
                </button>
                <p style={examMenuHintStyle}>兩種遠征共用每日 DMN 抽卡上限（同一條出征軸）。</p>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setExpeditionMenu('choose')} style={examMenuBackStyle}>
                  ← 返回
                </button>
                <h2 style={examMenuTitleStyle}>年份回數遠征 · 選試卷</h2>
                <div style={examPaperListStyle}>
                  {examPapers.map((p) => (
                    <button
                      key={`${p.year}-${p.session}`}
                      type="button"
                      onClick={() => chooseExamPaper(p.year, p.session)}
                      disabled={p.complete}
                      style={p.complete ? examPaperRowDoneStyle : examPaperRowStyle}
                      title={p.complete ? '已完成全部題目' : `剩 ${p.total - p.answered} 題未答`}
                    >
                      <span>{p.year} 第{p.session}次</span>
                      <span style={ctaCountBadgeStyle}>
                        {p.complete ? '✓ 完成' : `已答 ${p.answered}/${p.total}`}
                      </span>
                    </button>
                  ))}
                </div>
                <p style={examMenuHintStyle}>
                  每份＝該年該次 醫學一＋醫學二 全題，依題號順序；已答過的題（任何模式）會跳過、累積到答完整份。
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 年份回數遠征 drill — unanswered questions of the chosen paper, in order.
          onComplete credits the shared expedition DMN draw axis. */}
      {examSelection && examSetPool.length > 0 && (
        <QuizModal
          pool={examSetPool}
          preserveOrder
          onClose={() => setExamSelection(null)}
          onComplete={onExpeditionComplete}
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

const examMenuOptionDisabledStyle: React.CSSProperties = {
  ...examMenuOptionStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
  borderColor: '#c9b48f',
}

const examMenuHintStyle: React.CSSProperties = {
  margin: '0.35rem 0 0',
  fontSize: '0.78rem',
  color: '#7a5c3a',
  lineHeight: 1.5,
}

const examMenuBackStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  color: '#8c6d4a',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  fontSize: '0.85rem',
}

const examPaperListStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
}

const examPaperRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.4rem',
  padding: '0.5rem 0.6rem',
  border: '2px solid #b8893a',
  borderRadius: '6px',
  background: '#fff',
  color: '#5a3f29',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const examPaperRowDoneStyle: React.CSSProperties = {
  ...examPaperRowStyle,
  opacity: 0.6,
  cursor: 'default',
  background: '#eef3e6',
  borderColor: '#9bbf6f',
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

const expeditionButtonStyle: React.CSSProperties = {
  flex: '1 1 200px',
  padding: '0.65rem 1.2rem',
  borderRadius: '6px',
  border: '1px solid #9a5a3a',
  background: '#c06a3a',
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
