import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { initMasteryForPack, runDailyResetIfNeeded } from '../lib/services/connectome'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import QuizHotkeysAnnouncementBanner from '../components/QuizHotkeysAnnouncementBanner'
import { QuizModal } from '../components/QuizModal'
import { FamilyPicker, type FamilyAccrual } from '../components/FamilyPicker'
import MazeBrainMap from '../components/maze/MazeBrainMap'
import { DmnDrawProgressRing } from '../components/DmnDrawProgressRing'
import { HomepageOnboarding } from '../components/HomepageOnboarding'
import StudySquadPanel from '../components/StudySquadPanel'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'
import { filterPoolByFamily, filterPoolByYear } from '../lib/services/quiz-pool'
import { useQuestionHistory } from '../lib/services/question-history'
import { buildWrongQuestionPool, buildQuickReviewPool, onExpeditionComplete } from '../lib/services/expedition'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { ALL_YEARS, effectiveYearSet, useYearFilter } from '../lib/services/year-filter'
import { YearFilterBar } from '../components/YearFilterBar'
import { useMaze } from '../lib/maze/useMaze'
import { db } from '../lib/db'

interface Props {
  pack: ContentPack
}

interface ProgressStats {
  variants: number
  dmnOwned: number
}

// QuizModal entry state. `null` 代表跨 family 隨機；`string` 代表特定 family；
// `undefined` 代表 modal 未開。三態化讓 OverviewPage 不再保留「先選 family
// 再點 CTA」 的中間狀態 — 對齊 二階 RecruitmentBanner 每張卡片自己開 modal 的 pattern。
type QuizEntry = string | null | undefined

