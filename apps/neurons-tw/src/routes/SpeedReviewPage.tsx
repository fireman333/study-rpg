/**
 * SpeedReviewPage — /cram/5min 「5 分鐘速看版考前複習」(add-neurons-5min-speed-review).
 *
 * A full-screen, pure-read, horizontally swipeable one-card-per-family skim of the
 * highest-yield essence lines, meant to be opened in the last ~5 minutes before an
 * exam. Data source = the existing cram.json `kernel` (🎯 高頻考古) blocks (design D3
 * — reuse, no new artifact). Cards are ordered weakest-first from read-only family
 * mastery (D6 — zero writes). An ambient 5-minute hourglass fills gently and, on
 * completion, shows a non-interrupting hint — no score, no countdown pressure, no
 * blocking (honors the cram honesty rule). Pure read: essence lines are not clickable.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { useCram } from '../lib/cram'
import { listAllMastery } from '../lib/services/mastery'
import type { FamilyMasteryRow } from '../lib/db'
import { buildSpeedReviewCards } from '../lib/speed-review'
import { EmojiIcon } from '../components/EmojiIcon'

const TOTAL_SECONDS = 5 * 60

/** Render build-trusted inline HTML (sanitized to <b> in build-cram; same as CramPage). */
function Inline({ html }: { html: string }): JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export function SpeedReviewPage(): JSX.Element | null {
  const navigate = useNavigate()
  const cram = useCram()
  const reduced = useReducedMotion()
  const [mastery, setMastery] = useState<FamilyMasteryRow[] | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  // Portal-safety: only render the portal after mount, when document.body is guaranteed
  // present (standard robust pattern; avoids any "Target container is not a DOM element").
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Read-only weakness signal (D6): per-family correct/total. No writes.
  useEffect(() => {
    let alive = true
    void listAllMastery().then((rows) => alive && setMastery(rows))
    return () => {
      alive = false
    }
  }, [])

  // Ambient hourglass — ticks only while the tab is visible (honest: no accrual while away).
  useEffect(() => {
    let timer: number | undefined
    const tick = () => setElapsed((e) => (e >= TOTAL_SECONDS ? e : e + 1))
    const start = () => {
      if (timer == null) timer = window.setInterval(tick, 1000)
    }
    const stop = () => {
      if (timer != null) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop())
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const cards = useMemo(
    () => (cram ? buildSpeedReviewCards(cram, mastery ?? []) : []),
    [cram, mastery],
  )

  const totalSlides = cards.length + 2 // intro + cards + close
  const scrollToSlide = (i: number) => {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' })
  }
  const onScroll = () => {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }
  const close = () => navigate('/cram')

  const remaining = Math.max(0, TOTAL_SECONDS - elapsed)
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  const timeUp = elapsed >= TOTAL_SECONDS

  if (!mounted) return null
  // Portal to <body>: the route lives inside a Framer-Motion transform wrapper
  // (AnimatedRoutes), which would otherwise become the containing block for our
  // position:fixed scene (breaking full-viewport coverage + flex height). The portal
  // escapes that transform so `inset:0` is viewport-relative.
  return createPortal(
    <div style={sceneStyle} role="dialog" aria-modal="true" aria-label="5 分鐘速看版考前複習">
      {/* ── Header: title · ambient hourglass · close ── */}
      <header style={headerStyle}>
        <span style={titleStyle}>
          <EmojiIcon char="⏳" size={16} decorative /> 5 分鐘速看
        </span>
        <span style={timeUp ? doneHintStyle : timeStyle}>
          {timeUp ? '掃完就進去考吧 💪' : `${mm}:${ss}`}
        </span>
        <button style={closeBtnStyle} onClick={close} aria-label="關閉速看">
          ✕
        </button>
      </header>
      {/* ambient progress bar (gentle, non-blocking) */}
      <div style={barTrackStyle} aria-hidden="true">
        <div
          style={{
            ...barFillStyle,
            width: `${Math.min(100, (elapsed / TOTAL_SECONDS) * 100)}%`,
            transition: reduced ? 'none' : 'width 1s linear',
          }}
        />
      </div>

      {!cram ? (
        <p style={loadingStyle}>載入速看資料中…</p>
      ) : (
        <>
          {/* ── Swipeable deck (CSS scroll-snap) ── */}
          <div ref={trackRef} style={trackStyle} onScroll={onScroll}>
            {/* intro */}
            <section style={slideStyle}>
              <div style={{ ...cardStyle, borderColor: '#8c6d4a' }}>
                <h2 style={introTitleStyle}>進場前 5 分鐘 · 速看</h2>
                <p style={introLineStyle}>左右滑，把 11 科最高頻的精華掃一遍。純看、不答題。</p>
                <p style={introSubStyle}>依歷屆出現頻率精選，供考前收斂 —— 頻率高 ≠ 今年一定考。</p>
                {cards.some((c) => c.weak) && (
                  <p style={introSubStyle}>⚠️ 標記的是你近期較弱的科，已排前面。</p>
                )}
                <button style={startBtnStyle} onClick={() => scrollToSlide(1)}>
                  開始掃 →
                </button>
              </div>
            </section>

            {/* family cards */}
            {cards.map((c) => (
              <section key={c.familyId} style={slideStyle}>
                <div style={{ ...cardStyle, borderColor: c.color }}>
                  <div style={{ ...cardHeadStyle, background: c.color }}>
                    <span style={cardHeadNameStyle}>{c.name}</span>
                    {c.weak && <span style={weakChipStyle}>⚠ 近期較弱</span>}
                  </div>
                  <ul style={essenceListStyle}>
                    {c.items.map((it, i) => (
                      <li key={i} style={essenceItemStyle}>
                        <Inline html={it.html} />
                        {it.cite && <cite style={citeStyle}>{it.cite}</cite>}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}

            {/* close */}
            <section style={slideStyle}>
              <div style={{ ...cardStyle, borderColor: '#8c6d4a', textAlign: 'center' }}>
                <h2 style={introTitleStyle}>掃完了 💪</h2>
                <p style={introLineStyle}>深呼吸，進去考吧。</p>
                <button style={startBtnStyle} onClick={close}>
                  回考前猜題
                </button>
              </div>
            </section>
          </div>

          {/* ── Progress dots + prev/next ── */}
          <footer style={footerStyle}>
            <button
              style={{ ...navBtnStyle, visibility: index > 0 ? 'visible' : 'hidden' }}
              onClick={() => scrollToSlide(index - 1)}
              aria-label="上一張"
            >
              ‹
            </button>
            <div style={dotsStyle}>
              {Array.from({ length: totalSlides }, (_, i) => (
                <button
                  key={i}
                  style={i === index ? dotActiveStyle : dotStyle}
                  onClick={() => scrollToSlide(i)}
                  aria-label={`第 ${i + 1} 張`}
                />
              ))}
            </div>
            <button
              style={{ ...navBtnStyle, visibility: index < totalSlides - 1 ? 'visible' : 'hidden' }}
              onClick={() => scrollToSlide(index + 1)}
              aria-label="下一張"
            >
              ›
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  )
}

// ── styles (warm pixel-tan aesthetic, matching CramPage / MockExamRunner) ──
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
  gap: '0.75rem',
  padding: '0.7rem 1rem',
  borderBottom: '2px solid #d8c8a0',
}
const titleStyle: React.CSSProperties = { fontWeight: 700, color: '#5a4a2f', fontSize: '1rem' }
const timeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontVariantNumeric: 'tabular-nums',
  color: '#8c7a55',
  fontSize: '0.95rem',
}
const doneHintStyle: React.CSSProperties = { marginLeft: 'auto', color: '#3d7a52', fontSize: '0.9rem' }
const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  color: '#8c6d4a',
  cursor: 'pointer',
  lineHeight: 1,
}
const barTrackStyle: React.CSSProperties = { height: 3, background: '#e2d6b8' }
const barFillStyle: React.CSSProperties = { height: '100%', background: '#c9a24a' }
const trackStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollSnapType: 'x mandatory',
  WebkitOverflowScrolling: 'touch',
}
const slideStyle: React.CSSProperties = {
  flex: '0 0 100%',
  scrollSnapAlign: 'center',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  boxSizing: 'border-box',
  overflowY: 'auto',
}
const cardStyle: React.CSSProperties = {
  background: '#fbf6e9',
  border: '2px solid #8c6d4a',
  borderRadius: 12,
  width: 'min(680px, 100%)',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}
const cardHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.55rem 0.9rem',
  color: '#fff',
}
const cardHeadNameStyle: React.CSSProperties = { fontWeight: 700, fontSize: '1.05rem' }
const weakChipStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.72rem',
  background: 'rgba(255,255,255,0.28)',
  padding: '0.1rem 0.45rem',
  borderRadius: 999,
}
const essenceListStyle: React.CSSProperties = {
  margin: 0,
  padding: '0.8rem 1rem 1rem 1.5rem',
  overflowY: 'auto',
  lineHeight: 1.7,
  color: '#3f341f',
}
const essenceItemStyle: React.CSSProperties = { marginBottom: '0.65rem', fontSize: '0.96rem' }
const citeStyle: React.CSSProperties = {
  marginLeft: '0.4em',
  fontSize: '0.72em',
  color: '#a08a5e',
  fontStyle: 'normal',
}
const introTitleStyle: React.CSSProperties = {
  margin: '1.2rem 1rem 0.4rem',
  color: '#5a4a2f',
  fontSize: '1.3rem',
}
const introLineStyle: React.CSSProperties = { margin: '0.3rem 1rem', color: '#4a3f28' }
const introSubStyle: React.CSSProperties = { margin: '0.3rem 1rem', color: '#8c7a55', fontSize: '0.85rem' }
const startBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  margin: '0.9rem 1rem 1.2rem',
  padding: '0.5rem 1.1rem',
  background: '#c9a24a',
  color: '#3d2f12',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
}
const loadingStyle: React.CSSProperties = { margin: 'auto', color: '#8c7a55' }
const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.6rem 1rem',
  borderTop: '2px solid #d8c8a0',
}
const navBtnStyle: React.CSSProperties = {
  background: '#efe4c6',
  border: '1px solid #c9b891',
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: '1.2rem',
  color: '#6a5836',
  cursor: 'pointer',
  lineHeight: 1,
}
const dotsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  justifyContent: 'center',
  flex: 1,
}
const dotStyle: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: '50%',
  border: 'none',
  background: '#d3c39c',
  cursor: 'pointer',
  padding: 0,
}
const dotActiveStyle: React.CSSProperties = { ...dotStyle, background: '#8c6d4a', transform: 'scale(1.25)' }
