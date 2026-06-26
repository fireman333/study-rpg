/**
 * Explanation — renders a question's 詳解.
 *
 * Prefers structured `explanationBlocks` (prose paragraphs + real <table>s,
 * reconstructed from PDF-flattened tables) and falls back to the flat
 * `explanation` string when no blocks are present. Shared by every surface that
 * shows an explanation (QuizModal / MockExamRunner / QuestionBankPage), so a
 * question with reconstructed tables renders identically everywhere.
 *
 * Tables render as genuine HTML tables inside an `overflow-x: auto` wrapper, so on
 * a narrow phone the table scrolls horizontally rather than collapsing into a
 * fragment column (per the structured-table design — medical tables need
 * horizontal comparison; card-ifying would break it). The caller passes its own
 * prose `textStyle` (its existing explanationBodyStyle) so flat/prose text keeps
 * each surface's look; table chrome is owned here for consistency.
 */
import { useState, type CSSProperties } from 'react'
import type { ExplanationBlock, ExplanationFigure, ExplanationTableImage, Question } from '@study-rpg/core'

export function Explanation({
  question,
  textStyle,
}: {
  question: Pick<
    Question,
    'explanation' | 'explanationBlocks' | 'explanationTableImages' | 'explanationFigures'
  >
  textStyle?: CSSProperties
}): JSX.Element {
  const blocks = question.explanationBlocks
  const tableImages = question.explanationTableImages
  const figures = question.explanationFigures
  const proseStyle = { ...baseTextStyle, ...textStyle }

  // Explanation body: structured blocks when present, else the flat string.
  const hasBlocks = !!(blocks && blocks.length > 0)
  const body = hasBlocks ? (
    blocks!.map((block, i) =>
      block.type === 'prose' ? (
        <div key={i} style={proseStyle}>
          {block.text}
        </div>
      ) : (
        <ExplanationTable key={i} block={block} />
      ),
    )
  ) : (
    <div style={proseStyle}>{question.explanation}</div>
  )

  // No image tier (table-image crops or recovered figures) → preserve original output exactly.
  const hasTail = (tableImages?.length ?? 0) > 0 || (figures?.length ?? 0) > 0
  if (!hasTail) {
    return hasBlocks ? <div style={blocksWrapStyle}>{body}</div> : (body as JSX.Element)
  }
  // Image tier: render the faithful 詳解 table images, then recovered figures, AFTER the explanation.
  return (
    <div style={blocksWrapStyle}>
      {body}
      {tableImages?.map((img, i) => (
        <ExplanationTableImageView key={`ti-${i}`} img={img} />
      ))}
      {figures?.map((fig, i) => (
        <ExplanationFigureView key={`ef-${i}`} fig={fig} />
      ))}
    </div>
  )
}

function ExplanationFigureView({ fig }: { fig: ExplanationFigure }): JSX.Element | null {
  const [error, setError] = useState(false)
  if (error) return null
  const caption = fig.caption || '原始詳解圖'
  return (
    <figure style={tableFigureStyle}>
      <figcaption style={tableCaptionStyle}>{caption}</figcaption>
      <div style={tableImageScrollStyle}>
        <img
          src={`${import.meta.env.BASE_URL}${fig.src}`}
          alt={`原始詳解圖：${caption}`}
          loading="lazy"
          style={tableImageStyle}
          onError={() => setError(true)}
        />
      </div>
    </figure>
  )
}

function ExplanationTableImageView({ img }: { img: ExplanationTableImage }): JSX.Element | null {
  const [error, setError] = useState(false)
  if (error) return null
  const caption = img.caption || '原始詳解表格'
  return (
    <figure style={tableFigureStyle}>
      <figcaption style={tableCaptionStyle}>{caption}</figcaption>
      <div style={tableImageScrollStyle}>
        <img
          src={`${import.meta.env.BASE_URL}${img.src}`}
          alt={`原始詳解表格：${caption}`}
          loading="lazy"
          style={tableImageStyle}
          onError={() => setError(true)}
        />
      </div>
    </figure>
  )
}

function ExplanationTable({ block }: { block: Extract<ExplanationBlock, { type: 'table' }> }): JSX.Element {
  return (
    <figure style={tableFigureStyle}>
      {block.caption && <figcaption style={tableCaptionStyle}>{block.caption}</figcaption>}
      <div style={tableScrollStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {block.columns.map((c, ci) => (
                <th key={ci} style={thStyle}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={tdStyle}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

// ─── Styles (cream/brown pixel aesthetic; content text legible) ───────────────

const baseTextStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: '0.86rem',
  color: '#3a2a1a',
  lineHeight: 1.65,
  fontFamily: 'var(--font-legible)',
}
const blocksWrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.6rem' }
const tableFigureStyle: CSSProperties = { margin: 0 }
const tableCaptionStyle: CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#6a5238',
  marginBottom: '0.3rem',
  fontFamily: 'var(--font-legible)',
}
// Horizontal scroll on narrow screens — a real table beats wrapped fragments.
const tableScrollStyle: CSSProperties = {
  maxWidth: '100%',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
}
const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  width: 'max-content',
  minWidth: '100%',
  fontFamily: 'var(--font-legible)',
  fontSize: '0.82rem',
  color: '#2a2118',
}
const thStyle: CSSProperties = {
  border: '1px solid #c9ad7f',
  background: '#efe3c8',
  color: '#3a2a1a',
  fontWeight: 700,
  padding: '0.35rem 0.55rem',
  textAlign: 'left',
  verticalAlign: 'top',
  whiteSpace: 'normal',
  wordBreak: 'keep-all',
}
const tdStyle: CSSProperties = {
  border: '1px solid #c9ad7f',
  padding: '0.35rem 0.55rem',
  verticalAlign: 'top',
  lineHeight: 1.55,
  whiteSpace: 'normal',
  wordBreak: 'keep-all',
}
// Image-crop tier: the original 詳解 table as a scanned-looking framed image.
// Horizontal scroll on narrow screens (a wide table image must not force page
// overflow); white background reads as an intentional "scanned excerpt".
const tableImageScrollStyle: CSSProperties = {
  maxWidth: '100%',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  border: '1px solid #c9ad7f',
  borderRadius: '4px',
  background: '#fff',
}
const tableImageStyle: CSSProperties = {
  display: 'block',
  maxWidth: '100%',
  height: 'auto',
}
