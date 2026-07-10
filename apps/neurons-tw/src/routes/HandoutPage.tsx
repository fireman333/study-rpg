/**
 * HandoutPage — /cram/handout 「考前講義(beta)」(add-neurons-anatomy-handout).
 *
 * A full-screen, vertically scrollable, TEACHING-style study handout — deeper and more
 * beginner-friendly than the cram-tab discriminator sheets or the 5-min speed review.
 * Meant to be read over the last week before an exam. beta ships 解剖學 only; the loader
 * returns a subjects[] array so more families can be added with zero code change.
 *
 * Same full-screen-scene discipline as SpeedReviewPage: createPortal to <body> to escape the
 * AnimatedRoutes Framer transform; the route is registered OUTSIDE AnimatedRoutes (with an
 * in-layer placeholder) so in-app nav + direct URL + F5 all render.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useHandout } from '../lib/handout'
import type { HandoutSubject } from '../lib/handout'

interface TocEntry {
  id: string
  title: string
}

/** Parse region anchors from the authored HTML for the in-scene table of contents. */
function deriveToc(html: string): TocEntry[] {
  if (typeof window === 'undefined' || !html) return []
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return [...doc.querySelectorAll('.hdt-region')].map((s) => ({
      id: (s as HTMLElement).id,
      title: s.querySelector('.hdt-region__head')?.textContent?.trim() || (s as HTMLElement).id,
    }))
  } catch {
    return []
  }
}

export function HandoutPage(): JSX.Element | null {
  const navigate = useNavigate()
  const data = useHandout()
  const [mounted, setMounted] = useState(false)
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => setMounted(true), [])

  const subjects: HandoutSubject[] = data?.subjects ?? []
  const active: HandoutSubject | null =
    subjects.find((s) => s.subjectId === subjectId) ?? subjects[0] ?? null
  const toc = useMemo(() => deriveToc(active?.html ?? ''), [active?.html])

  const close = () => navigate('/cram')
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // Reset scroll to top when switching subjects.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [active?.subjectId])

  if (!mounted) return null
  return createPortal(
    <div className="hdt-scene" style={sceneStyle} role="dialog" aria-modal="true" aria-label="考前講義">
      <style>{SCENE_CSS}</style>

      {/* ── Header: title · subject · close ── */}
      <header style={headerStyle}>
        <span style={titleStyle}>📖 考前講義</span>
        <span style={betaChipStyle}>beta</span>
        {active && <span style={subjectChipStyle}>{active.subjectId}</span>}
        <button style={closeBtnStyle} onClick={close} aria-label="關閉講義">
          ✕
        </button>
      </header>

      {/* ── Subject picker (only shows when >1 subject exists; future-proof) ── */}
      {subjects.length > 1 && (
        <div style={subjectRowStyle}>
          {subjects.map((s) => (
            <button
              key={s.subjectId}
              type="button"
              aria-pressed={s.subjectId === active?.subjectId}
              style={{ ...subjectBtnStyle, ...(s.subjectId === active?.subjectId ? subjectBtnActiveStyle : null) }}
              onClick={() => setSubjectId(s.subjectId)}
            >
              {s.subjectId}
            </button>
          ))}
        </div>
      )}

      {/* ── Region TOC (jump nav) ── */}
      {toc.length > 0 && (
        <nav style={tocStyle} aria-label="章節導覽">
          {toc.map((t) => (
            <button key={t.id} type="button" style={tocChipStyle} onClick={() => jumpTo(t.id)}>
              {t.title}
            </button>
          ))}
        </nav>
      )}

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} style={scrollStyle}>
        {!data ? (
          <p style={loadingStyle}>載入講義中…</p>
        ) : !active ? (
          <p style={loadingStyle}>目前尚無講義內容。</p>
        ) : (
          <div style={contentWrapStyle}>
            <div style={introNoteStyle}>
              這是<b>教學型考前講義</b>：第一次唸也看得懂，依解剖分區整理高頻重點，適合考前一週系統複習。
              依歷屆出現頻率收斂 —— 頻率高 ≠ 今年一定考。
            </div>
            {/* Authored, build-trusted teaching HTML (no user input; same trust model as cram). */}
            <article dangerouslySetInnerHTML={{ __html: active.html }} />
            <footer style={creditStyle}>
              內容依歷屆考題（考選部）與陽明國考考古題小組詳解（CC-BY-NC）整理彙編；教學脈絡為輔助說明。
            </footer>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── scene chrome (warm pixel-tan base, matching SpeedReviewPage; green handout accents) ──
const GREEN = '#6a8c3f' // 解剖學 anchor color
const GREEN_DK = '#4c6a2b'

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
  borderBottom: `2px solid ${GREEN}`,
  background: '#eef2e2',
}
const titleStyle: React.CSSProperties = { fontWeight: 700, color: GREEN_DK, fontSize: '1rem' }
const betaChipStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color: '#fff',
  background: GREEN,
  borderRadius: 999,
  padding: '0.08rem 0.45rem',
}
const subjectChipStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: GREEN_DK,
  border: `1px solid ${GREEN}`,
  borderRadius: 6,
  padding: '0.1rem 0.5rem',
}
const closeBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  fontSize: '1.2rem',
  color: GREEN_DK,
  cursor: 'pointer',
  lineHeight: 1,
}
const subjectRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  padding: '0.5rem 1rem 0',
  flexWrap: 'wrap',
}
const subjectBtnStyle: React.CSSProperties = {
  border: `1px solid ${GREEN}`,
  background: '#fbfdf6',
  color: GREEN_DK,
  borderRadius: 6,
  padding: '0.25rem 0.7rem',
  fontSize: '0.82rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-legible)',
}
const subjectBtnActiveStyle: React.CSSProperties = { background: GREEN, color: '#fff' }
const tocStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  padding: '0.55rem 1rem',
  overflowX: 'auto',
  borderBottom: '1px solid #d8c8a0',
  WebkitOverflowScrolling: 'touch',
}
const tocChipStyle: React.CSSProperties = {
  flex: '0 0 auto',
  border: `1px solid ${GREEN}`,
  background: '#fbfdf6',
  color: GREEN_DK,
  borderRadius: 999,
  padding: '0.25rem 0.7rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font-legible)',
}
const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}
const contentWrapStyle: React.CSSProperties = {
  maxWidth: 780,
  margin: '0 auto',
  padding: '1rem 1.1rem 4rem',
}
const introNoteStyle: React.CSSProperties = {
  fontSize: '0.84rem',
  color: '#5a4a2f',
  background: '#eef2e2',
  border: `1px solid ${GREEN}`,
  borderRadius: 8,
  padding: '0.6rem 0.8rem',
  marginBottom: '1.2rem',
  lineHeight: 1.6,
  fontFamily: 'var(--font-legible)',
}
const creditStyle: React.CSSProperties = {
  marginTop: '2rem',
  fontSize: '0.74rem',
  color: '#a08a5e',
  lineHeight: 1.6,
  fontFamily: 'var(--font-legible)',
  borderTop: '1px dashed #d8c8a0',
  paddingTop: '0.8rem',
}
const loadingStyle: React.CSSProperties = { margin: '2rem auto', textAlign: 'center', color: '#8c7a55' }

