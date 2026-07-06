/**
 * ConceptLabelRow — shared render of a question's tested concept labels (考點).
 *
 * Extracted from QuestionReviewCard so every surface renders the same chip row. Three
 * mutually-exclusive interaction modes, chosen by the caller (priority: hrefFor → onConceptClick → static):
 *  - `hrefFor`: render each label as a native anchor (`<a target="_blank" rel="noopener">`) to the
 *    bank prefilled with that concept — used by the INTERACTIVE answering flows (QuizModal, and the
 *    mock-exam review) so activating a label opens a new tab and the in-progress answering / expedition
 *    / mock session is preserved in the original tab. Plain click follows the browser default; a
 *    modifier / middle click opens in the background per OS convention (native anchor, no scripted focus).
 *  - `onConceptClick`: render each label as a `<button>` that navigates in-app — used by the read-only
 *    review card in the standalone 題庫 / 收藏.
 *  - neither: static, non-interactive chips (embedded 考前猜題 drill-down).
 *
 * Renders nothing when there are no labels — enhancement-only, never blocks the surface.
 */
import type { CSSProperties } from 'react'
import type { ConceptLabel } from '../lib/concept-tags'

export function ConceptLabelRow({
  labels,
  hrefFor,
  onConceptClick,
}: {
  labels: ConceptLabel[]
  /** Interactive flows: render labels as new-tab anchors to the prefilled bank. */
  hrefFor?: (zh: string) => string
  /** Review card: render labels as in-app search-shortcut buttons. */
  onConceptClick?: (zh: string) => void
}): JSX.Element | null {
  if (labels.length === 0) return null
  return (
    <div style={conceptRowStyle}>
      <span style={conceptLeadStyle}>考點</span>
      {labels.map((c) => {
        if (hrefFor) {
          return (
            <a
              key={c.leafId}
              href={hrefFor(c.zh)}
              target="_blank"
              rel="noopener"
              style={conceptChipLinkStyle}
              title={`在新分頁搜尋「${c.zh}」的所有題目`}
            >
              {c.zh}
            </a>
          )
        }
        if (onConceptClick) {
          return (
            <button
              key={c.leafId}
              type="button"
              style={conceptChipButtonStyle}
              onClick={() => onConceptClick(c.zh)}
              title={`搜尋「${c.zh}」的所有題目`}
            >
              {c.zh}
            </button>
          )
        }
        return (
          <span key={c.leafId} style={conceptChipStyle}>
            {c.zh}
          </span>
        )
      })}
    </div>
  )
}

// Concept-tag label row styles (moved from QuestionReviewCard — single source for every surface).
const conceptRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem', margin: '0.1rem 0 0.35rem' }
const conceptLeadStyle: CSSProperties = { fontSize: '0.72rem', color: '#8c6d4a', fontWeight: 700, fontFamily: 'var(--font-legible)' }
const conceptChipStyle: CSSProperties = { fontSize: '0.74rem', color: '#5a4a33', background: '#efe4cc', border: '1px solid #d8c39a', borderRadius: '999px', padding: '0.08rem 0.5rem', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
const conceptChipButtonStyle: CSSProperties = { ...conceptChipStyle, cursor: 'pointer', color: '#7a5a2a' }
const conceptChipLinkStyle: CSSProperties = { ...conceptChipStyle, cursor: 'pointer', color: '#7a5a2a', textDecoration: 'none', display: 'inline-block' }
