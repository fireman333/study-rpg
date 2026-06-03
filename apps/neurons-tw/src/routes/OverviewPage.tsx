import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { NEURON_VARIANT_TOTAL } from '@study-rpg/content-neurons-tw'
import { initMasteryForPack } from '../lib/services/connectome'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import QuizHotkeysAnnouncementBanner from '../components/QuizHotkeysAnnouncementBanner'
import { QuizModal } from '../components/QuizModal'
import { FamilyPicker, type FamilyAccrual } from '../components/FamilyPicker'
import { ConnectomeTreeSvg } from '../components/connectome/ConnectomeTreeSvg'
import { DmnDrawProgressRing } from '../components/DmnDrawProgressRing'
import { HomepageOnboarding } from '../components/HomepageOnboarding'
import StudySquadPanel from '../components/StudySquadPanel'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'
import { filterPoolByFamily, filterPoolByYear } from '../lib/services/quiz-pool'
import { useQuestionHistory } from '../lib/services/question-history'
import { buildWrongQuestionPool, onExpeditionComplete } from '../lib/services/expedition'
import { ALL_YEARS, effectiveYearSet, useYearFilter } from '../lib/services/year-filter'
import { YearFilterBar } from '../components/YearFilterBar'
import { db } from '../lib/db'

interface Props {
  pack: ContentPack
}

interface ProgressStats {
  variants: number
  synapsesStrong: number
  synapsesWeak: number
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
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const [stats, setStats] = useState<ProgressStats>({
    variants: 0,
    synapsesStrong: 0,
    synapsesWeak: 0,
    dmnOwned: 0,
  })
  const [synapseCount, setSynapseCount] = useState(0)
  const [accrualByFamily, setAccrualByFamily] = useState<Map<string, FamilyAccrual>>(new Map())
  const timer = useReadingTimer()

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
  const expeditionPool = useMemo(
    () => (expeditionOpen ? buildWrongQuestionPool(pack.questions, questionHistory) : []),
    [expeditionOpen, pack.questions, questionHistory],
  )

  useEffect(() => {
    initMasteryForPack(pack).catch(() => {
      // Non-fatal: chips fall back to 0/0 display until next load
    })
  }, [pack])

