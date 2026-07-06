/**
 * CramPage — /cram 考前猜題 (add-neurons-cram-tab).
 *
 * Two regions (醫學一 / 醫學二), single-open subject accordions. Each subject shows its 押題清單
 * first (honest raw counts + tier, no hit-rate/guarantee) with an evidence-first drawer that drills
 * to real source questions AND offers a low-friction practice on-ramp (design D7); 速看重點 blocks
 * are nested behind a toggle. Persistent honesty disclaimer + methodology note + 「統計至 115-1」stamp.
 *
 * Data is lazy-fetched cram.json (useCram); questions resolve from the loaded ContentPack.
 */
import { useMemo, useState } from 'react'
import type { ContentPack, Question } from '@study-rpg/core'
import type { CramBlock, CramPushItem } from '@study-rpg/content-neurons-tw'
import { useCram } from '../lib/cram'
import { QuestionReviewCard } from '../components/QuestionReviewCard'
import { QuizModal } from '../components/QuizModal'
import { EmojiIcon } from '../components/EmojiIcon'

const STAT_STAMP = '統計至 115-1'
const SOURCE_PREVIEW_CAP = 6

// Tier presentation — honest labels; 經典但降溫 explicitly flagged as cooling.
const TIER_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
  常青必掃: { color: '#7a5410', bg: '#f3dfa6', icon: '🌲' },
  穩定考點: { color: '#5a4a33', bg: '#e6dcc2', icon: '◆' },
  近年新寵: { color: '#2f6b45', bg: '#d5ecd9', icon: '✨' },
  經典但降溫: { color: '#6a6a6a', bg: '#e4e4e4', icon: '❄️ 降溫' },
}

