/**
 * QuestionReviewCard — the shared READ-ONLY question display for every non-interactive review
 * surface (題庫 QuestionBankPage / 收藏 BookmarksPage). Renders the full question —
 * 承上題前文 (self-hiding) + stem + figure + options + 正解 + 看原始詳解 PDF + 簡答 — with NO
 * answer interaction and NO state mutation. The interactive flow (pick → reveal → write SRS /
 * history / energy / achievements) stays in QuizModal, deliberately kept as a separate molecule.
 *
 * Leaf components (QuestionFigure / Explanation / LocalPdfButton / PrecedingContext) remain the
 * single source of truth; this card is only their read-only composition. Callers pass an optional
 * `header` slot for surface-specific chrome (e.g. the bookmark badge row).
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Question } from '@study-rpg/core'
import type { ConceptLabel } from '../lib/concept-tags'
import { EmojiIcon } from './EmojiIcon'
import { PrecedingContext } from './PrecedingContext'
import { QuestionFigure } from './QuestionFigure'
import { Explanation } from './Explanation'
import { LocalPdfButton } from './LocalPdfButton'
import { SHOW_INLINE_EXPLANATION } from '../lib/feature-flags'

// Keys that count as 正解: 送分 (disputed) → every option; 官方更正多答案 → the listed accepted
// keys; otherwise the single answer. Mirrors QuizModal's acceptedKeys.
function acceptedKeysOf(q: Question): string[] {
  if (q.disputed) return Object.keys(q.options)
  return [q.answer, ...(q.acceptedAnswers ?? [])]
}

export function QuestionReviewCard({
  question: q,
  header,
  showFigure = true,
  conceptLabels,
  onConceptClick,
}: {
  question: Question
  header?: ReactNode
  showFigure?: boolean
  /** Tested concept labels for this question (add-neurons-concept-tags §5.2). */
  conceptLabels?: ConceptLabel[]
  /** When provided, labels are a search shortcut (tap → 導 /bank + prefill). Omit for
   *  embedded read-only drill-downs (考前猜題) so tapping doesn't navigate away. */
  onConceptClick?: (zh: string) => void
}): JSX.Element {
  return (
    <>
      {header}
      {/* 承上題前文情境 — self-detects continuation questions and resolves the preceding chain;
          renders nothing for ordinary / unresolvable questions (zero visual cost). */}
      <PrecedingContext question={q} />
      <p style={stemStyle}>{q.stem}</p>
      {showFigure && <QuestionFigure key={q.id} q={q} />}
      <ul style={optionsStyle}>
        {Object.entries(q.options).map(([key, text]) => (
          <li key={key} style={optionItemStyle}>
            <span style={optionKeyStyle}>({key})</span> {text}
          </li>
        ))}
      </ul>
      <p style={answerStyle}>
        <strong>正解：</strong>
        {q.disputed ? '⚖ 送分題（考選部判定全部給分）' : `(${acceptedKeysOf(q).join(' 或 ')})`}
      </p>
      {conceptLabels && conceptLabels.length > 0 && (
        <div style={conceptRowStyle}>
          <span style={conceptLeadStyle}>考點</span>
          {conceptLabels.map((c) =>
            onConceptClick ? (
              <button
                key={c.leafId}
                type="button"
                style={conceptChipButtonStyle}
                onClick={() => onConceptClick(c.zh)}
                title={`搜尋「${c.zh}」的所有題目`}
              >
                {c.zh}
              </button>
            ) : (
              <span key={c.leafId} style={conceptChipStyle}>
                {c.zh}
              </span>
            ),
          )}
        </div>
      )}
      {q.explanation && (
        <>
          <LocalPdfButton questionId={q.id} />
          {SHOW_INLINE_EXPLANATION && q.optionExplanations && (
            <details style={explanationStyle} open>
              <summary style={explanationSummaryStyle}><EmojiIcon char="📖" size={15} /> 簡答</summary>
              <Explanation question={q} textStyle={explanationBodyStyle} />
              {(q as { explanationSource?: string }).explanationSource === 'ai-generated' && (
                <p style={aiNoteStyle}>※ 本題原始詳解由 AI 生成，僅供參考。</p>
              )}
            </details>
          )}
        </>
      )}
    </>
  )
}

// ─── Styles — exam content (stem / options / answer / 簡答 body) is legible, never pixel ─────
const stemStyle: CSSProperties = { fontSize: '0.95rem', color: '#2a2118', lineHeight: 1.6, margin: '0.4rem 0', fontFamily: 'var(--font-legible)', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }
const optionsStyle: CSSProperties = { listStyle: 'none', padding: 0, margin: '0.3rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }
const optionItemStyle: CSSProperties = { fontSize: '0.9rem', color: '#3a2a1a', lineHeight: 1.5, fontFamily: 'var(--font-legible)', overflowWrap: 'anywhere' }
const optionKeyStyle: CSSProperties = { fontWeight: 700, color: '#8c6d4a' }
const answerStyle: CSSProperties = { fontSize: '0.9rem', color: '#4d8c4d', fontWeight: 600, margin: '0.5rem 0 0.3rem', fontFamily: 'var(--font-legible)' }
const explanationStyle: CSSProperties = { marginTop: '0.4rem', background: '#f4ecd8', border: '1px solid #c9ad7f', borderRadius: '4px', padding: '0.4rem 0.6rem' }
const explanationSummaryStyle: CSSProperties = { fontWeight: 700, color: '#8c6d4a', cursor: 'pointer', fontSize: '0.86rem' }
const explanationBodyStyle: CSSProperties = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.86rem', color: '#3a2a1a', lineHeight: 1.65, marginTop: '0.4rem', fontFamily: 'var(--font-legible)' }
const aiNoteStyle: CSSProperties = { fontSize: '0.74rem', color: '#a07a3a', marginTop: '0.4rem', fontStyle: 'italic', fontFamily: 'var(--font-legible)' }
// Concept-tag label row (add-neurons-concept-tags §5.2)
const conceptRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem', margin: '0.1rem 0 0.35rem' }
const conceptLeadStyle: CSSProperties = { fontSize: '0.72rem', color: '#8c6d4a', fontWeight: 700, fontFamily: 'var(--font-legible)' }
const conceptChipStyle: CSSProperties = { fontSize: '0.74rem', color: '#5a4a33', background: '#efe4cc', border: '1px solid #d8c39a', borderRadius: '999px', padding: '0.08rem 0.5rem', fontFamily: 'var(--font-legible)', lineHeight: 1.5 }
const conceptChipButtonStyle: CSSProperties = { ...conceptChipStyle, cursor: 'pointer', color: '#7a5a2a' }