  useEffect(() => {
    // Read-only table reads — do NOT call loadConnectome() here: it runs the
    // daily-reset WRITE transaction, which Dexie liveQuery forbids inside its
    // querier (throws DexieError → stats/synapseCount/accrual would never update).
    // The daily reset is owned by ConnectomeTreeSvg's mount + recordCorrectAnswer.
    const sub = liveQuery(async () => {
      const [variants, dmn, synapses, familyAccrual] = await Promise.all([
        db.neuronVariants.toArray(),
        db.dmnCards.toArray(),
        db.synapses.toArray(),
        db.familyAccrual.toArray(),
      ])
      const accrual = new Map<string, FamilyAccrual>(
        familyAccrual.map((r) => [
          r.familyId,
          { ap: r.ap, unlockedSlots: r.unlockedSlots, firedToday: r.firedToday },
        ]),
      )
      return {
        stats: {
          variants: variants.length,
          synapsesStrong: synapses.filter((s) => s.state === 'strong').length,
          synapsesWeak: synapses.filter((s) => s.state === 'weak').length,
          dmnOwned: dmn.length,
        },
        synapseCount: synapses.length,
        accrual,
      }
    }).subscribe({
      next: (val) => {
        setStats(val.stats)
        setSynapseCount(val.synapseCount)
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
    setQuizEntry(familyId)
  }

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

      {/* ── CTA toolbar (above the tree): reading toggle + cross-family random quiz ── */}
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
            <span style={randomQuizCountStyle}>{totalPoolSize} 題</span>
          </button>
        </div>
        <p style={quizCtaHintStyle}>
          開始閱讀累積時間，或直接答題。下方點任何 family 卡片即可指定範圍練習。
        </p>
        <YearFilterBar />
      </section>

      {/* ── Study squad: party + 出征 (add-neurons-study-squad). Sits above the
            connectome tree as a deploy-from-the-map surface; its own block so it
            never overlaps the SVG graph. ── */}
      <StudySquadPanel
        expeditionCount={wrongCount}
        onExpedition={() => {
          setQuizEntry(undefined)
          setExpeditionOpen(true)
        }}
      />

      {/* ── First-visit guidance while the connectome is still empty (stateless;
            auto-hides on first synapse). Replaces the old "0 連線" framing. ── */}
      {synapseCount === 0 && (
        <section role="region" aria-label="新手指引" style={emptyStateCalloutStyle}>
          <strong style={emptyStateOpenerStyle}>👋 連結組還是空的 — 先 wire 出第一條 synapse</strong>
          <p style={emptyStateBodyStyle}>
            用上方 <strong>🎲 隨機跨 family 答題</strong>，或下方任一 family 卡片的 <strong>🎯 答題</strong> 開始作答。
            同一天讓 <strong>兩個 family 各答對 5 題</strong>，就會 wire 出你的第一條 synapse，下面樹上的連線會亮起來。
          </p>
          <p style={emptyStateFlavorStyle}>
            Hebbian rule — &ldquo;Neurons that fire together, wire together.&rdquo;
          </p>
        </section>
      )}

      {/* ── The connectome IS the homepage: fixed-height interactive tree panel.
            When empty it reads as a dimmed skeleton of what the tree can grow into. ── */}
      <div
        style={synapseCount === 0 ? treePanelEmptyStyle : treePanelStyle}
        aria-label="connectome 連結組（互動）"
      >
        <ConnectomeTreeSvg pack={pack} interactive panelHeight="min(72vh, 600px)" />
      </div>

      <DmnDrawProgressRing />

      <section style={statusChipStyle} aria-label="進度狀態">
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>🧬</span>
          <span style={statusLabelStyle}>變體</span>
          <span style={statusValueStyle}>{stats.variants}</span>
          <span style={statusMaxStyle}>/ {NEURON_VARIANT_TOTAL}</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>🔗</span>
          <span style={statusLabelStyle}>Synapse</span>
          <span style={statusValueStyle}>{stats.synapsesStrong}</span>
          <span style={statusMaxStyle}>強 / {stats.synapsesWeak} 弱</span>
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

      {/* 出征 (expedition) drill — cross-subject wrong questions. Its onComplete
          fires the no-op reward seam (Phase 4 plugs in here). (add-neurons-study-squad) */}
      {expeditionOpen && (
        <QuizModal
          pool={expeditionPool}
          onClose={() => setExpeditionOpen(false)}
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

// Fixed-height interactive tree panel — the connectome IS the homepage. Bounds
// the tree so it's a centerpiece, not a full-page-tall block; ConnectomeTreeSvg
// gets panelHeight so its SVG fits via preserveAspectRatio meet. overflow:hidden
// + the tree's own overscroll-behavior:contain keep gestures from chaining out.
const treePanelStyle: React.CSSProperties = {
  marginBottom: '1rem',
  overflow: 'hidden',
}

// Empty connectome: lightly desaturate the tree so it reads as a skeleton of what
// it can grow into (paired with the guidance callout above).
const treePanelEmptyStyle: React.CSSProperties = {
  ...treePanelStyle,
  filter: 'saturate(0.7)',
}

const emptyStateCalloutStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.9rem 1.1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const emptyStateOpenerStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '1.05rem',
  color: '#5a3f29',
  marginBottom: '0.4rem',
}

const emptyStateBodyStyle: React.CSSProperties = {
  margin: '0 0 0.45rem',
  fontSize: '0.92rem',
  lineHeight: 1.55,
  color: '#3a2a1a',
}

const emptyStateFlavorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  fontStyle: 'italic',
  color: '#8c6d4a',
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
  flex: '1 1 220px',
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
  flex: '1 1 220px',
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

const randomQuizCountStyle: React.CSSProperties = {
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