/** Render build-trusted inline HTML (sanitized to <b> only in build-cram). */
function Inline({ html }: { html: string }): JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export function CramPage({ pack }: { pack: ContentPack }): JSX.Element {
  const cram = useCram()
  const questionById = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of pack.questions) m.set(q.id, q)
    return m
  }, [pack.questions])

  const [openSubject, setOpenSubject] = useState<string | null>(null)
  const [showBlocks, setShowBlocks] = useState<Record<string, boolean>>({})
  const [drawerFor, setDrawerFor] = useState<string | null>(null) // `${subjectId}::${leafId}`
  const [methodOpen, setMethodOpen] = useState(false)
  const [practice, setPractice] = useState<{ pool: Question[]; label: string } | null>(null)

  if (!cram) {
    return (
      <div style={pageStyle}>
        <p style={loadingStyle}>載入考前猜題資料中…</p>
      </div>
    )
  }

  const resolve = (ids: string[]): Question[] =>
    ids.map((id) => questionById.get(id)).filter((q): q is Question => q != null)

  return (
    <div style={pageStyle}>
      {/* ── Persistent honesty header ── */}
      <header style={disclaimerStyle}>
        <p style={disclaimerLineStyle}>
          <EmojiIcon char="⚖️" size={14} decorative /> 此清單依歷屆<b>出現頻率</b>排序，供考前收斂用。
          <b>頻率高 ≠ 今年一定考</b>；請當作投報率參考，不是預測。
        </p>
        <div style={disclaimerMetaStyle}>
          <button type="button" style={methodBtnStyle} onClick={() => setMethodOpen((v) => !v)}>
            ⓘ 怎麼算的 {methodOpen ? '▴' : '▾'}
          </button>
          <span style={stampStyle}>{STAT_STAMP}</span>
        </div>
        {methodOpen && (
          <div style={methodBodyStyle}>
            押題排序＝該概念在 <b>23 次考試</b>（104–114 各兩次 + 115 第一次）中出現過的<b>不同次數</b>
            （sitting-breadth，同一次考多題只算一次，上限 23）。分母固定 23，跨概念題不會灌水。
            「共 N 題」是次要強度參考，可能超過真實題數（跨概念題重複計）。
            速看重點由歷屆真實考題 + 陽明國考考古題小組詳解壓縮而成，每一條都可回溯真題。
          </div>
        )}
      </header>

      {/* ── Mobile sticky subject quick-jump ── */}
      <nav style={quickJumpStyle} aria-label="科目快跳">
        {cram.books.map((book) =>
          book.subjects.map((s) => (
            <a key={s.subjectId} href={`#cram-${s.subjectId}`} style={quickChipStyle}>
              {s.name}
            </a>
          )),
        )}
      </nav>

      {/* ── Books ── */}
      {cram.books.map((book) => (
        <section key={book.book} style={{ marginBottom: '1.5rem' }}>
          <h2 style={bookHeadingStyle}>
            {book.book}
            <span style={bookNoteStyle}>{book.book === '醫學一' ? '（上午卷）' : '（下午卷）'}</span>
          </h2>

          {book.subjects.map((s) => {
            const key = s.subjectId
            const isOpen = openSubject === key
            const blocksOpen = showBlocks[key] ?? false
            return (
              <article key={key} id={`cram-${s.subjectId}`} style={subjectCardStyle}>
                <button
                  type="button"
                  style={subjectHeaderStyle}
                  aria-expanded={isOpen}
                  onClick={() => setOpenSubject(isOpen ? null : key)}
                >
                  <span style={subjectNameStyle}>{s.name}</span>
                  <span style={subjectCountChipStyle}>
                    押題 {s.push.length} · 速看 {s.blocks.length}
                  </span>
                  <span style={{ marginLeft: 'auto' }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen && (
                  <div style={subjectBodyStyle}>
                    {/* 押題清單 (visible by default) */}
                    <h3 style={sectionLabelStyle}>🎯 押題清單（依重現度）</h3>
                    <ul style={pushListStyle}>
                      {s.push.map((item) => {
                        const dkey = `${s.subjectId}::${item.leafId}`
                        const drawerOpen = drawerFor === dkey
                        const tier = TIER_STYLE[item.tier] ?? TIER_STYLE['穩定考點']
                        return (
                          <li key={item.leafId} style={pushItemStyle}>
                            <div style={pushRowStyle}>
                              <span style={pushZhStyle}>{item.zh}</span>
                              <span style={{ ...tierChipStyle, color: tier.color, background: tier.bg }}>
                                {tier.icon} {item.tier}
                              </span>
                            </div>
                            <button
                              type="button"
                              style={countChipStyle}
                              aria-expanded={drawerOpen}
                              onClick={() => setDrawerFor(drawerOpen ? null : dkey)}
                            >
                              {item.sittingsTotal} 次考試出現 <b>{item.sittingBreadth}</b> 次
                              <span style={intensityStyle}> · 共 {item.questionCount} 題</span>
                              <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
                                {drawerOpen ? '▴ 收合' : '▾ 看題'}
                              </span>
                            </button>

                            {drawerOpen && (
                              <CramEvidenceDrawer
                                item={item}
                                questions={resolve(item.sourceQuestionIds)}
                                onPractice={(pool) =>
                                  setPractice({ pool, label: item.zh })
                                }
                              />
                            )}
                          </li>
                        )
                      })}
                    </ul>

                    {/* One section-level practice CTA (D7 — single low-friction bridge) */}
                    <button
                      type="button"
                      style={sectionPracticeStyle}
                      onClick={() => {
                        const ids = s.push.flatMap((p) => p.sourceQuestionIds)
                        const pool = resolve([...new Set(ids)])
                        if (pool.length > 0) setPractice({ pool, label: `${s.name} 高頻概念` })
                      }}
                    >
                      ▶ 用本章高頻概念練幾題
                    </button>

                    {/* 速看重點 (nested, collapsed) */}
                    <button
                      type="button"
                      style={blocksToggleStyle}
                      aria-expanded={blocksOpen}
                      onClick={() => setShowBlocks((m) => ({ ...m, [key]: !blocksOpen }))}
                    >
                      📖 {blocksOpen ? '收合' : '展開'}速看重點（{s.blocks.length} 區塊）{blocksOpen ? '▴' : '▾'}
                    </button>
                    {blocksOpen && (
                      <div style={blocksWrapStyle}>
                        {s.blocks.map((b, i) => (
                          <CramBlockView key={i} block={b} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ))}

      {/* Download */}
      <div style={downloadRowStyle}>
        <a href={`${import.meta.env.BASE_URL}content/neurons-tw/cram-pdf/考前速看-醫學一.pdf`} download style={downloadBtnStyle}>
          ⬇ 下載 醫學一 A4 PDF
        </a>
        <a href={`${import.meta.env.BASE_URL}content/neurons-tw/cram-pdf/考前速看-醫學二.pdf`} download style={downloadBtnStyle}>
          ⬇ 下載 醫學二 A4 PDF
        </a>
      </div>

      {/* Practice on-ramp — existing QuizModal in practice mode (no progression, wrong→錯題本→出征) */}
      {practice && (
        <QuizModal pool={practice.pool} practice onClose={() => setPractice(null)} />
      )}
    </div>
  )
}

/** 押題 evidence-first drawer: raw count + tier + recent-first read-only source mini-list + on-ramp. */
function CramEvidenceDrawer({
  item,
  questions,
  onPractice,
}: {
  item: CramPushItem
  questions: Question[]
  onPractice: (pool: Question[]) => void
}): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const preview = questions.slice(0, SOURCE_PREVIEW_CAP)
  return (
    <div style={drawerStyle}>
      <p style={drawerLeadStyle}>
        這個考點在 {item.sittingsTotal} 次考試中出現 <b>{item.sittingBreadth}</b> 次（{item.tier}）。以下為真實考題：
      </p>
      <ul style={sourceListStyle}>
        {preview.map((q) => {
          const open = expandedId === q.id
          return (
            <li key={q.id} style={sourceItemStyle}>
              <button type="button" style={sourceQBtnStyle} onClick={() => setExpandedId(open ? null : q.id)}>
                {open ? '▴' : '▾'} {q.id}
              </button>
              {open && (
                <div style={reviewWrapStyle}>
                  <QuestionReviewCard question={q} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {questions.length > preview.length && (
        <p style={moreNoteStyle}>還有 {questions.length - preview.length} 題（標此考點）</p>
      )}
      {/* Low-friction primary on-ramp — opens practice directly, no prompt/modal */}
      <button type="button" style={practiceCtaStyle} onClick={() => onPractice(questions)}>
        ▶ 答 1 題看看
      </button>
    </div>
  )
}

/** Render one 速看 CramBlock by kind. */
function CramBlockView({ block }: { block: CramBlock }): JSX.Element {
  return (
    <div style={blockStyle}>
      <h4 style={blockHeadingStyle}>{block.heading}</h4>
      {block.kind === 'kernel' && (
        <ul style={kernelListStyle}>
          {block.items.map((it, i) => (
            <li key={i} style={kernelItemStyle}>
              <Inline html={it.html} />
              {it.cite && <cite style={citeStyle}>{it.cite}</cite>}
            </li>
          ))}
        </ul>
      )}
      {block.kind === 'kw' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td style={kwKeyStyle}>{r.k}</td>
                <td style={cellStyle}><Inline html={r.v} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'disc' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          {block.cols.length > 0 && (
            <thead>
              <tr>
                {block.cols.map((c, i) => (
                  <th key={i} style={thStyle}><Inline html={c} /></th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} style={cellStyle}><Inline html={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'num' && (
        <div style={tableWrapStyle}><table style={tableStyle}>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i}>
                <td style={numLabelStyle}>{r.label}</td>
                <td style={cellStyle}><Inline html={r.value} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {block.kind === 'skeleton' && (
        <div style={skelStyle}>
          {block.html.split('\n').map((line, i) => (
            <div key={i}><Inline html={line} /></div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic; exam content uses --font-legible) ─────────────────────
const pageStyle: React.CSSProperties = { maxWidth: 960, margin: '1.5rem auto', padding: '0 1.25rem', fontFamily: 'var(--font-pixel-cjk)' }
const loadingStyle: React.CSSProperties = { textAlign: 'center', color: '#8c6d4a', padding: '2rem', fontFamily: 'var(--font-legible)' }
const disclaimerStyle: React.CSSProperties = { background: '#f4ecd8', border: '1px solid #c9ad7f', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem' }
const disclaimerLineStyle: React.CSSProperties = { margin: 0, fontSize: '0.82rem', color: '#4a3a22', lineHeight: 1.6, fontFamily: 'var(--font-legible)' }
const disclaimerMetaStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }
const methodBtnStyle: React.CSSProperties = { border: '1px solid #c9ad7f', background: '#fff8e8', borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.76rem', cursor: 'pointer', color: '#7a5a2a', fontFamily: 'var(--font-legible)' }
const stampStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#8c6d4a', fontFamily: 'var(--font-legible)' }
const methodBodyStyle: React.CSSProperties = { marginTop: '0.5rem', fontSize: '0.78rem', color: '#4a3a22', lineHeight: 1.7, background: '#fff8e8', border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.55rem 0.7rem', fontFamily: 'var(--font-legible)' }
const quickJumpStyle: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexWrap: 'wrap', gap: '0.3rem', padding: '0.4rem 0', background: 'var(--bg-cream, #f4ecd8)', marginBottom: '0.5rem' }
const quickChipStyle: React.CSSProperties = { fontSize: '0.72rem', textDecoration: 'none', color: '#7a5a2a', background: '#efe4cc', border: '1px solid #d8c39a', borderRadius: 999, padding: '0.08rem 0.5rem', fontFamily: 'var(--font-legible)' }
const bookHeadingStyle: React.CSSProperties = { fontSize: '1.05rem', color: '#5a3d1a', margin: '0.5rem 0 0.6rem', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }
const bookNoteStyle: React.CSSProperties = { fontSize: '0.74rem', color: '#8c6d4a', fontWeight: 400, fontFamily: 'var(--font-legible)' }
const subjectCardStyle: React.CSSProperties = { border: '1px solid #c9ad7f', borderRadius: 8, marginBottom: '0.5rem', overflow: 'hidden', background: '#fffdf7', scrollMarginTop: '3rem' }
const subjectHeaderStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.8rem', background: '#f4ecd8', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-pixel-cjk)', fontSize: '0.9rem', color: '#4a3a22' }
const subjectNameStyle: React.CSSProperties = { fontWeight: 700 }
const subjectCountChipStyle: React.CSSProperties = { fontSize: '0.7rem', color: '#8c6d4a', background: '#efe4cc', borderRadius: 999, padding: '0.05rem 0.5rem', fontFamily: 'var(--font-legible)' }
const subjectBodyStyle: React.CSSProperties = { padding: '0.6rem 0.8rem' }
const sectionLabelStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#7a5410', margin: '0.2rem 0 0.5rem' }
const pushListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }
const pushItemStyle: React.CSSProperties = { border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.45rem 0.6rem', background: '#fff' }
const pushRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }
const pushZhStyle: React.CSSProperties = { fontSize: '0.88rem', color: '#2a2118', fontFamily: 'var(--font-legible)', fontWeight: 600 }
const tierChipStyle: React.CSSProperties = { fontSize: '0.7rem', borderRadius: 999, padding: '0.05rem 0.45rem', fontFamily: 'var(--font-legible)', whiteSpace: 'nowrap' }
const countChipStyle: React.CSSProperties = { marginTop: '0.35rem', border: '1px solid #d8c39a', background: '#f8f2e2', borderRadius: 6, padding: '0.15rem 0.5rem', fontSize: '0.76rem', color: '#5a4a33', cursor: 'pointer', fontFamily: 'var(--font-legible)', width: '100%', textAlign: 'left' }
const intensityStyle: React.CSSProperties = { color: '#a08a5a' }
const sectionPracticeStyle: React.CSSProperties = { marginTop: '0.6rem', border: '1px solid #b58900', background: '#fff3d0', color: '#7a5410', borderRadius: 6, padding: '0.35rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const blocksToggleStyle: React.CSSProperties = { marginTop: '0.7rem', border: '1px solid #c9ad7f', background: '#f4ecd8', borderRadius: 6, padding: '0.35rem 0.7rem', fontSize: '0.82rem', cursor: 'pointer', color: '#5a4a33', fontFamily: 'var(--font-legible)', width: '100%', textAlign: 'left' }
const blocksWrapStyle: React.CSSProperties = { marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }
const blockStyle: React.CSSProperties = { border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.5rem 0.65rem', background: '#fffdf7' }
const blockHeadingStyle: React.CSSProperties = { fontSize: '0.84rem', color: '#7a5410', margin: '0 0 0.4rem' }
const kernelListStyle: React.CSSProperties = { margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const kernelItemStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#2a2118', lineHeight: 1.55, fontFamily: 'var(--font-legible)' }
const citeStyle: React.CSSProperties = { marginLeft: '0.4rem', fontSize: '0.7rem', color: '#a08a5a', fontStyle: 'normal' }
const tableWrapStyle: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'var(--font-legible)' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.25rem 0.4rem', background: '#f0e6cd', color: '#5a4a33', borderBottom: '1px solid #d8c39a', fontSize: '0.76rem' }
const cellStyle: React.CSSProperties = { padding: '0.25rem 0.4rem', color: '#2a2118', borderBottom: '1px solid #efe4cc', verticalAlign: 'top', lineHeight: 1.5 }
const kwKeyStyle: React.CSSProperties = { ...cellStyle, color: '#7a5a2a', fontWeight: 600, whiteSpace: 'nowrap' }
const numLabelStyle: React.CSSProperties = { ...cellStyle, color: '#5a4a33' }
const skelStyle: React.CSSProperties = { fontSize: '0.82rem', color: '#2a2118', lineHeight: 1.7, fontFamily: 'var(--font-legible)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }
const drawerStyle: React.CSSProperties = { marginTop: '0.4rem', borderTop: '1px dashed #d8c39a', paddingTop: '0.4rem' }
const drawerLeadStyle: React.CSSProperties = { margin: '0 0 0.4rem', fontSize: '0.78rem', color: '#5a4a33', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
const sourceListStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const sourceItemStyle: React.CSSProperties = { fontSize: '0.78rem' }
const sourceQBtnStyle: React.CSSProperties = { border: '1px solid #d8c39a', background: '#f8f2e2', borderRadius: 4, padding: '0.1rem 0.45rem', fontSize: '0.74rem', color: '#5a4a33', cursor: 'pointer', fontFamily: 'ui-monospace, monospace' }
const reviewWrapStyle: React.CSSProperties = { marginTop: '0.35rem', border: '1px solid #e2d4b0', borderRadius: 6, padding: '0.5rem 0.6rem', background: '#fff' }
const moreNoteStyle: React.CSSProperties = { margin: '0.3rem 0 0', fontSize: '0.74rem', color: '#a08a5a', fontFamily: 'var(--font-legible)' }
const practiceCtaStyle: React.CSSProperties = { marginTop: '0.5rem', border: '1px solid #b58900', background: '#b58900', color: '#fff', borderRadius: 6, padding: '0.35rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-legible)' }
const downloadRowStyle: React.CSSProperties = { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', margin: '1rem 0 2rem' }
const downloadBtnStyle: React.CSSProperties = { border: '1px solid #8c6d4a', background: '#f4ecd8', color: '#5a3d1a', borderRadius: 6, padding: '0.4rem 0.8rem', fontSize: '0.82rem', textDecoration: 'none', fontFamily: 'var(--font-legible)' }