export default function OverviewPage({ pack }: Props): JSX.Element {
  const [quizEntry, setQuizEntry] = useState<QuizEntry>(undefined)
  // 出征 (expedition) is a separate, mutually-exclusive QuizModal entry on the
  // cross-subject wrong-question pool. (add-neurons-study-squad)
  const [expeditionOpen, setExpeditionOpen] = useState(false)
  // Quick-review mini-batch: when true, the open expedition is capped to ≤5
  // wrong questions (DMN quick-review-batch event, realign-dmn-event-rewards-to-maze).
  const [quickReviewActive, setQuickReviewActive] = useState(false)
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const [stats, setStats] = useState<ProgressStats>({ variants: 0, dmnOwned: 0 })
  const [accrualByFamily, setAccrualByFamily] = useState<Map<string, FamilyAccrual>>(new Map())
  const timer = useReadingTimer()

  // Single useMaze subscription for the homepage (it runs reconcileSettles →
  // pulls; mounting it twice would double-fire). MazeBrainMap is presentational
  // and consumes this view.
  const mazeView = useMaze(pack)

  const persistedYears = useYearFilter()
  const yearSet = useMemo(() => effectiveYearSet(persistedYears), [persistedYears])
  const yearActive = yearSet.size < ALL_YEARS.length

  const quizPool = useMemo(() => {
    if (quizEntry === undefined) return []
    const byFamily = filterPoolByFamily(pack.questions, quizEntry)
    return yearActive ? filterPoolByYear(byFamily, yearSet) : byFamily
  }, [pack.questions, quizEntry, yearSet, yearActive])

  // Random-quiz CTA count reflects the year-filtered total corpus.
  const totalPoolSize = useMemo(
    () => (yearActive ? filterPoolByYear(pack.questions, yearSet).length : pack.questions.length),
    [pack.questions, yearSet, yearActive],
  )

  // 出征 pool — all-subject currently-unmastered questions (lastResult==='wrong').
  // NOT year-filtered: it is the player's wrong set regardless of exam year.
  // The 出征 button only needs the COUNT (cheap, O(history)); the full-corpus
  // materialization runs only while the drill is actually open.
  const questionHistory = useQuestionHistory()
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

  // Open a regular (non-expedition) quiz; the two are mutually exclusive, so
  // opening one always closes the other.
  const openRegularQuiz = (familyId: string | null): void => {
    setExpeditionOpen(false)
    setQuickReviewActive(false)
    setQuizEntry(familyId)
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

  const onTimerToggle = (): void => {
    if (timer.status === 'idle') {
      timer.start()
    } else if (timer.status === 'paused') {
      timer.resume()
    } else {
      timer.stop()
    }
  }

  const timerButtonLabel = (() => {
    if (timer.status === 'idle') return '📖 開始閱讀'
    if (timer.status === 'reading') {
      return `🟢 閱讀中 · ${timer.currentMinute} min · 點擊結束`
    }
    if (timer.pauseReason === 'visibility') return '⏸ 切到別的分頁 · 點擊繼續'
    if (timer.pauseReason === 'idle') return '⏸ 90s 無動作 · 點擊繼續'
    return '⏸ 已暫停 · 點擊繼續'
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

      {/* ── CTA toolbar (above the maze): reading toggle + cross-family random quiz
            + 全科錯題 出征 (persistent expedition CTA, per neurons-homepage). ── */}
      <section style={quizCtaSectionStyle} aria-label="核心循環入口">
        <div style={ctaButtonRowStyle}>
          <button
            type="button"
            style={timer.status === 'reading' ? readingActiveButtonStyle : readingCtaButtonStyle}
            onClick={onTimerToggle}
            aria-label="閱讀計時器"
          >
            {timerButtonLabel}
          </button>
          <button
            type="button"
            style={randomQuizButtonStyle}
            onClick={() => openRegularQuiz(null)}
            aria-label="跨 family 隨機答題"
            title={`從全部 ${totalPoolSize} 題隨機抽題`}
          >
            🎲 隨機跨 family 答題
            <span style={ctaCountBadgeStyle}>{totalPoolSize} 題</span>
          </button>
          <button
            type="button"
            style={wrongCount > 0 ? expeditionButtonStyle : expeditionButtonDisabledStyle}
            onClick={openExpedition}
            disabled={wrongCount === 0}
            aria-label="出征：全科錯題練習"
            title={
              wrongCount > 0
                ? `對你目前未答對的 ${wrongCount} 題出征`
                : '目前沒有未答對的題目 — 先去答題吧'
            }
          >
            ⚔️ 出征 · 全科錯題
            <span style={ctaCountBadgeStyle}>{wrongCount} 題</span>
          </button>
        </div>
        <p style={quizCtaHintStyle}>
          開始閱讀累積能量，或直接答題。下方點任何 family 卡片即可指定範圍練習；走腦圖到節點即可抽出神經元。
        </p>
        <YearFilterBar />
      </section>

      {/* ── The maze brain-map IS the homepage centerpiece (promote-maze-to-home).
            Fixed-height contained panel; the connectome tree no longer mounts here. ── */}
      <MazeBrainMap view={mazeView} />

      {/* ── Study squad: party + assembly editor (出征 itself now lives in the CTA
            toolbar above). Sits below the maze as a deploy-from-the-map surface. ── */}
      <StudySquadPanel />

      <DmnDrawProgressRing />

      <section style={statusChipStyle} aria-label="進度狀態">
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>🧬</span>
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
          <span style={statusEmojiStyle}>📖</span>
          <span style={statusLabelStyle}>累積閱讀</span>
          <span style={statusValueStyle}>{totalStudyMin}</span>
          <span style={statusMaxStyle}>min</span>
        </div>
      </section>

      <FamilyPicker
        pack={pack}
        accrualByFamily={accrualByFamily}
        onStartQuiz={openRegularQuiz}
      />

      {quizEntry !== undefined && expeditionOpen === false && (
        <QuizModal pool={quizPool} onClose={() => setQuizEntry(undefined)} />
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
  fontFamily: "'VT323', monospace",
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

const readingCtaButtonStyle: React.CSSProperties = {
  flex: '1 1 200px',
  padding: '0.65rem 1.2rem',
  borderRadius: '6px',
  border: '1px solid #6a8c3f',
  background: '#7fa84a',
  color: '#fff',
  fontSize: '1.02rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
}

const readingActiveButtonStyle: React.CSSProperties = {
  ...readingCtaButtonStyle,
  background: '#4d8c4d',
  border: '1px solid #3a6a3a',
  animation: 'pulse 2s ease-in-out infinite',
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

const expeditionButtonDisabledStyle: React.CSSProperties = {
  ...expeditionButtonStyle,
  background: '#cdbfa6',
  border: '1px solid #b8a98c',
  cursor: 'not-allowed',
  boxShadow: 'none',
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