// ── CSS for the authored teaching HTML (scoped under .hdt-scene) ──
const SCENE_CSS = `
.hdt-scene article { font-family: var(--font-legible); color: #33301f; line-height: 1.75; font-size: 0.95rem; }
.hdt-scene .hdt-region { scroll-margin-top: 8px; margin: 0 0 2.2rem; }
.hdt-scene .hdt-region__head {
  font-size: 1.15rem; color: #fff; background: ${GREEN}; border-radius: 8px;
  padding: 0.5rem 0.8rem; margin: 1.6rem 0 0.9rem; font-weight: 700;
}
.hdt-scene .hdt-region:first-child .hdt-region__head { margin-top: 0; }
.hdt-scene .hdt-intro {
  background: #f7f3e4; border-left: 4px solid ${GREEN}; border-radius: 0 6px 6px 0;
  padding: 0.55rem 0.8rem; margin: 0 0 1rem; color: #4a4028; font-size: 0.9rem;
}
.hdt-scene .hdt-topic { margin: 0 0 1.3rem; }
.hdt-scene .hdt-topic > h3 { font-size: 1rem; color: ${GREEN_DK}; margin: 1.1rem 0 0.35rem; font-weight: 700; }
.hdt-scene .hdt-teach { margin: 0 0 0.5rem; color: #453d29; }
.hdt-scene h3.hdt-h { font-size: 0.98rem; color: ${GREEN_DK}; margin: 1.2rem 0 0.45rem; font-weight: 700; }
.hdt-scene ul.hdt-must { margin: 0.2rem 0 0.6rem; padding-left: 1.25rem; }
.hdt-scene ul.hdt-must > li { margin: 0.3rem 0; }
.hdt-scene ul.hdt-must > li > b { color: ${GREEN_DK}; }
.hdt-scene cite {
  margin-left: 0.35em; font-size: 0.72em; color: #a08a5e; font-style: normal;
  vertical-align: super; white-space: nowrap;
}
.hdt-scene table.hdt-tbl {
  width: 100%; border-collapse: collapse; margin: 0.4rem 0 1rem; font-size: 0.86rem;
  display: block; overflow-x: auto;
}
.hdt-scene table.hdt-tbl thead th {
  background: #e3ead2; color: ${GREEN_DK}; text-align: left; padding: 0.35rem 0.55rem;
  border-bottom: 2px solid ${GREEN}; white-space: nowrap;
}
.hdt-scene table.hdt-tbl td {
  padding: 0.35rem 0.55rem; border-bottom: 1px solid #e7ddc2; vertical-align: top; color: #33301f;
}
.hdt-scene table.hdt-tbl tbody tr:nth-child(even) { background: #faf6ea; }
.hdt-scene table.hdt-vs thead th:first-child { color: #7a6a45; }
.hdt-scene b { color: #2a2618; }
`
